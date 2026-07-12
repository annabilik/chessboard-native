import fc from 'fast-check';

import {
  generateBoardGeometry,
  parseFenPosition,
  type BoardDimensions,
  type FenPieceCode,
  type PieceData,
  type PositionObject,
} from '../../src/index';
import { coordinateToSquare } from '../../src/core/coordinates';

const fenPieceCodes = [
  'p',
  'r',
  'n',
  'b',
  'q',
  'k',
  'P',
  'R',
  'N',
  'B',
  'Q',
  'K',
] as const satisfies readonly FenPieceCode[];

type FenCell = FenPieceCode | null;

function pieceData(code: FenPieceCode): Readonly<PieceData> {
  const color = code === code.toUpperCase() ? 'w' : 'b';
  return { pieceType: `${color}${code.toUpperCase()}` };
}

function serializeRank(cells: readonly FenCell[]): string {
  let result = '';
  let emptySquares = 0;

  for (const cell of cells) {
    if (cell === null) {
      emptySquares += 1;
      continue;
    }

    if (emptySquares > 0) {
      result += String(emptySquares);
      emptySquares = 0;
    }
    result += cell;
  }

  if (emptySquares > 0) {
    result += String(emptySquares);
  }

  return result;
}

function serializePosition(cells: readonly FenCell[]): string {
  const ranks: string[] = [];
  for (let rankIndex = 0; rankIndex < 8; rankIndex += 1) {
    ranks.push(serializeRank(cells.slice(rankIndex * 8, rankIndex * 8 + 8)));
  }
  return ranks.join('/');
}

function positionFromCells(cells: readonly FenCell[]): PositionObject {
  const position: Record<string, Readonly<PieceData>> = {};

  for (let index = 0; index < cells.length; index += 1) {
    const code = cells[index];
    if (code === null || code === undefined) {
      continue;
    }

    const fileIndex = index % 8;
    const rank = 8 - Math.floor(index / 8);
    position[`${String.fromCodePoint(97 + fileIndex)}${String(rank)}`] =
      pieceData(code);
  }

  return position;
}

