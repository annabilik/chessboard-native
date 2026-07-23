# CLAUDE.md

<!-- markdownlint-disable MD013 -->

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A pnpm monorepo for `@vibechess/chessboard-native` — a controlled, rules-free React Native chessboard (Android/iOS, New Architecture, React 19.2 / RN 0.86). Node 24.15.0 and pnpm 11.11.0 are pinned (`corepack enable`).

- `packages/chessboard-native` — the published library (only package).
- `apps/example` — private Expo gallery; also hosts the native Storybook via an alternate Metro entry (`pnpm storybook:start`).
- `apps/native-harness` — bare React Native app for package-resolution, native-build, and accessibility fixtures.
- `fixtures/parity` — the pinned `react-chessboard@5.10.0` parity ledger and a frozen upstream source snapshot (never edit `upstream-b74704a`).
- `scripts/` — Node gate scripts (parity, docs, storybook, package inspection); tested by `pnpm test:tooling`.

## Commands

```sh
pnpm install --frozen-lockfile
pnpm check     # format, lint, docs, typecheck, Jest+parity, tooling, storybook inventory
pnpm verify    # full PR gate: check + build + api:check + package:check + release:check + Expo/Storybook exports
```

Individual pieces:

- `pnpm test` — Jest for the library (jest-expo preset, `--runInBand`).
- Single test file: `pnpm --filter @vibechess/chessboard-native exec jest --config jest.config.mjs --runInBand tests/core/fen.test.ts` (add `-t 'name'` to filter by title). Tests live in `packages/chessboard-native/tests/` and match `**/*.test.{ts,tsx}`.
- `pnpm test:ci` — CI Jest run that also writes the parity result shard to `coverage/parity/jest.parity.json`; required before `pnpm parity:complete`.
- `pnpm typecheck`, `pnpm lint`, `pnpm format` / `format:check`.
- `pnpm build` — react-native-builder-bob (ESM module + typescript targets into `lib/`).
- `pnpm api:check` / `pnpm api:update` — API Extractor against the three checked-in reports in `packages/chessboard-native/etc`.
- `pnpm parity:verify` — typecheck + test:ci + complete parity-ledger validation.
- `pnpm parity:update` — regenerate `docs/parity/react-chessboard-5.10.md` from the JSON ledger.
- `pnpm example:start` / `pnpm storybook:start` — run the Expo gallery / native Storybook.
- `pnpm changeset` — required for changes that alter published package behavior (not for docs/infra-only changes).

Native harness builds (`pnpm native:ios:*`, `pnpm native:android:*`) need Xcode/CocoaPods or JDK 17 + Android SDK and are only required when the harness changes.

## Architecture

The single governing principle (see `docs/architecture/controlled-state.md` and the invariant registry in `docs/architecture/invariants.md`, `CBN-INV-001`–`020`): **the consumer owns all semantic state; the board owns only transient presentation.**

- `position`, `annotations`, and optional `selection` props are the only canonical sources. Gestures emit intents (`onMoveRequest`, `onSquareActivate`, `onAnnotationOperation`); callback results can never commit state — only the consumer's next controlled prop does. Accepting a move request merely permits pending presentation.
- Correlation is revision-based: revisioned props carry monotonic `revision` numbers, and a committed move is confirmed by a newer revision with a matching `committedIntentId`. Async results are validated against their base revision/epoch; stale results are inert.
- The library contains no chess rules, legal-move logic, engines, or app state. Do not add them, and do not introduce any second internal copy of position/annotations/selection.

Source layout inside `packages/chessboard-native/src`:

- `core/` — pure domain logic: FEN parsing (8×8 only), coordinates, position/annotation/selection normalization, hit testing.
- `internal/` — controlled-domain validation, the interaction reducer, gesture adapters, move-request runtime, transition planner, provider coordination, and the `use-*` hooks that wire them together.
- `render/` — the layered renderer (RN Views + Reanimated + gesture-handler + react-native-svg) with a fixed back-to-front order: squares → below-piece annotations → animated pieces → above-piece annotations → notation → a single board-wide gesture plane (not per-square handlers) → single accessibility host. See `docs/architecture/rendering-layers.md`.
- `accessibility/` — virtual cursor, announcements, labels; the board is one adjustable accessibility control and every drag action has a non-drag alternative.
- `ChessboardProvider.tsx` / provider internals — cross-board drag coordination. The provider owns one transient drag-overlay lease routed by `boardId`, never semantic board state. A standalone board creates a private provider.
- `pieces/` — Cburnett default renderers (CC BY-SA 3.0; attribution in NOTICE.md / THIRD_PARTY_NOTICES.md).
- `react-chessboard-compat/` — the migration adapter entry point.

Public entry points are exactly `.`, `./pieces`, and `./react-chessboard-compat`; deep imports under `src`/`lib` are not public API.

## Repo-specific gates and rules

- **Frozen public API**: any declaration, subpath, or export-map change is intentional API work. Run `pnpm api:update` only after reviewing the generated diff — never just to make `api:check` pass. Update `docs/api-reference.md` too; `pnpm docs:check` enforces required sections and exported symbol names.
- **Parity ledger**: `fixtures/parity/react-chessboard-5.10.json` is the only authored parity source (regenerate the doc with `pnpm parity:update`). Statuses are forward-only (`planned` → `in-progress` → `implemented`); CI rejects removed rows, status regressions, and edits to implemented rows' disposition/mapping/contract ID. Contract tests put the contract ID at the start of a Jest title (e.g. `[PARITY-OPTION-POSITION] ...`); result shards are generated by CI — never author or commit them.
- **Invariant contracts**: each `CBN-INV-*` invariant has a reserved `CBN-CONTRACT-*` test namespace; behavior claims require an executed contract test at the lowest authoritative layer.
- **Storybook inventory**: the required story list is pinned in `fixtures/storybook/required-stories.json`; run `pnpm storybook:check` after adding/renaming stories, and keep Storybook confined to its alternate Metro entry (normal gallery bundles must stay Storybook-free). See `docs/storybook.md`.
- **Fixtures**: never edit `fixtures/parity/upstream-b74704a` (frozen upstream source + licenses); it is evidence only and is never imported or shipped.
- **Releases**: merging never publishes. Version prep and publication are separate manual workflows (`docs/releasing.md`); the npm `next` tag can lag `main`.
- Lint is typescript-eslint `strictTypeChecked` + `stylisticTypeChecked` with Prettier; markdown is linted by markdownlint-cli2.
