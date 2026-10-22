# Huahua design summary

**Status:** architecture proposal; v0.1 implementation in progress. Updated 2026-10-22. The parent task supplied the complete 22-chapter RFC as implementation guidance. This file condenses its binding decisions for maintainers; it is not a verbatim copy of that RFC.

## Product and v0.1 scope

Huahua is an independent, Cubox-style web reading annotation SDK, not a feedback ticket system. The stable relationship is document → excerpt/highlight → note. It targets an explicitly supplied HTML reading root and provides a framework-agnostic TypeScript core, text selection, color highlights, immutable excerpt evidence, notes, serialization/export, recovery states, and explicit manual relocation. Host applications own accounts, source capture, transport, and document identity. Defaults do not make network requests.

The first release excludes PDF, editors/contenteditable, canvas/image annotation, cross-origin frames, closed Shadow DOM, automatic support for virtualized unmounted text, multi-user threads, remote/untrusted runtime plugins, and broad unverified framework claims.

## Architecture

Use a small fixed core with typed adapters for content and storage, action plugins for user operations, and UI slots for host-rendered controls. Commands are the only write path; events report outcomes and cannot mutate transactions. Provider selection is explicit and singular for content, authoritative storage, and renderer. Setup must validate capabilities and dependencies, and teardown must dispose resources in reverse order even if one cleanup fails. Document switches increment a generation; stale async reads/selections are rejected. Plugins are trusted build-time code, not a sandbox.

The core owns document/rendition identity, immutable source excerpt, protocol validation, selection state, command validation, and final anchor decision. Locator and renderer implementations remain internal until their contracts have mature compatibility tests.

## Identity and data

`documentId` is a stable host-supplied content identity, never inferred solely from URL. `renditionId` distinguishes original and reader snapshot text; position offsets never cross rendition boundaries. `contentVersion` denotes a revision. A committed annotation preserves the exact selected excerpt as evidence and separately tracks editable plain-text note/tag bodies, color, revision, and one or more anchors. Existing anchors remain when a host creates a confirmed new anchor for changed content.

Persisted extensions, when implemented, belong under versioned `extensions[pluginId]` envelopes. Unknown extension data is retained during ordinary edits and export. Imported data is untrusted and validated from `unknown` at boundaries. URLs, excerpts, and notes are also untrusted strings; default rendering is text-only.

## Text profile and recovery

The initial `html-reader-v1` projection reads decoded DOM text and excludes scripts, styles, forms, SDK UI, and explicit `data-annotation-exclude` content. It uses UTF-16 code unit offsets and stores mappings to original text nodes. It preserves NBSP and Unicode sequences; ordinary collapsible whitespace is projected as one ASCII space. Block boundaries, `<br>`, `pre` rules, hidden content and all projection changes need explicit versioned rules before production use.

Resolution first checks position only when rendition, profile, content version, quote, and context agree. It then searches a trusted block when available, then quote plus prefix/suffix context. A unique, sufficiently evidenced candidate may resolve. Ties and weak fuzzy candidates are `ambiguous`; absent text is `orphaned`; unmounted virtualized content is `deferred`. Fuzzy matches are previews only, never automatic persistent reanchors. Manual relocation creates a new anchor and retains old evidence.

W3C TextPositionSelector uses code point offsets and has its own text normalization rules; internal UTF-16 offsets must never be mislabeled as W3C offsets. Import/export is a declared subset with loss reports, not a claim of universal lossless conversion.

## Extensibility, lifecycle, and storage

Content, storage, action, UI, export/import, renderer and locator are conceptual extension points. v0.1 exposes only stable typed adapters, commands, UI slots and export conversion; do not open arbitrary middleware or runtime hot-plugging. Each plugin manifest has stable ID, version, API version, required and provided capabilities. Missing dependencies, cycles, duplicate IDs and ambiguous single providers fail during initialization.

Storage operations are scoped by document ID and carry operation IDs and revisions. Create is idempotent; update uses expected revision; conflicts must not overwrite note text. A local draft is not a persisted event. Sync, offline queues and server authorization are host concerns until optional adapters are implemented and audited.

## Engineering and validation requirements

- TypeScript strict mode plus `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, and safe `unknown` boundary handling.
- pnpm workspace, a single committed `pnpm-lock.yaml`, Apache-2.0 for Huahua-authored work, and per-dependency license/notice review.
- Run type checks, unit/property tests, packed-tarball consumer tests, and Playwright Chromium/Firefox/WebKit.
- Browser tests must use real mouse and keyboard selection, native and fallback rendering, dynamic DOM, Unicode, repeated quotes, cross-block selections, conflicts, stale requests, and teardown cleanup.
- Playwright WebKit is not Safari; device emulation is not mobile Safari/Chrome. Real Safari and phones must be reported as unverified if unavailable.
- Never claim that test-set zero false binds proves arbitrary pages safe. Error rate in fixed regression fixtures is the gate; ambiguous cases remain unresolved.

## Security and release boundary

No network requests by default, no credentials in the SDK, no full page upload, and no dynamic execution of imported or remote plugins. PR CI must be read-only, pin Actions to audited commit SHAs, and never execute untrusted pull request code in a privileged release workflow. npm publishing, provenance configuration, deployment, or persistent credentials require separate authorization and are not part of this implementation task.

## Candidate dependencies (not yet validated)

Keep model/core near zero-runtime-dependency. Evaluate Valibot for input validation, Floating UI only in optional UI, DOMPurify only if sanitized HTML is ever allowed, and `idb` only in a separately installed offline adapter. Vitest, fast-check, and Playwright are development dependencies. Dependency versions and licenses must be verified against the actual lockfile before claiming compliance.
