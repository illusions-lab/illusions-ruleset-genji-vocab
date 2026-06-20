import { describe, it, expect } from "vitest";
import type { LintIssue, LintRule, LintRuleConfig, Token } from "illusions-lint-sdk";

import ruleset from "../src/index";
import { createTestContext, type TestContextOptions } from "./test-kit";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** An L2 rule view that exposes lintWithTokens for the test. */
type L2Rule = LintRule & {
  lintWithTokens(text: string, tokens: ReadonlyArray<Token>, config: LintRuleConfig): LintIssue[];
};

/** Build a token. `start` defaults to 0; `end` is derived from the surface. */
function tok(p: Partial<Token> & { surface: string; pos: string; start?: number }): Token {
  const start = p.start ?? 0;
  return {
    pos_detail_1: undefined,
    basic_form: p.surface,
    reading: undefined,
    ...p,
    start,
    end: start + p.surface.length,
  } as Token;
}

function build(opts: TestContextOptions = {}): L2Rule {
  const ctx = createTestContext(opts);
  const rule = ruleset.createRules(ctx)[0];
  return rule as L2Rule;
}

const CONFIG: LintRuleConfig = { enabled: true, severity: "info" };

// 「猫」「走る」が辞書内、その他は辞書外として prewarm 済みのスナップショット。
const ENTRIES: Array<[string, { found: boolean }]> = [
  ["猫", { found: true }],
  ["走る", { found: true }],
  ["図書館", { found: true }],
  ["本", { found: true }],
  ["圕", { found: false }],
  ["讀む", { found: false }],
  ["幾田花", { found: false }],
];

