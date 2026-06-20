/**
 * Local test harness — builds a real RulesetContext for unit tests.
 *
 * Vendored from illusions `lib/linting/{base-rule,toolkit}`. These are small,
 * pure functions; keeping a copy here lets the template run tests without the
 * illusions source tree. When illusions publishes a testing entry
 * (`@illusions/lint-sdk/testing`), replace this file with an import of it.
 *
 * Behavior here mirrors what illusions injects at runtime, so a green test means
 * the rule will behave the same inside the app.
 */
import type {
  DetectorToolkit,
  DictLookup,
  GenjiHealthState,
  JsonRuleMeta,
  LintIssue,
  LintReference,
  LintRuleConfig,
  RegexReplaceOptions,
  RulesetBases,
  RulesetContext,
  RulesetManifest,
  RulesetRuleMeta,
  Severity,
  Token,
  UnitDetectorOptions,
  WordListMatch,
} from "illusions-lint-sdk";

// ---------------------------------------------------------------------------
// Minimal base classes (constructor + abstract lint) matching the SDK contract.
// ---------------------------------------------------------------------------

abstract class AbstractLintRule {
  abstract readonly id: string;
  abstract lint(text: string, config: LintRuleConfig): LintIssue[];
}

abstract class AbstractL1Rule extends AbstractLintRule {
  readonly meta: JsonRuleMeta;
  readonly id: string;
  readonly name: string;
  readonly nameJa: string;
  readonly description: string;
  readonly descriptionJa: string;
  readonly level = "L1" as const;
  readonly defaultConfig: LintRuleConfig;
  engine: "regex" | "morphological" = "regex";

  constructor(
    meta: JsonRuleMeta,
    config: {
      id: string;
      name: string;
      nameJa: string;
      description: string;
      descriptionJa: string;
      defaultConfig: LintRuleConfig;
    },
  ) {
    super();
    this.meta = meta;
    this.id = config.id;
    this.name = config.name;
    this.nameJa = config.nameJa;
    this.description = config.description;
    this.descriptionJa = config.descriptionJa;
    this.defaultConfig = config.defaultConfig;
  }

  abstract lint(text: string, config: LintRuleConfig): LintIssue[];
}

// Other base classes are stubbed; extend as needed for L2/document rules.
abstract class AbstractMorphologicalLintRule extends AbstractLintRule {
  abstract lintWithTokens(
    text: string,
    tokens: ReadonlyArray<Token>,
    config: LintRuleConfig,
  ): LintIssue[];
  lint(): LintIssue[] {
    return [];
  }
}
abstract class AbstractDocumentLintRule extends AbstractLintRule {
  abstract lintDocument(
    paragraphs: ReadonlyArray<{ text: string; index: number }>,
    config: LintRuleConfig,
  ): Array<{ paragraphIndex: number; issues: LintIssue[] }>;
  lint(): LintIssue[] {
    return [];
  }
}
abstract class AbstractMorphologicalDocumentLintRule extends AbstractLintRule {
  abstract lintDocumentWithTokens(
    paragraphs: ReadonlyArray<{ text: string; index: number; tokens: ReadonlyArray<Token> }>,
    config: LintRuleConfig,
  ): Array<{ paragraphIndex: number; issues: LintIssue[] }>;
  lint(): LintIssue[] {
    return [];
  }
}

const bases = {
  AbstractLintRule,
  AbstractL1Rule,
  AbstractMorphologicalLintRule,
  AbstractDocumentLintRule,
  AbstractMorphologicalDocumentLintRule,
} as unknown as RulesetBases;

// ---------------------------------------------------------------------------
// Toolkit (pure detectors).
// ---------------------------------------------------------------------------

function toGlobal(pattern: RegExp): RegExp {
  return pattern.flags.includes("g")
    ? new RegExp(pattern.source, pattern.flags)
    : new RegExp(pattern.source, `${pattern.flags}g`);
}

function regexReplace(opts: RegexReplaceOptions): LintIssue[] {
  const issues: LintIssue[] = [];
  const re = toGlobal(opts.pattern);
  let m: RegExpExecArray | null;
  while ((m = re.exec(opts.text)) !== null) {
    if (m[0].length === 0) {
      re.lastIndex += 1;
      continue;
    }
    const { from, to, original } = opts.span
      ? opts.span(m)
      : { from: m.index, to: m.index + m[0].length, original: m[0] };
    const replacement = opts.replacement(m);
    issues.push({
      ruleId: opts.ruleId,
      severity: opts.severity,
      message: opts.message,
      messageJa: opts.messageJa,
      from,
      to,
      originalText: original,
      ...(opts.reference ? { reference: opts.reference } : {}),
      fix: {
        label: opts.fixLabel ?? `Replace with ${replacement}`,
        labelJa: opts.fixLabelJa ?? `「${replacement}」に置換`,
        replacement,
      },
    });
  }
  return issues;
}

