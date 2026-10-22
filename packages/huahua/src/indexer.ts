import type { TextIndex, TextSegment } from './model.js';
const excluded = 'SCRIPT,STYLE,TEMPLATE,NOSCRIPT,INPUT,TEXTAREA,SELECT,OPTION,[contenteditable],[data-annotation-exclude],[data-huahua-ui],[hidden]';
const blockTags = new Set(['ADDRESS','ARTICLE','ASIDE','BLOCKQUOTE','DD','DIV','DL','DT','FIELDSET','FIGCAPTION','FIGURE','FOOTER','FORM','H1','H2','H3','H4','H5','H6','HEADER','HR','LI','MAIN','NAV','OL','P','PRE','SECTION','TABLE','TD','TH','TR','UL']);
export function createTextIndex(root: HTMLElement): TextIndex {
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent || parent.closest(excluded)) return NodeFilter.FILTER_REJECT;
      const style = getComputedStyle(parent);
      return style.display === 'none' || style.visibility === 'hidden' ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
    }
  });
  let text = ''; const segments: TextSegment[] = []; let node: Node | null; let pendingSpace: { node: Text; offset: number; value: string } | null = null; let previousBlock: Element | null = null; let previousNode: Text | null = null;
  while ((node = walker.nextNode())) {
    if (!(node instanceof Text)) continue;
    const parent = nearestBlock(node.parentElement, root);
    if (previousNode && previousBlock && parent === previousBlock && hasBreakBetween(previousNode, node, root.ownerDocument)) { pendingSpace = null; if (text && !text.endsWith('\n')) text += '\n'; }
    if (previousNode && parent && previousBlock && parent !== previousBlock) {
      pendingSpace = null;
      if (text && !text.endsWith('\n')) text += '\n';
    }
    previousBlock = parent ?? previousBlock; previousNode = node;
    const source = node.data.replace(/\r\n?/g, '\n');
    let i = 0;
    while (i < source.length) {
      const start = i; const whitespace = /[\t\n\f\r ]/.test(source[i] ?? '');
      while (i < source.length && /[\t\n\f\r ]/.test(source[i] ?? '') === whitespace) i++;
      if (whitespace) {
        if (text.length > 0) pendingSpace = { node, offset: Math.min(start, node.length), value: source.slice(start, i).includes('\n') ? '\n' : ' ' };
        continue;
      }
      if (pendingSpace) {
        const s = text.length; text += pendingSpace.value; segments.push({ start: s, end: s + pendingSpace.value.length, node: pendingSpace.node, nodeStart: pendingSpace.offset, nodeEnd: Math.min(pendingSpace.offset + pendingSpace.value.length, pendingSpace.node.length) }); pendingSpace = null;
      }
      const s = text.length; const piece = source.slice(start, i); text += piece;
      segments.push({ start: s, end: text.length, node, nodeStart: start, nodeEnd: i });
    }
  }
  const rangeToOffsets = (range: Range) => {
    const boundary = (container: Node, offset: number): number | null => {
      const seg = segments.find(x => x.node === container && offset >= x.nodeStart && offset <= x.nodeEnd);
      if (seg) return seg.start + Math.min(offset - seg.nodeStart, seg.end - seg.start);
      for (const s of segments) {
        const position = root.ownerDocument.createRange(); position.selectNodeContents(s.node);
        if (position.comparePoint(container, offset) <= 0) return s.end;
      }
      return null;
    };
    const start = boundary(range.startContainer, range.startOffset), end = boundary(range.endContainer, range.endOffset);
    return start === null || end === null || end <= start ? null : { start, end };
  };
  const offsetsToRanges = (start: number, end: number) => {
    const result: Range[] = [];
    for (const s of segments) {
      const from = Math.max(start, s.start), to = Math.min(end, s.end);
      if (to <= from || !root.contains(s.node)) continue;
      const r = root.ownerDocument.createRange();
      r.setStart(s.node, s.nodeStart + from - s.start); r.setEnd(s.node, s.nodeStart + to - s.start); result.push(r);
    }
    return result;
  };
  return { text, segments, version: 0, rangeToOffsets, offsetsToRanges };
}
function nearestBlock(element: Element | null, root: HTMLElement): Element | null {
  for (let current = element; current && current !== root; current = current.parentElement) if (blockTags.has(current.tagName)) return current;
  return root;
}
function hasBreakBetween(previous: Text, current: Text, doc: Document): boolean {
  const range = doc.createRange();
  try { range.setStart(previous, previous.length); range.setEnd(current, 0); return range.cloneContents().querySelector('br') !== null; }
  catch { return false; }
}
