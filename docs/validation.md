# v0.1 validation record

Validation ran on macOS with Node.js v26.4.0, pnpm v11.1.2, TypeScript 5.9.3, Vitest 3.2.4, Playwright 1.56.1, Vite 6.4.1, fast-check 4.3.0, and jsdom 26.1.0. Safari.app reports version 26.5.2. The installed Google Chrome application was used for Chromium interaction runs; its exact marketing version was not recorded.

## Passed

| Check | Result | Evidence |
| --- | --- | --- |
| Frozen pnpm install | Passed | `CI=true pnpm install --frozen-lockfile`; one `pnpm-lock.yaml` |
| TypeScript | Passed | `CI=true pnpm typecheck`; strict package source, tests, and E2E configuration compile |
| Unit and property tests | Passed, 18 tests | `CI=true pnpm test`; anchor recovery and text-split properties, ambiguity, rendition boundary, storage conflicts, local persistence, provider resolution, dependency cycles, partial setup rollback, cancellation, observer isolation, idempotent destruction, and annotator teardown |
| Packed consumer | Passed | `CI=true pnpm test:package`; tarball ESM import plus TypeScript declaration consumer |
| Frozen pnpm install | Passed on lifecycle changes | `CI=true pnpm install --frozen-lockfile`; one `pnpm-lock.yaml` |
| Chromium E2E | Passed, 3 tests (baseline before lifecycle changes; rerun pending) | `CHROME_EXECUTABLE_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' CI=true pnpm exec playwright test --project=chromium`; real mouse drag selection, keyboard activation of save, native CSS highlight registry, overlay geometry, and original text preservation |
| Real Safari smoke test | Passed, manual UI | Safari 26.5.2 opened `http://localhost:4173/?renderer=overlay`; real drag selected `Reading should preser`, and the save action surfaced that exact excerpt in the demo. This is not a Playwright run. |
| Dependency license inventory | Reviewed | `pnpm licenses list --json` reported MIT, Apache-2.0, BSD-2-Clause, BSD-3-Clause, ISC, and MIT-0 dependency license groups. These are development dependencies; only Huahua's Apache-2.0 source and package are shipped in the core tarball. |

## Not verified

Playwright Firefox and Playwright WebKit did not complete locally. Playwright 1.56.1 downloads its archive successfully but stalls during macOS app extraction, leaving an incomplete `Nightly.app` / `WebKit.app`. During a diagnostic Firefox install, debug output showed HTTP 200 and a 94,216,653-byte Firefox archive downloading into `/var/folders/.../playwright-download-...`; its extraction created `/tmp/huahua-pw-debug/firefox-1495/firefox/Nightly.app/Contents/MacOS` but did not finish. The running installer remained active without output; process inspection was denied by the local macOS sandbox (`operation not permitted: ps`), so the exact extraction sub-process cause is unknown. Chromium was instead run using the installed Google Chrome executable. Playwright WebKit is not Safari; the manual Safari smoke test above does not substitute for a Playwright WebKit run.

No iOS Safari or Android Chrome hardware was available for touch handles, long press, native menus, orientation, zoom, soft keyboard, or assistive technology checks. Mobile support is unverified. No React/Vue/Solid adapters, full WCAG audit, performance budget, SCA scan, or release SBOM were completed in this v0.1 implementation.

## Scope notes

The implementation currently includes HTML text selection/index mapping, UTF-16 anchors, conservative quote/context recovery, ambiguous/orphaned statuses, manual anchor addition, native CSS Highlights and a fixed-position overlay fallback, memory and explicit LocalStorage adapters, revisions/conflict errors, JSON import/export, Markdown export, a demo, and read-only CI. The plugin runtime validates API versions, IDs, capability requirements, dependency cycles, declared conflicts, and explicit single-provider selection; setup is ordered, cancellation-aware, and rolls back partial setup in reverse order, while all disposers run even after cleanup failures and destroy is idempotent. Actions reject duplicate IDs. It remains an early v0.1: the overlay is visual only; there is no built-in toolbar/sidebar, remote HTTP adapter, offline queue, or framework binding. Multi-provider routing is only modeled for manifest validation, and there is no general extension-data migration lifecycle.
