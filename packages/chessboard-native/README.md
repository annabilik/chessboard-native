# @vibechess/chessboard-native

A controlled, rules-free React Native chessboard component.

This unpublished Phase 1 package includes the controlled public contracts,
platform-free position and coordinate core, measured geometry, strict FEN
foundation, and a responsive static board surface. `Chessboard` fills its
parent width, derives height from board rows and columns, and renders oriented
square backgrounds with optional edge notation. Constrain the parent to set an
explicit width.

Position, annotations, and optional selection already pass through the
standalone controlled-value boundary, but pieces, annotations, selection
styling, custom renderers, themes, interaction, and the adjustable
accessibility control are not rendered yet. Provider-level identity
registration also remains future work.

```tsx
import { Chessboard } from '@vibechess/chessboard-native';

<Chessboard
  boardId="variant-diagram"
  dimensions={{ columns: 5, rows: 3 }}
  orientation="black"
  position={{}}
/>;
```

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
resize measurement. Notation defaults on and follows the visual bottom and left
edges in either orientation.

Standalone validation uses standard `TypeError`, `RangeError`, and
`SyntaxError` failures. `Chessboard` translates them into contextual
`ChessboardError` values, derives plain revisions without renderable shadow
snapshots, and rejects invalid revision ordering or mounted tier changes.
Invalid dimensions or orientation also use the typed dimensions recovery
domain. Development throws; production calls `onError` once per domain and
revision after commit, or logs once when no handler exists. Annotation IDs are
non-empty and unique, annotation order is semantic, and selection square arrays
normalize as sorted sets.

Do not use this package in production yet.
