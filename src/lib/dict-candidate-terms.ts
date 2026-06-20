/**
 * Content-word → dictionary-headword extraction.
 *
 * This is a byte-for-byte mirror of illusions' internal
 * `lib/linting/dict-candidate-terms.ts`. illusions prewarms dictionary
 * membership on the renderer using the SAME selection, then ships a snapshot the
 * rule reads. Keeping the two in sync ensures every headword this rule queries
 * was prewarmed (a mismatch only ever causes a skipped token — a false negative,
 * never a false positive).
 */
import type { Token } from "illusions-lint-sdk";

export interface DictCandidateOptions {
  /** Include 固有名詞 (proper nouns: names, places). Default true. */
  includeProperNouns?: boolean;
  /** Include 動詞/形容詞 (matched by basic form). Default true. */
  includeVerbsAdjectives?: boolean;
  /** Skip headwords shorter than this (in code points). Default 1. */
  minLength?: number;
}

/** 名詞 subtypes that are never meaningful dictionary headwords. */
const EXCLUDED_NOUN_DETAILS = new Set(["数", "代名詞", "非自立", "接尾", "特殊"]);
/** 動詞/形容詞 subtypes that are auxiliary, not real lexical entries. */
const EXCLUDED_VERB_ADJ_DETAILS = new Set(["非自立", "接尾"]);

const ALL_ASCII = /^[\x00-\x7F]+$/;

function isValidHeadword(key: string, minLength: number): boolean {
  if (key.length === 0 || key === "*") return false;
  if ([...key].length < minLength) return false;
  // Pure ASCII (English words, digits, punctuation, kaomoji) are not Genji
  // headwords — skip them so they never get flagged.
  if (ALL_ASCII.test(key)) return false;
  return true;
}

/**
 * The dictionary headword this token should be looked up under, or `null` if the
 * token is not a checkable content word.
 *
 * - 名詞 → surface form (`surface`).
 * - 動詞 / 形容詞 → basic form (`basic_form`), falling back to surface.
 */
export function dictCandidateTerm(token: Token, opts: DictCandidateOptions = {}): string | null {
  const includeProperNouns = opts.includeProperNouns ?? true;
  const includeVerbsAdjectives = opts.includeVerbsAdjectives ?? true;
  const minLength = opts.minLength ?? 1;
  const detail = token.pos_detail_1;

  if (token.pos === "名詞") {
    if (detail && EXCLUDED_NOUN_DETAILS.has(detail)) return null;
    if (!includeProperNouns && detail === "固有名詞") return null;
    const key = token.surface;
    return isValidHeadword(key, minLength) ? key : null;
  }

  if (includeVerbsAdjectives && (token.pos === "動詞" || token.pos === "形容詞")) {
    if (detail && EXCLUDED_VERB_ADJ_DETAILS.has(detail)) return null;
    const base = token.basic_form && token.basic_form !== "*" ? token.basic_form : token.surface;
    return isValidHeadword(base, minLength) ? base : null;
  }

  return null;
}
