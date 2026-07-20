# Comparing `chessboard-native` with `react-chessboard`

This comparison is limited to `react-chessboard@5.10.0`, tag `v5.10.0`,
commit `b74704af988396d3da32a8c1627d95341e1e0061`. The pinned upstream
source is retained as a
[hash-verified offline fixture](../fixtures/parity/upstream-b74704a/PROVENANCE.md).
It is reference material and is not copied into the native package.

This page is a curated product and architecture comparison. The
[generated parity ledger](./parity/react-chessboard-5.10.md) is the exhaustive
source for all 39 upstream root exports, 42 `ChessboardOptions` fields, and 50
reviewed observable behaviors.

> [!IMPORTANT]
> This page describes the current repository source. The repository release
> record identifies `0.1.0-next.1` as an older archive published from commit
> `8d3c419`. In particular, that archive does not export the later
> `react-chessboard-compat` subpath. Check the exact package version rather than
> assuming that current main-branch capabilities are already on npm.

## What parity means here

Each upstream ledger row receives one reviewed disposition:

- **Keep:** the contract remains effectively unchanged.
- **Adapt:** the useful contract remains, expressed with native types or
  primitives.
- **Redesign:** the user goal remains, but the contract changes to preserve
  controlled state, native input, accessibility, or deterministic lifecycle
  behavior.
- **Drop:** the browser-specific contract has no native 1.0 equivalent.

The current ledger records all 131 rows as implemented. Ten of those
implementation outcomes are intentional, executable `drop` decisions:

<!-- markdownlint-disable MD013 -->

| Inventory          | Implemented rows | Of which intentional drops | Total rows |
| ------------------ | ---------------: | -------------------------: | ---------: |
| Root exports       |               39 |                          2 |         39 |
| Options            |               42 |                          4 |         42 |
| Reviewed behaviors |               50 |                          4 |         50 |
| **Total**          |          **131** |                     **10** |    **131** |

<!-- markdownlint-enable MD013 -->

This closes parity for the pinned native target: every row has one reviewed
disposition and one passing executable contract, including negative contracts
for the ten browser-only exclusions. It does not make the library a drop-in
browser replacement, certify physical devices, or mean that a release
candidate has been published.

## Curated comparison

“Compatibility” below means the current-source
`@vibechess/chessboard-native/react-chessboard-compat` adapter. It preserves a
familiar options object while reducing it to the primary native contracts. It
does not emulate browser primitives.

<!-- markdownlint-disable MD013 -->

