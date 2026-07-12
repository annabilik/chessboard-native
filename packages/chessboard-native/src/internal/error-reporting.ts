import type {
  ChessboardErrorContext,
  OnChessboardError,
} from '../ChessboardError';
import { ChessboardError } from '../ChessboardError';

export interface ErrorReportMetadata {
  readonly reportedKeys: readonly string[];
}

export interface ChessboardErrorReport {
  readonly error: ChessboardError;
  readonly context: ChessboardErrorContext;
}

export interface PlannedChessboardErrorReports {
  readonly reports: readonly ChessboardErrorReport[];
  readonly nextMetadata: ErrorReportMetadata;
}

export function createErrorReportMetadata(): ErrorReportMetadata {
  return Object.freeze({ reportedKeys: Object.freeze([]) });
}

function reportKey(error: ChessboardError): string {
  return JSON.stringify([error.domain, error.revision]);
}

export function planChessboardErrorReports(
  errors: readonly ChessboardError[],
  previousMetadata: ErrorReportMetadata,
): PlannedChessboardErrorReports {
  const reportedKeys = new Set(previousMetadata.reportedKeys);
  const reports: ChessboardErrorReport[] = [];

  for (const error of errors) {
    const key = reportKey(error);
    if (reportedKeys.has(key)) {
      continue;
    }
    reportedKeys.add(key);
    reports.push(
      Object.freeze({
        context: Object.freeze({
          boardId: error.boardId,
          domain: error.domain,
          revision: error.revision,
        }),
        error,
      }),
    );
  }

  if (reports.length === 0) {
    return Object.freeze({
      nextMetadata: previousMetadata,
      reports: Object.freeze([]),
    });
  }

  return Object.freeze({
    nextMetadata: Object.freeze({
      reportedKeys: Object.freeze([...reportedKeys]),
    }),
    reports: Object.freeze(reports),
  });
}

export function dispatchChessboardErrorReports(
  reports: readonly ChessboardErrorReport[],
  onError: OnChessboardError | undefined,
  logError: (error: ChessboardError) => void = (error) => {
    console.error(error);
  },
): void {
  for (const report of reports) {
    if (onError === undefined) {
      logError(report.error);
    } else {
      onError(report.error, report.context);
    }
  }
}