describe('FEN piece-placement parsing', () => {
  it('[PARITY-EXPORT-FEN-STRING-TO-POSITION-OBJECT] strictly parses only the 8x8 FEN piece-placement field', () => {
    const startingPosition = parseFenPosition(
      'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    );

    expect(Object.keys(startingPosition)).toHaveLength(32);
    expect(startingPosition['a8']).toEqual({ pieceType: 'bR' });
    expect(startingPosition['e8']).toEqual({ pieceType: 'bK' });
    expect(startingPosition['a2']).toEqual({ pieceType: 'wP' });
    expect(startingPosition['h1']).toEqual({ pieceType: 'wR' });
    expect(startingPosition['e4']).toBeUndefined();
    expect(Object.isFrozen(startingPosition)).toBe(true);
    expect(
      Object.values(startingPosition).every(
        (piece) => piece !== undefined && Object.isFrozen(piece),
      ),
    ).toBe(true);

    const allCodes = parseFenPosition('prnbqk2/PRNBQK2/8/8/8/8/8/8');
    expect(Object.values(allCodes).map((piece) => piece?.pieceType)).toEqual([
      'bP',
      'bR',
      'bN',
      'bB',
      'bQ',
      'bK',
      'wP',
      'wR',
      'wN',
      'wB',
      'wQ',
      'wK',
    ]);
  });

  it('round-trips generated canonical piece placements', () => {
    const cellArbitrary = fc.option(fc.constantFrom(...fenPieceCodes), {
      nil: null,
    });

    fc.assert(
      fc.property(
        fc.array(cellArbitrary, { maxLength: 64, minLength: 64 }),
        (cells) => {
          expect(parseFenPosition(serializePosition(cells))).toEqual(
            positionFromCells(cells),
          );
        },
      ),
      { numRuns: 250 },
    );
  });

  it('accepts bare placement or full FEN and deliberately ignores suffix fields', () => {
    const bare = parseFenPosition('8/8/8/8/8/8/8/8');
    const complete = parseFenPosition(
      '  8/8/8/8/8/8/8/8 suffix fields are not interpreted  ',
    );

    expect(bare).toEqual({});
    expect(complete).toEqual(bare);
  });

  it('shares canonical square encoding across all geometry, coordinate, and FEN paths', () => {
    const dimensions = { columns: 8, rows: 8 };
    const white = generateBoardGeometry(dimensions, 'white');
    const black = generateBoardGeometry(dimensions, 'black');

    for (let row = 0; row < 8; row += 1) {
      for (let column = 0; column < 8; column += 1) {
        const geometrySquare = white[row]?.[column]?.square;
        const beforePiece = column === 0 ? '' : String(column);
        const afterPiece = column === 7 ? '' : String(7 - column);
        const ranks = Array<string>(8).fill('8');
        ranks[row] = `${beforePiece}P${afterPiece}`;

        expect(geometrySquare).toBe(
          coordinateToSquare({ column, row }, dimensions, 'white'),
        );
        expect(black[7 - row]?.[7 - column]?.square).toBe(geometrySquare);
        expect(Object.keys(parseFenPosition(ranks.join('/')))).toEqual([
          geometrySquare,
        ]);
      }
    }
  });

  it('[CBN-CONTRACT-016-RULES-FREE] accepts syntactically valid positions without chess legality checks', () => {
    expect(parseFenPosition('KKKKKKKK/8/8/8/8/8/8/kkkkkkkk')).toEqual(
      expect.objectContaining({
        a1: { pieceType: 'bK' },
        a8: { pieceType: 'wK' },
        h1: { pieceType: 'bK' },
        h8: { pieceType: 'wK' },
      }),
    );
    expect(parseFenPosition('8/8/8/8/8/8/8/8')).toEqual({});
  });

  it.each([
    ['', 'empty input'],
    ['   ', 'whitespace-only input'],
    ['8/8/8/8/8/8/8', 'seven ranks'],
    ['8/8/8/8/8/8/8/8/8', 'nine ranks'],
    ['8/8/8/8/8/8/8/', 'an empty rank'],
    ['7/8/8/8/8/8/8/8', 'a short rank'],
    ['9/8/8/8/8/8/8/8', 'digit nine'],
    ['0/8/8/8/8/8/8/8', 'digit zero'],
    ['44/8/8/8/8/8/8/8', 'adjacent empty runs'],
    ['17/8/8/8/8/8/8/8', 'another adjacent empty run'],
    ['x7/8/8/8/8/8/8/8', 'an unsupported piece'],
    ['P8/8/8/8/8/8/8/8', 'piece then overflow'],
    ['8P/8/8/8/8/8/8/8', 'empty run then overflow'],
    ['ppppppppp/8/8/8/8/8/8/8', 'nine pieces'],
    ['....8/8/8/8/8/8/8/8', 'punctuation'],
  ])('rejects %s (%s) atomically', (fen) => {
    expect(() => parseFenPosition(fen)).toThrow(SyntaxError);
  });

  it('[CBN-CONTRACT-020-FEN-EIGHT-BY-EIGHT] rejects FEN for every supported non-8x8 dimension', () => {
    const nonStandardDimensions = fc
      .record({
        columns: fc.integer({ max: 26, min: 1 }),
        rows: fc.integer({ max: 99, min: 1 }),
      })
      .filter(({ columns, rows }) => columns !== 8 || rows !== 8);

    fc.assert(
      fc.property(nonStandardDimensions, (dimensions) => {
        expect(() => parseFenPosition('8/8/8/8/8/8/8/8', dimensions)).toThrow(
          RangeError,
        );
      }),
      { numRuns: 250 },
    );
  });

  it('validates dimensions before applying the 8x8 FEN restriction', () => {
    expect(() =>
      parseFenPosition('8/8/8/8/8/8/8/8', { columns: 8, rows: 0 }),
    ).toThrow(RangeError);
    expect(() =>
      parseFenPosition('8/8/8/8/8/8/8/8', {
        columns: Number.NaN,
        rows: 8,
      }),
    ).toThrow(TypeError);
    expect(() =>
      parseFenPosition(42 as never, { columns: 8, rows: 8 }),
    ).toThrow(TypeError);
  });

  it('accepts an explicit standard dimension object', () => {
    const dimensions = { columns: 8, rows: 8 } satisfies BoardDimensions;
    expect(parseFenPosition('8/8/8/8/8/8/8/8', dimensions)).toEqual({});
  });
});
