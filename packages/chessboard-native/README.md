# @vibechess/chessboard-native

A controlled, rules-free React Native chessboard component.

This unpublished Phase 1 package includes the controlled public contracts and
the platform-free position, coordinate, measured-geometry, and strict FEN
foundation. Its `Chessboard` component still renders a disabled
package-verification frame. Its public props already execute the standalone
controlled-value boundary for position, annotations, selection,
board identity, and dimensions. Provider-level identity registration and
responsive square and piece rendering have not landed yet.

```tsx
import { Chessboard } from '@vibechess/chessboard-native';

<Chessboard
  boardId="analysis"
  position={{ revision: 12, value: '8/8/8/3q4/4P3/8/8/8' }}
  annotations={{
    revision: 4,
    value: [
      {
        id: 'candidate',
        type: 'arrow',
        from: 'e4',
        to: 'd5',
        color: '#ef4444',
      },
    ],
  }}
  selection={{ revision: 8, selectedSquare: 'e4' }}
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

Standalone validation uses standard `TypeError`, `RangeError`, and
`SyntaxError` failures. `Chessboard` translates them into contextual
`ChessboardError` values, derives plain revisions without renderable shadow
snapshots, and rejects invalid revision ordering or mounted tier changes.
Development throws; production calls `onError` once per domain and revision
after commit, or logs once when no handler exists. Annotation IDs are non-empty
and unique, annotation order is semantic, and selection square arrays normalize
as sorted sets.

Do not use this package in production yet.
