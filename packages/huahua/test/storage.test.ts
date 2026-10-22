// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { LocalStorageAdapter, MemoryStorage } from '../src/storage.js';
import { createTextIndex } from '../src/indexer.js';
import { renderAnnotations } from '../src/renderer.js';
import { exportJSON, importJSON } from '../src/export.js';
import type { Annotation } from '../src/model.js';
const sample: Annotation = { schemaVersion: 1, id: 'a1', documentId: 'doc', anchors: [], excerpt: { text: 'original', capturedAt: '2026-01-01T00:00:00.000Z', renditionId: 'reader' }, color: 'yellow', bodies: [], revision: '0', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' };
class FakeStorage implements Storage {
  #data = new Map<string, string>(); get length(): number { return this.#data.size; }
  clear(): void { this.#data.clear(); } getItem(key: string): string | null { return this.#data.get(key) ?? null; }
  key(index: number): string | null { return [...this.#data.keys()][index] ?? null; }
  removeItem(key: string): void { this.#data.delete(key); } setItem(key: string, value: string): void { this.#data.set(key, value); }
}
describe('memory storage and rendering', () => {
  it('rejects stale revisions without replacing the source excerpt', async () => {
    const storage = new MemoryStorage(); await storage.create(sample, { operationId: 'create-1' });
    const updated = await storage.update(sample.id, { color: 'blue' }, { expectedRevision: '0', operationId: 'update-1' });
    expect(updated.excerpt.text).toBe('original'); expect(updated.revision).toBe('1');
    await expect(storage.update(sample.id, { color: 'pink' }, { expectedRevision: '0', operationId: 'update-2' })).rejects.toThrow('revision-conflict');
  });
  it('survives adapter recreation and validates JSON exports', async () => {
    const storage = new FakeStorage(); const first = new LocalStorageAdapter(storage); await first.create(sample, { operationId: 'create-1' });
    const second = new LocalStorageAdapter(storage); expect((await second.list('doc'))[0]?.excerpt.text).toBe('original');
    expect(importJSON(exportJSON([sample]))[0]?.id).toBe(sample.id);
    expect(() => importJSON('{"protocol":"huahua-annotations-v1","annotations":[{}]}')).toThrow('invalid-annotation-record');
  });
  it('uses and cleans the forced overlay path', () => {
    const root = document.createElement('article'); root.textContent = 'plain reading text'; document.body.append(root);
    const range = document.createRange(); range.setStart(root.firstChild!, 0); range.setEnd(root.firstChild!, 5);
    const index = createTextIndex(root); const anchor = { profile: 'html-reader-v1' as const, unit: 'utf16' as const, renditionId: 'reader', quote: { exact: 'plain', prefix: '', suffix: '' }, position: { start: 0, end: 5 } };
    const annotation = { ...sample, anchors: [anchor] };
    renderAnnotations(root, index, [annotation], { renditionId: 'reader' }, 'overlay');
    expect(document.querySelector('[data-huahua-overlay]')).not.toBeNull();
    renderAnnotations(root, index, [], { renditionId: 'reader' }, 'overlay');
    expect(document.querySelector('[data-huahua-overlay-mark]')).toBeNull();
  });
});
