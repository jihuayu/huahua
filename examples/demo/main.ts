import { createAnnotator } from '@huahua/core';
const output = document.querySelector('output')!;
const huahua = await createAnnotator({ root: document.querySelector<HTMLElement>('#article')!, document: { id: 'demo:article', renditionId: 'web', version: '1' }, renderer: new URLSearchParams(location.search).get('renderer') === 'overlay' ? 'overlay' : 'auto' });
document.querySelector('#highlight')!.addEventListener('click', async () => {
  const selection = huahua.selection;
  if (!selection) { output.textContent = 'Select a phrase in the article first.'; return; }
  try { const note = await huahua.commands.createHighlight(selection, 'yellow'); output.textContent = `Saved excerpt: ${note.excerpt.text}`; }
  catch (error) { output.textContent = error instanceof Error ? error.message : String(error); }
});
