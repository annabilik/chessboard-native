# @vibechess/chessboard-native

A controlled, rules-free React Native chessboard component.

This unpublished early Phase 2 package includes the controlled public contracts,
platform-free position and coordinate core, measured geometry, strict FEN
foundation, and a responsive static board renderer. `Chessboard` fills its
parent width, derives height from board rows and columns, and renders oriented
square backgrounds, optional edge notation, and the current controlled
position and annotation collection. Constrain the parent to set an explicit
width.

The default set contains twelve original interim geometric chess pieces.
Consumers can replace it with a visual-only renderer map keyed by the open
`pieceType` vocabulary. Theme, instance, and canonical per-square styles are
also declarative. The board is one adjustable accessibility control with an
orientation-aware virtual cursor and decorative visual descendants. Controlled
square and arrow annotations render in below/above-piece SVG planes. Selection
styling, custom square rendering, semantic interaction, annotation drawing, and
transitions are not rendered yet. An internal pure reducer and board-level RNGH
adapter now model the move-intent lifecycle, worklet hit testing, and transient
presentation. The adapter is deliberately disabled in this public component
until a move-request callback and effect executor exist, so the board remains
read-only. Provider-level identity registration remains future work.

```tsx
import { Chessboard } from '@vibechess/chessboard-native';

<Chessboard
  boardId="starting-position"
  orientation="black"
  position="rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR"
/>;
```

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
and `squareStyles` in that order. Later interaction work adds transient state
styles after those layers. Per-square styles use canonical square IDs and do
not rotate when orientation changes. Custom piece content receives the resolved
piece style for inspection or derived artwork, while the board-owned wrapper
applies that style exactly once. Renderers should not blindly apply it again.
Renderer props contain no event or accessibility handlers, and the board keeps
the entire visual subtree non-interactive and decorative. Only the stable outer
host is exposed to assistive technology. Host measurement and absolute
square/piece wrapper rectangles remain structural and cannot be replaced by
visual styles.

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
reduced motion and `never` explicitly permits it. Semantic activation, moves,
removal, spare placement, and annotation actions remain later slices.

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
