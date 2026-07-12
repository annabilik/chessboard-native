import {
  ChessboardError,
  type ChessboardErrorContext,
} from '../../src/ChessboardError';
import {
  createErrorReportMetadata,
  dispatchChessboardErrorReports,
  planChessboardErrorReports,
} from '../../src/internal/error-reporting';

function positionError(
  code: 'INVALID_POSITION' | 'INVALID_POSITION_SQUARE',
  revision: number,
): ChessboardError {
  return new ChessboardError(code, {
    boardId: 'analysis',
    code,
    revision,
  });
}

describe('production error reporting', () => {
  it('plans one contextual report per domain and revision', () => {
    const firstError = positionError('INVALID_POSITION', 3);
    const duplicateKey = positionError('INVALID_POSITION_SQUARE', 3);
    const annotationError = new ChessboardError('annotations', {
      boardId: 'analysis',
      code: 'INVALID_ANNOTATIONS',
      revision: 3,
    });
    const nextRevision = positionError('INVALID_POSITION', 4);

    const first = planChessboardErrorReports(
      [firstError, duplicateKey, annotationError, nextRevision],
      createErrorReportMetadata(),
    );
    expect(first.reports.map(({ error }) => error)).toEqual([
      firstError,
      annotationError,
      nextRevision,
    ]);
    expect(first.reports[0]?.context).toEqual({
      boardId: 'analysis',
      domain: 'position',
      revision: 3,
    });

    const replay = planChessboardErrorReports(
      [firstError, annotationError, nextRevision],
      first.nextMetadata,
    );
    expect(replay.reports).toEqual([]);
    expect(replay.nextMetadata).toBe(first.nextMetadata);
  });

  it('deduplicates null-revision errors by domain for the mounted lifetime', () => {
    const malformedRevision = new ChessboardError('malformed revision', {
      boardId: 'analysis',
      code: 'INVALID_POSITION_REVISION',
      revision: null,
    });
    const tierChange = new ChessboardError('tier change', {
      boardId: 'analysis',
      code: 'POSITION_CONTROL_TIER_CHANGED',
      revision: null,
    });
    const selectionRevision = new ChessboardError('selection revision', {
      boardId: 'analysis',
      code: 'INVALID_SELECTION_REVISION',
      revision: null,
    });

    const planned = planChessboardErrorReports(
      [malformedRevision, tierChange, selectionRevision],
      createErrorReportMetadata(),
    );
    expect(planned.reports.map(({ error }) => error)).toEqual([
      malformedRevision,
      selectionRevision,
    ]);
  });

  it('dispatches through onError without also logging', () => {
    const error = positionError('INVALID_POSITION', 1);
    const planned = planChessboardErrorReports(
      [error],
      createErrorReportMetadata(),
    );
    const handler = jest.fn<
      undefined,
      [ChessboardError, ChessboardErrorContext]
    >();
    const logger = jest.fn<undefined, [ChessboardError]>();

    dispatchChessboardErrorReports(planned.reports, handler, logger);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(error, planned.reports[0]?.context);
    expect(logger).not.toHaveBeenCalled();
  });

  it('logs each planned error when no handler exists', () => {
    const errors = [
      positionError('INVALID_POSITION', 1),
      positionError('INVALID_POSITION', 2),
    ];
    const planned = planChessboardErrorReports(
      errors,
      createErrorReportMetadata(),
    );
    const logger = jest.fn<undefined, [ChessboardError]>();

    dispatchChessboardErrorReports(planned.reports, undefined, logger);

    expect(logger.mock.calls).toEqual([[errors[0]], [errors[1]]]);
  });
});