function detectUnits(opts: UnitDetectorOptions): LintIssue[] {
  const { text, ruleId, severity, units, reference, messageJa, dedup = true } = opts;
  const out: LintIssue[] = [];
  const seen = new Set<string>();
  for (const spec of units) {
    const re = toGlobal(spec.pattern);
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      if (m[0].length === 0) {
        re.lastIndex += 1;
        continue;
      }
      if (m[0] === spec.correct) continue;
      const from = m.index;
      const to = m.index + m[0].length;
      if (dedup) {
        const key = `${from}-${to}`;
        if (seen.has(key)) continue;
        seen.add(key);
      }
      out.push({
        ruleId,
        severity,
        message: `Incorrect unit notation: ${m[0]} -> ${spec.correct}`,
        messageJa: messageJa
          ? messageJa(m[0], spec.correct)
          : `単位表記「${m[0]}」は「${spec.correct}」と表記してください。`,
        from,
        to,
        originalText: m[0],
        ...(reference ? { reference: reference as LintReference } : {}),
        fix: { label: `Replace with ${spec.correct}`, labelJa: `「${spec.correct}」に置換`, replacement: spec.correct },
      });
    }
  }
  return out;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function matchWordList(text: string, words: ReadonlyArray<string>): WordListMatch[] {
  const ordered = [...new Set(words)].filter((w) => w.length > 0).sort((a, b) => b.length - a.length);
  const matches: WordListMatch[] = [];
  for (const word of ordered) {
    const re = new RegExp(escapeRegExp(word), "g");
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      matches.push({ word, from: m.index, to: m.index + word.length });
    }
  }
  return matches.sort((a, b) => a.from - b.from || b.to - a.to);
}

function dedupe(issues: LintIssue[], key?: (issue: LintIssue) => string): LintIssue[] {
  const k = key ?? ((i: LintIssue) => [i.ruleId, `${i.from}-${i.to}`, i.fix?.replacement ?? ""].join("|"));
  const seen = new Set<string>();
  const out: LintIssue[] = [];
  for (const issue of issues) {
    const id = k(issue);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(issue);
  }
  return out;
}

function toJsonRuleMeta(rule: RulesetRuleMeta, manifest: RulesetManifest): JsonRuleMeta {
  return {
    ruleId: rule.ruleId,
    level: rule.level,
    description: rule.descriptionJa,
    patternLogic: "",
    positiveExample: rule.docs.positiveExample,
    negativeExample: rule.docs.negativeExample,
    sourceReference: rule.docs.sourceReference,
    bookTitle: manifest.nameJa,
  };
}

/**
 * Build a dict toolkit seeded with a prewarmed snapshot.
 *
 * `entries` mirrors what illusions ships per batch: term → projection, with
 * misses included as `{ found: false }`. `hasCached`/`lookupCached` read it
 * synchronously; the async `has`/`lookupBatch` consult the same data so either
 * style of rule can be exercised. When the state is not "ready", everything
 * fails safe (false / undefined / empty) — exactly as in the app.
 */
function makeDict(state: GenjiHealthState, entries: ReadonlyArray<[string, DictLookup]> = []) {
  const ready = state === "ready";
  const snapshot = new Map<string, DictLookup>(entries);
  return {
    ready,
    state,
    async lookupBatch(terms: string[]): Promise<Map<string, DictLookup>> {
      if (!ready) return new Map();
      return new Map(terms.map((t) => [t, snapshot.get(t) ?? { found: false }]));
    },
    async has(term: string): Promise<boolean> {
      return ready ? (snapshot.get(term)?.found ?? false) : false;
    },
    hasCached(term: string): boolean {
      return ready ? (snapshot.get(term)?.found ?? false) : false;
    },
    lookupCached(term: string): DictLookup | undefined {
      return ready ? snapshot.get(term) : undefined;
    },
  };
}

const toolkit: DetectorToolkit = {
  nfkc: (s: string) => s.normalize("NFKC"),
  charMap: (map) => (ch: string) => map.get(ch) ?? ch,
  applyCharMap: (map, input) => {
    let o = "";
    for (const ch of input) o += map.get(ch) ?? ch;
    return o;
  },
  regexReplace,
  detectUnits,
  matchWordList,
  dedupe,
  posFilter: (tokens, pred) => tokens.filter(pred),
  toJsonRuleMeta,
  dict: makeDict("ready"),
};

/** Options for {@link createTestContext}. */
export interface TestContextOptions {
  /** Dictionary health. Defaults to "ready". */
  dictState?: GenjiHealthState;
  /**
   * Prewarmed dictionary snapshot for the batch: term → projection. Include
   * misses as `{ found: false }` so a rule can flag "prewarmed but absent"
   * while skipping terms that are absent from this list entirely.
   */
  dictEntries?: ReadonlyArray<[string, DictLookup]>;
}

/**
 * Build a test context. Pass a dict state to exercise requirement gating, and
 * `dictEntries` to seed the prewarmed snapshot a `dict:genji` rule reads.
 *
 * Accepts a bare state string for backward compatibility.
 */
export function createTestContext(
  opts: GenjiHealthState | TestContextOptions = {},
): RulesetContext {
  const { dictState = "ready", dictEntries = [] }: TestContextOptions =
    typeof opts === "string" ? { dictState: opts } : opts;
  return {
    engineApi: 1,
    bases,
    toolkit: { ...toolkit, dict: makeDict(dictState, dictEntries) },
    deps: {
      requirements: new Map<string, boolean>([["dict:genji", dictState === "ready"]]),
      dictState,
    },
  };
}

export const CONFIG = { enabled: true, severity: "warning" as Severity };
