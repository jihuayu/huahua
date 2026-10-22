# Huahua

Huahua is a small, framework-agnostic TypeScript SDK for Cubox-style reading annotations: select text in an HTML reading area, save a colored highlight and an excerpt, add a plain-text note, then resolve the excerpt against later content. The first release prioritizes explicit evidence and safe failure: a missing or ambiguous match is never silently highlighted elsewhere.

> v0.1 is an early implementation. It supports HTML roots and in-memory storage; it does not yet provide durable browser storage, a built-in toolbar, or production-grade native/overlay rendering.

## Install

```sh
pnpm add @huahua/core
```

## Basic use

```ts
import { createAnnotator } from '@huahua/core';

const huahua = await createAnnotator({
  root: document.querySelector('article')!,
  document: { id: 'article:42', renditionId: 'reader', version: 'rev7' },
  onEvent(event) {
    if (event.type === 'error') console.error(event.error);
  }
});

// The host renders its own toolbar and calls this command with the current selection.
const selection = huahua.selection;
if (selection) await huahua.commands.createHighlight(selection, 'yellow', 'A useful note');

// Keep this annotation list in a host-owned sidebar, and clean up on unmount.
const unsubscribe = huahua.subscribe(items => console.log(items));
// On teardown:
unsubscribe();
huahua.destroy();
```

The default storage adapter is in-memory. For browser persistence, explicitly pass `new LocalStorageAdapter(window.localStorage)` after applying the host's storage policy, or supply another `StorageAdapter`. A host provides stable `document.id` and distinct `renditionId` values for original and saved-reader views. A position from one rendition is never applied to another. Use `exportJSON` and `importJSON` for validated backups.

## Guarantees and limits

- Original excerpt text and its source anchor are captured separately from editable notes.
- Quote recovery requires a unique, sufficiently supported candidate. Ambiguous and orphaned states are exposed by `resolveAnchor`.
- HTML index offsets use UTF-16 code units, matching DOM Range offsets. W3C TextPositionSelector conversion must explicitly convert units.
- The library does not upload data or fetch source pages. Storage and authentication belong to the host.
- v0.1 does not support editors, PDF, canvas text, cross-origin frames, closed shadow roots, or unmounted virtualized text.

See [the architecture and implementation scope](docs/design.md) for the design summary and deferred work.

## Development

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
```

The Playwright suite uses Chromium, Firefox, and WebKit browser engines. Playwright WebKit is not real Safari; desktop Safari and physical iOS/Android interaction remain unverified unless the separate device checklist is completed.
