import type { ActionPlugin } from './model.js';
export type PluginManifest = { id: string; version: string; apiVersion: number; requires?: Array<{ capability: string; version: number }>; provides: Array<{ capability: string; version: number }> };
export type RegisteredPlugin = { manifest: PluginManifest; setup(context: { signal: AbortSignal; registerDisposer(dispose: () => void): void }): void | Promise<void> };
export function orderPlugins(plugins: readonly RegisteredPlugin[]): RegisteredPlugin[] {
  const byId = new Map<string, RegisteredPlugin>();
  for (const plugin of plugins) { if (byId.has(plugin.manifest.id)) throw new Error(`duplicate plugin id: ${plugin.manifest.id}`); byId.set(plugin.manifest.id, plugin); }
  const providers = new Map<string, number>();
  for (const plugin of plugins) for (const capability of plugin.manifest.provides) providers.set(capability.capability, (providers.get(capability.capability) ?? 0) + 1);
  const sorted: RegisteredPlugin[] = [], visiting = new Set<string>(), visited = new Set<string>();
  const visit = (plugin: RegisteredPlugin, path: string[]): void => {
    const id = plugin.manifest.id;
    if (visited.has(id)) return;
    if (visiting.has(id)) throw new Error(`plugin dependency cycle: ${[...path, id].join(' -> ')}`);
    visiting.add(id);
    for (const req of plugin.manifest.requires ?? []) {
      const matching = plugins.filter(p => p.manifest.provides.some(c => c.capability === req.capability && c.version === req.version));
      if (!matching.length) throw new Error(`missing capability ${req.capability}@${req.version} required by ${id}`);
      if ((providers.get(req.capability) ?? 0) > 1) throw new Error(`ambiguous provider for ${req.capability}`);
      const provider = matching[0]; if (provider) visit(provider, [...path, id]);
    }
    visiting.delete(id); visited.add(id); sorted.push(plugin);
  };
  plugins.forEach(p => visit(p, [])); return sorted;
}
export function validateActions(actions: readonly ActionPlugin[]): void {
  const ids = new Set<string>(); for (const action of actions) { if (ids.has(action.id)) throw new Error(`duplicate action id: ${action.id}`); ids.add(action.id); }
}
