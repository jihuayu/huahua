export type Color = 'yellow' | 'green' | 'blue' | 'pink';
export type Anchor = {
  profile: 'html-reader-v1'; unit: 'utf16'; renditionId: string;
  quote: { exact: string; prefix: string; suffix: string };
  position: { start: number; end: number };
  contentVersion?: string;
};
export type Annotation = {
  schemaVersion: 1; id: string; documentId: string; sourceUrl?: string; anchors: Anchor[];
  excerpt: { text: string; capturedAt: string; renditionId: string; contentVersion?: string };
  color: Color; bodies: Array<{ id: string; type: 'note' | 'tag'; value: string; format: 'text/plain' }>;
  revision: string; createdAt: string; updatedAt: string;
};
export type AnnotationPatch = Partial<Pick<Annotation, 'anchors' | 'color' | 'bodies'>>;
export type ResolveStatus = 'resolved' | 'ambiguous' | 'orphaned' | 'deferred';
export type ResolveResult = { status: ResolveStatus; ranges: Range[]; candidates: number; strategy?: 'position' | 'quote'; reason?: string };
export type DocumentIdentity = { id: string; renditionId: string; version?: string };
export type StorageAdapter = {
  list(documentId: string, signal?: AbortSignal): Promise<Annotation[]>;
  create(annotation: Annotation, context: { operationId: string; signal?: AbortSignal }): Promise<Annotation>;
  update(id: string, patch: AnnotationPatch, context: { expectedRevision: string; operationId: string; signal?: AbortSignal }): Promise<Annotation>;
  remove(id: string, context: { expectedRevision: string; operationId: string; signal?: AbortSignal }): Promise<void>;
};
export type ContentAdapter = { root: HTMLElement; buildIndex(): TextIndex; destroy(): void };
export type AdapterFactory = (root: HTMLElement) => ContentAdapter;
export type TextSegment = { start: number; end: number; node: Text; nodeStart: number; nodeEnd: number };
export type TextIndex = { text: string; segments: TextSegment[]; version: number; rangeToOffsets(range: Range): { start: number; end: number } | null; offsetsToRanges(start: number, end: number): Range[] };
export type AnnotationCommands = {
  createHighlight(selection: { id: string; generation: number }, color: Color, note?: string): Promise<Annotation>;
  update(id: string, patch: AnnotationPatch): Promise<Annotation>;
  remove(id: string): Promise<void>;
};
export type UIContext = { annotations: readonly Annotation[]; commands: AnnotationCommands; root: HTMLElement; subscribe(listener: (annotations: readonly Annotation[]) => void): () => void };
export type UISlot = (context: UIContext) => { destroy(): void };
export type RendererMode = 'auto' | 'native' | 'overlay';
export type ActionPlugin = { id: string; label: string; run(context: { selection: SelectionSnapshot | null; commands: AnnotationCommands }): void | Promise<void> };
export type SelectionSnapshot = { id: string; quote: string; anchor: Anchor; generation: number };
export type AnnotationEvent = { type: 'change' | 'error'; annotation?: Annotation; error?: Error; phase?: 'local' | 'persisted' };