| Capability                | `react-chessboard` 5.10                                                                              | Native compatibility adapter                                                        | Primary native API                                                                                      | Disposition       |
| ------------------------- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ----------------- |
| Runtime                   | React DOM, CSS, SVG, and dnd-kit sensors                                                             | React Native values translated to the primary runtime                               | React Native `View`, Gesture Handler, Reanimated, and React Native SVG                                  | Redesign          |
| Configuration             | One `options` object                                                                                 | One familiar `options` object with native value and callback types                  | Direct `Chessboard` props                                                                               | Adapt             |
| Position ownership        | External position plus a mutable internal current-position mirror used by presentation and callbacks | `options.position` is the only canonical position                                   | `position` is the only canonical position and may be plain or revisioned                                | Redesign          |
| Move request              | Synchronous Boolean `onPieceDrop` participates in browser drag behavior                              | Strict `true` accepts presentation, but only the next position prop moves the piece | Cancellable sync or async `onMoveRequest` returns a decision; only a controlled commit changes position | Redesign          |
| Commit correlation        | No exact request-to-controlled-update identity                                                       | Plain controlled values; no public intent correlation                               | A greater revision plus matching `committedIntentId` confirms a request                                 | Redesign          |
| Board rules               | The consumer decides move legality                                                                   | The consumer decides move legality                                                  | The consumer owns legality, turns, promotion, premoves, and game state                                  | Adapt             |
| Position input            | FEN piece placement or object position                                                               | Strict native FEN or sparse object position                                         | Strict 8 by 8 FEN; sparse object position for any supported dimensions                                  | Redesign          |
| Dimensions                | Configurable rows and columns                                                                        | `chessboardRows` and `chessboardColumns`                                            | `dimensions` supports 1–99 rows and 1–26 columns                                                        | Adapt             |
| Orientation               | White or black visual orientation                                                                    | `boardOrientation`                                                                  | `orientation`; canonical square IDs do not rotate                                                       | Adapt             |
| Default position          | Standard start position                                                                              | Same default only for 8 by 8; variants default empty                                | Position is required                                                                                    | Adapt             |
| Arrow ownership           | External arrows are combined with a persistent internal arrow list                                   | One controlled arrow array; callback proposes a complete next array                 | One controlled ID-bearing annotation collection; callbacks emit revisioned operations                   | Redesign          |
| Annotation types          | Straight arrows with browser drawing behaviors                                                       | Upstream-shaped arrows adapted to native input                                      | Straight or knight arrows and square fill, circle, dot, or border annotations                           | Redesign          |
| Annotation input          | Browser pointer, right-click, and modifier behavior                                                  | Portable native arrow input when the controlled callback gate is complete           | Explicit, long-press, two-finger, and accessibility arrow or square input                               | Redesign          |
| Arrow clearing            | Internal mutation and effect-driven whole-array callback                                             | Complete next-array proposal; only a later prop persists it                         | Independent clear policies emit scoped operations against the observed revision                         | Redesign          |
| Drag input                | dnd-kit mouse and touch sensors                                                                      | Native gesture adapter with upstream option names                                   | One board-level native gesture plane with app-state and geometry cancellation                           | Adapt             |
| Ancestor scrolling        | Optional browser ancestor auto-scroll                                                                | Not available; ordinary native `ScrollView` arbitration remains                     | Same; the component never discovers or programmatically scrolls an ancestor                             | Drop              |
| Hover and secondary click | Mouse-over/out, context menu, right-click, and modifier ordering                                     | Not available                                                                       | No native 1.0 equivalent; renderer state exposes portable pressed and drop-target presentation          | Drop              |
| Drag callbacks            | Browser callback payloads and event-era naming                                                       | Familiar names with detached native payloads                                        | Frozen piece, square, move, and press contexts from current controlled snapshots                        | Adapt             |
| Styling                   | `CSSProperties` and browser layout                                                                   | Familiar names accepting React Native styles                                        | `theme`, `styles`, `squareStyles`, and native annotation style                                          | Adapt             |
| Board layout styling      | CSS can participate in browser geometry                                                              | Native paint only; the parent constrains width                                      | Measured parent width and derived row/column height; structural layout stays board-owned                | Redesign          |
| Piece artwork             | Twelve upstream browser renderers                                                                    | A native whole-map renderer replacement                                             | Twelve original interim native renderers or a consumer whole-map replacement                            | Adapt             |
| Square renderer           | Browser renderer can be coupled to square event structure                                            | Native visual-only renderer                                                         | Visual-only `renderSquare` inside board-owned paint, hit testing, and accessibility                     | Adapt             |
| Providers                 | Upstream provider exposes a large browser implementation context                                     | No expanded compatibility-context contract                                          | `ChessboardProvider` coordinates IDs, measurement, and one transient overlay without semantic state     | Redesign          |
| Spare pieces              | Browser spare source                                                                                 | Familiar callback payloads can identify a spare-origin request                      | `SparePiece` explicitly targets one board and emits through that board's current move callback          | Adapt             |
| Multiple boards           | Browser provider composition                                                                         | Use the primary provider for explicit coordination                                  | Unique `boardId` values in a provider scope; every board retains independent controlled state           | Adapt             |
| Selection                 | No equivalent controlled selection domain in the pinned options surface                              | Not added to the compatibility object                                               | Optional plain or revisioned `selection` plus controlled activation callbacks                           | Native extension  |
| Transitions               | Mutable snapshots and a one-deep timeout queue infer browser animation                               | Duration and Boolean option names adapt to native policy                            | Adjacent controlled revisions produce deterministic, interruptible presentation plans                   | Redesign          |
| Reduced motion            | Boolean animation switch                                                                             | `showAnimations: false` forces reduction; otherwise follows the system              | `reduceMotion` is `system`, `always`, or `never`                                                        | Redesign          |
| Accessibility             | No equivalent single native control in the pinned browser implementation                             | Uses the primary board's native accessibility surface                               | One adjustable board control with navigation and gated move, selection, and annotation actions          | Redesign          |
| Error handling            | Browser implementation accepts several permissive or ambiguous cases                                 | Adapter input is validated before reaching the board                                | Typed domain errors, atomic normalization, and post-commit production reporting                         | Redesign          |
| Pure utilities            | Browser-oriented coordinates, permissive FEN, DOM hit test, and transition diff helpers              | Only the adapter's public types and component are exposed                           | Validated coordinates, strict FEN, measured geometry, and controlled annotation helpers                 | Adapt or redesign |

