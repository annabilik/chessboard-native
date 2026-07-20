# @vibechess/chessboard-native

<!-- markdownlint-disable MD024 -->

## 0.1.0-next.2

### Minor Changes

- 71c8713: <!-- markdownlint-disable MD041 -->

  Add controlled arrow and square annotation actions to the single adjustable
  board. Accessibility and touch now share one correlated draft runtime and emit
  immutable operations without owning persistent annotations.

- 22de881: <!-- markdownlint-disable MD041 -->

  Add a stale-safe `ChessboardActions.cancelMove` handle and declarative
  `gesture.allowDragOffBoard` overlay bounds. Cancellation clears only transient
  move work, while visual clamping leaves raw hit testing and nullable off-board
  move intents unchanged.

- 475f00c: <!-- markdownlint-disable MD041 -->

  Add deterministic controlled-annotation operations, revision-safe consumer
  application, independent clear policies, and transient annotation-draft
  composition without introducing a second semantic annotation store.

- 0f7d72b: <!-- markdownlint-disable MD041 -->

  Add controlled native annotation input through explicit activation,
  long-press pan, and two-finger pan. The new `annotationTool` prop produces one
  revision-correlated draft and toggle operation without owning persistent
  annotations.

- 4efbbf8: <!-- markdownlint-disable MD041 -->

  Add non-committing `onPiecePress` and `onPieceDragStart` observations for board
  pieces and targeted spares. Their frozen contexts come from the named board's
  current controlled position revision, callback exceptions cannot break input,
  and an occupied piece press never also bubbles into square activation.

  Add `gesture.activationDistance` as a validated, finite non-negative native
  point threshold shared by a board and spares targeting that board. It defaults
  to four points and changes gesture recognition only, never controlled state.

- 24dbcef: <!-- markdownlint-disable MD041 -->

  Add the optional `react-chessboard-compat` package subpath, which adapts the
  upstream-shaped options and callbacks onto the primary controlled native
  pipeline without adding another semantic source of truth.

- cdd8bf5: <!-- markdownlint-disable MD041 -->

  Add observational `onSquarePressIn` and `onSquarePressOut` callbacks with a
  detached, frozen `SquarePressContext` captured from the current controlled
  position. Press callbacks can run on an otherwise read-only board without
  enabling activation, pair release and mounted cancellation exactly once, and
  remain isolated from semantic state and callback exceptions.

- 457daa3: <!-- markdownlint-disable MD041 -->

  Add selected-spare tap placement on the named board's current controlled move
  runtime. The tap path is revision- and selection-correlated, yields to pending
  moves and disabled targets, and remains exclusive with annotations and ordinary
  piece/square activation.

  Harden open custom piece types with prototype-safe default accessibility labels
  and snapshot `SparePiece` payload fields exactly once per prop identity.

- 778caaf: <!-- markdownlint-disable MD041 -->

  Add visual-only custom square rendering plus declarative drop-target,
  dragging-piece, and source-ghost theme and instance style slots. Custom
  square content receives frozen controlled and transient context inside the
  board-owned measured, pointerless, accessibility-hidden paint layer.
  Spare drag-overlay renderers now receive the current canonical hover square,
  or `null` while off-board; resting spare and source-ghost renderers remain
  squareless.

### Patch Changes

- 1375fb7: <!-- markdownlint-disable MD041 -->

  Complete the public API documentation, migration and comparison guides, support
  matrix, and categorized native example gallery for the upcoming release.

- fa5beb6: <!-- markdownlint-disable MD041 -->

  Close the pinned `react-chessboard@5.10.0` parity ledger with executable
  contracts for all 131 reviewed rows, including the ten intentional browser-only
  exclusions. Freeze the three public TypeScript entry points and exact package
  resolver map as reviewed candidate snapshots without changing runtime behavior.

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