describe("genji-out-of-dict", () => {
  it("is an L2 morphological rule with the expected id", () => {
    const rule = build({ dictEntries: ENTRIES });
    expect(rule.id).toBe("genji-out-of-dict");
    expect(rule.level).toBe("L2");
    expect(typeof rule.lintWithTokens).toBe("function");
  });

  it("positive: flags nothing when every content word is in the dictionary", () => {
    const rule = build({ dictEntries: ENTRIES });
    const tokens = [
      tok({ surface: "猫", pos: "名詞", pos_detail_1: "一般", start: 0 }),
      tok({ surface: "が", pos: "助詞", pos_detail_1: "格助詞", start: 1 }),
      tok({ surface: "本", pos: "名詞", pos_detail_1: "一般", start: 2 }),
    ];
    expect(rule.lintWithTokens("猫が本", tokens, CONFIG)).toHaveLength(0);
  });

  it("negative: flags an out-of-dictionary noun with the right span and message", () => {
    const rule = build({ dictEntries: ENTRIES });
    const tokens = [tok({ surface: "圕", pos: "名詞", pos_detail_1: "一般", start: 3 })];
    const issues = rule.lintWithTokens("彼は圕", tokens, CONFIG);
    expect(issues).toHaveLength(1);
    expect(issues[0].ruleId).toBe("genji-out-of-dict");
    expect(issues[0].severity).toBe("info");
    expect(issues[0].messageJa).toContain("圕");
    expect([issues[0].from, issues[0].to]).toEqual([3, 4]);
    expect(issues[0].originalText).toBe("圕");
  });

  // ----- edge cases -----

  it("fail-safe: no issues when the dictionary is not ready (would-be misses ignored)", () => {
    for (const dictState of ["not-installed", "web-fallback", "corrupt", "unknown"] as const) {
      const rule = build({ dictState, dictEntries: ENTRIES });
      const tokens = [tok({ surface: "圕", pos: "名詞", pos_detail_1: "一般" })];
      expect(rule.lintWithTokens("圕", tokens, CONFIG)).toHaveLength(0);
    }
  });

  it("skips terms that were not prewarmed (never flags undeclared words)", () => {
    const rule = build({ dictEntries: [["猫", { found: true }]] });
    // 「未知語」 is absent from the snapshot entirely → must be skipped, not flagged.
    const tokens = [tok({ surface: "未知語", pos: "名詞", pos_detail_1: "一般" })];
    expect(rule.lintWithTokens("未知語", tokens, CONFIG)).toHaveLength(0);
  });

  it("includes proper nouns by default and can exclude them via options", () => {
    const tokens = [tok({ surface: "幾田花", pos: "名詞", pos_detail_1: "固有名詞" })];

    const on = build({ dictEntries: ENTRIES });
    expect(on.lintWithTokens("幾田花", tokens, CONFIG)).toHaveLength(1);

    const off = build({ dictEntries: ENTRIES });
    const cfg: LintRuleConfig = { ...CONFIG, options: { includeProperNouns: false } };
    expect(off.lintWithTokens("幾田花", tokens, cfg)).toHaveLength(0);
  });

  it("matches verbs/adjectives by basic form (conjugated, in-dictionary → no flag)", () => {
    const rule = build({ dictEntries: ENTRIES });
    // 「走っ」(surface) conjugates from 「走る」(basic_form), which IS in the dict.
    const inDict = [tok({ surface: "走っ", pos: "動詞", pos_detail_1: "自立", basic_form: "走る" })];
    expect(rule.lintWithTokens("走っ", inDict, CONFIG)).toHaveLength(0);

    // 「讀ん」conjugates from 「讀む」(basic_form), which is NOT in the dict.
    const outDict = [tok({ surface: "讀ん", pos: "動詞", pos_detail_1: "自立", basic_form: "讀む" })];
    const issues = rule.lintWithTokens("讀ん", outDict, CONFIG);
    expect(issues).toHaveLength(1);
    expect(issues[0].messageJa).toContain("讀む");
  });

  it("can disable verb/adjective checking via options", () => {
    const rule = build({ dictEntries: ENTRIES });
    const tokens = [tok({ surface: "讀ん", pos: "動詞", pos_detail_1: "自立", basic_form: "讀む" })];
    const cfg: LintRuleConfig = { ...CONFIG, options: { includeVerbsAdjectives: false } };
    expect(rule.lintWithTokens("讀ん", tokens, cfg)).toHaveLength(0);
  });

  it("ignores particles, auxiliaries, symbols, numbers, pronouns and suffixes", () => {
    const rule = build({ dictEntries: ENTRIES });
    const tokens = [
      tok({ surface: "は", pos: "助詞", pos_detail_1: "係助詞", start: 0 }),
      tok({ surface: "だ", pos: "助動詞", start: 1 }),
      tok({ surface: "。", pos: "記号", pos_detail_1: "句点", start: 2 }),
      tok({ surface: "３", pos: "名詞", pos_detail_1: "数", start: 3 }),
      tok({ surface: "それ", pos: "名詞", pos_detail_1: "代名詞", start: 4 }),
      tok({ surface: "たち", pos: "名詞", pos_detail_1: "接尾", start: 6 }),
    ];
    expect(rule.lintWithTokens("はだ。３それたち", tokens, CONFIG)).toHaveLength(0);
  });

  it("skips pure-ASCII tokens (English / digits)", () => {
    const rule = build({ dictEntries: ENTRIES });
    const tokens = [
      tok({ surface: "Genji", pos: "名詞", pos_detail_1: "固有名詞", start: 0 }),
      tok({ surface: "2026", pos: "名詞", pos_detail_1: "数", start: 5 }),
    ];
    expect(rule.lintWithTokens("Genji2026", tokens, CONFIG)).toHaveLength(0);
  });

  it("respects the minLength option", () => {
    const tokens = [tok({ surface: "圕", pos: "名詞", pos_detail_1: "一般" })];
    const rule = build({ dictEntries: ENTRIES });
    expect(rule.lintWithTokens("圕", tokens, { ...CONFIG, options: { minLength: 1 } })).toHaveLength(1);
    expect(rule.lintWithTokens("圕", tokens, { ...CONFIG, options: { minLength: 2 } })).toHaveLength(0);
  });

  it("flags every occurrence of an out-of-dictionary word", () => {
    const rule = build({ dictEntries: ENTRIES });
    const tokens = [
      tok({ surface: "圕", pos: "名詞", pos_detail_1: "一般", start: 0 }),
      tok({ surface: "圕", pos: "名詞", pos_detail_1: "一般", start: 2 }),
    ];
    const issues = rule.lintWithTokens("圕。圕", tokens, CONFIG);
    expect(issues).toHaveLength(2);
    expect(issues.map((i) => i.from)).toEqual([0, 2]);
  });

  it("returns nothing for empty input or when disabled", () => {
    const rule = build({ dictEntries: ENTRIES });
    expect(rule.lintWithTokens("", [], CONFIG)).toHaveLength(0);
    const tokens = [tok({ surface: "圕", pos: "名詞", pos_detail_1: "一般" })];
    expect(rule.lintWithTokens("圕", tokens, { ...CONFIG, enabled: false })).toHaveLength(0);
  });
});