<!-- markdownlint-enable MD013 -->

## The controlled-state difference

The largest semantic difference is not rendering technology. It is ownership.
In `chessboard-native`:

- the current `position` prop is the only renderable logical position;
- the current `annotations` prop is the only persistent annotation collection;
- the optional `selection` prop is the only semantic selection;
- callback decisions never become logical state;
- transition snapshots, drag coordinates, focus, and drafts are transient
  presentation state only; and
- a provider may coordinate measurement and an active drag, but it never copies
  board semantics.

This prevents a callback, animation, or stale asynchronous result from
overwriting a newer store update. See
[Controlled semantic state](./architecture/controlled-state.md) and
[Plain and revisioned API tiers](./architecture/api-tiers.md).

The compatibility adapter follows the same rule. Familiar names do not restore
the upstream internal mirrors:

- `onPieceDrop` must be followed by a new `options.position` value;
- `onArrowsChange` must be followed by a new `options.arrows` value;
- no drop callback means no move input; and
- no arrows callback means read-only arrows and no drawing or clear policy.

## Browser contracts intentionally excluded

The complete exclusion inventory has:

- two exports: `useChessboardContext` and
  `isTouchEndWithinSquare`;
- four options: `allowAutoScroll`, `onMouseOutSquare`,
  `onMouseOverSquare`, and `onSquareRightClick`; and
- four behaviors: automatic ancestor scrolling during drag, hover transition
  ordering, context-menu/right-click ordering, and modifier-key color
  precedence.

See [Complete browser-only exclusions](./migrating-from-react-chessboard.md#complete-browser-only-exclusions)
for the row-by-row ledger links and native migration alternatives.

These exclusions are intentional boundaries for Android and iOS, not silent
no-ops. Unsupported compatibility options are typed as `never` and rejected at
runtime when supplied.

## What can be claimed

The repository evidence supports these statements:

- `chessboard-native` is a controlled, rules-free React Native board.
- It targets the useful surface of the pinned `react-chessboard` 5.10 source
  through reviewed keep, adapt, redesign, and drop decisions.
- All 131 current-source rows are recorded as implemented in the parity ledger;
  the ten drop rows are tested exclusions rather than emulated browser features.
- The three supported TypeScript entry points and exact package resolver map
  are frozen as reviewed candidate snapshots.
- The compatibility adapter preserves familiar option names where a portable
  native contract exists.
- The primary API adds revision correlation, controlled annotation operations,
  native accessibility, and provider-scoped composition without introducing a
  second semantic state source.
- Android and iOS are the first-class targets on the exact dependency lines in
  the [support matrix](./support-matrix.md).

The repository evidence does **not** yet support these statements:

- “drop-in replacement”;
- “browser API compatible”;
- “release candidate” or “production ready”;
- “all React Native or Expo versions supported”;
- “React Native Web supported”;
- “physical TalkBack or VoiceOver certified”; or
- “performance targets passed on the release device matrix.”

## Evidence

- [Pinned source provenance](../fixtures/parity/upstream-b74704a/PROVENANCE.md)
- [Machine-readable parity manifest](../fixtures/parity/react-chessboard-5.10.json)
- [Generated exhaustive parity ledger](./parity/react-chessboard-5.10.md)
- [Primary public API report](../packages/chessboard-native/etc/chessboard-native.api.md)
- [Pieces public API report](../packages/chessboard-native/etc/chessboard-native.pieces.api.md)
- [Compatibility public API report](../packages/chessboard-native/etc/chessboard-native.react-chessboard-compat.api.md)
- [Architecture invariants](./architecture/invariants.md)
- [Accessibility contract and pending physical checklist](./accessibility.md)
- [Release evidence and registry boundary](./releasing.md)
