import fc from 'fast-check';

import { ChessboardError } from '../../src/ChessboardError';
import {
  STANDARD_BOARD_DIMENSIONS,
  validateBoardDimensions,
} from '../../src/core/dimensions';
import type { PositionObject } from '../../src/public-types';
import { createControlledDomainMetadata } from '../../src/internal/controlled-domain';
import {
  normalizePositionDomain,
  positionComparisonToken,
} from '../../src/internal/position-domain';

const dimensions = STANDARD_BOARD_DIMENSIONS;

function captureChessboardError(operation: () => unknown): ChessboardError {
  try {
    operation();
  } catch (error) {
    expect(error).toBeInstanceOf(ChessboardError);
    if (error instanceof ChessboardError) {
      return error;
    }
    throw error;
  }
  throw new Error('Expected a ChessboardError.');
}

describe('controlled position domain', () => {
  it('[CBN-CONTRACT-001-POSITION-CANONICAL] returns only the current controlled position and never an older fallback', () => {
    const first = normalizePositionDomain({
      boardId: 'analysis',
      development: false,
      dimensions,
      input: { a1: { pieceType: 'wR' } },
      previousMetadata: createControlledDomainMetadata(),
    });
    expect(first.ok).toBe(true);
    if (!first.ok) {
      throw first.error;
    }

    const invalid = normalizePositionDomain({
      boardId: 'analysis',
      development: false,
      dimensions,
      input: { A1: { pieceType: 'wR' } },
      previousMetadata: first.nextMetadata,
    });
    expect(invalid.ok).toBe(false);
    if (invalid.ok) {
      throw new Error('Expected invalid current position.');
    }
    expect(invalid.current).toBeNull();
    expect(invalid.error.code).toBe('INVALID_POSITION_SQUARE');
    expect(invalid.nextMetadata).toBe(first.nextMetadata);
    expect(invalid.nextMetadata).not.toHaveProperty('value');

    const latest = normalizePositionDomain({
      boardId: 'analysis',
      development: false,
      dimensions,
      input: { h8: { pieceType: 'bR' } },
      previousMetadata: invalid.nextMetadata,
    });
    expect(latest.ok).toBe(true);
    if (!latest.ok) {
      throw latest.error;
    }
    expect(latest.current.value).toEqual({ h8: { pieceType: 'bR' } });
    expect(latest.current.value).not.toHaveProperty('a1');
  });

  it('normalizes equal FEN, object, plain, and envelope values identically', () => {
    const fen = normalizePositionDomain({
      boardId: 'analysis',
      development: true,
      dimensions,
      input: '8/8/8/3q4/4P3/8/8/8',
      previousMetadata: createControlledDomainMetadata(),
    });
    expect(fen.ok).toBe(true);
    if (!fen.ok) {
      throw fen.error;
    }

    const object = normalizePositionDomain({
      boardId: 'analysis',
      development: true,
      dimensions,
      input: {
        e4: { pieceType: 'wP' },
        d5: { pieceType: 'bQ' },
      },
      previousMetadata: fen.nextMetadata,
    });
    expect(object.ok).toBe(true);
    if (!object.ok) {
      throw object.error;
    }
    expect(object.current.value).toEqual(fen.current.value);
    expect(object.current.revision).toBe(fen.current.revision);

    const envelope = normalizePositionDomain({
      boardId: 'analysis',
      development: true,
      dimensions,
      input: {
        revision: 12,
        value: {
          d5: { pieceType: 'bQ' },
          e4: { pieceType: 'wP' },
        },
      },
      previousMetadata: createControlledDomainMetadata(),
    });
    expect(envelope.ok).toBe(true);
    if (!envelope.ok) {
      throw envelope.error;
    }
    expect(envelope.current.value).toEqual(object.current.value);
  });

  it('projects commit correlation from only the current revisioned envelope', () => {
    const first = normalizePositionDomain({
      boardId: 'analysis',
      development: true,
      dimensions,
      input: {
        committedIntentId: 'analysis:move:3',
        revision: 4,
        value: { e4: { id: 'pawn', pieceType: 'wP' } },
      },
      previousMetadata: createControlledDomainMetadata(),
    });
    expect(first.ok).toBe(true);
    if (!first.ok) {
      throw first.error;
    }
    expect(first.current.committedIntentId).toBe('analysis:move:3');
    expect(Object.isFrozen(first.current)).toBe(true);
    expect(first.nextMetadata).not.toHaveProperty('committedIntentId');

    const omitted = normalizePositionDomain({
      boardId: 'analysis',
      development: true,
      dimensions,
      input: {
        revision: 5,
        value: { e4: { id: 'pawn', pieceType: 'wP' } },
      },
      previousMetadata: first.nextMetadata,
    });
    expect(omitted.ok).toBe(true);
    if (!omitted.ok) {
      throw omitted.error;
    }
    expect(omitted.current).not.toHaveProperty('committedIntentId');

    const plain = normalizePositionDomain({
      boardId: 'plain',
      development: true,
      dimensions,
      input: { e4: { pieceType: 'wP' } },
      previousMetadata: createControlledDomainMetadata(),
    });
    expect(plain.ok).toBe(true);
    if (!plain.ok) {
      throw plain.error;
    }
    expect(plain.current).not.toHaveProperty('committedIntentId');
  });

  it('treats malformed commit correlation as a non-semantic unavailable hint', () => {
    const correlationCause = new Error('commit getter failed');
    const input = Object.defineProperties(
      {},
      {
        committedIntentId: {
          enumerable: true,
          get: () => {
            throw correlationCause;
          },
        },
        revision: { enumerable: true, value: 4 },
        value: {
          enumerable: true,
          value: { e4: { pieceType: 'wP' } },
        },
      },
    );
    const result = normalizePositionDomain({
      boardId: 'analysis',
      development: true,
      dimensions,
      input,
      previousMetadata: createControlledDomainMetadata(),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw result.error;
    }
    expect(result.current.value).toEqual({ e4: { pieceType: 'wP' } });
    expect(result.current).not.toHaveProperty('committedIntentId');
  });

  it('snapshots a detached transition candidate only from the current revisioned envelope', () => {
    const rookMove = { from: 'h1', to: 'f1' };
    const transition = {
      capturedSquare: 'd5',
      from: 'e5',
      fromRevision: 4,
      rookMove,
      to: 'd6',
      toRevision: 5,
    };
    const result = normalizePositionDomain({
      boardId: 'analysis',
      development: true,
      dimensions,
      input: {
        revision: 5,
        transition,
        value: {
          d6: { id: 'pawn', pieceType: 'wP' },
          f1: { id: 'rook', pieceType: 'wR' },
        },
      },
      previousMetadata: createControlledDomainMetadata(),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw result.error;
    }
    expect(result.current.transition).toEqual(transition);
    expect(result.current.transition).not.toBe(transition);
    expect(result.current.transition?.rookMove).not.toBe(rookMove);
    expect(Object.isFrozen(result.current.transition)).toBe(true);
    expect(Object.isFrozen(result.current.transition?.rookMove)).toBe(true);
    expect(result.current).not.toHaveProperty('transitionWarning');
    expect(result.nextMetadata).not.toHaveProperty('transition');
  });

  it('keeps malformed or hostile transition hints warning-only and preserves the valid position', () => {
    const malformed = normalizePositionDomain({
      boardId: 'analysis',
      development: true,
      dimensions,
      input: {
        revision: 5,
        transition: {
          from: 'E5',
          fromRevision: 4,
          to: 'd6',
          toRevision: 5,
        },
        value: { d6: { pieceType: 'wP' } },
      },
      previousMetadata: createControlledDomainMetadata(),
    });
    expect(malformed.ok).toBe(true);
    if (!malformed.ok) {
      throw malformed.error;
    }
    expect(malformed.current.value).toEqual({ d6: { pieceType: 'wP' } });
    expect(malformed.current).not.toHaveProperty('transition');
    expect(malformed.current.transitionWarning).toEqual(
      expect.objectContaining({ code: 'malformed' }),
    );

    let reads = 0;
    const hostile = Object.defineProperties(
      {},
      {
        revision: { enumerable: true, value: 6 },
        transition: {
          enumerable: true,
          get: () => {
            reads += 1;
            throw new Error('transition getter failed');
          },
        },
        value: {
          enumerable: true,
          value: { e7: { pieceType: 'wP' } },
        },
      },
    );
    const hostileResult = normalizePositionDomain({
      boardId: 'analysis',
      development: true,
      dimensions,
      input: hostile,
      previousMetadata: malformed.nextMetadata,
    });
    expect(hostileResult.ok).toBe(true);
    if (!hostileResult.ok) {
      throw hostileResult.error;
    }
    expect(reads).toBe(1);
    expect(hostileResult.current.value).toEqual({
      e7: { pieceType: 'wP' },
    });
    expect(hostileResult.current.transitionWarning).toEqual({
      code: 'malformed',
      message: 'Board transition could not be read.',
    });
  });

  it('uses a collision-free, insertion-order-independent position token', () => {
    const first: PositionObject = {
      a1: { id: '', pieceType: '' },
      h8: { pieceType: '🐉' },
    };
    const second: PositionObject = {
      h8: { pieceType: '🐉' },
      a1: { id: '', pieceType: '' },
    };
    const noId: PositionObject = { a1: { pieceType: '' } };

    expect(positionComparisonToken(first)).toBe(
      positionComparisonToken(second),
    );
    expect(positionComparisonToken(first)).not.toBe(
      positionComparisonToken(noId),
    );
  });

  it.each([
    ['not/fen', 'INVALID_FEN'],
    [{ A1: { pieceType: 'wR' } }, 'INVALID_POSITION_SQUARE'],
    [
      {
        a1: { id: 'same', pieceType: 'wR' },
        b1: { id: 'same', pieceType: 'wN' },
      },
      'DUPLICATE_PIECE_ID',
    ],
  ] as const)('maps invalid current value %p to %s', (input, expectedCode) => {
    const error = captureChessboardError(() =>
      normalizePositionDomain({
        boardId: 'analysis',
        development: true,
        dimensions,
        input,
        previousMetadata: createControlledDomainMetadata(),
      }),
    );
    expect(error.code).toBe(expectedCode);
    expect(error.domain).toBe('position');
  });

  it('maps FEN dimension mismatch without parsing error messages', () => {
    const result = normalizePositionDomain({
      boardId: 'variant',
      development: false,
      dimensions: validateBoardDimensions({ columns: 10, rows: 8 }),
      input: '8/8/8/8/8/8/8/8',
      previousMetadata: createControlledDomainMetadata(),
    });
    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error('Expected FEN dimension mismatch.');
    }
    expect(result.error).toEqual(
      expect.objectContaining({
        boardId: 'variant',
        code: 'FEN_DIMENSION_MISMATCH',
        revision: 0,
      }),
    );
    expect(result.error.cause).toBeInstanceOf(RangeError);
  });

  it('treats only an own revision field as the envelope discriminator', () => {
    const inherited = Object.create({ revision: 4 }) as Record<string, unknown>;
    inherited['a1'] = { pieceType: 'wR' };

    expect(() =>
      normalizePositionDomain({
        boardId: 'analysis',
        development: true,
        dimensions,
        input: inherited,
        previousMetadata: createControlledDomainMetadata(),
      }),
    ).toThrow(ChessboardError);

    const missingValue = normalizePositionDomain({
      boardId: 'analysis',
      development: false,
      dimensions,
      input: { revision: 4 },
      previousMetadata: createControlledDomainMetadata(),
    });
    expect(missingValue.ok).toBe(false);
    if (missingValue.ok) {
      throw new Error('Expected malformed envelope value.');
    }
    expect(missingValue.error.code).toBe('INVALID_POSITION');
    expect(missingValue.error.revision).toBe(4);
  });

  it('validates envelope revisions before reading values and maps accessor failures', () => {
    let invalidValueReads = 0;
    const invalidRevision = Object.defineProperties(
      {},
      {
        revision: { enumerable: true, value: -1 },
        value: {
          enumerable: true,
          get: () => {
            invalidValueReads += 1;
            throw new Error('must not read');
          },
        },
      },
    );
    const invalidRevisionResult = normalizePositionDomain({
      boardId: 'analysis',
      development: false,
      dimensions,
      input: invalidRevision,
      previousMetadata: createControlledDomainMetadata(),
    });
    expect(invalidRevisionResult.ok).toBe(false);
    if (invalidRevisionResult.ok) {
      throw new Error('Expected invalid revision.');
    }
    expect(invalidRevisionResult.error.code).toBe('INVALID_POSITION_REVISION');
    expect(invalidValueReads).toBe(0);

    const valueCause = new Error('value getter failed');
    const invalidValue = Object.defineProperties(
      {},
      {
        revision: { enumerable: true, value: 4 },
        value: {
          enumerable: true,
          get: () => {
            throw valueCause;
          },
        },
      },
    );
    const invalidValueResult = normalizePositionDomain({
      boardId: 'analysis',
      development: false,
      dimensions,
      input: invalidValue,
      previousMetadata: createControlledDomainMetadata(),
    });
    expect(invalidValueResult.ok).toBe(false);
    if (invalidValueResult.ok) {
      throw new Error('Expected invalid envelope value.');
    }
    expect(invalidValueResult.error.code).toBe('INVALID_POSITION');
    expect(invalidValueResult.error.cause).toBe(valueCause);

    const revisionCause = new Error('revision getter failed');
    const invalidRevisionAccessor = Object.defineProperties(
      {},
      {
        revision: {
          enumerable: true,
          get: () => {
            throw revisionCause;
          },
        },
        value: { enumerable: true, value: {} },
      },
    );
    const invalidRevisionAccessorResult = normalizePositionDomain({
      boardId: 'analysis',
      development: false,
      dimensions,
      input: invalidRevisionAccessor,
      previousMetadata: createControlledDomainMetadata(),
    });
    expect(invalidRevisionAccessorResult.ok).toBe(false);
    if (invalidRevisionAccessorResult.ok) {
      throw new Error('Expected invalid revision accessor.');
    }
    expect(invalidRevisionAccessorResult.error.code).toBe(
      'INVALID_POSITION_REVISION',
    );
    expect(invalidRevisionAccessorResult.error.cause).toBe(revisionCause);
  });

  it('derives exactly one revision per arbitrary semantic position change', () => {
    fc.assert(
      fc.property(
        fc.array(fc.boolean(), { maxLength: 100, minLength: 1 }),
        (states) => {
          let metadata = createControlledDomainMetadata();
          let previousState: boolean | undefined;
          let expectedRevision = -1;

          for (const occupied of states) {
            const result = normalizePositionDomain({
              boardId: 'property',
              development: true,
              dimensions,
              input: occupied ? { a1: { pieceType: 'wR' } } : {},
              previousMetadata: metadata,
            });
            expect(result.ok).toBe(true);
            if (!result.ok) {
              throw result.error;
            }
            if (previousState === undefined || previousState !== occupied) {
              expectedRevision += 1;
            }
            expect(result.current.revision).toBe(expectedRevision);
            metadata = result.nextMetadata;
            previousState = occupied;
          }
        },
      ),
      { numRuns: 300 },
    );
  });
});
