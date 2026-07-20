# API reference

<!-- markdownlint-disable MD013 -->

This is the human-readable reference for the public API on `main`. The generated
[primary](../packages/chessboard-native/etc/chessboard-native.api.md),
[pieces](../packages/chessboard-native/etc/chessboard-native.pieces.api.md), and
[compatibility](../packages/chessboard-native/etc/chessboard-native.react-chessboard-compat.api.md)
API reports are the exact declaration locks.

> [!IMPORTANT]
> `@vibechess/chessboard-native` is controlled and rules-free. The consumer is
> the only authority for position, annotations, and optional selection. The
> board may present a transient gesture, pending request, focus cursor, or
> animation, but callback results never commit semantic state.

## Entry points

| Import                                                 | Purpose                                                           |
| ------------------------------------------------------ | ----------------------------------------------------------------- |
| `@vibechess/chessboard-native`                         | Primary controlled components, types, defaults, and pure helpers  |
| `@vibechess/chessboard-native/pieces`                  | Focused original geometric `defaultPieceRenderers` value          |
| `@vibechess/chessboard-native/react-chessboard-compat` | Native adapter with pinned `react-chessboard@5.10.0` option names |

The package is ESM-only. Import public values and types from these entry points;
paths below `src` and `lib` are private implementation details.

## `Chessboard`

`Chessboard` fills its parent's measured width. Its height is derived from the
row/column ratio, so the parent determines the board's final size.

```tsx
import { Chessboard } from '@vibechess/chessboard-native';

<Chessboard
  boardId="analysis"
  orientation="black"
  position="rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR"
/>;
```

### Props

| Prop                     | Required/default                                     | Contract                                                                        |
| ------------------------ | ---------------------------------------------------- | ------------------------------------------------------------------------------- |
| `boardId`                | Required                                             | Non-empty, stable for the mounted lifetime, and unique in the nearest provider  |
| `position`               | Required                                             | Canonical plain or revisioned controlled position                               |
| `actionsRef`             | Optional                                             | Mount-scoped `cancelMove()` handle for transient move work only                 |
| `dimensions`             | `{ rows: 8, columns: 8 }`                            | 1–99 rows and 1–26 columns; FEN remains 8×8-only                                |
| `orientation`            | `'white'`                                            | White- or black-at-bottom presentation; canonical square IDs do not change      |
| `showNotation`           | `true`                                               | Decorative file and rank labels                                                 |
| `theme`                  | `defaultTheme`                                       | Reusable native visual defaults layered over the built-in theme                 |
| `styles`                 | Optional                                             | Per-instance native visual overrides applied after `theme`                      |
| `squareStyles`           | Optional                                             | Canonical per-square native styles                                              |
| `renderSquare`           | Optional                                             | Visual-only square content; it receives no handlers                             |
| `pieceRenderers`         | `defaultPieceRenderers`                              | Whole renderer-map replacement; supplied maps are not merged with defaults      |
| `annotations`            | Optional                                             | Canonical plain or revisioned persistent annotation collection                  |
| `annotationStyle`        | `defaultAnnotationStyle`                             | Whole-value arrow geometry and opacity configuration                            |
| `annotationTool`         | `null`                                               | Current arrow or square input tool; a tool alone does not enable input          |
| `annotationPolicies`     | Both `false`                                         | Opt-in requests to clear annotations on board press or position change          |
| `onAnnotationOperation`  | Optional                                             | Receives immutable annotation deltas; never commits them                        |
| `selection`              | Optional                                             | Plain or revisioned selected/destination/disabled presentation                  |
| `onSquareActivate`       | Optional                                             | Enables controlled same-square touch/accessibility activation                   |
| `onSquarePressIn`        | Optional                                             | Observes one native press begin without enabling activation                     |
| `onSquarePressOut`       | Optional                                             | Observes the paired terminal native press boundary                              |
| `onMoveRequest`          | Optional                                             | Opens controlled board/spare move requests and returns a decision               |
| `interactionPermissions` | Enabled when relevant callback exists                | Gates drag and adjustable-control move input                                    |
| `gesture`                | `{ activationDistance: 4, allowDragOffBoard: true }` | Native drag threshold and presentation bounds for the board and targeted spares |
| `canDragPiece`           | Optional                                             | Synchronous current-prop permission for board and targeted spare dragging       |
| `onPiecePress`           | Optional                                             | Observes one current piece activation; return value is ignored                  |
| `onPieceDragStart`       | Optional                                             | Observes one permitted native drag start; return value is ignored               |
| `moveRequestTimeouts`    | `{ decisionMs: 10000, commitMs: 1500 }`              | Decision and accepted-intent commit budgets in milliseconds                     |
| `accessibility`          | Built-in labels/actions                              | Overrides the one adjustable board control's labels and announcements           |
| `reduceMotion`           | `'system'`                                           | System, always, or never reduction for board-owned transitions                  |
| `transitionDurationMs`   | `300`                                                | Finite non-negative duration for controlled position transitions                |
| `onError`                | Optional                                             | Deduplicated production contract errors, dispatched after commit                |

