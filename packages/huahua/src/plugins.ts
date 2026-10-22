import type { ActionPlugin } from './model.js';

export type Capability = { capability: string; version: number; multiple?: boolean };
export type PluginManifest = {
  id: string;
  version: string;
  apiVersion: number;
  requires?: Capability[];
  provides: Capability[];
  conflicts?: string[];
};
export type PluginDisposer = () => void | Promise<void>;
export type PluginEvent = {
  type: 'setup:start' | 'setup:ready' | 'setup:error' | 'dispose:start' | 'dispose:done' | 'dispose:error' | 'cancelled';
  pluginId: string;
  error?: Error;
};
export type RegisteredPlugin = {
  manifest: PluginManifest;
  setup(context: { signal: AbortSignal; registerDisposer(dispose: PluginDisposer): void }): void | Promise<void>;
  destroy?(): void | Promise<void>;
};
export type ProviderSelection = Readonly<Record<string, string>>;
export type PluginRuntimeOptions = {
  providers?: ProviderSelection;
  signal?: AbortSignal;
  onEvent?: (event: PluginEvent) => void;
};

function capabilityKey(capability: Capability): string { return `${capability.capability}@${capability.version}`; }
function abortError(signal: AbortSignal): Error { return signal.reason instanceof Error ? signal.reason : new DOMException('Plugin setup aborted', 'AbortError'); }

export function orderPlugins(plugins: readonly RegisteredPlugin[], providers: ProviderSelection = {}): RegisteredPlugin[] {
  const byId = new Map<string, RegisteredPlugin>();
  const providerGroups = new Map<string, RegisteredPlugin[]>();
  for (const plugin of plugins) {
    const { id, version, apiVersion } = plugin.manifest;
    if (!id || !version || apiVersion !== 1) throw new Error(`invalid plugin manifest for ${id || '<unknown>'}: apiVersion must be 1`);
    if (byId.has(id)) throw new Error(`duplicate plugin id: ${id}`);
    byId.set(id, plugin);
    for (const provided of plugin.manifest.provides) {
      if (!provided.capability || !Number.isInteger(provided.version) || provided.version < 1) throw new Error(`invalid capability provided by ${id}`);
      const key = capabilityKey(provided), group = providerGroups.get(key) ?? [];
      group.push(plugin); providerGroups.set(key, group);
    }
  }
  for (const plugin of plugins) for (const otherId of plugin.manifest.conflicts ?? []) {
    if (!byId.has(otherId)) continue;
    if (otherId === plugin.manifest.id) throw new Error(`plugin ${otherId} conflicts with itself`);
    throw new Error(`plugin conflict: ${plugin.manifest.id} conflicts with ${otherId}`);
  }
  for (const [key, group] of providerGroups) {
    if (group.length < 2 || group.every(plugin => plugin.manifest.provides.some(p => capabilityKey(p) === key && p.multiple === true))) continue;
    const name = key.slice(0, key.lastIndexOf('@'));
    const selected = providers[name];
    if (!selected || !group.some(plugin => plugin.manifest.id === selected)) throw new Error(`provider conflict for ${key}; select one provider explicitly`);
  }
  for (const [capability, pluginId] of Object.entries(providers)) {
    const plugin = byId.get(pluginId);
    if (!plugin || !plugin.manifest.provides.some(p => p.capability === capability)) throw new Error(`invalid provider selection: ${capability} -> ${pluginId}`);
  }
  const excludedProviders = new Set<string>();
  for (const [key, group] of providerGroups) {
    if (group.length < 2 || group.every(plugin => plugin.manifest.provides.some(p => capabilityKey(p) === key && p.multiple === true))) continue;
    const capability = key.slice(0, key.lastIndexOf('@')), selected = providers[capability];
    for (const plugin of group) if (plugin.manifest.id !== selected) excludedProviders.add(plugin.manifest.id);
  }
  const activePlugins = plugins.filter(plugin => !excludedProviders.has(plugin.manifest.id));
  const sorted: RegisteredPlugin[] = [], visiting = new Set<string>(), visited = new Set<string>();
  const visit = (plugin: RegisteredPlugin, path: string[]): void => {
    const id = plugin.manifest.id;
    if (visited.has(id)) return;
    if (visiting.has(id)) throw new Error(`plugin dependency cycle: ${[...path, id].join(' -> ')}`);
    visiting.add(id);
    for (const required of plugin.manifest.requires ?? []) {
      const matching = activePlugins.filter(candidate => candidate.manifest.provides.some(provided => provided.capability === required.capability && provided.version === required.version));
      if (!matching.length) throw new Error(`missing capability ${capabilityKey(required)} required by ${id}`);
      let provider: RegisteredPlugin | undefined;
      const selectedId = providers[required.capability];
      if (selectedId) provider = matching.find(candidate => candidate.manifest.id === selectedId);
      else if (matching.length === 1) provider = matching[0];
      else throw new Error(`ambiguous provider for ${capabilityKey(required)} required by ${id}; select one provider explicitly`);
      if (!provider) throw new Error(`selected provider for ${capabilityKey(required)} does not satisfy ${id}`);
      visit(provider, [...path, id]);
    }
    visiting.delete(id); visited.add(id); sorted.push(plugin);
  };
  activePlugins.forEach(plugin => visit(plugin, []));
  return sorted;
}

