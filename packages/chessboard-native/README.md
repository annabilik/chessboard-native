# @vibechess/chessboard-native

> **Prerelease status:** `0.1.0-next.*` releases are for evaluation and
> integration testing, not production use; APIs may change before 1.0. The
> installation command targets whichever published prerelease owns `next`.
> npm `next` currently resolves `0.1.0-next.2`, including the compatibility
> entry point described below. Verify that an `@next` installation resolves
> `0.1.0-next.2` or a later version that retains the export before relying on
> it.

## Installation

Install the package and every required peer on their supported release lines:

```sh
npm install \
  @vibechess/chessboard-native@next \
  react@19.2.x \
  react-native@0.86.x \
  react-native-gesture-handler@2.32.x \
  react-native-reanimated@4.5.x \
  react-native-svg@15.15.x \
  react-native-worklets@0.10.x
```

| Required peer                  | Supported line |
| ------------------------------ | -------------- |
| `react`                        | `19.2.x`       |
| `react-native`                 | `0.86.x`       |
| `react-native-gesture-handler` | `2.32.x`       |
| `react-native-reanimated`      | `4.5.x`        |
| `react-native-svg`             | `15.15.x`      |
| `react-native-worklets`        | `0.10.x`       |

Expo SDK 57 with React Native 0.86 is the supported managed-app boundary.
Bare React Native consumers must also use React Native 0.86. Other Expo SDK or
React Native lines have not been validated and are outside the current support
contract. This package is ESM-only and supports Android and iOS; it does not
provide a CommonJS build or a React Native Web support guarantee. Reanimated 4
requires React Native's New Architecture; the legacy architecture is not a
supported configuration.

## Required app setup

Mount the application beneath `GestureHandlerRootView`. The wrapper must have
a non-zero layout; `flex: 1` is appropriate for an app root:

```tsx
import { GestureHandlerRootView } from 'react-native-gesture-handler';

export function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Application />
    </GestureHandlerRootView>
  );
}
```