### What enables input

- `onMoveRequest` enables the controlled move-request surface. Drag also
  requires current permission; accessible move actions require the
  accessibility permission.
- `onSquareActivate` or `onPiecePress` enables ordinary same-square
  activation. Square press-in/out callbacks can mount a press observer without
  enabling activation.
- Annotation touch/accessibility input requires `annotations`, a non-null
  `annotationTool`, and `onAnnotationOperation`. Supplying arrows without a
  callback is read-only.
- With none of those boundaries, the board remains read-only and mounts no
  gesture hit plane.

## Controlled value tiers

### Position

`PositionProp` accepts either a plain `PositionInput` or a
`ControlledPosition` envelope:

```ts
type ControlledPosition = {
  value: PositionInput;
  revision: number;
  committedIntentId?: string;
  transition?: BoardTransition;
};
```

- A plain value gets a board-derived revision and is convenient when exact
  async correlation is unnecessary.
- A revisioned value uses a consumer-owned non-negative safe integer. Every
  changed semantic snapshot must advance it.
- Do not switch between plain and revisioned tiers while the board is mounted.
- After accepting a `MoveIntent`, publish the new position with a newer
  revision. Set `committedIntentId` to that intent's ID when exact pending-to-
  commit handoff matters.
- `BoardTransition` is presentation-only and must describe the exact adjacent
  `fromRevision`/`toRevision` pair. It does not apply chess rules.

`PositionInput` is strict FEN piece placement for an 8×8 board or a sparse
object position for any supported dimensions. Piece types are open strings;
the bundled chess renderers use `wP` through `bK`. Stable optional piece IDs
improve transition identity and must be unique within one position.

### Selection

`SelectionProp` contains `selectedSquare`, optional `destinationSquares`, and
optional `disabledSquares`. It can be plain or carry its own `revision`.
`onSquareActivate` emits an intent; only the consumer's next selection prop can
select or clear a square.

### Annotations

`AnnotationsProp` is a readonly `BoardAnnotation[]` or
`ControlledAnnotations { value, revision }`. Persistent arrows and square
annotations require stable unique IDs.

`onAnnotationOperation` emits one `add`, `toggle`, `remove`, or `clear` delta.
Use `applyAnnotationOperation` against the latest consumer-owned envelope. Its
result is:

- `applied` — publish `next`;
- `unchanged` — the operation is a valid no-op; or
- `rejected` — keep the current value and inspect `reason`.

Stale operations can apply safely when they do not conflict with newer IDs.
The helper never writes to a store itself.

## Move requests and observations

`onMoveRequest(intent, { signal })` may return a `MoveDecision` synchronously
or asynchronously. The signal aborts when the request is cancelled, times out,
or becomes stale. Returning `{ status: 'accepted' }` permits pending
presentation only; it does not move, add, or remove a piece. A nullable
`targetSquare` represents an off-board request.

`onPiecePress`, `onPieceDragStart`, `onSquarePressIn`, and
`onSquarePressOut` are observation callbacks. They receive detached current-
prop contexts, isolate callback failures, ignore return values, and never make
move decisions.

`actionsRef.current?.cancelMove()` cancels current transient move work and
returns whether anything was cancelled. It never edits controlled values.

## Providers and spare pieces

Use a `ChessboardProvider` only when boards and external sources need one
coordination scope. A standalone board creates an equivalent private scope.

### `ChessboardProviderProps`

| Prop               | Required/default | Contract                                                                               |
| ------------------ | ---------------- | -------------------------------------------------------------------------------------- |
| `children`         | Required         | Boards and external sources in one identity/drag scope                                 |
| `geometryRevision` | `0`              | Non-decreasing consumer invalidation for ancestor movement React Native cannot observe |

