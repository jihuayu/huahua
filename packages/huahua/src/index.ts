export { createAnnotator, Huahua } from './core.js';
export { createTextIndex } from './indexer.js';
export { makeAnchor, resolveAnchor } from './anchor.js';
export { isAnnotation, LocalStorageAdapter, MemoryStorage } from './storage.js';
export { exportJSON, exportMarkdown, importJSON } from './export.js';
export { orderPlugins, validateActions } from './plugins.js';
export { createPluginRuntime, PluginRuntime } from './plugins.js';
export type { Capability, PluginDisposer, PluginEvent, PluginManifest, PluginRuntimeOptions, ProviderSelection, RegisteredPlugin } from './plugins.js';
export type { ActionPlugin, Anchor, Annotation, AnnotationCommands, AnnotationEvent, AnnotationPatch, Color, ContentAdapter, DocumentIdentity, RendererMode, ResolveResult, SelectionSnapshot, StorageAdapter, TextIndex, UISlot } from './model.js';
