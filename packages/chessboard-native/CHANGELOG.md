# @vibechess/chessboard-native

## 0.1.0-next.1

### Patch Changes

- Advance the prerelease for a one-time npm trusted-publishing proof. This release
  does not change the public API or runtime behavior.

## 0.1.0-next.0

### Minor Changes

- b8d6ba0: <!-- markdownlint-disable MD041 -->

  Render controlled square and marker-free arrow annotations in deterministic
  below/above-piece native SVG layers, with configurable annotation geometry.

- da0ef92: <!-- markdownlint-disable MD041 -->

  Add cancellable controlled move requests with board-piece drag, accessible
  source/target/removal actions, deterministic timeouts, and revisioned commit
  correlation without internal position state.

- 2954e1b: <!-- markdownlint-disable MD041 -->

  Animate ordinary controlled-position moves, captures, additions, removals, and
  ambiguous fades with a board-local Reanimated runtime. Add
  `transitionDurationMs`, defaulting to 300 milliseconds with zero as an explicit
  snap, while preserving reduced motion and latest-prop authority.

- 7b50f39: <!-- markdownlint-disable MD041 -->

  Add declarative controlled-selection styling and exclusive touch/accessibility
  square activation or destination move routing without internal semantic state.

- Add the initial controlled, rules-free React Native chessboard: strict position
  normalization, responsive orientation-aware rendering, deterministic coordinate
  utilities, default and custom pieces, native style precedence, controlled
  selection and annotations, and one adjustable accessibility surface.
- f23fe96: <!-- markdownlint-disable MD041 -->

  Harden native board and spare-piece interaction inside ancestor ScrollViews,
  cancel transient work on AppState and geometry changes, and move the shared
  pointerless drag overlay to the provider level so clipped source palettes do not
  crop it.

  Add deterministic render/callback and provider-overlay coverage plus packed
  Android and iOS interaction scenarios for board/ScrollView arbitration,
  lifecycle cancellation, and reuse.

- 66c0dc9: <!-- markdownlint-disable MD041 -->

  Add `ChessboardProvider` with provider-scoped stable board identity, one shared
  transient drag overlay, and stale-safe release remeasurement infrastructure for
  multi-board and future external-source coordination.

- 643d580: <!-- markdownlint-disable MD041 -->

  Add the public provider-coordinated `SparePiece` API with named-board drag,
  controlled move-intent payloads, and accessible select/place/cancel composition.

  `PieceRendererProps` now requires a discriminated `source`. Board visuals keep
  a non-null `square`; spare visuals may pass `square: null`. Custom renderers
  should narrow on `props.source.kind` before assuming a square is present.

- 731a281: <!-- markdownlint-disable MD041 -->

  Animate controlled promotion and type-changing replacements without shadow
  state, coordinate explicit second-actor moves such as castling, reserve exact
  capture actors for en passant, and add a safe anonymous promotion fallback.

- ef6a76d: <!-- markdownlint-disable MD041 -->

  Preserve presentation continuity across interrupted controlled-position
  transitions and geometry changes, and hand matching controlled move commits off
  from their pending target without creating shadow position state.
