# @vibechess/chessboard-native

A controlled, rules-free React Native chessboard component.

This unpublished package includes the controlled public contracts,
platform-free position and coordinate core, measured geometry, strict FEN
foundation, a responsive board renderer, and the completed Phase 2 interaction
surface. `Chessboard` fills its parent width, derives height from board rows and
columns, and renders oriented square backgrounds, optional edge notation, and
the current controlled position and annotation collection. Constrain the
parent to set an explicit width.

The default set contains twelve original interim geometric chess pieces.
Consumers can replace it with a visual-only renderer map keyed by the open
`pieceType` vocabulary. Theme, instance, and canonical per-square styles are
also declarative. The board is one adjustable accessibility control with an
orientation-aware virtual cursor and decorative visual descendants. Controlled
square and arrow annotations render in below/above-piece SVG planes. Selection
styling follows the controlled selection prop, and `onSquareActivate` can opt
the board into controlled touch and accessibility activation. Supplying
`onMoveRequest` opens the controlled move-request surface: board/spare-piece
drag and the adjustable control's source, target, removal, and cancellation
actions use one correlated lifecycle. Neither gesture path nor either callback
changes position or selection; only the consumer's next controlled props can do
that.
`ChessboardProvider` adds provider-scoped board identity, one shared transient
overlay, and stale-safe external-drop measurement. Its public `SparePiece`
source supports drag and accessible placement on one named board while that
board's controlled move callback remains the only position authority. Custom
square rendering and annotation gesture drawing remain future work. Pure
controlled-position transition planning validates exact-revision hints,
prefers stable piece IDs, and treats ambiguous anonymous matches as exits and
enters. The mounted Reanimated runtime consumes only those detached operations;
it never renders a retained position snapshot.

```tsx
import { Chessboard } from '@vibechess/chessboard-native';

<Chessboard
  boardId="starting-position"
  orientation="black"
  position="rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR"
/>;
```

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
geometry. `disabled` prevents drag and accessible selection. The source is an
accessible button whose default label and hint can be replaced with
`accessibilityLabel` and `accessibilityHint`.

Drag and non-drag placement both call only the named board's current
`onMoveRequest`. The immutable intent carries that `boardId`, the board's
current `basePositionRevision`, the detached `piece`, and
`source: { kind: 'spare', spareId }`. Drag uses `input: 'drag'` and may report
an off-board `targetSquare: null`; accessible placement uses
`input: 'accessibility'` and the board cursor's current square. The board
rechecks its current callback and interaction permissions at emission. Drag
also rechecks `canDragPiece` with the spare source. A missing callback, denied
permission, unavailable target, or stale release fails closed.

Activating a spare selects one transient source in the provider. Only its
matching target board exposes **Place selected spare** and
**Cancel spare selection** actions. Placement is gated by the board's current
move callback, accessible permission, pending lifecycle, and disabled cursor
square; cancellation remains available if those placement gates disappear.
Selecting another spare replaces the first; starting a physical drag from that
selected source, successful request submission, explicit cancellation, source
identity change, disablement or unmount, target unmount, and provider
deactivation clear the transient selection. This selection is not
`ChessboardProps.selection` and does not edit the consumer's position. The
consumer must accept or reject the ordinary move request and publish any
resulting controlled position update.

The provider-level overlay can escape clipping inside a source palette, but it
is not a native window portal. An ancestor that clips the provider's entire
interaction scope can still crop it. Place the provider above palette- or
board-local clipping regions and avoid clipping the full provider scope when a
drag must travel beyond it.

## Interaction hardening

Board and spare-piece drag recognizers arbitrate with an ordinary ancestor
React Native `ScrollView`. A touch that cannot start a current draggable source
fails the drag path so the scroll view can take ownership. A valid drag can
activate after its movement threshold and then retains the interaction until
release or cancellation. The library never discovers or programmatically
scrolls an arbitrary ancestor; upstream `allowAutoScroll` behavior is
intentionally not part of the native 1.0 contract.

Continuous pan coordinates and overlay transforms remain on the UI thread.
Only activation, release, cancellation, and recognized tap boundaries cross to
JavaScript. Deterministic component instrumentation verifies bounded React
commits and custom-renderer calls. Packed-package Espresso and XCUITest
scenarios separately verify parent scrolling, board-drag capture, exactly-once
consumer callbacks, unchanged controlled revisions, and lifecycle
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

Resolved static styles follow built-in defaults, `theme`, instance `styles`,
and canonical `squareStyles` in that order. Controlled state paint follows
those layers in the fixed order destination, selected, then disabled. Each
state slot resolves its built-in default, `theme`, and instance `styles` before
the next slot is applied. Per-square styles and selection IDs are canonical and
do not rotate when orientation changes. The default state paint uses inset
shadow or opacity and never changes square geometry.

