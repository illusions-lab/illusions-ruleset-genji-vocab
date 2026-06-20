/**
 * `genji-out-of-dict` — flag words absent from the 幻辞 (Genji) dictionary.
 *
 * An L2 (morphological) rule: it walks kuromoji tokens, picks content words
 * (nouns, verbs, adjectives — proper nouns included by default), and reports any
 * whose headword the Genji dictionary does not contain. Useful for catching
 * typos, mis-conversions and stray/unknown words.
 *
 * Dictionary I/O is async but linting is synchronous, so illusions prewarms
 * membership for the batch and exposes it through `ctx.toolkit.dict`:
 *  - `dict.ready`            — the dictionary is installed & healthy.
 *  - `dict.lookupCached(t)`  — the prewarmed projection for `t`, or `undefined`
 *                              if `t` was not prewarmed.
 *
 * Safety: a token is flagged ONLY when it was prewarmed AND reported absent
 * (`{ found: false }`). A token that was not prewarmed returns `undefined` and is
 * skipped — so a prewarm gap can only ever under-report, never false-positive.
 */
import type {
  LintIssue,
  LintRule,
  LintRuleConfig,
  RulesetContext,
  RulesetManifest,
  Token,
} from "illusions-lint-sdk";

import { dictCandidateTerm, type DictCandidateOptions } from "../lib/dict-candidate-terms";

const RULE_ID = "genji-out-of-dict";

function readOptions(config: LintRuleConfig): DictCandidateOptions {
  const o = (config.options ?? {}) as Record<string, unknown>;
  return {
    includeProperNouns: o.includeProperNouns !== false,
    includeVerbsAdjectives: o.includeVerbsAdjectives !== false,
    minLength: typeof o.minLength === "number" && o.minLength >= 1 ? o.minLength : 1,
  };
}

export function createGenjiOutOfDict(ctx: RulesetContext, manifest: RulesetManifest): LintRule {
  const meta = manifest.rules.find((r) => r.ruleId === RULE_ID);
  if (!meta) throw new Error(`manifest is missing the ${RULE_ID} rule`);
  const { nameJa, descriptionJa, defaultConfig } = meta;

  const { AbstractMorphologicalLintRule } = ctx.bases;
  const { dict } = ctx.toolkit;
  const reference = { standard: manifest.nameJa };

  class GenjiOutOfDict extends AbstractMorphologicalLintRule {
    readonly id = RULE_ID;
    readonly name = nameJa;
    readonly nameJa = nameJa;
    readonly description = descriptionJa;
    readonly descriptionJa = descriptionJa;
    readonly level = "L2" as const;
    readonly defaultConfig: LintRuleConfig = defaultConfig;

    lintWithTokens(
      _text: string,
      tokens: ReadonlyArray<Token>,
      config: LintRuleConfig,
    ): LintIssue[] {
      // Fail safe: do nothing unless the rule is on AND the dictionary is usable
      // and prewarmed. Otherwise we'd flag valid words as "out of dictionary".
      if (!config.enabled || !dict.ready) return [];

      const opts = readOptions(config);
      const issues: LintIssue[] = [];
      for (const token of tokens) {
        const term = dictCandidateTerm(token, opts);
        if (term === null) continue;
        const lookup = dict.lookupCached(term);
        // Skip when not prewarmed (undefined); flag only confirmed absences.
        if (lookup === undefined || lookup.found) continue;
        issues.push({
          ruleId: this.id,
          severity: config.severity,
          message: `"${term}" is not in the 幻辞 dictionary`,
          messageJa: `幻辞（辞書）に未収録の語です：「${term}」`,
          from: token.start,
          to: token.end,
          originalText: token.surface,
          reference,
        });
      }
      return issues;
    }
  }

  return new GenjiOutOfDict();
}
