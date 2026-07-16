import { parseSquareId } from '../core/coordinates';
import type { ValidatedBoardDimensions } from '../core/dimensions';
import { isPlainRecord } from '../core/records';
import type {
  BoardTransition,
  PieceType,
  Revision,
  SquareId,
} from '../public-types';

export type TransitionHintWarningCode =
  'malformed' | 'revision-mismatch' | 'position-mismatch' | 'identity-mismatch';

export interface TransitionHintWarning {
  readonly code: TransitionHintWarningCode;
  readonly message: string;
}

export interface TransitionHintSnapshotResult {
  readonly hint: Readonly<BoardTransition> | null;
  readonly warning: Readonly<TransitionHintWarning> | null;
}

const NO_TRANSITION_HINT: TransitionHintSnapshotResult = Object.freeze({
  hint: null,
  warning: null,
});

function warning(message: string): TransitionHintSnapshotResult {
  return Object.freeze({
    hint: null,
    warning: Object.freeze({
      code: 'malformed' as const,
      message,
    }),
  });
}

function isRevision(value: unknown): value is Revision {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function requiredRevision(
  value: unknown,
  name: 'fromRevision' | 'toRevision',
): Revision {
  if (!isRevision(value)) {
    throw new TypeError(
      `Board transition ${name} must be a non-negative safe integer.`,
    );
  }
  return value;
}

function requiredSquare(
  value: unknown,
  name: 'from' | 'to',
  dimensions: ValidatedBoardDimensions,
): SquareId {
  if (typeof value !== 'string') {
    throw new TypeError(`Board transition ${name} must be a square ID.`);
  }
  parseSquareId(value, dimensions);
  return value;
}

function optionalSquare(
  value: unknown,
  name: 'capturedSquare',
  dimensions: ValidatedBoardDimensions,
): SquareId | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'string') {
    throw new TypeError(`Board transition ${name} must be a square ID.`);
  }
  parseSquareId(value, dimensions);
  return value;
}

function optionalPieceType(
  value: unknown,
  name: 'promotion',
): PieceType | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'string') {
    throw new TypeError(`Board transition ${name} must be a string.`);
  }
  return value;
}

function snapshotRookMove(
  value: unknown,
  dimensions: ValidatedBoardDimensions,
): Readonly<{ from: SquareId; to: SquareId }> | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!isPlainRecord(value)) {
    throw new TypeError(
      'Board transition rookMove must be a plain object with from and to squares.',
    );
  }

  const fromValue = value['from'];
  const toValue = value['to'];
  const from = requiredSquare(fromValue, 'from', dimensions);
  const to = requiredSquare(toValue, 'to', dimensions);
  if (from === to) {
    throw new TypeError(
      'Board transition rookMove must use different from and to squares.',
    );
  }
  return Object.freeze({ from, to });
}

/**
 * Snapshot a presentation-only transition hint without affecting position
 * validity. Hostile accessors and malformed optional data degrade to a warning.
 */
export function snapshotTransitionHint(
  input: unknown,
  dimensions: ValidatedBoardDimensions,
): TransitionHintSnapshotResult {
  if (input === undefined) {
    return NO_TRANSITION_HINT;
  }

  try {
    if (!isPlainRecord(input)) {
      return warning('Board transition must be a plain object.');
    }

    // Snapshot every public field once before validating any relationships.
    const fromRevisionValue = input['fromRevision'];
    const toRevisionValue = input['toRevision'];
    const fromValue = input['from'];
    const toValue = input['to'];
    const promotionValue = input['promotion'];
    const capturedSquareValue = input['capturedSquare'];
    const rookMoveValue = input['rookMove'];

    const fromRevision = requiredRevision(fromRevisionValue, 'fromRevision');
    const toRevision = requiredRevision(toRevisionValue, 'toRevision');
    const from = requiredSquare(fromValue, 'from', dimensions);
    const to = requiredSquare(toValue, 'to', dimensions);
    if (from === to) {
      return warning(
        'Board transition must use different from and to squares.',
      );
    }

    const promotion = optionalPieceType(promotionValue, 'promotion');
    const capturedSquare = optionalSquare(
      capturedSquareValue,
      'capturedSquare',
      dimensions,
    );
    const rookMove = snapshotRookMove(rookMoveValue, dimensions);
    const hint: BoardTransition = Object.freeze({
      from,
      fromRevision,
      to,
      toRevision,
      ...(promotion === undefined ? {} : { promotion }),
      ...(capturedSquare === undefined ? {} : { capturedSquare }),
      ...(rookMove === undefined ? {} : { rookMove }),
    });

    return Object.freeze({ hint, warning: null });
  } catch (error) {
    let message = 'Board transition could not be read.';
    try {
      if (error instanceof Error && error.message.length > 0) {
        message = error.message;
      }
    } catch {
      // Warning text is best-effort and must not rethrow hostile error access.
    }
    return warning(message);
  }
}