Custom piece content receives the resolved piece style for inspection or
derived artwork, while the board-owned wrapper applies that style exactly once.
Renderers should not blindly apply it again. Renderer props contain no event or
accessibility handlers. Their discriminated `source` is
`{ kind: 'board', square }` for a controlled board piece and
`{ kind: 'spare', spareId }` for a public spare. `square` is non-null for board
sources and nullable for spare sources; `SparePiece` and its external overlay
pass `null`. The corresponding board or spare host keeps the visual subtree
non-interactive and decorative. Host measurement and absolute square/piece
wrapper rectangles remain structural and cannot be replaced by visual styles.

Board display, width, height, aspect ratio, flex sizing, margins, insets,
padding, transforms, box sizing, border widths, and pointer-event modes are
ignored in `theme.board` and `styles.board`; use a parent wrapper for those
concerns. Square and piece geometry-like styles can inform paint or renderer
derivation but cannot replace canonical measured placement.

## Controlled annotations

`annotations` is the only persistent square/arrow collection. Replacing that
prop replaces the rendered collection immediately; the board never merges it
with an internal arrow list. Array order is same-layer paint order. Arrows
default above pieces, while square annotations default below pieces.

```tsx
import {
  Chessboard,
  defaultAnnotationStyle,
} from '@vibechess/chessboard-native';

<Chessboard
  annotations={[
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
  ]}
  annotationStyle={{
    ...defaultAnnotationStyle,
    arrowStartOffset: 0.25,
  }}
  boardId="analysis"
  position="8/8/8/8/8/8/8/8"
/>;
```

Omitted arrow shape automatically selects an L path only for an integer
one-by-two canonical move. `shape="straight"` always overrides that choice;
`shape="knight"` selects an L path when both axes change and otherwise falls
back to a straight path. Multiple sources aimed at one target shorten further
to keep heads distinct. `width` is an optional stroke width in the fixed
2048-wide logical annotation space, and per-arrow `opacity` overrides the style
default.
`annotationStyle` is a complete whole-value configuration, not a partial merge.
Its three colors are reserved for future annotation tools; every persistent
annotation continues to render its own required `color`.

Square shapes are `fill`, `circle`, `dot`, and `border`. All SVG descendants are
pointerless and hidden from accessibility; the stable outer board remains the
only accessible control. This slice renders annotations only—it does not draw,
toggle, clear, or commit them.

## Controlled selection and square activation

`selection` is the only semantic selection source. Its `selectedSquare`,
`destinationSquares`, and `disabledSquares` fields drive presentation, but the
board never edits them. Supplying `onSquareActivate` opts into same-square touch
and accessibility activation, including occupied and empty squares. Each
enabled ordinary activation is routed exactly once:

- For touch, when `onMoveRequest` is also present, a selected source exists,
  that source still contains a current controlled piece, and the enabled target
  is listed as a destination, the board emits only a `MoveIntent` to
  `onMoveRequest`. Accessibility activation uses that route only while
  `interactionPermissions.accessibility` permits move input.
- Otherwise the board emits only an immutable `SquareActivationIntent` to
  `onSquareActivate`. The intent reports the current position and selection
  revisions, target square and piece, selected source, destination flag, input,
  and action.

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

Without `onSquareActivate`, no same-square tap recognizer is enabled. An
existing `onMoveRequest` still provides its accessible transient source-target,
removal, and cancellation flow while accessible move input is permitted. With
neither callback, the component mounts no native gesture hit plane and remains
read-only.

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

<Chessboard
  boardId="playground"
  interactionPermissions={{ accessibility: true, drag: true }}
  moveRequestTimeouts={{ commitMs: 1_500, decisionMs: 10_000 }}
  onMoveRequest={onMoveRequest}
  position={position}
/>;
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
recognizer is mounted; `onSquareActivate` may still enable controlled tap input.
The default decision timeout is 10 seconds; after acceptance, the default
controlled-commit timeout is 1.5 seconds.

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
and uses `0` as an explicit snap. Reduced motion also snaps. Initial mount,
semantic no-ops, unavailable measurement, invalid current position, and
geometry or orientation changes settle directly to the latest prop. A newer
position cancels the prior epoch immediately; P3.4 will add
continuity-preserving A-B-C replanning rather than changing that latest-prop
authority.

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
  value: { h8: { id: 'pawn-1', pieceType: 'wQ' } },
  transition: {
    from: 'g7',
    fromRevision: 11,
    promotion: 'wQ',
    to: 'h8',
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
Annotation actions remain a later slice. `formatMoveOutcome` customizes the
correlated committed, rejected, cancelled, or timed-out announcement; returning
`null` suppresses it.

When `onSquareActivate` is present, activating the current square uses the
exclusive controlled-selection router described above, and a selected board
also exposes an explicit clear-selection action. The consumer must publish the
resulting selection update. Without that callback, `onMoveRequest` preserves
the transient accessible source-target fallback.

Setting `interactionPermissions.accessibility` to `false` disables accessible
destination-to-move routing, removal, cancellation, and the transient fallback.
Controlled square activation remains available and therefore emits a square
intent for a destination that cannot use the accessible move route. Touch
destination routing remains independent of this accessibility-only gate.

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
