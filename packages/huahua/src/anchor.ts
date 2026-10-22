import type { Anchor, ResolveResult, TextIndex } from './model.js';
export function makeAnchor(index: TextIndex, start: number, end: number, renditionId: string, contentVersion?: string): Anchor {
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start || end > index.text.length) throw new RangeError('invalid-selection-range');
  if (splitsSurrogate(index.text, start) || splitsSurrogate(index.text, end)) throw new RangeError('selection-splits-surrogate-pair');
  const exact = index.text.slice(start, end);
  const before = [...index.text.slice(0, start)].slice(-32).join('');
  const after = [...index.text.slice(end)].slice(0, 32).join('');
  return { profile: 'html-reader-v1', unit: 'utf16', renditionId, quote: { exact, prefix: before, suffix: after }, position: { start, end }, ...(contentVersion === undefined ? {} : { contentVersion }) };
}
function splitsSurrogate(text: string, offset: number): boolean { const before = text.charCodeAt(offset - 1), after = text.charCodeAt(offset); return before >= 0xd800 && before <= 0xdbff && after >= 0xdc00 && after <= 0xdfff; }
export function resolveAnchor(index: TextIndex, anchor: Anchor, identity: { renditionId: string; version?: string }): ResolveResult {
  if (anchor.renditionId !== identity.renditionId) return { status: 'orphaned', ranges: [], candidates: 0, reason: 'rendition-mismatch' };
  if (!anchor.quote.exact) return { status: 'orphaned', ranges: [], candidates: 0, reason: 'empty-quote' };
  const { start, end } = anchor.position;
  if (anchor.contentVersion && identity.version === anchor.contentVersion && index.text.slice(start, end) === anchor.quote.exact) return { status: 'resolved', ranges: index.offsetsToRanges(start, end), candidates: 1, strategy: 'position' };
  const found: number[] = []; let from = 0;
  while ((from = index.text.indexOf(anchor.quote.exact, from)) !== -1) { found.push(from); from += Math.max(1, anchor.quote.exact.length); }
  const scored = found.map(pos => {
    const prefix = index.text.slice(Math.max(0, pos - anchor.quote.prefix.length), pos);
    const suffix = index.text.slice(pos + anchor.quote.exact.length, pos + anchor.quote.exact.length + anchor.quote.suffix.length);
    const pre = commonSuffix(prefix, anchor.quote.prefix), post = commonPrefix(suffix, anchor.quote.suffix);
    return { pos, score: pre + post, exactContext: pre === anchor.quote.prefix.length && post === anchor.quote.suffix.length };
  }).sort((a, b) => b.score - a.score);
  if (!scored.length) return { status: 'orphaned', ranges: [], candidates: 0, reason: 'quote-not-found' };
  const top = scored[0]; if (!top) return { status: 'orphaned', ranges: [], candidates: 0 };
  const tied = scored.filter(x => x.score === top.score);
  if (tied.length !== 1 || (scored.length > 1 && !top.exactContext)) return { status: 'ambiguous', ranges: [], candidates: scored.length, reason: 'multiple-candidates' };
  return { status: 'resolved', ranges: index.offsetsToRanges(top.pos, top.pos + anchor.quote.exact.length), candidates: scored.length, strategy: 'quote' };
}
function commonSuffix(a: string, b: string): number { let i = 0; while (i < a.length && i < b.length && a[a.length - 1 - i] === b[b.length - 1 - i]) i++; return i; }
function commonPrefix(a: string, b: string): number { let i = 0; while (i < a.length && i < b.length && a[i] === b[i]) i++; return i; }
