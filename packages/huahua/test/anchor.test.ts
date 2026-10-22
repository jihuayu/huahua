// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { makeAnchor, resolveAnchor } from '../src/anchor.js';
import { createTextIndex } from '../src/indexer.js';

describe('anchor recovery', () => {
  it('resolves a quote by a unique surrounding context after an insertion', () => {
    const root = document.createElement('article'); root.innerHTML = '<p>alpha target omega</p>';
    const old = createTextIndex(root); const anchor = makeAnchor(old, 6, 12, 'reader', 'v1');
    root.querySelector('p')!.prepend('new '); const next = createTextIndex(root);
    const result = resolveAnchor(next, anchor, { renditionId: 'reader', version: 'v2' });
    expect(result.status).toBe('resolved'); expect(result.ranges[0]?.toString()).toBe('target');
  });
  it('leaves repeated quotes ambiguous instead of guessing', () => {
    const root = document.createElement('article'); root.textContent = 'foo target bar target baz';
    const anchor = { ...makeAnchor(createTextIndex(root), 4, 10, 'reader', 'v1'), quote: { exact: 'target', prefix: '', suffix: '' } };
    const result = resolveAnchor(createTextIndex(root), anchor, { renditionId: 'reader', version: 'v2' });
    expect(result.status).toBe('ambiguous'); expect(result.ranges).toHaveLength(0);
  });
  it('does not cross rendition boundaries', () => {
    const root = document.createElement('article'); root.textContent = 'a😀e\u0301';
    const anchor = makeAnchor(createTextIndex(root), 1, 3, 'original', 'v1');
    expect(resolveAnchor(createTextIndex(root), anchor, { renditionId: 'snapshot' }).status).toBe('orphaned');
  });
  it('maps a selection across paragraphs while keeping block breaks explicit', () => {
    const root = document.createElement('article'); root.innerHTML = '<p>alpha</p><p>beta</p>'; document.body.append(root);
    const index = createTextIndex(root); expect(index.text).toBe('alpha\nbeta');
    const range = document.createRange(); range.setStart(root.querySelector('p')!.firstChild!, 0); range.setEnd(root.querySelectorAll('p')[1]!.firstChild!, 4);
    const offsets = index.rangeToOffsets(range); expect(offsets).toEqual({ start: 0, end: 10 });
    expect(index.offsetsToRanges(0, 10).map(part => part.toString())).toEqual(['alpha', 'beta']);
  });
  it('preserves a selected quote through arbitrary text node splits', () => {
    fc.assert(fc.property(fc.string({ minLength: 1, maxLength: 80 }).filter(s => !/[\u0000]/.test(s)), fc.nat(), (text, seed) => {
      const doc = document.implementation.createHTMLDocument(); const root = doc.createElement('article'); doc.body.append(root);
      const split = seed % (text.length + 1); const left = doc.createTextNode(text.slice(0, split)); const right = doc.createTextNode(text.slice(split)); root.append(left, right);
      const index = createTextIndex(root); expect(index.text).toBe(text.replace(/[\t\n\f\r ]+/g, ' ').trim());
    }), { numRuns: 150 });
  });
});
