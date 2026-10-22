import type { Annotation } from './model.js';
import { isAnnotation } from './storage.js';
export function exportJSON(annotations: readonly Annotation[]): string { return JSON.stringify({ protocol: 'huahua-annotations-v1', annotations }, null, 2); }
export function importJSON(source: string): Annotation[] {
  const value: unknown = JSON.parse(source);
  if (typeof value !== 'object' || value === null || (value as Record<string, unknown>).protocol !== 'huahua-annotations-v1' || !Array.isArray((value as Record<string, unknown>).annotations)) throw new TypeError('invalid-huahua-export');
  const records: unknown[] = (value as { annotations: unknown[] }).annotations;
  if (!records.every(isAnnotation)) throw new TypeError('invalid-annotation-record');
  const ids = records.map(record => (record as Annotation).id); if (new Set(ids).size !== ids.length) throw new TypeError('duplicate-annotation-id');
  return records as Annotation[];
}
export function exportMarkdown(annotations: readonly Annotation[]): string {
  return annotations.map(a => `## ${escapeMd(a.excerpt.text)}\n\n${a.sourceUrl ? `[Source](${a.sourceUrl.replace(/[()]/g, '')}) · ` : ''}${new Date(a.createdAt).toLocaleString()}\n\n${a.bodies.filter(b => b.type === 'note').map(b => b.value).join('\n\n') || '_No note_'}\n`).join('\n---\n\n');
}
function escapeMd(text: string): string { return text.replace(/[\\`*_{}\[\]<>]/g, '\\$&').replace(/\n/g, ' '); }
