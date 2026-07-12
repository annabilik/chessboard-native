import fc from 'fast-check';

import type {
  BoardDimensions,
  PieceData,
  PositionObject,
} from '../../src/index';
import { coordinateToSquare } from '../../src/core/coordinates';
import {
  normalizePositionInput,
  normalizePositionObject,
  PositionValidationError,
  type PositionValidationCode,
} from '../../src/core/position';

function expectPositionError(
  operation: () => unknown,
  code: PositionValidationCode,
): void {
  try {
    operation();
  } catch (error) {
    expect(error).toBeInstanceOf(PositionValidationError);
    if (!(error instanceof PositionValidationError)) {
      throw error;
    }
    expect(error).toBeInstanceOf(TypeError);
    expect(error.code).toBe(code);
    return;
  }

  throw new Error(`Expected ${code}.`);
}

const positionCaseArbitrary = fc
  .record({
    columns: fc.integer({ max: 26, min: 1 }),
    rows: fc.integer({ max: 99, min: 1 }),
  })
  .chain((dimensions) =>
    fc.record({
      dimensions: fc.constant(dimensions),
      entries: fc.uniqueArray(
        fc.record({
          column: fc.integer({ max: dimensions.columns - 1, min: 0 }),
          pieceType: fc.string(),
          row: fc.integer({ max: dimensions.rows - 1, min: 0 }),
        }),
        {
          maxLength: Math.min(dimensions.columns * dimensions.rows, 40),
          selector: ({ column, row }) => `${String(row)}:${String(column)}`,
        },
      ),
    }),
  );