The provider owns registration, measurement coordination, and one transient
overlay. It owns no position, selection, or annotations.

### `SparePieceProps`

| Prop                 | Required/default        | Contract                                               |
| -------------------- | ----------------------- | ------------------------------------------------------ |
| `spareId`            | Required                | Stable source ID included in emitted move intents      |
| `targetBoardId`      | Required                | One board in the nearest explicit provider             |
| `piece`              | Required                | Detached piece payload                                 |
| `size`               | `48`                    | Finite positive native-point size                      |
| `pieceRenderers`     | `defaultPieceRenderers` | Whole visual renderer map                              |
| `style`              | Optional                | Visual-only native paint                               |
| `disabled`           | `false`                 | Disables drag, tap selection, and accessible placement |
| `accessibilityLabel` | Derived from piece type | Accessible button label                                |
| `accessibilityHint`  | Built in                | Full hint override                                     |

The named board's `onMoveRequest` remains the only decision callback. The
consumer remains the only position authority.

## Visual contracts

- `ChessboardTheme` supplies reusable defaults; `ChessboardStyles` supplies
  instance overrides. Both use React Native style values.
- `SquareStyles` is keyed by canonical square ID. Drop-target and other
  transient named states are layered deterministically without changing hit
  geometry.
- `SquareRenderer` and `PieceRenderer` are visual-only. The board owns gesture,
  measurement, structural positioning, and accessibility semantics.
- `defaultTheme`, `defaultAnnotationStyle`, and `defaultPieceRenderers` are
  frozen reusable defaults. Import `defaultPieceRenderers` from either the root
  or `/pieces` entry point; renderer types are exported by the root.

## Accessibility

The board exposes one native adjustable control with an orientation-aware
virtual cursor. `ChessboardAccessibility` can override the board label/hint,
format square values and action labels, format move outcomes, and publish one
ID-correlated announcement.

Visual descendants are decorative. Accessible move, selection, spare, and
annotation actions route through the same controlled callbacks as touch input.
See the [accessibility contract](accessibility.md) for action precedence and
the still-required physical TalkBack/VoiceOver checks.

## Pure helpers

| Export                                    | Purpose                                                                                               |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `parseFenPosition`                        | Strict, atomic 8×8 FEN piece-placement parser; ignores later FEN fields and applies no legality rules |
| `rowIndexToRank` / `rankToRowIndex`       | Convert top-origin visual rows and canonical ranks for either orientation                             |
| `columnIndexToFile` / `fileToColumnIndex` | Convert left-origin visual columns and canonical lowercase files                                      |
| `generateBoardGeometry`                   | Build the oriented logical square grid for validated dimensions                                       |
| `squareToBoardPoint`                      | Project a canonical square center into measured board-local coordinates                               |
| `findMatchingAnnotationIds`               | Find controlled annotations with matching toggle geometry                                             |
| `applyAnnotationOperation`                | Purely reduce one revision-correlated annotation delta against the latest store value                 |

Invalid helper input throws `TypeError`, `RangeError`, or `SyntaxError` before
returning a partial value.

## Errors

`ChessboardError` is the typed public error for controlled input and board-
identity violations. It includes a stable `code`, recovery `domain`, optional
`boardId`, and relevant `revision`.

- Development reports malformed controlled props synchronously.
- Production never retains an older semantic value as a fallback. Invalid board
  identity, dimensions, orientation, or position produces a disabled empty
  board; invalid annotations or selection makes only that current domain
  unavailable while a valid current position remains visible.
- Production calls `onError` once after commit for each deduplicated violation.
- Invalid transition hints warn in development and are ignored; they do not
  invalidate an otherwise valid position.

## Compatibility entry point

> [!IMPORTANT]
> The prepared `0.1.0-next.2` package exports this entry point; npm
> `0.1.0-next.1` does not. Merging does not publish, so verify that the registry
> exposes the exact prepared version before importing the subpath from npm.

The compatibility entry point exports its own `Chessboard`,
`ReactChessboardOptions`, upstream-shaped position/arrow/callback payload
types, and the native renderer/style types used by those options. It does not
re-export the primary provider, revisioned state, selection, square
annotations, actions, or error surface.

See the [migration guide](migrating-from-react-chessboard.md) and
[comparison](comparison.md) before choosing it. Familiar option names do not
restore DOM events or upstream shadow state.
