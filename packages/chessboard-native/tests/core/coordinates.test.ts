import fc from 'fast-check';

import {
  columnIndexToFile,
  fileToColumnIndex,
  generateBoardGeometry,
  rankToRowIndex,
  rowIndexToRank,
  type BoardDimensions,
  type BoardOrientation,
} from '../../src/index';
import {
  coordinateToSquare,
  squareToCoordinate,
} from '../../src/core/coordinates';

const orientationArbitrary = fc.constantFrom<BoardOrientation>(
  'white',
  'black',
);

const rowIndexCaseArbitrary = fc
  .integer({ max: 99, min: 1 })
  .chain((rows) =>
    fc.tuple(
      fc.constant(rows),
      fc.integer({ max: rows - 1, min: 0 }),
      orientationArbitrary,
    ),
  );

const rankCaseArbitrary = fc
  .integer({ max: 99, min: 1 })
  .chain((rows) =>
    fc.tuple(
      fc.constant(rows),
      fc.integer({ max: rows, min: 1 }),
      orientationArbitrary,
    ),
  );

const columnCaseArbitrary = fc
  .integer({ max: 26, min: 1 })
  .chain((columns) =>
    fc.tuple(
      fc.constant(columns),
      fc.integer({ max: columns - 1, min: 0 }),
      orientationArbitrary,
    ),
  );

const coordinateCaseArbitrary = fc
  .record({
    columns: fc.integer({ max: 26, min: 1 }),
    rows: fc.integer({ max: 99, min: 1 }),
  })
  .chain((dimensions) =>
    fc.record({
      column: fc.integer({ max: dimensions.columns - 1, min: 0 }),
      dimensions: fc.constant(dimensions),
      orientation: orientationArbitrary,
      row: fc.integer({ max: dimensions.rows - 1, min: 0 }),
    }),
  );

