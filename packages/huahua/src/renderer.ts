import type { Annotation, RendererMode } from './model.js';
import { resolveAnchor } from './anchor.js';
import type { TextIndex } from './model.js';
export type RenderStatus = { annotationId: string; status: string; candidates: number; reason?: string };
const overlays = new WeakMap<HTMLElement, HTMLElement>();
const overlayUpdates = new WeakMap<HTMLElement, () => void>();
const rootIds = new WeakMap<HTMLElement, number>();
let nextRootId = 0;
const colorValues = { yellow: 'rgba(255, 224, 82, .48)', green: 'rgba(105, 210, 145, .42)', blue: 'rgba(109, 178, 255, .40)', pink: 'rgba(255, 145, 179, .42)' };
type HighlightWindow = Window & { CSS?: typeof CSS; Highlight?: new (...ranges: Range[]) => Highlight };
export function renderAnnotations(root: HTMLElement, index: TextIndex, annotations: readonly Annotation[], identity: { renditionId: string; version?: string }, mode: RendererMode = 'auto'): RenderStatus[] {
  const w = root.ownerDocument.defaultView as HighlightWindow | null;
  const namespace = rootNamespace(root);
  const nativeAvailable = !!(w?.CSS?.highlights && w.Highlight);
  const useNative = mode === 'native' || (mode === 'auto' && nativeAvailable);
  if (mode === 'native' && !nativeAvailable) throw new Error('native-highlight-unavailable');
  const statuses: RenderStatus[] = [];
  for (const annotation of annotations) {
    const results = annotation.anchors.map(anchor => resolveAnchor(index, anchor, identity));
    const resolved = results.flatMap(result => result.ranges);
    const state = results.find(result => result.status === 'resolved') ?? results.find(result => result.status === 'ambiguous') ?? results[0];
    statuses.push({ annotationId: annotation.id, status: state?.status ?? 'orphaned', candidates: state?.candidates ?? 0, ...(state?.reason ? { reason: state.reason } : {}) });
  }
  if (useNative && w?.CSS?.highlights && w.Highlight) {
    removeOverlay(root);
    const registry = w.CSS.highlights;
    for (const key of [...registry.keys()]) if (key.startsWith(`huahua-${namespace}-`)) registry.delete(key);
    for (const color of ['yellow', 'green', 'blue', 'pink'] as const) {
      const ranges = annotations.filter(annotation => annotation.color === color).flatMap(annotation => annotation.anchors.flatMap(anchor => resolveAnchor(index, anchor, identity).ranges));
      if (ranges.length) registry.set(`huahua-${namespace}-${color}`, new w.Highlight(...ranges));
    }
    ensureNativeStyles(root.ownerDocument, namespace);
  } else {
    if (w?.CSS?.highlights) for (const key of [...w.CSS.highlights.keys()]) if (key.startsWith(`huahua-${namespace}-`)) w.CSS.highlights.delete(key);
    const paint = (): void => {
      const container = getOverlay(root); container.replaceChildren();
      for (const annotation of annotations) for (const anchor of annotation.anchors) {
        const result = resolveAnchor(index, anchor, identity);
        if (result.status !== 'resolved') continue;
        for (const range of result.ranges) for (const rect of (typeof range.getClientRects === 'function' ? [...range.getClientRects()] : [])) {
          const box = root.ownerDocument.createElement('span'); box.setAttribute('data-huahua-overlay-mark', annotation.id); box.setAttribute('aria-hidden', 'true');
          Object.assign(box.style, { position: 'fixed', left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px`, background: colorValues[annotation.color], pointerEvents: 'none', borderRadius: '2px' });
          container.append(box);
        }
      }
    };
    overlayUpdates.set(root, paint); paint();
    if (!root.hasAttribute('data-huahua-listening')) {
      root.setAttribute('data-huahua-listening', namespace);
      const update = (): void => overlayUpdates.get(root)?.();
      root.ownerDocument.addEventListener('scroll', update, true); w?.addEventListener('resize', update);
      overlayListeners.set(root, () => { root.ownerDocument.removeEventListener('scroll', update, true); w?.removeEventListener('resize', update); root.removeAttribute('data-huahua-listening'); });
    }
  }
  return statuses;
}
function ensureNativeStyles(doc: Document, namespace: string): void {
  if (doc.querySelector(`style[data-huahua-styles="${namespace}"]`)) return;
  const style = doc.createElement('style'); style.dataset.huahuaStyles = namespace;
  for (const [color, value] of Object.entries(colorValues)) style.textContent += `::highlight(huahua-${namespace}-${color}){background:${value};}`;
  (doc.head ?? doc.documentElement).append(style);
}
const overlayListeners = new WeakMap<HTMLElement, () => void>();
function rootNamespace(root: HTMLElement): string { let id = rootIds.get(root); if (id === undefined) { id = ++nextRootId; rootIds.set(root, id); } return `r${id}`; }
function getOverlay(root: HTMLElement): HTMLElement {
  let container = overlays.get(root);
  if (!container) { container = root.ownerDocument.createElement('div'); container.dataset.huahuaUi = ''; container.dataset.huahuaOverlay = ''; container.setAttribute('aria-hidden', 'true'); Object.assign(container.style, { position: 'fixed', inset: '0', pointerEvents: 'none', zIndex: '2147483640' }); root.ownerDocument.body.append(container); overlays.set(root, container); }
  return container;
}
function removeOverlay(root: HTMLElement): void { overlays.get(root)?.remove(); overlays.delete(root); overlayUpdates.delete(root); overlayListeners.get(root)?.(); overlayListeners.delete(root); }
export function clearHighlights(root: HTMLElement): void {
  const w = root.ownerDocument.defaultView as HighlightWindow | null;
  const registry = w?.CSS?.highlights; const namespace = rootNamespace(root);
  if (registry) for (const key of [...registry.keys()]) if (key.startsWith(`huahua-${namespace}-`)) registry.delete(key);
  removeOverlay(root);
  root.ownerDocument.querySelector(`style[data-huahua-styles="${namespace}"]`)?.remove();
}