For a standard Expo SDK 57 project, follow Expo's
[Reanimated installation guide](https://docs.expo.dev/versions/v57.0.0/sdk/reanimated/)
and place this wrapper in the root layout. Expo's Babel preset configures the
Worklets transform.

In a bare React Native app, follow the upstream
[Gesture Handler installation guide](https://docs.swmansion.com/react-native-gesture-handler/docs/fundamentals/installation/)
and the
[Reanimated getting-started guide](https://docs.swmansion.com/react-native-reanimated/docs/fundamentals/getting-started/).
Add the Worklets Babel plugin **last**:

```js
module.exports = {
  presets: ['module:@react-native/babel-preset'],
  plugins: [
    // Other plugins go above this entry.
    'react-native-worklets/plugin',
  ],
};
```

Then install iOS pods and restart Metro with a cleared cache after changing the
Babel configuration. See the
[Worklets getting-started guide](https://docs.swmansion.com/react-native-worklets/docs/fundamentals/getting-started/)
for the current bare-app steps.

## Support

Pin an exact `0.1.0-next.N` version after evaluating it if reproducible builds
matter to your application. Report package defects and compatibility findings
in the repository's
[GitHub issues](https://github.com/annabilik/chessboard-native/issues). Include
the exact package and peer versions, platform, and a minimal reproduction.

## Documentation

The installed README is the detailed usage guide. Repository documentation
adds the authored API and migration material:

- [API reference](https://github.com/annabilik/chessboard-native/blob/main/docs/api-reference.md)
- [Migration from `react-chessboard`](https://github.com/annabilik/chessboard-native/blob/main/docs/migrating-from-react-chessboard.md)
- [Comparison](https://github.com/annabilik/chessboard-native/blob/main/docs/comparison.md)
- [Support matrix](https://github.com/annabilik/chessboard-native/blob/main/docs/support-matrix.md)
- [Pinned parity ledger](https://github.com/annabilik/chessboard-native/blob/main/docs/parity/react-chessboard-5.10.md)

## Core contract

`Chessboard` fills its parent's measured width and derives height from the board
dimensions. Constrain the parent to choose a size. Position, annotations, and
optional selection are consumer-owned controlled values. Move, selection, and
annotation callbacks emit decisions or requested deltas; they never commit
semantic state inside the component.

The root API includes native interaction, provider-coordinated spare pieces,
controlled transitions, declarative visual customization, and one adjustable
accessibility control. The package is rules-free: legality, promotion, premoves,
history, and application state belong to the consumer.

```tsx
import { Chessboard } from '@vibechess/chessboard-native';

<Chessboard
  boardId="starting-position"
  orientation="black"
  position="rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR"
/>;
```

## `react-chessboard` compatibility subpath

> [!IMPORTANT]
> Published `0.1.0-next.2` exports this entry point; npm
> `0.1.0-next.1` does not. After installing `@next`, confirm the resolved
> package is `0.1.0-next.2` or a later version that retains
> `./react-chessboard-compat` before using the import below.

Applications migrating from `react-chessboard@5.10` can keep its single
`options` object and familiar option names through a separate entry point:

```tsx
import { useState } from 'react';
import {
  Chessboard,
  type ReactChessboardArrow,
} from '@vibechess/chessboard-native/react-chessboard-compat';

export function CompatibilityBoard() {
  const [position, setPosition] = useState<
    Record<string, { pieceType: string }>
  >({ d4: { pieceType: 'wN' }, d5: { pieceType: 'bP' } });
  const [arrows, setArrows] = useState<readonly ReactChessboardArrow[]>([]);

  return (
    <Chessboard
      options={{
        id: 'analysis',
        position,
        arrows,
        boardOrientation: 'white',
        onPieceDrop: ({ piece, sourceSquare, targetSquare }) => {
          if (piece.isSparePiece || targetSquare === null) return false;
          setPosition((current) => {
            const next = { ...current };
            delete next[sourceSquare];
            next[targetSquare] = { pieceType: piece.pieceType };
            return next;
          });
          return true;
        },
        onArrowsChange: ({ arrows: next }) => setArrows(next),
      }}
    />
  );
}
```

The subpath adapts option names, not browser primitives. Style fields accept
React Native `StyleProp` values, piece and square renderers use the native
visual-only contracts, and square press callbacks do not receive a synthetic
`React.MouseEvent`. Pointer hover, right-click, ancestor auto-scroll, DOM
helpers, and the upstream context hook are unavailable on Android and iOS.
The standard 8×8 board keeps the upstream starting-position default;
nonstandard dimensions default to an empty position unless `position` is
supplied explicitly.

Position and arrows remain app-owned. Returning `true` from `onPieceDrop`
accepts the request but does not move a piece; publish the next `position`
through `options`. Likewise, `onArrowsChange` proposes a complete next array,
and only a later `options.arrows` value persists it. The adapter never stores a
shadow position or arrow collection and never fires `onArrowsChange` merely
because it mounted. Without `onPieceDrop`, move input stays read-only; without
`onArrowsChange`, supplied arrows render read-only and drawing/clear policies
stay disabled.

The compatibility surface uses plain controlled values. Choose the primary
entry point when an application needs revisioned positions, exact
`committedIntentId` correlation, asynchronous move decisions, stable annotation
IDs, square annotations, selection, accessibility customization, multiple
board coordination, or targeted spare pieces.

## Providers and multiple boards

`boardId` is required, non-empty, stable for the mounted lifetime, and unique
within the nearest provider. A standalone board creates a private provider. Use
an explicit `ChessboardProvider` when boards need one coordination scope:

```tsx
import { Chessboard, ChessboardProvider } from '@vibechess/chessboard-native';

<ChessboardProvider geometryRevision={workspaceGeometryRevision}>
  <Chessboard boardId="analysis-main" position={mainPosition} />
  <Chessboard boardId="analysis-variation" position={variationPosition} />
</ChessboardProvider>;
```

The provider is compositional and owns no position, annotations, or semantic
selection. Each board remains an independent adjustable accessibility control
and keeps its own controlled callbacks and revisions. A duplicate ID takes the
typed `DUPLICATE_BOARD_ID` error path without replacing the original board's
registration. Nested providers create independent identity scopes.

`geometryRevision` defaults to `0`, must remain monotonic while the provider is
mounted, and cannot be negative. Increment it after a programmatic ancestor
scroll, transform, or other layout mutation that React Native cannot report to
the registered boards. A changed value cancels the active provider drag/drop
verification and pending board move interactions in that scope; it never
changes board state.

The provider caches measured window bounds for hover presentation only. An
external release always remeasures its named target, translates the fresh
window point into board-local coordinates, and verifies the board mount token,
board geometry, provider geometry, and interaction epoch before resolving a
square. A committed board reserves its ID immediately but cannot become a drop
target until it has a current positive layout. Its shared overlay remains
pointerless and hidden from accessibility while active. The layout-neutral
provider projects that overlay as one transient absolute sibling after its
children. It translates window pointer coordinates through the freshly
measured overlay-host origin, so a clipping palette child cannot crop a drag
that leaves the source. `SparePiece` keeps the overlay visible through
asynchronous release verification, then routes the verified result through the
target board's current move-request runtime.

## Spare pieces and position editors

`SparePiece` is a reusable external source, not a position store. It requires an
explicit `ChessboardProvider` around both the source and its target; a
standalone board's private provider cannot coordinate with a sibling palette.
Every source names exactly one board, so a provider containing multiple boards
has no implicit drop routing.

```tsx
import {
  Chessboard,
  ChessboardProvider,
  SparePiece,
  type OnMoveRequest,
} from '@vibechess/chessboard-native';

const onMoveRequest: OnMoveRequest = (intent) => {
  if (intent.source.kind !== 'spare' || intent.targetSquare === null) {
    return { status: 'rejected' };
  }

  editorStore.placePiece(intent.targetSquare, intent.piece, {
    committedIntentId: intent.intentId,
    expectedRevision: intent.basePositionRevision,
  });
  return { status: 'accepted' };
};

<ChessboardProvider>
  <SparePiece
    piece={{ pieceType: 'wQ' }}
    size={56}
    spareId="white-queen"
    targetBoardId="editor"
  />
  <Chessboard
    boardId="editor"
    onMoveRequest={onMoveRequest}
    position={editorPosition}
  />
</ChessboardProvider>;
```

The required props are `spareId`, `targetBoardId`, and `piece`. `size` defaults
to 48 points. `pieceRenderers` is the same whole-map visual replacement used by
`Chessboard`; `style` paints the spare host without replacing its interaction
geometry. `disabled` prevents drag and placement selection. The source is an
accessible button whose default label and hint can be replaced with
`accessibilityLabel` and `accessibilityHint`.

Activating that button also calls the named target board's current
`onPiecePress`, when present, with
`source: { kind: 'spare', spareId }` and the board's current controlled position
revision. This observation does not replace or commit the provider's transient
spare selection. Once a permitted spare pan actually activates, the
same target board receives one `onPieceDragStart` observation. A palette never
captures its own semantic callback or revision.

Drag, tap-to-place, and accessible placement all call only the named board's current
`onMoveRequest`. The immutable intent carries that `boardId`, the board's
current `basePositionRevision`, the detached `piece`, and
`source: { kind: 'spare', spareId }`. After activating a spare, an ordinary
board tap uses `input: 'tap'` and the tapped canonical square before annotation,
piece-press, or square-activation callbacks. Drag uses `input: 'drag'` and may
report an off-board `targetSquare: null`; accessible placement uses
`input: 'accessibility'` and the board cursor's current square. All paths
recheck the board's current callback and interaction permissions at emission. Drag
also rechecks `canDragPiece` with the spare source. A missing callback, denied
permission, unavailable target, or stale release fails closed.

Activating a spare selects one transient source in the provider. A tap on its
matching target board requests placement unless that canonical square is
controlled-disabled or another move is pending. The same board alone exposes
**Place selected spare** and **Cancel spare selection** actions. Accessible
placement is additionally gated by the current accessibility permission and
cursor square; cancellation remains available if those placement gates
disappear.
Selecting another spare replaces the first; starting a physical drag from that
selected source, successful request submission, explicit cancellation, source
identity change, disablement or unmount, target unmount, and provider
deactivation clear the transient selection. This selection is not
`ChessboardProps.selection` and does not edit the consumer's position. The
consumer must accept or reject the ordinary move request and publish any
resulting controlled position update.

`piece.id` is actor identity, not palette identity. A reusable anonymous palette
entry may omit it. When stable transition identity is desired, publish a fresh
piece ID for each offered placement and preserve that exact ID from the emitted
intent into the committed position; do not place one fixed ID more than once in
the same position. Board-origin editor moves preserve the existing actor ID.

For rectangular variants, use sparse object positions. FEN remains strict and
8×8-only. When changing `dimensions`, publish a dimension-compatible object
position in the same consumer update and advance its controlled revision. The
board cancels stale interaction geometry but never prunes, relocates, or restores
pieces on the consumer's behalf.

The provider-level overlay can escape clipping inside a source palette, but it
is not a native window portal. An ancestor that clips the provider's entire
interaction scope can still crop it. Place the provider above palette- or
board-local clipping regions and avoid clipping the full provider scope when a
drag must travel beyond it.

## Interaction hardening

Board and spare-piece drag recognizers arbitrate with an ordinary ancestor
React Native `ScrollView`. A touch that cannot start a current draggable source
fails the drag path so the scroll view can take ownership. A valid drag can
activate after the named board's current `gesture.activationDistance` and then
retains the interaction until release or cancellation. The threshold defaults
to four native points and is shared by targeted spares. The library never
discovers or programmatically scrolls an arbitrary ancestor; upstream
`allowAutoScroll` behavior is intentionally not part of the native 1.0
contract.

Continuous pan coordinates and overlay transforms remain on the UI thread.
Only activation, release, cancellation, canonical hover-square changes, and
recognized tap boundaries cross to JavaScript. `onPieceDragStart` therefore
fires once, never per frame. Deterministic component instrumentation verifies
bounded React commits and custom-renderer calls. Packed-package Espresso and
XCUITest scenarios separately verify parent scrolling, board-drag capture,
exactly-once consumer callbacks, unchanged controlled revisions, and lifecycle
cancellation.

Leaving the interactive AppState cancels the provider's active drag, pending
drop verification, transient spare selection, and board interaction work.
Layout, dimensions, orientation, position, permissions, provider
`geometryRevision`, target unmount, and provider unmount keep their existing
epoch-correlated cancellation rules. Returning to the foreground never replays
the cancelled gesture or a late native terminal signal.

See the repository's
[`interaction-hardening` example](https://github.com/annabilik/chessboard-native/blob/main/apps/example/app/interaction-hardening.tsx)
for a clipped palette, standard vertical `ScrollView`, geometry invalidation,
unmount/remount controls, and app-owned render/callback counters.

## Pieces and styles

`defaultTheme` is a public root export. `defaultPieceRenderers` is available
from the root and the focused `@vibechess/chessboard-native/pieces` subpath.
Supplying `pieceRenderers` replaces the whole lookup; spread the defaults
explicitly when overriding only one standard piece. A renderer may also
introduce any custom piece type used by an object position. Ordinary,
memoized, and forwarded-ref React components are accepted.

`defaultTheme` is safe to spread as a customization base. Unchanged nested
notation defaults retain their responsive measured font size and insets; only
fields changed by the derived theme become overrides.

```tsx
import { Chessboard, type PieceRenderer } from '@vibechess/chessboard-native';
import { defaultPieceRenderers } from '@vibechess/chessboard-native/pieces';
import { Text, View } from 'react-native';

const Fairy: PieceRenderer = ({ size }) => (
  <View
    style={{
      alignItems: 'center',
      height: size,
      justifyContent: 'center',
      width: size,
    }}
  >
    <Text style={{ fontSize: size * 0.55 }}>F</Text>
  </View>
);

<Chessboard
  boardId="custom-variant"
  dimensions={{ columns: 5, rows: 3 }}
  orientation="black"
  pieceRenderers={{ ...defaultPieceRenderers, fairy: Fairy }}
  position={{ c2: { id: 'guide', pieceType: 'fairy' } }}
  squareStyles={{ c2: { backgroundColor: '#d7c5ff' } }}
  styles={{ piece: { opacity: 0.9 } }}
  theme={{ darkSquare: { backgroundColor: '#66507c' } }}
/>;
```

Resolved square styles follow this fixed order:

1. Built-in base and light/dark paint.
2. `theme` base and light/dark paint.
3. Instance `styles` base and light/dark paint.
4. Canonical `squareStyles[square]` paint.
5. Destination, selected, disabled, and drop-target state slots, in that order.

Each state slot resolves its built-in default, `theme`, and instance `styles`
before the next slot is applied, making `dropTarget` the final named square
state. Per-square styles, pieces, and selection IDs are canonical and do not
rotate when orientation changes. The defaults use inset shadow or opacity and
never change square geometry.

Static piece paint resolves built-in `piece`, `theme.piece`, then
`styles.piece`. The active provider drag overlay adds built-in,
`theme.draggingPiece`, and `styles.draggingPiece` paint after that complete
chain. Its default 1.2 scale is composed after the pointer translations on the
UI thread; reduced motion suppresses the lift transform. The active source
ghost similarly adds the `draggingPieceGhost` chain, whose default opacity is
0.5. The named target board's resolved drag and ghost slots apply to both
board-origin and spare-origin drags. `SparePiece.style` remains its resting base
paint; once its provider lease is active, the target board owns the overlay and
ghost presentation.

`renderSquare` is called for every measured canonical square. Its frozen props
contain `boardId`, `square`, the current controlled `piece` or `null`, the
smaller measured cell dimension as `size`, the resolved frozen `style`, and a
frozen `state` with these flags:

- `isSelected`, `isDestination`, and `isDisabled` come from the current
  controlled selection.
- `isPressed` is current gesture presentation and clears when that correlated
  press ends or becomes stale.
- `isDropTarget` is the current correlated board or spare hover square. It is
  visual feedback only; verified release and `onMoveRequest` still authorize
  the move.
- `isPendingSource` and `isPendingTarget` describe the current deciding or
  awaiting-controlled-commit move presentation.

The board always owns and paints the square frame. It applies `style` exactly
once, then mounts custom content inside a pointerless,
accessibility-hidden wrapper. The renderer receives no handlers and cannot
replace measurement, hit testing, gestures, or the single board accessibility
control. Returning `null` leaves the resolved fallback paint visible.

```tsx
import { Chessboard, type SquareRenderer } from '@vibechess/chessboard-native';
import { View } from 'react-native';

const SquareContent: SquareRenderer = ({ size, state }) =>
  state.isPendingTarget ? (
    <View
      style={{
        backgroundColor: '#ffffff',
        borderRadius: size * 0.06,
        height: size * 0.12,
        opacity: 0.8,
        width: size * 0.12,
      }}
    />
  ) : null;

<Chessboard
  boardId="styled-board"
  onMoveRequest={onMoveRequest}
  position={position}
  renderSquare={SquareContent}
  styles={{
    draggingPiece: { opacity: 0.9, transform: [{ scale: 1.12 }] },
    draggingPieceGhost: { opacity: 0.3 },
    dropTarget: { backgroundColor: '#b8d8ba' },
  }}
/>;
```

Custom piece content receives its resolved piece style for inspection or
derived artwork, while the board-owned wrapper applies that style exactly once.
Renderers should not blindly apply it again. Renderer props contain no event or
accessibility handlers. Their discriminated `source` is
`{ kind: 'board', square }` for a controlled board piece and
`{ kind: 'spare', spareId }` for a public spare. `square` is non-null for board
sources and nullable for spare sources. A resting `SparePiece` and its source
ghost pass `null`; its active provider overlay passes the current canonical
target square while over the board and `null` off-board. The corresponding
board or spare host keeps the visual subtree non-interactive and decorative.
Host measurement and absolute square/piece wrapper rectangles remain structural
and cannot be replaced by visual styles.

Board display, width, height, aspect ratio, flex sizing, margins, insets,
padding, transforms, box sizing, border widths, and pointer-event modes are
ignored in `theme.board` and `styles.board`; use a parent wrapper for those
concerns. Square and piece geometry-like styles can inform paint or renderer
derivation but cannot replace canonical measured placement.

## Controlled annotations

`annotations` is the only persistent square/arrow collection. Replacing that
prop replaces the rendered collection immediately; the board never merges it
with an internal arrow list. Array order is same-layer paint order. Arrows
default above pieces, while square annotations default below pieces. Use the
revisioned `ControlledAnnotations` tier for interactive annotation stores.

```tsx
import {
  applyAnnotationOperation,
  Chessboard,
  defaultAnnotationStyle,
  type ControlledAnnotations,
  type OnAnnotationOperation,
} from '@vibechess/chessboard-native';
import { useCallback, useState } from 'react';

const initialAnnotations: ControlledAnnotations = {
  revision: 4,
  value: [
    {
      id: 'candidate',
      type: 'arrow',
      from: 'b1',
      to: 'c3',
      color: '#246bc2',
    },
    {
      id: 'focus',
      type: 'square',
      square: 'd4',
      shape: 'circle',
      color: 'rgba(228, 111, 24, 0.45)',
    },
  ],
};

function AnalysisBoard() {
  const [annotations, setAnnotations] =
    useState<ControlledAnnotations>(initialAnnotations);
  const onAnnotationOperation = useCallback<OnAnnotationOperation>(
    (operation) => {
      setAnnotations((current) => {
        const result = applyAnnotationOperation({
          boardId: 'analysis',
          current,
          operation,
        });
        return result.status === 'rejected' ? current : result.next;
      });
    },
    [],
  );

  return (
    <Chessboard
      annotationPolicies={{
        clearOnBoardPress: true,
        clearOnPositionChange: true,
      }}
      annotations={annotations}
      annotationTool={{ color: '#e46f18', type: 'arrow' }}
      annotationStyle={{
        ...defaultAnnotationStyle,
        arrowStartOffset: 0.25,
      }}
      boardId="analysis"
      onAnnotationOperation={onAnnotationOperation}
      position={{ revision: 9, value: '8/8/8/8/8/8/8/8' }}
    />
  );
}
```

`onAnnotationOperation` is a synchronous notification. Its return value is
ignored, and the board never applies the delta itself. Add and toggle operations
carry the stable `annotationId` to use if the delta adds a persistent value.
Toggle operations also name only the matching IDs observed at their base;
clear operations likewise carry `annotationIdsAtBase` and a reason. Operation
IDs provide correlation; consumers that need exactly-once processing must
deduplicate them in their own store boundary.

`applyAnnotationOperation` is a pure convenience reducer for the consumer side.
Always call it against the latest store envelope, not a snapshot captured when
the gesture or policy began. It returns `applied`, `unchanged`, or `rejected`
with the next envelope. A stale operation can still be applied safely: toggle
and clear remove only IDs named at their base, so annotations added concurrently
survive. Board mismatches, future bases, conflicting annotation IDs, and
revision overflow are rejected without changing `next`.
`findMatchingAnnotationIds` returns the deterministic type-and-square or
type-and-endpoints match set required when a consumer constructs a toggle
operation outside the board's touch paths.

`annotationPolicies.clearOnBoardPress` and `clearOnPositionChange` independently
emit scoped clear operations. They never mutate the controlled collection, and
position-change clearing is not coupled to board-press clearing. A consumer may
omit either policy or the callback to keep the board read-only for annotations.

Interactive annotation input is enabled only when all of these current values
are available: a ready measured board, `annotations`, a non-null
`annotationTool`, and a committed `onAnnotationOperation` callback. An empty
collection is valid and can receive its first annotation. Plain annotation
arrays receive an internally derived correlation revision, but an interactive
store should use `ControlledAnnotations` so it can apply operations and publish
the next revision explicitly.

An arrow tool supports three equivalent touch paths. Tap one source square and
then a different target square; hold a source for 500 milliseconds and pan to
the target; or use the two-finger pan. The first explicit arrow tap paints a
transient border anchor. A square tool toggles on one explicit tap, while its
pan paths use the terminal square. Every successful path emits one immutable
`toggle` operation with `input: "touch"`, the exact base annotation revision,
all matching IDs observed at that revision, and a stable candidate ID for an
add. Releasing an arrow on its source, releasing outside the board, or
cancelling emits nothing.

Annotation activation is exclusive: a consumed touch does not also request a
board-press clear, square activation, or move. Immediate one-finger piece drag
keeps its existing path; long-press and two-finger recognition arbitrate on the
same accessibility-hidden board plane. Changes to the position or annotation
revision, tool semantics, geometry, provider lifecycle, callback availability,
or mount lifetime cancel the transient session. Callback results are ignored,
and a persistent annotation appears or disappears only after the consumer
publishes the next `annotations` prop.

The same gate adds annotation actions to the single adjustable board. With an
arrow tool, **Start arrow** arms the cursor square, navigation keeps the border
draft visible, **Finish arrow** on a different square emits one toggle, and
**Cancel annotation** emits nothing. With a square tool, **Toggle square
annotation** emits immediately at the cursor. Operations use
`input: "accessibility"` and share the exact session, revision checks, matching
IDs, and committed callback with touch; either input can finish a source begun
by the other. Annotation actions replace ordinary accessible move and square
activation, while a selected spare and an already-pending move keep precedence.
`accessibility.formatActionLabel` receives all four annotation action names.
Keyboard annotation input remains future work.

Omitted arrow shape automatically selects an L path only for an integer
one-by-two canonical move. `shape="straight"` always overrides that choice;
`shape="knight"` selects an L path when both axes change and otherwise falls
back to a straight path. Multiple sources aimed at one target shorten further
to keep heads distinct. `width` is an optional stroke width in the fixed
2048-wide logical annotation space, and per-arrow `opacity` overrides the style
default.
`annotationStyle` is a complete whole-value configuration, not a partial merge.
The selected `annotationTool` supplies the color and optional presentation
fields for a drawn candidate; every persistent annotation continues to render
its own required `color`.

Square shapes are `fill`, `circle`, `dot`, and `border`. All SVG descendants are
pointerless and hidden from accessibility; the stable outer board remains the
only accessible control. The renderer can compose at most one
revision/geometry-correlated transient draft. Layer ordering follows the draft
type, and the draft is appended after persistent entries only within that
layer. Arrow drafts use active width and opacity styling; square drafts use
active opacity styling. A draft never becomes a persistent annotation. The
explicit, long-press, and two-finger touch paths produce that one correlated
draft and request the final operation without retaining an annotation list.

## Controlled selection and square activation

`selection` is the only semantic selection source. Its `selectedSquare`,
`destinationSquares`, and `disabledSquares` fields drive presentation, but the
board never edits them. Supplying `onSquareActivate` opts into same-square touch
and accessibility activation, including occupied and empty squares. Supplying
`onPiecePress` independently opts occupied squares into that same pipeline.
Each enabled ordinary activation is routed exactly once:

- For touch, when `onMoveRequest` is also present, a selected source exists,
  that source still contains a current controlled piece, and the enabled target
  is listed as a destination, the board emits only a `MoveIntent` to
  `onMoveRequest`. Accessibility activation uses that route only while
  `interactionPermissions.accessibility` permits move input.
- Otherwise an occupied square emits only one immutable
  `PieceInteractionContext` to `onPiecePress` when supplied.
- Every remaining enabled activation emits only a `SquareActivationIntent` to
  `onSquareActivate` when supplied. The intent reports the current position and
  selection revisions, target square and piece, selected source, destination
  flag, input, and action.

Disabled targets and disabled selected sources block ordinary activation.
Omitting `destinationSquares` therefore keeps activation declarative rather
than inferring chess rules. The accessible `clear-selection` action is an
explicit activation intent even when the selected square is disabled; the
consumer clears selection by publishing a new `selection` prop.
When `onMoveRequest` is present and accessible move input is permitted,
accessible removal of the current enabled piece remains a direct null-target
`MoveIntent` and never also emits a square activation.

```tsx
import {
  Chessboard,
  type OnSquareActivate,
} from '@vibechess/chessboard-native';

const onSquareActivate: OnSquareActivate = (intent) => {
  selectionStore.dispatch({ intent, type: 'square-activated' });
};

<Chessboard
  boardId="analysis"
  onSquareActivate={onSquareActivate}
  position={position}
  selection={selection}
/>;
```

Callback references become active only after their render commits. Touch
activation captures the selection revision at gesture start and is rechecked
against the current normalized selection and position before emission, so an
abandoned render or stale tap is inert. A callback invocation is a notification
only; neither it nor the recognizer mutates selection or position.

Without either `onSquareActivate` or `onPiecePress`, no ordinary same-square tap
activation is enabled. Square press callbacks may independently mount a
press-only recognizer without enabling activation. An existing `onMoveRequest`
still provides its accessible transient source-target, removal, and cancellation
flow while accessible move input is permitted. With none of those callbacks,
square press callbacks, or a complete annotation input gate, the component
mounts no native gesture hit plane and remains read-only.

## Square press callbacks

`onSquarePressIn` and `onSquarePressOut` are portable native observations for
the upstream mouse-down/up intent. They receive no DOM or native event object,
do not enable square activation, and cannot update controlled state. Each
delivery is a detached, frozen `SquarePressContext` containing the canonical
square, the piece or `null` captured there, the board ID, and the controlled
position revision at press-in:

```tsx
import {
  Chessboard,
  type OnSquarePressIn,
  type OnSquarePressOut,
} from '@vibechess/chessboard-native';

const onSquarePressIn: OnSquarePressIn = (context) => {
  interactionLog.record('in', context);
};
const onSquarePressOut: OnSquarePressOut = (context) => {
  interactionLog.record('out', context);
};

<Chessboard
  boardId="analysis"
  onSquarePressIn={onSquarePressIn}
  onSquarePressOut={onSquarePressOut}
  position={position}
/>;
```

A callback-only board mounts the same single accessibility-hidden RNGH plane but
keeps tap activation, selection, annotation, and move requests disabled. An
accepted press emits `onSquarePressIn` once. Release, leaving the hit plane,
gesture failure, drag or annotation takeover, and a mounted semantic or geometry
invalidation emit `onSquarePressOut` at most once with that originating context.
Unmount disposes the press without invoking consumer code. Successful activation
orders press-in, press-out, then the existing activation router; a drag takeover
orders press-out before `onPieceDragStart`.

Callback references become active only after commit. Replacing a callback does
not recreate the recognizer, a terminal uses the latest committed handler, and
removing a handler prevents stale delivery. Exceptions and return values are
isolated from gesture and controlled-state behavior. Accessibility activation
does not synthesize touch press-in/out callbacks.

## Piece callbacks and gesture tuning

`onPiecePress` and `onPieceDragStart` are synchronous observations. They do not
approve moves, enable drag by themselves, or modify controlled state. Each
receives one detached, frozen `PieceInteractionContext` containing the owning
`boardId`, its current `basePositionRevision`, a copied `piece`, and one explicit
source:

```ts
import type { OnPiecePress } from '@vibechess/chessboard-native';

const onPiecePress: OnPiecePress = (context) => {
  const source =
    context.source.kind === 'board'
      ? `square ${context.source.square}`
      : `spare ${context.source.spareId}`;
  interactionLog.record({
    boardId: context.boardId,
    piece: context.piece,
    revision: context.basePositionRevision,
    source,
  });
};
```

An occupied same-square touch or accessibility activation calls
`onPiecePress` once unless a declared selected-destination move owns that action
first. It never also calls `onSquareActivate`. Activating `SparePiece` keeps its
existing transient accessible-selection behavior and also calls the named
target board's current `onPiecePress`; the palette never owns a separate
callback or position revision.

`onPieceDragStart` fires once after a board or targeted-spare pan passes current
permissions and `canDragPiece` and actually activates. It does not fire for a
denied source, a gesture cancelled before activation, or every pointer frame.
The later terminal request still belongs only to `onMoveRequest`. Exceptions
from either observational callback are isolated and their return values are
ignored.

```tsx
<Chessboard
  boardId="analysis"
  gesture={{ activationDistance: 12 }}
  onMoveRequest={onMoveRequest}
  onPieceDragStart={(context) => interactionLog.dragStarted(context)}
  onPiecePress={(context) => interactionLog.pressed(context)}
  position={position}
/>
```

`gesture.activationDistance` is measured in native points, defaults to `4`, and
must be a finite non-negative number. It configures the board pan threshold and
is published to every `SparePiece` targeting that board. On the shared board
plane it also sets same-square tap travel tolerance and two-finger annotation
pan activation distance. Changing it replaces the current recognizer
configuration; it never changes position, selection, or annotations.

`gesture.allowDragOffBoard` defaults to `true`. Set it to `false` to clamp the
active overlay's center to the board rectangle. The board applies that policy
to its own pieces and every `SparePiece` targeting it. This is presentation
only: raw pointer hit testing and release verification are unchanged, so a
release outside the board still emits `targetSquare: null`. Changing the policy
cancels an active pan so its gesture and visual bounds cannot disagree, but
does not cancel a move request that is already deciding or awaiting a
controlled commit.

## Controlled move requests

`onMoveRequest` asks the consumer to accept or reject one rules-free intent.
The callback may be synchronous or asynchronous and receives an `AbortSignal`.
Acceptance changes only transient pending presentation. To commit, publish a
new controlled position. The revisioned tier can correlate that update by
incrementing `revision` and copying `intent.intentId` to `committedIntentId`:

```tsx
import {
  Chessboard,
  type ControlledPosition,
  type OnMoveRequest,
} from '@vibechess/chessboard-native';
import { useState } from 'react';

export function ControlledMoveBoard() {
  const [position, setPosition] = useState<ControlledPosition>({
    revision: 0,
    value: { e2: { id: 'pawn', pieceType: 'wP' } },
  });

  const onMoveRequest: OnMoveRequest = async (intent, { signal }) => {
    const accepted = await validateInYourApplication(intent, signal);
    if (!accepted || signal.aborted) {
      return { status: 'rejected', reason: 'Move not accepted' };
    }

    setPosition((current) =>
      current.revision !== intent.basePositionRevision
        ? current
        : {
            committedIntentId: intent.intentId,
            revision: current.revision + 1,
            value: applyIntentInYourStore(current.value, intent),
          },
    );
    return { status: 'accepted' };
  };

  return (
    <Chessboard
      boardId="playground"
      interactionPermissions={{ accessibility: true, drag: true }}
      moveRequestTimeouts={{ commitMs: 1_500, decisionMs: 10_000 }}
      onMoveRequest={onMoveRequest}
      position={position}
    />
  );
}
```

The board does not check turns, legal moves, promotion, or game state. That is
why the example delegates both validation and position construction to the
consumer. A matching controlled update may arrive before or after the accepted
decision; stale results, timeouts, permission changes, unrelated position
updates, and unmounts cannot commit or replace current props.

With a callback, accessible move input and drag both default on. Set
`interactionPermissions.drag` to `false` to keep only the non-drag path. Setting
`interactionPermissions.accessibility` to `false` also disables drag, so the
component never exposes a drag-only move action. `canDragPiece` is a synchronous
current-position gate for drag activation; throwing or returning anything other
than `true` denies the drag. Without `onMoveRequest`, no move-request pan
recognizer is mounted; `onSquareActivate` or `onPiecePress` may still enable
controlled tap input. The default decision timeout is 10 seconds; after
acceptance, the default controlled-commit timeout is 1.5 seconds.

### Cancelling transient move work

Pass `actionsRef` to obtain one mount-scoped `ChessboardActions` handle. Its
`cancelMove()` method cancels current board or targeted-spare dragging,
release verification, an accessible staged source or spare selection, and a
move request that is deciding or awaiting a controlled commit. It returns
`true` only when at least one of those transient interactions was cancelled.

```tsx
import {
  Chessboard,
  type ChessboardActions,
} from '@vibechess/chessboard-native';
import { useRef } from 'react';
import { Button } from 'react-native';

export function CancellableBoard() {
  const actionsRef = useRef<ChessboardActions | null>(null);
  const cancelMove = () => actionsRef.current?.cancelMove() ?? false;

  return (
    <>
      <Chessboard
        actionsRef={actionsRef}
        boardId="playground"
        gesture={{ allowDragOffBoard: false }}
        onMoveRequest={onMoveRequest}
        position={position}
      />
      <Button onPress={cancelMove} title="Cancel current move" />
    </>
  );
}
```

Cancellation never edits controlled position, selection, annotations, or
transition inputs, and it does not synthesize consumer callbacks. A retained
handle becomes an inert, false-returning capability after its board unmounts;
it cannot address a later board that reuses the same `boardId`.

### Promotion and premoves belong to the consumer

`Chessboard` reports coordinates and current controlled context; it does not
choose a promotion piece or own a premove queue. A promotion picker can keep an
`onMoveRequest` promise pending in application state, listen to its
`AbortSignal`, and reject any chooser result whose base revision is no longer
current. After a choice, publish a greater `ControlledPosition.revision`, copy
the request's `intentId` to `committedIntentId`, retain the actor's stable ID,
and provide an exact `transition.promotion` hint for the chosen target type.

A premove should not be represented by returning `accepted` and leaving the
board waiting for a future commit. Queue it in application state instead. Use
controlled `selection` and `annotations` for its presentation, then revalidate
the queued source and target against the latest position after the opponent's
update. Applying a still-valid premove is an ordinary new controlled position
revision; an invalid queue is simply cleared. The Expo gallery's
`rules-owned-moves` route demonstrates both workflows without adding a rules
engine or another board source of truth.

## Controlled position transitions

Every valid position prop is authoritative as soon as it renders. When the
previous and current committed positions form an animatable revision pair, the
board derives detached piece operations and presents them with one board-local
Reanimated clock:

- ordinary continuing pieces translate from their old measured cell to their
  current canonical square;
- added and ambiguous new actors fade in;
- removed, captured, and ambiguous old actors fade out underneath current
  pieces;
- type-changing replacements travel once while old and new artwork crossfade;
- an accepted `rookMove` coordinates a second actor on the same clock;
- an accepted `capturedSquare` identifies the exact fading victim, including an
  off-target en passant capture.

The visual operation never becomes a logical position. Custom renderers for a
moving or entering current actor receive its current target `square` and
`state.isTransitioning = true`; an exiting actor receives its old square and
detached old piece. All transient hosts remain pointerless and hidden from
accessibility.

```tsx
<Chessboard
  boardId="analysis"
  position={position}
  reduceMotion="system"
  transitionDurationMs={450}
/>
```

`transitionDurationMs` defaults to `300`, must be a finite non-negative number,
and uses `0` as an explicit snap. Every semantic plan still compares only the
exact previous and current committed revisions. A private
`TransitionPresentation` actor graph contains normalized visual endpoints,
opacity, and correlation metadata, never a canonical position collection. If C
arrives during an A-to-B animation, B remains committed and the next plan is
exactly B to C. An identity-safe actor may start that new presentation from its
sampled current A-to-B visual point and opacity and run the B-to-C segment for
the configured full duration; the sample can never become a semantic source.
Visible detached or pending artwork may finish as bounded fading residuals.

When measured geometry or orientation changes during active motion, the runtime
samples each actor's current normalized visual point and opacity, rebases them
into the new projection, and continues to the same current controlled target
for the original segment's remaining time. Initial mount, semantic no-ops,
unavailable measurement, logical row/column changes, invalid current position,
and zero duration still snap. Reduced motion also snaps immediately, clears
sampled continuity, and does not replay a settled revision if motion is later
re-enabled.

A newer revision with the active move's matching `committedIntentId` and a
non-null target may crossfade the pending target into the canonical current
actor without replaying its source-to-target move. The handoff also requires the
exact plan revisions and a current actor matching the intent's source, piece,
and target. Other changed actors still follow the exact adjacent semantic plan.
A missing or mismatched correlation, an actor mismatch, and an off-board target
use ordinary controlled-transition behavior instead; none fabricates a handoff
actor.

Revisioned positions may supply a `transition` hint for exact actor identity.
Malformed, stale, or contradictory hints are warning-only in development and
never invalidate an otherwise valid position.

Each example below is an independent previous/current revision pair:

```tsx
const promotionBefore = {
  revision: 11,
  value: { g7: { id: 'pawn-1', pieceType: 'wP' } },
};
const promotionAfter = {
  revision: 12,
  value: { g8: { id: 'pawn-1', pieceType: 'wQ' } },
  transition: {
    from: 'g7',
    fromRevision: 11,
    promotion: 'wQ',
    to: 'g8',
    toRevision: 12,
  },
};

const castlingBefore = {
  revision: 20,
  value: {
    e1: { id: 'king-1', pieceType: 'wK' },
    h1: { id: 'rook-1', pieceType: 'wR' },
  },
};
const castlingAfter = {
  revision: 21,
  value: {
    f1: { id: 'rook-1', pieceType: 'wR' },
    g1: { id: 'king-1', pieceType: 'wK' },
  },
  transition: {
    from: 'e1',
    fromRevision: 20,
    rookMove: { from: 'h1', to: 'f1' },
    to: 'g1',
    toRevision: 21,
  },
};

const enPassantBefore = {
  revision: 30,
  value: {
    d5: { id: 'pawn-3', pieceType: 'bP' },
    e5: { id: 'pawn-2', pieceType: 'wP' },
  },
};
const enPassantAfter = {
  revision: 31,
  value: { d6: { id: 'pawn-2', pieceType: 'wP' } },
  transition: {
    capturedSquare: 'd5',
    from: 'e5',
    fromRevision: 30,
    to: 'd6',
    toRevision: 31,
  },
};
```

`promotion` is required exactly when the primary actor's piece type changes and
must equal the target type; omit it when the type is unchanged. It remains
rules-free, so custom piece vocabularies are supported. `rookMove` names one
second continuing same-type actor; it does not require a literal rook or legal
castling. `capturedSquare` names an actor from the previous revision that is
removed or replaced. The whole hint is atomic: any revision, endpoint, or
stable-identity contradiction discards it and leaves deterministic ordinary
inference in control.

Without a hint, stable piece IDs still identify replacements. As a final
compatibility fallback, exactly one unambiguous anonymous standard promotion or
replay reversal with no same-type actor alternative can animate; multiple
candidates and custom anonymous types degrade to deterministic ordinary
matching or fades.

## Accessibility and reduced motion

`Chessboard` owns a transient virtual cursor, never semantic selection. It
starts at a valid controlled selected square or the visual top-left, traverses
orientation-aware reading order through adjustable increment/decrement events,
and exposes four directional custom actions. Position and selection prop changes
refresh its value without moving a valid cursor; orientation keeps the same
canonical square.

Use `accessibility` for a full board label/hint override, square/action
formatters, and `{ id, message }` announcements. Announcement IDs are spoken
once per mounted board. `reduceMotion="system"` is the default; `always` forces
reduced motion and `never` explicitly permits it. When move interaction is
enabled, the same control can activate a source and target, remove the source
with a null-target intent, or cancel pending work. A selected `SparePiece`
temporarily gives only its named board the place/cancel actions described above.
When the measured annotation gate is complete, arrow
start/finish/cancel or immediate square-toggle actions replace ordinary move and
square activation while keeping cursor navigation. Every emitted toggle remains
consumer-controlled. `formatActionLabel` can localize those action names, and
`formatMoveOutcome` customizes the correlated committed, rejected, cancelled,
or timed-out announcement; returning `null` suppresses it.

When `onSquareActivate` or `onPiecePress` is present, activating the current
square uses the exclusive controlled-selection router described above. An
occupied square prefers the piece observer unless an accessible declared move
owns the action; remaining activation can emit the square intent. A controlled
selected board also exposes an explicit clear-selection action. The consumer
must publish any resulting selection update. Without either callback,
`onMoveRequest` preserves the transient accessible source-target fallback.

Setting `interactionPermissions.accessibility` to `false` disables accessible
destination-to-move routing, removal, cancellation, and the transient fallback.
Controlled piece/square activation remains available and therefore follows its
ordinary exclusive route for a destination that cannot use the accessible move
path. Touch destination routing remains independent of this accessibility-only
gate.

See the repository's
[`docs/accessibility.md`](https://github.com/annabilik/chessboard-native/blob/main/docs/accessibility.md)
for the complete contract and manual TalkBack/VoiceOver checklist.

## Pure core

```ts
import {
  columnIndexToFile,
  generateBoardGeometry,
  parseFenPosition,
  rankToRowIndex,
  squareToBoardPoint,
} from '@vibechess/chessboard-native';

const grid = generateBoardGeometry({ columns: 8, rows: 8 }, 'black');

grid[0]?.[0]?.square; // "h1"
columnIndexToFile(0, 8, 'white'); // "a"
rankToRowIndex(1, 8, 'white'); // 7
squareToBoardPoint(
  'e4',
  { height: 320, width: 320 },
  { columns: 8, rows: 8 },
  'white',
); // { x: 180, y: 180 }

const position = parseFenPosition(
  'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
);
position['e1']; // { pieceType: "wK" }
```

Dimensions are validated as 1 through 99 rows and 1 through 26 columns.
Coordinates are zero-based from the visual top-left; orientation changes their
projection, never canonical square IDs. FEN consumes only piece placement, is
strict and atomic, and is accepted only for an 8x8 board. Sparse object
positions are validated into detached immutable snapshots, and measured width
and height drive rectangular square-center and internal hit-test geometry.

The visual surface waits for a positive native layout measurement, then places
every cell from cumulative proportional edges without rounding. Width changes
remeasure the same coordinate system. Same-aspect dimension changes immediately
reproject the unchanged bounds, while changed-aspect layouts wait for the native
resize measurement. Pieces use those same board-local rectangles. Notation
defaults on and follows the visual bottom and left edges in either orientation.

Standalone validation uses standard `TypeError`, `RangeError`, and
`SyntaxError` failures. `Chessboard` translates them into contextual
`ChessboardError` values, derives plain revisions without renderable shadow
snapshots, and rejects invalid revision ordering or mounted tier changes.
Invalid dimensions or orientation also use the typed dimensions recovery
domain. Development throws; production calls `onError` once per domain and
revision after commit, or logs once when no handler exists. Annotation IDs are
non-empty and unique, annotation order is semantic, and selection square arrays
normalize as sorted sets.

An invalid current position renders no pieces and never falls back to an older
position. Invalid annotations or selection do not suppress pieces from the
valid current position.

Do not use this package in production yet.
