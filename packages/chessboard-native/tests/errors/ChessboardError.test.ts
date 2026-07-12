import {
  ChessboardError,
  type ChessboardErrorContext,
  type OnChessboardError,
} from '../../src/index';

describe('ChessboardError', () => {
  it('exposes stable diagnostic and recovery metadata', () => {
    const cause = new Error('rank overflow');
    const details = {
      boardId: 'analysis',
      code: 'INVALID_FEN',
      revision: 14,
    } as const;
    const error = new ChessboardError(
      'FEN must contain exactly eight ranks.',
      details,
      cause,
    );

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(ChessboardError);
    expect(error.name).toBe('ChessboardError');
    expect(error.code).toBe('INVALID_FEN');
    expect(error.message).toBe('FEN must contain exactly eight ranks.');
    expect(error.boardId).toBe('analysis');
    expect(error.domain).toBe('position');
    expect(error.revision).toBe(14);
    expect(error.cause).toBe(cause);
    expect(Object.prototype.propertyIsEnumerable.call(error, 'cause')).toBe(
      false,
    );
  });

  it('uses null revisions for board and dimension failures', () => {
    const details = {
      boardId: null,
      code: 'INVALID_DIMENSIONS',
      revision: null,
    } as const;
    const error = new ChessboardError(
      'Rows must be between 1 and 99.',
      details,
    );
    const context = {
      boardId: error.boardId,
      domain: error.domain,
      revision: error.revision,
    } satisfies ChessboardErrorContext;
    const handler: OnChessboardError = (reported, reportedContext) => {
      expect(reported).toBe(error);
      expect(reportedContext).toBe(context);
    };

    handler(error, context);
    expect(error.boardId).toBeNull();
    expect(error.revision).toBeNull();
    expect(error.cause).toBeUndefined();
  });

  it('uses null when malformed revisions and plain tier switches have no consumer revision', () => {
    const revision = new ChessboardError('Revision must be a safe integer.', {
      boardId: 'analysis',
      code: 'INVALID_POSITION_REVISION',
      revision: null,
    });
    const tier = new ChessboardError('Selection tier changed.', {
      boardId: 'analysis',
      code: 'SELECTION_CONTROL_TIER_CHANGED',
      revision: null,
    });

    expect(revision.domain).toBe('position');
    expect(revision.revision).toBeNull();
    expect(tier.domain).toBe('selection');
    expect(tier.revision).toBeNull();
  });

  it('derives recovery domains and rejects impossible detail combinations', () => {
    const error = new ChessboardError('Selection revision moved backwards.', {
      boardId: 'analysis',
      code: 'INVALID_SELECTION_REVISION',
      revision: 8,
    });
    const invalidDetails = () => {
      // @ts-expect-error Position failures must carry a semantic revision.
      new ChessboardError('Invalid FEN.', {
        boardId: 'analysis',
        code: 'INVALID_FEN',
        revision: null,
      });
      // @ts-expect-error Dimensions failures cannot carry a semantic revision.
      new ChessboardError('Invalid dimensions.', {
        boardId: 'analysis',
        code: 'INVALID_DIMENSIONS',
        revision: 1,
      });
    };

    expect(error.domain).toBe('selection');
    expect(invalidDetails).toEqual(expect.any(Function));
  });
});