export class PluginRuntime {
  readonly plugins: readonly RegisteredPlugin[];
  readonly signal: AbortSignal;
  readonly #controller = new AbortController();
  readonly #externalSignal: AbortSignal | undefined;
  readonly #onEvent: ((event: PluginEvent) => void) | undefined;
  readonly #started: RegisteredPlugin[] = [];
  readonly #disposers = new Map<string, PluginDisposer[]>();
  #state: 'setting-up' | 'ready' | 'disposing' | 'disposed' | 'failed' = 'setting-up';
  #destroyPromise: Promise<void> | undefined;

  private constructor(plugins: RegisteredPlugin[], options: PluginRuntimeOptions) {
    this.plugins = plugins; this.signal = this.#controller.signal; this.#externalSignal = options.signal; this.#onEvent = options.onEvent;
    if (options.signal?.aborted) this.#controller.abort(options.signal.reason);
    else options.signal?.addEventListener('abort', this.onExternalAbort, { once: true });
  }

  static async create(plugins: readonly RegisteredPlugin[], options: PluginRuntimeOptions = {}): Promise<PluginRuntime> {
    const ordered = orderPlugins(plugins, options.providers);
    const runtime = new PluginRuntime(ordered, options);
    try {
      for (const plugin of ordered) {
        if (runtime.signal.aborted) throw abortError(runtime.signal);
        const id = plugin.manifest.id;
        const disposers = runtime.#disposers.get(id) ?? [];
        runtime.#disposers.set(id, disposers);
        let acceptingDisposers = true;
        runtime.#started.push(plugin);
        runtime.#emit({ type: 'setup:start', pluginId: id });
        try {
          await plugin.setup({
            signal: runtime.signal,
            registerDisposer(dispose) {
              if (!acceptingDisposers || runtime.#state !== 'setting-up') throw new Error(`plugin ${id} registered a disposer outside setup`);
              disposers.push(dispose);
            }
          });
        } catch (error) {
          acceptingDisposers = false;
          const normalized = error instanceof Error ? error : new Error(String(error));
          runtime.#emit({ type: 'setup:error', pluginId: id, error: normalized });
          throw normalized;
        }
        acceptingDisposers = false;
        if (runtime.signal.aborted) throw abortError(runtime.signal);
        runtime.#emit({ type: 'setup:ready', pluginId: id });
      }
      runtime.#state = 'ready';
      return runtime;
    } catch (error) {
      options.signal?.removeEventListener('abort', runtime.onExternalAbort);
      const cause = error instanceof Error ? error : new Error(String(error));
      if (runtime.signal.aborted) runtime.#emit({ type: 'cancelled', pluginId: runtime.#started.at(-1)?.manifest.id ?? '<runtime>', error: cause });
      runtime.#controller.abort(cause);
      const cleanupErrors = await runtime.#disposeStarted('failed');
      runtime.#state = 'failed';
      if (cleanupErrors.length) throw new AggregateError([cause, ...cleanupErrors], 'Plugin setup failed and rollback reported errors', { cause });
      throw cause;
    }
  }

  get ready(): boolean { return this.#state === 'ready'; }
  destroy(): Promise<void> {
    if (this.#destroyPromise) return this.#destroyPromise;
    this.#destroyPromise = Promise.resolve().then(async () => {
      if (this.#state === 'disposed' || this.#state === 'failed') return;
      this.#state = 'disposing';
      this.#controller.abort(new DOMException('Plugin runtime destroyed', 'AbortError'));
      this.#externalSignal?.removeEventListener('abort', this.onExternalAbort);
      const errors = await this.#disposeStarted('disposed');
      this.#state = 'disposed';
      if (errors.length) throw new AggregateError(errors, 'One or more plugin disposers failed');
    });
    return this.#destroyPromise;
  }

  readonly onExternalAbort = (): void => { if (!this.#controller.signal.aborted) this.#controller.abort(this.#externalSignal?.reason); };
  #emit(event: PluginEvent): void { try { this.#onEvent?.(event); } catch { /* Observer callbacks cannot break setup or teardown. */ } }

  async #disposeStarted(phase: 'failed' | 'disposed'): Promise<Error[]> {
    const errors: Error[] = [];
    for (const plugin of [...this.#started].reverse()) {
      const id = plugin.manifest.id;
      this.#emit({ type: 'dispose:start', pluginId: id });
      const disposers = this.#disposers.get(id) ?? [];
      this.#disposers.set(id, []);
      for (const dispose of disposers.reverse()) {
        try { await dispose(); }
        catch (error) { const normalized = error instanceof Error ? error : new Error(String(error)); errors.push(normalized); this.#emit({ type: 'dispose:error', pluginId: id, error: normalized }); }
      }
      try { await plugin.destroy?.(); }
      catch (error) { const normalized = error instanceof Error ? error : new Error(String(error)); errors.push(normalized); this.#emit({ type: 'dispose:error', pluginId: id, error: normalized }); }
      this.#emit({ type: 'dispose:done', pluginId: id });
    }
    this.#started.length = 0;
    if (phase === 'failed') this.#state = 'failed';
    return errors;
  }
}

export function createPluginRuntime(plugins: readonly RegisteredPlugin[], options: PluginRuntimeOptions = {}): Promise<PluginRuntime> {
  return PluginRuntime.create(plugins, options);
}

export function validateActions(actions: readonly ActionPlugin[]): void {
  const ids = new Set<string>();
  for (const action of actions) {
    if (!action.id || ids.has(action.id)) throw new Error(`duplicate or empty action id: ${action.id}`);
    ids.add(action.id);
  }
}
