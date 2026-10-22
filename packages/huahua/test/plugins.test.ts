import { describe, expect, it } from 'vitest';
import { createPluginRuntime, orderPlugins, type RegisteredPlugin } from '../src/plugins.js';

const plugin = (id: string, provides: Array<{ capability: string; version: number; multiple?: boolean }>, requires: Array<{ capability: string; version: number }> = [], setup: RegisteredPlugin['setup'] = () => undefined): RegisteredPlugin => ({
  manifest: { id, version: '1.0.0', apiVersion: 1, provides, ...(requires.length ? { requires } : {}) }, setup
});

describe('plugin provider resolution', () => {
  it('orders dependencies before consumers independent of declaration order', () => {
    const calls: string[] = [];
    const consumer = plugin('consumer', [{ capability: 'reader.commands', version: 1 }], [{ capability: 'reader.selection', version: 1 }], () => { calls.push('consumer'); });
    const provider = plugin('provider', [{ capability: 'reader.selection', version: 1 }], [], () => { calls.push('provider'); });
    expect(orderPlugins([consumer, provider]).map(item => item.manifest.id)).toEqual(['provider', 'consumer']);
  });
  it('rejects missing capabilities, cycles, duplicate IDs and declared conflicts', () => {
    expect(() => orderPlugins([plugin('consumer', [], [{ capability: 'missing', version: 1 }])])).toThrow('missing capability');
    const alpha = plugin('alpha', [{ capability: 'a', version: 1 }], [{ capability: 'b', version: 1 }]);
    const beta = plugin('beta', [{ capability: 'b', version: 1 }], [{ capability: 'a', version: 1 }]);
    expect(() => orderPlugins([alpha, beta])).toThrow('dependency cycle');
    expect(() => orderPlugins([plugin('same', []), plugin('same', [])])).toThrow('duplicate plugin id');
    const first = plugin('first', []); const second = { ...plugin('second', []), manifest: { ...plugin('second', []).manifest, conflicts: ['first'] } };
    expect(() => orderPlugins([first, second])).toThrow('plugin conflict');
  });
  it('requires explicit selection for conflicting providers and only starts the selected provider', async () => {
    const first = plugin('storage-a', [{ capability: 'annotation.storage', version: 1 }]);
    const second = plugin('storage-b', [{ capability: 'annotation.storage', version: 1 }]);
    const needsStorage = plugin('reader', [], [{ capability: 'annotation.storage', version: 1 }]);
    expect(() => orderPlugins([first, second, needsStorage])).toThrow('provider conflict');
    const runtime = await createPluginRuntime([first, second, needsStorage], { providers: { 'annotation.storage': 'storage-b' } });
    expect(runtime.plugins.map(item => item.manifest.id)).toEqual(['storage-b', 'reader']);
    await runtime.destroy();
  });
  it('allows explicitly multi-provider capabilities but still rejects ambiguous consumers', () => {
    const first = plugin('codec-a', [{ capability: 'export.json', version: 1, multiple: true }]);
    const second = plugin('codec-b', [{ capability: 'export.json', version: 1, multiple: true }]);
    expect(orderPlugins([first, second])).toHaveLength(2);
    const consumer = plugin('consumer', [], [{ capability: 'export.json', version: 1 }]);
    expect(() => orderPlugins([first, second, consumer])).toThrow('ambiguous provider');
  });
});

describe('plugin runtime lifecycle', () => {
  it('rolls a partial failing setup back in reverse order and disposes all registered resources', async () => {
    const calls: string[] = [];
    const first: RegisteredPlugin = { manifest: { id: 'first', version: '1', apiVersion: 1, provides: [] }, setup({ registerDisposer }) { calls.push('first:setup'); registerDisposer(() => { calls.push('first:dispose'); }); }, destroy() { calls.push('first:destroy'); } };
    const failing: RegisteredPlugin = { manifest: { id: 'failing', version: '1', apiVersion: 1, provides: [] }, setup({ registerDisposer }) { calls.push('failing:setup'); registerDisposer(() => { calls.push('failing:dispose'); }); throw new Error('setup-broke'); }, destroy() { calls.push('failing:destroy'); } };
    await expect(createPluginRuntime([first, failing])).rejects.toThrow('setup-broke');
    expect(calls).toEqual(['first:setup', 'failing:setup', 'failing:dispose', 'failing:destroy', 'first:dispose', 'first:destroy']);
  });
  it('continues cleanup after disposer errors and makes destroy idempotent', async () => {
    const calls: string[] = [];
    const item: RegisteredPlugin = { manifest: { id: 'cleaner', version: '1', apiVersion: 1, provides: [] }, setup({ registerDisposer }) { registerDisposer(() => { calls.push('last'); throw new Error('cleanup-error'); }); registerDisposer(() => { calls.push('first'); }); }, destroy() { calls.push('destroy'); } };
    const runtime = await createPluginRuntime([item]); const first = runtime.destroy(); const second = runtime.destroy();
    expect(first).toBe(second);
    let cleanupFailure: unknown; try { await first; } catch (error) { cleanupFailure = error; }
    expect(cleanupFailure).toBeInstanceOf(AggregateError);
    expect((cleanupFailure as AggregateError).errors.map(error => (error as Error).message)).toEqual(['cleanup-error']);
    await expect(runtime.destroy()).rejects.toBe(cleanupFailure);
    expect(runtime.signal.aborted).toBe(true); expect(calls).toEqual(['first', 'last', 'destroy']);
  });
  it('cancels in-flight setup through AbortSignal and rolls back partial resources', async () => {
    const controller = new AbortController(); let started!: () => void; const didStart = new Promise<void>(resolve => { started = resolve; }); const calls: string[] = [];
    const blocking: RegisteredPlugin = { manifest: { id: 'blocking', version: '1', apiVersion: 1, provides: [] }, setup({ signal, registerDisposer }) { registerDisposer(() => { calls.push('dispose'); }); started(); return new Promise<void>(resolve => signal.addEventListener('abort', () => { calls.push('abort'); resolve(); }, { once: true })); } };
    const running = createPluginRuntime([blocking], { signal: controller.signal }); await didStart; controller.abort(new Error('host-cancelled'));
    await expect(running).rejects.toThrow('host-cancelled'); expect(calls).toEqual(['abort', 'dispose']);
  });
  it('isolates lifecycle observer exceptions from successful setup', async () => {
    const item = plugin('quiet', []); const runtime = await createPluginRuntime([item], { onEvent() { throw new Error('observer-error'); } });
    expect(runtime.ready).toBe(true); await expect(runtime.destroy()).resolves.toBeUndefined();
  });
});
