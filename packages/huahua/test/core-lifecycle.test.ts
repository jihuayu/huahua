// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { createAnnotator } from '../src/core.js';
import { createTextIndex } from '../src/indexer.js';

describe('annotator cleanup', () => {
  it('disconnects its observer and disposes plugins exactly once', async () => {
    const root = document.createElement('article'); root.textContent = 'before'; document.body.append(root);
    let indexes = 0, disposed = 0, pluginDestroyed = 0;
    const content = { root, buildIndex() { indexes++; return createTextIndex(root); }, destroy: vi.fn() };
    const annotator = await createAnnotator({ root, document: { id: 'doc', renditionId: 'reader' }, content: () => content, plugins: [{
      manifest: { id: 'observer', version: '1', apiVersion: 1, provides: [] },
      setup({ registerDisposer }) { registerDisposer(() => { disposed++; }); }, destroy() { pluginDestroyed++; }
    }] });
    const beforeDestroy = indexes;
    root.append(document.createElement('p')); await new Promise(resolve => setTimeout(resolve, 35));
    expect(indexes).toBe(beforeDestroy + 1);
    const first = annotator.destroy(), second = annotator.destroy(); expect(first).toBe(second); await first; await second;
    const afterDestroy = indexes; root.append(document.createElement('p')); await new Promise(resolve => setTimeout(resolve, 35));
    expect(indexes).toBe(afterDestroy); expect(disposed).toBe(1); expect(pluginDestroyed).toBe(1); expect(content.destroy).toHaveBeenCalledTimes(1);
  });
  it('rolls plugins back when initial storage load fails before becoming ready', async () => {
    const root = document.createElement('article'); document.body.append(root); let disposed = 0;
    const storage = { list: async () => { throw new Error('storage-unavailable'); }, create: vi.fn(), update: vi.fn(), remove: vi.fn() };
    await expect(createAnnotator({ root, document: { id: 'doc', renditionId: 'reader' }, storage, plugins: [{
      manifest: { id: 'resource', version: '1', apiVersion: 1, provides: [] }, setup({ registerDisposer }) { registerDisposer(() => { disposed++; }); }
    }] })).rejects.toThrow('storage-unavailable');
    expect(disposed).toBe(1);
  });
});