describe('coordinate projection', () => {
  it('[PARITY-EXPORT-ROW-INDEX-TO-CHESS-ROW] maps visual row indices to canonical ranks', () => {
    expect(rowIndexToRank(0, 8, 'white')).toBe(8);
    expect(rowIndexToRank(7, 8, 'white')).toBe(1);
    expect(rowIndexToRank(0, 8, 'black')).toBe(1);
    expect(rowIndexToRank(7, 8, 'black')).toBe(8);

    fc.assert(
      fc.property(rowIndexCaseArbitrary, ([rows, rowIndex, orientation]) => {
        const rank = rowIndexToRank(rowIndex, rows, orientation);
        expect(rank).toBeGreaterThanOrEqual(1);
        expect(rank).toBeLessThanOrEqual(rows);
      }),
    );
  });

  it('[PARITY-EXPORT-CHESS-ROW-TO-ROW-INDEX] maps canonical ranks to visual row indices', () => {
    expect(rankToRowIndex(8, 8, 'white')).toBe(0);
    expect(rankToRowIndex(1, 8, 'white')).toBe(7);
    expect(rankToRowIndex(1, 8, 'black')).toBe(0);
    expect(rankToRowIndex(8, 8, 'black')).toBe(7);

    fc.assert(
      fc.property(rankCaseArbitrary, ([rows, rank, orientation]) => {
        const rowIndex = rankToRowIndex(rank, rows, orientation);
        expect(rowIndexToRank(rowIndex, rows, orientation)).toBe(rank);
      }),
    );
  });

  it('[PARITY-EXPORT-COLUMN-INDEX-TO-CHESS-COLUMN] maps visual column indices to canonical files', () => {
    expect(columnIndexToFile(0, 8, 'white')).toBe('a');
    expect(columnIndexToFile(7, 8, 'white')).toBe('h');
    expect(columnIndexToFile(0, 8, 'black')).toBe('h');
    expect(columnIndexToFile(7, 8, 'black')).toBe('a');

    fc.assert(
      fc.property(
        columnCaseArbitrary,
        ([columns, columnIndex, orientation]) => {
          const file = columnIndexToFile(columnIndex, columns, orientation);
          expect(file).toMatch(/^[a-z]$/);
        },
      ),
    );
  });

  it('[PARITY-EXPORT-CHESS-COLUMN-TO-COLUMN-INDEX] maps canonical files to visual column indices', () => {
    expect(fileToColumnIndex('a', 8, 'white')).toBe(0);
    expect(fileToColumnIndex('h', 8, 'white')).toBe(7);
    expect(fileToColumnIndex('h', 8, 'black')).toBe(0);
    expect(fileToColumnIndex('a', 8, 'black')).toBe(7);

    fc.assert(
      fc.property(
        columnCaseArbitrary,
        ([columns, columnIndex, orientation]) => {
          const file = columnIndexToFile(columnIndex, columns, orientation);
          expect(fileToColumnIndex(file, columns, orientation)).toBe(
            columnIndex,
          );
        },
      ),
    );
  });

  it('round-trips every supported coordinate shape through a canonical square ID', () => {
    fc.assert(
      fc.property(
        coordinateCaseArbitrary,
        ({ column, dimensions, orientation, row }) => {
          const coordinate = { column, row };
          const square = coordinateToSquare(
            coordinate,
            dimensions,
            orientation,
          );

          expect(squareToCoordinate(square, dimensions, orientation)).toEqual(
            coordinate,
          );
        },
      ),
      { numRuns: 500 },
    );
  });

  it('[CBN-CONTRACT-013-ORIENTATION-PRESERVES-IDS] changes visual coordinates without changing canonical square identity or color', () => {
    const dimensions = { columns: 3, rows: 5 } satisfies BoardDimensions;
    const white = generateBoardGeometry(dimensions, 'white');
    const black = generateBoardGeometry(dimensions, 'black');
    const whiteBySquare = new Map(
      white.flat().map(({ isLight, square }) => [square, isLight]),
    );
    const blackBySquare = new Map(
      black.flat().map(({ isLight, square }) => [square, isLight]),
    );

    expect(blackBySquare).toEqual(whiteBySquare);
    expect(squareToCoordinate('a1', dimensions, 'white')).toEqual({
      column: 0,
      row: 4,
    });
    expect(squareToCoordinate('a1', dimensions, 'black')).toEqual({
      column: 2,
      row: 0,
    });
    expect(whiteBySquare.get('a1')).toBe(false);
  });

  it('exhaustively covers the maximum a1 through z99 board', () => {
    const dimensions = { columns: 26, rows: 99 };
    const squares = generateBoardGeometry(dimensions, 'white')
      .flat()
      .map(({ square }) => square);

    expect(squares).toHaveLength(26 * 99);
    expect(new Set(squares).size).toBe(26 * 99);
    expect(squares[0]).toBe('a99');
    expect(squares.at(-1)).toBe('z1');
    expect(squares).toContain('a1');
    expect(squares).toContain('z99');

    for (const square of squares) {
      const coordinate = squareToCoordinate(square, dimensions, 'white');
      expect(coordinateToSquare(coordinate, dimensions, 'white')).toBe(square);
    }
  });

  it.each(['A1', 'aa1', 'a0', 'a01', 'a100', 'a', '1', ' a1', 'a1 '])(
    'rejects non-canonical square ID %p',
    (square) => {
      expect(() =>
        squareToCoordinate(square, { columns: 26, rows: 99 }, 'white'),
      ).toThrow(SyntaxError);
    },
  );

  it('rejects canonical squares outside the configured board', () => {
    expect(() =>
      squareToCoordinate(null as never, { columns: 8, rows: 8 }, 'white'),
    ).toThrow(TypeError);
    expect(() =>
      squareToCoordinate('i1', { columns: 8, rows: 8 }, 'white'),
    ).toThrow(RangeError);
    expect(() =>
      squareToCoordinate('a9', { columns: 8, rows: 8 }, 'white'),
    ).toThrow(RangeError);
  });

  it('rejects malformed and out-of-bounds primitive arguments', () => {
    expect(() => rowIndexToRank(-1, 8, 'white')).toThrow(RangeError);
    expect(() => rowIndexToRank(8, 8, 'white')).toThrow(RangeError);
    expect(() => rowIndexToRank(0.5, 8, 'white')).toThrow(TypeError);
    expect(() => rowIndexToRank(0, 0, 'white')).toThrow(RangeError);
    expect(() => rowIndexToRank(0, Number.NaN, 'white')).toThrow(TypeError);
    expect(() => rankToRowIndex(0, 8, 'white')).toThrow(RangeError);
    expect(() => columnIndexToFile(8, 8, 'white')).toThrow(RangeError);
    expect(() => columnIndexToFile(0, 27, 'white')).toThrow(RangeError);
    expect(() => fileToColumnIndex('A', 8, 'white')).toThrow(SyntaxError);
    expect(() => fileToColumnIndex('aa', 8, 'white')).toThrow(SyntaxError);
    expect(() => fileToColumnIndex('i', 8, 'white')).toThrow(RangeError);
    expect(() => fileToColumnIndex(1 as never, 8, 'white')).toThrow(TypeError);
    expect(() => rowIndexToRank(0, 8, 'sideways' as never)).toThrow(TypeError);
    expect(() =>
      coordinateToSquare(null as never, { columns: 8, rows: 8 }, 'white'),
    ).toThrow(TypeError);
  });
});