describe('object position normalization', () => {
  it('[PARITY-BEHAVIOR-B06] normalizes strict FEN and sparse object positions atomically', () => {
    const fen = normalizePositionInput('8/8/8/3q4/4P3/8/8/8');
    const object = normalizePositionInput({
      d5: { pieceType: 'bQ' },
      e4: { pieceType: 'wP' },
      h8: undefined,
    });
    const variant = normalizePositionInput(
      { a1: { pieceType: 'redDragon' }, z99: { pieceType: 'blueWizard' } },
      { columns: 26, rows: 99 },
    );

    expect(object).toEqual(fen);
    expect(variant).toEqual({
      a1: { pieceType: 'redDragon' },
      z99: { pieceType: 'blueWizard' },
    });
    expect(() =>
      normalizePositionInput({
        a1: { id: 'same', pieceType: 'wR' },
        b1: { id: 'same', pieceType: 'wN' },
      }),
    ).toThrow(PositionValidationError);
  });

  it('returns a detached, deeply frozen snapshot with only public piece fields', () => {
    const piece = {
      extra: { mutable: true },
      id: '',
      pieceType: '',
    };
    const source = { a1: piece };
    const normalized = normalizePositionObject(source);

    expect(normalized).toEqual({ a1: { id: '', pieceType: '' } });
    expect(normalized).not.toBe(source);
    expect(normalized['a1']).not.toBe(piece);
    expect(Object.isFrozen(normalized)).toBe(true);
    expect(Object.isFrozen(normalized['a1'])).toBe(true);

    piece.id = 'changed';
    piece.pieceType = 'changed';
    source.a1 = { ...piece };
    expect(normalized).toEqual({ a1: { id: '', pieceType: '' } });
  });

  it('preserves exact open strings and case-sensitive unique IDs', () => {
    expect(
      normalizePositionObject({
        a1: { id: 'piece', pieceType: '🐉 dragon ' },
        b1: { id: 'Piece', pieceType: 'custom/unit' },
        c1: { id: '', pieceType: '' },
      }),
    ).toEqual({
      a1: { id: 'piece', pieceType: '🐉 dragon ' },
      b1: { id: 'Piece', pieceType: 'custom/unit' },
      c1: { id: '', pieceType: '' },
    });
  });

  it('snapshots accessor-backed piece fields exactly once', () => {
    let reads = 0;
    const piece = Object.defineProperty({}, 'pieceType', {
      enumerable: true,
      get: () => {
        reads += 1;
        return reads === 1 ? 'wP' : 1;
      },
    });

    expect(normalizePositionObject({ a1: piece })).toEqual({
      a1: { pieceType: 'wP' },
    });
    expect(reads).toBe(1);
  });

  it('treats own undefined entries as sparse empties after validating their square', () => {
    expect(
      normalizePositionObject({
        a1: undefined,
        b2: { pieceType: 'wB' },
      }),
    ).toEqual({ b2: { pieceType: 'wB' } });
    expectPositionError(
      () => normalizePositionObject({ A1: undefined }),
      'INVALID_POSITION_SQUARE',
    );
  });

  it('accepts ordinary, frozen, and null-prototype sparse records', () => {
    const nullPrototype = Object.create(null) as Record<string, unknown>;
    nullPrototype['z99'] = Object.freeze({ pieceType: 'variant' });

    expect(
      normalizePositionObject(nullPrototype, { columns: 26, rows: 99 }),
    ).toEqual({ z99: { pieceType: 'variant' } });
    expect(
      normalizePositionObject(
        Object.freeze({ a1: Object.freeze({ pieceType: 'wK' }) }),
      ),
    ).toEqual({ a1: { pieceType: 'wK' } });
  });

  it('rejects malformed top-level containers', () => {
    for (const value of [null, [], new Date(), new Map(), 1, 'position']) {
      expectPositionError(
        () => normalizePositionObject(value),
        'INVALID_POSITION',
      );
    }
    expectPositionError(
      () => normalizePositionObject(Object.create({ a1: { pieceType: 'wR' } })),
      'INVALID_POSITION',
    );
  });

  it.each([
    ['A1', { columns: 26, rows: 99 }],
    ['aa1', { columns: 26, rows: 99 }],
    ['a0', { columns: 26, rows: 99 }],
    ['a01', { columns: 26, rows: 99 }],
    ['a100', { columns: 26, rows: 99 }],
    ['i1', { columns: 8, rows: 8 }],
    ['a9', { columns: 8, rows: 8 }],
  ] as const)(
    'rejects invalid or out-of-board square %s',
    (square, dimensions) => {
      expectPositionError(
        () =>
          normalizePositionObject(
            { [square]: { pieceType: 'wP' } },
            dimensions,
          ),
        'INVALID_POSITION_SQUARE',
      );
    },
  );

  it('rejects malformed piece records and fields', () => {
    for (const piece of [null, [], new Date(), 'wP', 1, {}]) {
      expectPositionError(
        () => normalizePositionObject({ a1: piece }),
        'INVALID_POSITION',
      );
    }
    expectPositionError(
      () => normalizePositionObject({ a1: { pieceType: 1 } }),
      'INVALID_POSITION',
    );
    expectPositionError(
      () =>
        normalizePositionObject({
          a1: { id: undefined, pieceType: 'wP' },
        }),
      'INVALID_POSITION',
    );
    expectPositionError(
      () => normalizePositionObject({ a1: { id: 1, pieceType: 'wP' } }),
      'INVALID_POSITION',
    );
  });

  it('rejects exact duplicate IDs even when the duplicate appears last', () => {
    expectPositionError(
      () =>
        normalizePositionObject({
          a1: { id: 'rook', pieceType: 'wR' },
          b1: { id: 'knight', pieceType: 'wN' },
          c1: { id: 'rook', pieceType: 'wB' },
        }),
      'DUPLICATE_PIECE_ID',
    );
    expectPositionError(
      () =>
        normalizePositionObject({
          a1: { id: '', pieceType: 'wR' },
          b1: { id: '', pieceType: 'wN' },
        }),
      'DUPLICATE_PIECE_ID',
    );
  });

  it('normalizes equal semantics independently of source insertion order', () => {
    const first = normalizePositionObject({
      a1: { pieceType: 'wR' },
      h8: { pieceType: 'bR' },
    });
    const second = normalizePositionObject({
      h8: { pieceType: 'bR' },
      a1: { pieceType: 'wR' },
    });

    expect(second).toEqual(first);
  });

  it('normalizes arbitrary valid variant positions without applying chess rules', () => {
    fc.assert(
      fc.property(positionCaseArbitrary, ({ dimensions, entries }) => {
        const source: Record<string, Readonly<PieceData>> = {};
        for (const { column, pieceType, row } of entries) {
          source[coordinateToSquare({ column, row }, dimensions, 'white')] = {
            pieceType,
          };
        }

        const normalized = normalizePositionObject(source, dimensions);
        expect(normalized).toEqual(source);
        expect(Object.isFrozen(normalized)).toBe(true);
        expect(
          Object.values(normalized).every(
            (piece) => piece === undefined || Object.isFrozen(piece),
          ),
        ).toBe(true);
      }),
      { numRuns: 300 },
    );
  });

  it('validates dimensions before position entries', () => {
    expect(() => normalizePositionObject({}, { columns: 8, rows: 0 })).toThrow(
      RangeError,
    );
    expect(() =>
      normalizePositionObject({}, { columns: Number.NaN, rows: 8 }),
    ).toThrow(TypeError);
  });

  it('keeps object positions rules-free even when chess-illegal', () => {
    const dimensions = { columns: 3, rows: 1 } satisfies BoardDimensions;
    const position: PositionObject = {
      a1: { pieceType: 'wK' },
      b1: { pieceType: 'wK' },
      c1: { pieceType: 'wK' },
    };
    expect(normalizePositionObject(position, dimensions)).toEqual(position);
  });
});
