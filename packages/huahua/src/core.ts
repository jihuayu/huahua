import type { ActionPlugin, AdapterFactory, Annotation, AnnotationCommands, AnnotationEvent, AnnotationPatch, Color, ContentAdapter, DocumentIdentity, RendererMode, SelectionSnapshot, StorageAdapter, TextIndex, UISlot } from './model.js';
import { createTextIndex } from './indexer.js';
import { makeAnchor, resolveAnchor } from './anchor.js';
import { MemoryStorage } from './storage.js';
import { clearHighlights, renderAnnotations, type RenderStatus } from './renderer.js';
import { exportJSON, exportMarkdown } from './export.js';
import { createPluginRuntime, validateActions, type PluginEvent, type PluginRuntime, type ProviderSelection, type RegisteredPlugin } from './plugins.js';
export type HuahuaOptions = { root: HTMLElement; document: DocumentIdentity; storage?: StorageAdapter; content?: AdapterFactory; ui?: UISlot; actions?: ActionPlugin[]; plugins?: readonly RegisteredPlugin[]; providers?: ProviderSelection; signal?: AbortSignal; renderer?: RendererMode; onEvent?: (event: AnnotationEvent) => void; onPluginEvent?: (event: PluginEvent) => void };
export class Huahua {
  readonly root: HTMLElement; readonly document: DocumentIdentity; readonly storage: StorageAdapter; readonly content: ContentAdapter;
  readonly actions: readonly ActionPlugin[];
  readonly #plugins: PluginRuntime;
  readonly #listeners = new Set<(annotations: readonly Annotation[]) => void>(); readonly #onEvent: ((event: AnnotationEvent) => void) | undefined; readonly #ui: { destroy(): void } | undefined;
  #annotations: Annotation[] = []; #index: TextIndex; #selection: SelectionSnapshot | null = null; #generation = 0; #disposed = false; #observer: MutationObserver | null = null; #timer: number | null = null;
  #destroyPromise: Promise<void> | undefined;
  readonly commands: AnnotationCommands;
  readonly rendererMode: RendererMode;
  private constructor(options: HuahuaOptions, content: ContentAdapter, plugins: PluginRuntime) {
    this.root = options.root; this.document = { ...options.document }; this.storage = options.storage ?? new MemoryStorage(); this.content = content; this.#onEvent = options.onEvent; this.rendererMode = options.renderer ?? 'auto'; this.actions = options.actions ?? []; validateActions(this.actions);
    this.#plugins = plugins;
    this.#index = content.buildIndex();
    this.commands = { createHighlight: (s, c, n) => this.createHighlight(s, c, n), update: (id, patch) => this.update(id, patch), remove: id => this.remove(id) };
    this.#ui = options.ui?.({ annotations: this.#annotations, commands: this.commands, root: this.root, subscribe: listener => this.subscribe(listener) });
    this.#observer = new MutationObserver(() => this.scheduleRefresh()); this.#observer.observe(this.root, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['class', 'style', 'hidden'] });
    this.root.addEventListener('mouseup', this.onRootMouseUp); this.root.ownerDocument.addEventListener('selectionchange', this.onSelection);
  }
  static async create(options: HuahuaOptions): Promise<Huahua> {
    if (!options.document.id || !options.document.renditionId) throw new TypeError('document id and renditionId are required');
    if (!options.root.isConnected) throw new TypeError('root must be connected to the document');
    const plugins = await createPluginRuntime(options.plugins ?? [], {
      ...(options.providers === undefined ? {} : { providers: options.providers }),
      ...(options.signal === undefined ? {} : { signal: options.signal }),
      ...(options.onPluginEvent === undefined ? {} : { onEvent: options.onPluginEvent })
    });
    let content: ContentAdapter | undefined, instance: Huahua | undefined;
    try {
      content = (options.content ?? (root => ({ root, buildIndex: () => createTextIndex(root), destroy() {} })))(options.root);
      instance = new Huahua(options, content, plugins);
      instance.#annotations = await instance.storage.list(options.document.id); instance.refresh(); return instance;
    } catch (error) {
      if (instance) {
        try { await instance.destroy(); }
        catch (cleanupError) { throw new AggregateError([error, cleanupError], 'Annotator setup failed and cleanup reported errors', { cause: error }); }
      }
      else {
        const cleanupErrors: unknown[] = [];
        try { content?.destroy(); } catch (cleanupError) { cleanupErrors.push(cleanupError); }
        try { await plugins.destroy(); } catch (cleanupError) { cleanupErrors.push(cleanupError); }
        if (cleanupErrors.length) throw new AggregateError([error, ...cleanupErrors], 'Annotator setup failed and cleanup reported errors', { cause: error });
      }
      throw error;
    }
  }
  get annotations(): readonly Annotation[] { return this.#annotations; }
  get selection(): SelectionSnapshot | null { return this.#selection; }
  subscribe(listener: (annotations: readonly Annotation[]) => void): () => void { this.#listeners.add(listener); return () => this.#listeners.delete(listener); }
  refresh(): RenderStatus[] { this.#assertActive(); this.#index = this.content.buildIndex(); const statuses = renderAnnotations(this.root, this.#index, this.#annotations, this.document, this.rendererMode); this.emitSnapshot(); return statuses; }
  setDocument(document: DocumentIdentity): void { this.#assertActive(); this.document.id = document.id; this.document.renditionId = document.renditionId; if (document.version === undefined) delete this.document.version; else this.document.version = document.version; this.#generation++; this.#selection = null; this.#annotations = []; this.refresh(); void this.reload(); }
  async reload(signal?: AbortSignal): Promise<void> { const gen = this.#generation, id = this.document.id; try { const items = await this.storage.list(id, signal); if (this.#disposed || gen !== this.#generation || id !== this.document.id) return; this.#annotations = items; this.refresh(); } catch (e) { this.emitError(e); } }
  async runAction(id: string): Promise<void> { const action = this.actions.find(candidate => candidate.id === id); if (!action) throw new Error(`action-not-found:${id}`); await action.run({ selection: this.#selection, commands: this.commands }); }
  reanchor(id: string, start: number, end: number): Promise<Annotation> { const item = this.get(id); const anchor = makeAnchor(this.#index, start, end, this.document.renditionId, this.document.version); return this.updateFull(item, { anchors: [...item.anchors, anchor] }); }
  exportJSON(): string { return exportJSON(this.#annotations); }
  exportMarkdown(): string { return exportMarkdown(this.#annotations); }
  destroy(): Promise<void> {
    if (this.#destroyPromise) return this.#destroyPromise;
    this.#disposed = true; this.#generation++;
    this.#destroyPromise = Promise.resolve().then(async () => {
      const errors: unknown[] = [];
      try { if (this.#timer !== null) this.root.ownerDocument.defaultView?.clearTimeout(this.#timer); } catch (error) { errors.push(error); }
      try { this.#observer?.disconnect(); } catch (error) { errors.push(error); }
      try { this.root.removeEventListener('mouseup', this.onRootMouseUp); } catch (error) { errors.push(error); }
      try { this.root.ownerDocument.removeEventListener('selectionchange', this.onSelection); } catch (error) { errors.push(error); }
      try { clearHighlights(this.root); } catch (error) { errors.push(error); }
      try { this.#ui?.destroy(); } catch (error) { errors.push(error); }
      try { this.content.destroy(); } catch (error) { errors.push(error); }
      try { await this.#plugins.destroy(); } catch (error) { errors.push(error); }
      this.#listeners.clear();
      if (errors.length) throw new AggregateError(errors, 'Annotator cleanup failed');
    });
    return this.#destroyPromise;
  }
  readonly onRootMouseUp = (): void => {
    const selection = this.root.ownerDocument.getSelection();
    if (!selection || selection.isCollapsed || !this.root.contains(selection.anchorNode) || !this.root.contains(selection.focusNode)) { this.#selection = null; return; }
    this.onSelection();
  };
  readonly onSelection = (): void => { if (this.#disposed) return; const selection = this.root.ownerDocument.getSelection(); if (!selection || selection.isCollapsed) return; if (!this.root.contains(selection.anchorNode) || !this.root.contains(selection.focusNode)) { this.#selection = null; return; }
    const range = selection.getRangeAt(0), offsets = this.#index.rangeToOffsets(range); if (!offsets) { this.#selection = null; return; }
    let anchor: ReturnType<typeof makeAnchor>;
    try { anchor = makeAnchor(this.#index, offsets.start, offsets.end, this.document.renditionId, this.document.version); } catch { this.#selection = null; return; }
    this.#selection = { id: crypto.randomUUID(), quote: anchor.quote.exact, anchor, generation: this.#generation }; this.emitSnapshot();
  };
  async createHighlight(selection: { id: string; generation: number }, color: Color, note?: string): Promise<Annotation> {
    this.#assertActive(); const current = this.#selection;
    if (!current || current.id !== selection.id || selection.generation !== this.#generation || current.generation !== this.#generation) throw new Error('selection-stale');
    const now = new Date().toISOString(); const annotation: Annotation = { schemaVersion: 1, id: crypto.randomUUID(), documentId: this.document.id,
      anchors: [current.anchor], excerpt: { text: current.quote, capturedAt: now, renditionId: this.document.renditionId, ...(this.document.version === undefined ? {} : { contentVersion: this.document.version }) },
      color, bodies: note ? [{ id: crypto.randomUUID(), type: 'note', value: note, format: 'text/plain' }] : [], revision: '0', createdAt: now, updatedAt: now };
    this.#annotations = [...this.#annotations, annotation]; this.refresh(); this.#onEvent?.({ type: 'change', annotation, phase: 'local' });
    try { const saved = await this.storage.create(annotation, { operationId: annotation.id }); this.replace(saved); return saved; }
    catch (e) { this.emitError(e); throw e; }
  }
  async update(id: string, patch: AnnotationPatch): Promise<Annotation> { return this.updateFull(this.get(id), patch); }
  async remove(id: string): Promise<void> { const item = this.get(id); await this.storage.remove(id, { expectedRevision: item.revision, operationId: crypto.randomUUID() }); this.#annotations = this.#annotations.filter(a => a.id !== id); this.refresh(); }
  private async updateFull(item: Annotation, patch: AnnotationPatch): Promise<Annotation> {
    if ('excerpt' in patch || 'documentId' in patch || 'id' in patch) throw new Error('immutable-annotation-field');
    const saved = await this.storage.update(item.id, patch, { expectedRevision: item.revision, operationId: crypto.randomUUID() }); this.replace(saved); this.refresh(); return saved;
  }
  private replace(item: Annotation): void { this.#annotations = this.#annotations.map(a => a.id === item.id ? item : a); this.refresh(); this.#onEvent?.({ type: 'change', annotation: item, phase: 'persisted' }); }
  private get(id: string): Annotation { const item = this.#annotations.find(a => a.id === id); if (!item) throw new Error('annotation-not-found'); return item; }
  private scheduleRefresh(): void { if (this.#timer !== null) return; this.#timer = this.root.ownerDocument.defaultView?.setTimeout(() => { this.#timer = null; if (!this.#disposed) this.refresh(); }, 16) ?? null; }
  private emitSnapshot(): void { for (const listener of this.#listeners) listener(this.#annotations); }
  private emitError(error: unknown): void { const normalized = error instanceof Error ? error : new Error(String(error)); this.#onEvent?.({ type: 'error', error: normalized }); }
  #assertActive(): void { if (this.#disposed) throw new Error('huahua-destroyed'); }
}
export function createAnnotator(options: HuahuaOptions): Promise<Huahua> { return Huahua.create(options); }
export type { ActionPlugin, Anchor, Annotation, AnnotationPatch, Color, ContentAdapter, DocumentIdentity, ResolveResult, StorageAdapter, UISlot } from './model.js';
export { createTextIndex } from './indexer.js'; export { makeAnchor, resolveAnchor } from './anchor.js'; export { MemoryStorage } from './storage.js'; export { exportJSON, exportMarkdown } from './export.js';
