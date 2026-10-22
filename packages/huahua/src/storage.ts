import type { Annotation, AnnotationPatch, StorageAdapter } from './model.js';
export class MemoryStorage implements StorageAdapter {
  readonly #items = new Map<string, Annotation>();
  async list(documentId: string, signal?: AbortSignal): Promise<Annotation[]> { signal?.throwIfAborted(); return [...this.#items.values()].filter(x => x.documentId === documentId).map(copy); }
  async create(annotation: Annotation, context: { operationId: string; signal?: AbortSignal }): Promise<Annotation> { context.signal?.throwIfAborted(); const prior = this.#items.get(annotation.id); if (prior) return copy(prior); this.#items.set(annotation.id, copy(annotation)); return copy(annotation); }
  async update(id: string, patch: AnnotationPatch, context: { expectedRevision: string; operationId: string; signal?: AbortSignal }): Promise<Annotation> {
    context.signal?.throwIfAborted(); const item = this.#items.get(id); if (!item) throw new Error('annotation-not-found'); if (item.revision !== context.expectedRevision) throw new Error('revision-conflict');
    const next: Annotation = { ...item, ...patch, revision: String(Number(item.revision) + 1), updatedAt: new Date().toISOString() }; this.#items.set(id, next); return copy(next);
  }
  async remove(id: string, context: { expectedRevision: string; operationId: string; signal?: AbortSignal }): Promise<void> { context.signal?.throwIfAborted(); const item = this.#items.get(id); if (!item) return; if (item.revision !== context.expectedRevision) throw new Error('revision-conflict'); this.#items.delete(id); }
}
/** Explicit browser persistence adapter. Supply localStorage only after the host's consent and storage policy permit it. */
export class LocalStorageAdapter implements StorageAdapter {
  constructor(private readonly storage: Storage, private readonly prefix = 'huahua:v1') {}
  async list(documentId: string, signal?: AbortSignal): Promise<Annotation[]> { signal?.throwIfAborted(); return this.read(documentId); }
  async create(annotation: Annotation, context: { operationId: string; signal?: AbortSignal }): Promise<Annotation> {
    context.signal?.throwIfAborted(); const items = this.read(annotation.documentId); const old = items.find(item => item.id === annotation.id); if (old) return copy(old);
    items.push(copy(annotation)); this.write(annotation.documentId, items); return copy(annotation);
  }
  async update(id: string, patch: AnnotationPatch, context: { expectedRevision: string; operationId: string; signal?: AbortSignal }): Promise<Annotation> {
    context.signal?.throwIfAborted(); const documentId = this.findDocumentId(id); if (!documentId) throw new Error('annotation-not-found');
    const items = this.read(documentId), index = items.findIndex(item => item.id === id), current = items[index];
    if (!current) throw new Error('annotation-not-found'); if (current.revision !== context.expectedRevision) throw new Error('revision-conflict');
    const next: Annotation = { ...current, ...patch, revision: String(Number(current.revision) + 1), updatedAt: new Date().toISOString() }; items[index] = next; this.write(documentId, items); return copy(next);
  }
  async remove(id: string, context: { expectedRevision: string; operationId: string; signal?: AbortSignal }): Promise<void> {
    context.signal?.throwIfAborted(); const documentId = this.findDocumentId(id); if (!documentId) return;
    const items = this.read(documentId), current = items.find(item => item.id === id); if (!current) return;
    if (current.revision !== context.expectedRevision) throw new Error('revision-conflict'); this.write(documentId, items.filter(item => item.id !== id));
  }
  private key(documentId: string): string { return `${this.prefix}:${encodeURIComponent(documentId)}`; }
  private read(documentId: string): Annotation[] { const raw = this.storage.getItem(this.key(documentId)); if (!raw) return []; const value: unknown = JSON.parse(raw); if (!Array.isArray(value) || !value.every(isAnnotation)) throw new Error('corrupt-local-annotation-data'); return value.filter(item => item.documentId === documentId).map(copy); }
  private write(documentId: string, items: Annotation[]): void { this.storage.setItem(this.key(documentId), JSON.stringify(items)); }
  private findDocumentId(id: string): string | null {
    for (let i = 0; i < this.storage.length; i++) { const key = this.storage.key(i); if (!key?.startsWith(`${this.prefix}:`)) continue; const docId = decodeURIComponent(key.slice(this.prefix.length + 1)); if (this.read(docId).some(item => item.id === id)) return docId; }
    return null;
  }
}
export function isAnnotation(value: unknown): value is Annotation {
  if (typeof value !== 'object' || value === null) return false;
  const x = value as Record<string, unknown>, excerpt = x.excerpt, anchors = x.anchors, bodies = x.bodies;
  if (x.schemaVersion !== 1 || typeof x.id !== 'string' || typeof x.documentId !== 'string' || !Array.isArray(anchors) || !Array.isArray(bodies)) return false;
  if (!['yellow', 'green', 'blue', 'pink'].includes(String(x.color)) || typeof x.revision !== 'string') return false;
  if (typeof excerpt !== 'object' || excerpt === null || typeof (excerpt as Record<string, unknown>).text !== 'string') return false;
  const validAnchor = (anchor: unknown): boolean => {
    if (typeof anchor !== 'object' || anchor === null) return false;
    const a = anchor as Record<string, unknown>, quote = a.quote, position = a.position;
    return a.profile === 'html-reader-v1' && a.unit === 'utf16' && typeof a.renditionId === 'string' && typeof quote === 'object' && quote !== null && typeof (quote as Record<string, unknown>).exact === 'string' && typeof (quote as Record<string, unknown>).prefix === 'string' && typeof (quote as Record<string, unknown>).suffix === 'string' && typeof position === 'object' && position !== null && Number.isInteger((position as Record<string, unknown>).start) && Number.isInteger((position as Record<string, unknown>).end);
  };
  const validBody = (body: unknown): boolean => {
    if (typeof body !== 'object' || body === null) return false; const b = body as Record<string, unknown>;
    return typeof b.id === 'string' && (b.type === 'note' || b.type === 'tag') && typeof b.value === 'string' && b.format === 'text/plain';
  };
  const e = excerpt as Record<string, unknown>;
  return typeof e.renditionId === 'string' && typeof e.capturedAt === 'string' && anchors.every(validAnchor) && bodies.every(validBody);
}
function copy<T>(value: T): T { return structuredClone(value); }
