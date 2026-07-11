# @vibechess/chessboard-native

A controlled, rules-free React Native chessboard component.

This unpublished Phase 1 package includes the controlled public contracts and
the platform-free coordinate, geometry, and strict FEN foundation. Its
`Chessboard` component still renders a disabled package-verification frame;
position normalization and static rendering have not landed yet.

## Pure core

```ts
import {
  columnIndexToFile,
  generateBoardGeometry,
  parseFenPosition,
  rankToRowIndex,
} from '@vibechess/chessboard-native';

const grid = generateBoardGeometry({ columns: 8, rows: 8 }, 'black');

grid[0]?.[0]?.square; // "h1"
columnIndexToFile(0, 8, 'white'); // "a"
rankToRowIndex(1, 8, 'white'); // 7

const position = parseFenPosition(
  'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
);
position['e1']; // { pieceType: "wK" }
```

Dimensions are validated as 1 through 99 rows and 1 through 26 columns.
Coordinates are zero-based from the visual top-left; orientation changes their
projection, never canonical square IDs. FEN consumes only piece placement, is
strict and atomic, and is accepted only for an 8x8 board.

Standalone validation uses standard `TypeError`, `RangeError`, and
`SyntaxError` failures. Contextual `ChessboardError` recovery belongs to the
component normalization layer planned for the next Phase 1 work.

Do not use this package in production yet.
