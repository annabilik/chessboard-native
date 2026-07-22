# Documentation

These guides describe the standalone `@vibechess/chessboard-native` library on
the repository's `main` branch. The npm `next` tag can lag behind `main` until
the next explicit prerelease; check the package version before relying on a
newly documented surface.

## Start here

- [API reference](api-reference.md) — entry points, components, controlled
  contracts, callbacks, defaults, utilities, and errors.
- [Migration from `react-chessboard`](migrating-from-react-chessboard.md) —
  incremental compatibility-subpath and primary-API migration paths.
- [Comparison](comparison.md) — the important semantic differences between
  `react-chessboard@5.10.0`, the compatibility adapter, and the primary native
  API.
- [Support matrix](support-matrix.md) — supported runtime lines, platforms,
  package entry points, and the evidence behind each claim.
- [Pinned parity ledger](parity/react-chessboard-5.10.md) — exhaustive,
  source-addressed implementation evidence for all pinned exports, options,
  and reviewed behaviors.

## Architecture

- [Controlled state](architecture/controlled-state.md)
- [API tiers](architecture/api-tiers.md)
- [Coordinates and FEN](architecture/coordinates-and-fen.md)
- [Gestures and provider coordination](architecture/gestures.md)
- [Rendering layers](architecture/rendering-layers.md)
- [Controlled transitions](architecture/transitions.md)
- [Invariant registry](architecture/invariants.md)

## Quality and release

- [Accessibility contract](accessibility.md)
- [Physical accessibility validation](physical-accessibility-validation.md)
- [Accessibility evidence for `0.1.0-next.2`](release-evidence/accessibility-0.1.0-next.2.md)
- [Prerelease runbook](releasing.md)

The Expo gallery is source-controlled in
[`apps/example`](../apps/example/app/index.tsx). It demonstrates mounted public
workflows; it is not a substitute for the physical accessibility, performance,
and device checks listed as pending in the support matrix.
