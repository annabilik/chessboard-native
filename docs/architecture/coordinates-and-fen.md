# Coordinates, dimensions, and FEN

The Phase 1 pure core has no React or React Native dependency. It validates
logical board dimensions, projects canonical chess squares into visual
coordinates, generates immutable logical grids, and parses standard FEN piece
placement.

## Dimensions

Supported boards have integer dimensions in these inclusive ranges:

- rows: 1 through 99
- columns: 1 through 26

This keeps every canonical square inside the single-file `a1` through `z99`
grammar. Invalid primitive values and non-integers throw `TypeError`; integers
outside the supported range throw `RangeError`.

## Coordinate projection

Rows and columns are zero-based visual coordinates measured from the top-left
of the rendered board. Canonical square IDs never depend on orientation.

For a white-oriented board, visual row zero is the highest configured rank and
visual column zero is file `a`. For a black-oriented board, visual row zero is
rank 1 and visual column zero is the last configured file. Changing orientation
therefore reverses both visual axes while preserving the same set of square
IDs.

The public pure utilities are:

- `rowIndexToRank` and `rankToRowIndex`
- `columnIndexToFile` and `fileToColumnIndex`
- `generateBoardGeometry`

The grid returned by `generateBoardGeometry` is immutable and ordered by
visual row, then visual column. Square color is derived from canonical file and
rank with `a1` dark. It does not depend on visual indices, so the same square
keeps the same color on odd rectangular boards after rotation.

The internal square codec accepts exactly one lowercase ASCII file followed by
a canonical rank without whitespace or leading zeroes. It is the only core
boundary that constructs or decomposes `SquareId` values. PR #9 will reuse it
for object positions and hit testing without widening the root API.

## FEN piece placement

`parseFenPosition` accepts either a bare piece-placement field or a complete
FEN string. It consumes only the first whitespace-delimited field. The
remaining FEN fields describe chess rules and clocks, which are outside this
rules-free component.

FEN is accepted only with 8x8 dimensions. Its placement field must contain
exactly eight slash-delimited ranks, and every rank must expand to exactly eight
squares. The grammar accepts only digits 1 through 8 and the twelve standard
piece letters `prnbqkPRNBQK`. Adjacent digit runs are rejected as non-canonical.
Uppercase pieces become `wP` through `wK`; lowercase pieces become `bP` through
`bK`. The parser never creates piece IDs and never checks chess legality.

Malformed FEN throws `SyntaxError`; a valid non-8x8 dimension throws
`RangeError`; invalid value types throw `TypeError`. These standalone utilities
have no board identity or semantic revision. PR #10 will translate their
failures into contextual `ChessboardError` values at the component
normalization boundary.
