# Coordinates, positions, and measured geometry

The Phase 1 pure core has no React or React Native dependency. It validates
logical board dimensions, projects canonical chess squares into visual
coordinates, generates immutable logical grids, normalizes controlled position
values, and maps measured board-local points.

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
boundary that constructs or decomposes `SquareId` values. FEN parsing, object
position normalization, geometry, and hit testing all use that boundary.

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
have no board identity or semantic revision. After the component validates
dimensions at the board boundary, the controlled-position adapter translates
their failures into contextual `ChessboardError` values without parsing
messages.

## Object positions

Object positions are sparse maps: an absent key or an own key whose value is
`undefined` represents an empty square. The internal normalization boundary
accepts ordinary and null-prototype records, validates every own enumerable
square before reading its piece, and rejects arrays, class instances, maps,
dates, and other non-record containers.

Every populated entry must be a plain piece record with an exact string
`pieceType`. The string vocabulary is deliberately open, including empty and
Unicode keys. An optional `id`, when present, must also be an exact string and
must be unique within the position. IDs are compared case-sensitively and are
never created, trimmed, or rewritten. Unsupported extra piece fields are not
part of the semantic contract and are discarded.

Normalization is O(piece count), returns a fresh deeply frozen sparse object,
and never mutates or retains consumer records. Source insertion order is not
semantic; the controlled-position adapter compares a canonical token built from
sorted square and exact piece tuples. Object validation uses an internal
structured error code so invalid positions, squares, and duplicate IDs map to
the existing contextual `ChessboardError` taxonomy without parsing messages.

## Measured board geometry

`BoardPoint` is local to the top-left of the measured board content rectangle;
`BoardSize` supplies its positive width and height. `squareToBoardPoint` is the
public pure utility for obtaining a square center. Width and height are divided
independently, so rectangular boards and cells do not repeat the upstream
width-for-both-axes bug.

P1.3 connects that model to the native `BoardSurface`. The surface fills its
parent width and uses `columns / rows` as its aspect ratio, so a standard board
is square and bounded variant boards remain grids of square cells. After Yoga
layout, the exact positive `onLayout` width and height are authoritative for
absolute cell placement. Parent resize remeasures the surface, and zero-size
layout removes projected cells. A row/column change with the same aspect ratio
reuses and immediately reprojects the unchanged native bounds; an aspect-ratio
change waits for the corresponding native resize measurement. No global
`Dimensions` value participates.

Cell rectangles use cumulative fractional edges rather than rounded square
sizes. That makes the rendered surface share the same half-open boundary model
as hit testing even when the measured width is not divisible by the column
count. A committed board publishes this local mapping and its native measurement
capability to the nearest provider under a mount token. Cached window bounds
are detached hover hints; they never replace the board's local layout.

P1.4 reuses those exact cell rectangles for pieces. Position keys remain
canonical, and the current orientation selects only which measured rectangle a
key occupies. Default and custom renderers therefore receive the same square and
piece data in either orientation while their visual placement reverses with the
grid. The piece layer does not introduce a second size calculation, position
codec, or hit-test surface.

The internal inverse, `hitTestBoardPoint`, returns a canonical square or `null`
for a finite point outside the board. Board coverage is half-open:
`0 <= x < width` and `0 <= y < height`. Top and left are included, exact right
and bottom edges are outside, and an exact internal boundary belongs to the row
or column after it. This gives every point at most one owner.

For a provider-coordinated release, fresh native bounds containing `x`, `y`,
`width`, and `height` translate a window point to
`{ x: point.x - x, y: point.y - y }`. That local point uses the same half-open
rule above. Provider resolution accepts the result only while the board mount
token, board geometry epoch, provider geometry revision, and active drop epoch
still match; stale or invalid measurements produce no resolution. Cached bounds
are never accepted as release evidence.
Non-finite point or size components throw `TypeError`; non-positive measured
sizes throw `RangeError`.
