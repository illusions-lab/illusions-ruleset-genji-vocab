/**
 * Morphology-driven noise filter for `genji-out-of-dict`.
 *
 * The bare rule flags any 名詞/動詞/形容詞 whose headword is absent from 幻辞.
 * Because 幻辞 lacks a large amount of everyday vocabulary, that produces a flood
 * of useless hits: stray symbols mis-tagged as nouns, light verbs (する/ある/いる),
 * formal nouns (ほか/あと/あいだ), and potential-verb conjugations (書ける/消せる).
 *
 * This module decides, per token, whether a candidate headword is grammatical
 * NOISE that should be suppressed — using part-of-speech, conjugation type and
 * character class rather than a flat frequency stoplist. The small word sets
 * below are NOT frequency lists: they encode genuinely CLOSED grammatical classes
 * (補助動詞 / 形式名詞) that morphology alone cannot always separate from content
 * words, because IPADIC tags them 名詞,一般 or 動詞,自立 in context.
 *
 * Direction of effect: this only ever turns a hit OFF. It can reduce
 * false positives but never introduce one — mirroring the rule's existing safety
 * invariant ("a gap only ever under-reports").
 *
 * Out of scope by design: real words that merely happen to be missing from 幻辞
 * (コーヒー, 畦道, 観る, …). Those are a DICTIONARY gap, not grammatical noise, and
 * are intentionally left flagged so they can be added to 幻辞 upstream.
 */
import type { Token } from "illusions-lint-sdk";

export interface NoiseFilterOptions {
  /** Drop symbol-only tokens mis-tagged as nouns (——, ～, ——」). Default true. */
  filterSymbols?: boolean;
  /** Drop grammaticalised light/auxiliary verbs (する/ある/いる/…). Default true. */
  filterLightVerbs?: boolean;
  /** Drop formal / adverbial nouns (ほか/あと/あいだ/…). Default true. */
  filterFormalNouns?: boolean;
  /** Drop potential-verb conjugations (書ける/消せる/踏み出せる). Default true. */
  filterDerivedConjugations?: boolean;
}

/**
 * Grammaticalised verbs (補助動詞・形式動詞). A closed class: these function as
 * auxiliaries or carry almost no lexical content, so flagging them as "unknown
 * words" is never useful. する/くる are caught by conjugation_type instead.
 * Content verbs (わかる/できる/うなずく) are deliberately absent — they stay flagged.
 */
const LIGHT_VERBS = new Set([
  "ある",
  "いる",
  "なる",
  "やる",
  "いく",
  "ゆく",
  "おく",
  "みる",
  "しまう",
  "くれる",
  "あげる",
  "もらう",
]);

/**
 * 名詞 subtypes that are structural rather than lexical headwords. 形式名詞 and
 * bleached adverbial nouns (ほか/あと/あいだ/…) are caught HERE, by their POS tag —
 * NOT by a hardcoded word list. Encoding which nouns are "formal" belongs in the
 * morphological analyser, not in this repo. (非自立 is already dropped upstream in
 * dictCandidateTerm; kept here as defence in depth.)
 */
const NOISE_NOUN_DETAILS = new Set(["副詞可能", "非自立"]);

/** A "word" character: kanji, kana, or any Unicode letter/number. */
const WORD_CHAR = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{L}\p{N}]/u;

/** え-row mora that a 五段 potential verb (可能動詞) ends its stem with, before る. */
const POTENTIAL_ENDINGS = ["ける", "げる", "せる", "ぜる", "てる", "でる", "ねる", "へる", "べる", "める", "れる", "える"];

function isSymbolOnly(term: string): boolean {
  return !WORD_CHAR.test(term);
}

function isLightVerb(token: Token): boolean {
  if (token.pos !== "動詞") return false;
  const ct = token.conjugation_type ?? "";
  if (ct.startsWith("サ変") || ct.startsWith("カ変")) return true; // する / くる
  const base = token.basic_form && token.basic_form !== "*" ? token.basic_form : token.surface;
  return LIGHT_VERBS.has(base);
}

function isFormalNoun(token: Token): boolean {
  if (token.pos !== "名詞") return false;
  return token.pos_detail_1 !== undefined && NOISE_NOUN_DETAILS.has(token.pos_detail_1);
}

/**
 * Potential verbs (可能動詞): 一段 verbs derived from a 五段 base, e.g. 書ける←書く.
 * kuromoji keeps the potential form as basic_form, which 幻辞 won't contain even
 * when the base verb would. Detected morphologically by the 一段 + え-row-る shape.
 *
 * RISK: this also matches regular 一段 verbs (受ける/分ける/食べる). That only causes
 * over-suppression (a missed hit), never a false positive, and it fires only when
 * such a verb is itself absent from 幻辞. Kept behind its own toggle so it can be
 * disabled if in-app validation shows it hides too much.
 */
function isPotentialVerb(token: Token): boolean {
  if (token.pos !== "動詞") return false;
  if (!(token.conjugation_type ?? "").startsWith("一段")) return false;
  const base = token.basic_form && token.basic_form !== "*" ? token.basic_form : token.surface;
  return POTENTIAL_ENDINGS.some((end) => base.endsWith(end)) && [...base].length >= 3;
}

/**
 * Should this candidate headword be suppressed as grammatical noise?
 * `term` is the headword chosen by `dictCandidateTerm`; `token` carries the POS.
 */
export function shouldSuppress(token: Token, term: string, opts: NoiseFilterOptions = {}): boolean {
  if (opts.filterSymbols !== false && isSymbolOnly(term)) return true;
  if (opts.filterLightVerbs !== false && isLightVerb(token)) return true;
  if (opts.filterFormalNouns !== false && isFormalNoun(token)) return true;
  if (opts.filterDerivedConjugations !== false && isPotentialVerb(token)) return true;
  return false;
}
