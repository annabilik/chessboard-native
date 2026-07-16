import { ChessboardError } from '../ChessboardError';
import type {
  BoardTransition,
  PositionObject,
  Revision,
} from '../public-types';
import type { ValidatedBoardDimensions } from '../core/dimensions';
import {
  normalizePositionInput,
  PositionValidationError,
} from '../core/position';
import {
  normalizeControlledDomain,
  type ClassifiedControlledValue,
  type ControlledDomainAdapter,
  type ControlledDomainMetadata,
  type ControlledDomainResult,
  type NormalizedControlledValue,
} from './controlled-domain';
import { safeErrorMessage } from './safe-error';
import {
  snapshotTransitionHint,
  type TransitionHintWarning,
} from './transition-hint';

/** Current-render position plus optional envelope-only commit correlation. */
export interface NormalizedPositionValue extends NormalizedControlledValue<PositionObject> {
  readonly committedIntentId?: string;
  readonly transition?: Readonly<BoardTransition>;
  readonly transitionWarning?: Readonly<TransitionHintWarning>;
}

export type NormalizedPositionDomainResult =
  | {
      readonly ok: true;
      readonly current: NormalizedPositionValue;
      readonly error: null;
      readonly nextMetadata: ControlledDomainMetadata;
    }
  | Extract<ControlledDomainResult<PositionObject>, { readonly ok: false }>;

function classifyPositionProp(input: unknown): ClassifiedControlledValue {
  if (
    typeof input === 'object' &&
    input !== null &&
    !Array.isArray(input) &&
    Object.hasOwn(input, 'revision')
  ) {
    const envelope = input as Record<string, unknown>;
    return Object.freeze({
      readRevision: () => envelope['revision'],
      readValue: () => envelope['value'],
      tier: 'envelope',
    });
  }
  return Object.freeze({ readValue: () => input, tier: 'plain' });
}

/** Canonical comparison metadata; key order and input spelling are non-semantic. */
export function positionComparisonToken(position: PositionObject): string {
  const entries: (
    readonly [string, string, 0] | readonly [string, string, 1, string]
  )[] = [];
  for (const square of Object.keys(position).sort()) {
    const piece = position[square];
    if (piece === undefined) {
      continue;
    }
    entries.push(
      piece.id === undefined
        ? [square, piece.pieceType, 0]
        : [square, piece.pieceType, 1, piece.id],
    );
  }
  return JSON.stringify(entries);
}

function positionValueError(
  error: unknown,
  value: unknown,
  boardId: string | null,
  revision: Revision,
): ChessboardError {
  let validationDetails:
    | Readonly<{
        code: PositionValidationError['code'];
        message: string;
      }>
    | undefined;
  try {
    if (error instanceof PositionValidationError) {
      const code: unknown = error.code;
      if (
        code === 'INVALID_POSITION' ||
        code === 'INVALID_POSITION_SQUARE' ||
        code === 'DUPLICATE_PIECE_ID'
      ) {
        validationDetails = {
          code,
          message: safeErrorMessage(error, 'Invalid position.'),
        };
      }
    }
  } catch {
    validationDetails = undefined;
  }
  if (validationDetails !== undefined) {
    return new ChessboardError(
      validationDetails.message,
      { boardId, code: validationDetails.code, revision },
      error,
    );
  }
  if (typeof value === 'string') {
    let dimensionMismatch: boolean;
    try {
      dimensionMismatch = error instanceof RangeError;
    } catch {
      dimensionMismatch = false;
    }
    if (dimensionMismatch) {
      return new ChessboardError(
        safeErrorMessage(error, 'FEN dimensions do not match the board.'),
        { boardId, code: 'FEN_DIMENSION_MISMATCH', revision },
        error,
      );
    }
    return new ChessboardError(
      safeErrorMessage(error, 'Invalid FEN piece placement.'),
      { boardId, code: 'INVALID_FEN', revision },
      error,
    );
  }
  return new ChessboardError(
    safeErrorMessage(error, 'Invalid position.'),
    { boardId, code: 'INVALID_POSITION', revision },
    error,
  );
}

function positionAdapter(
  dimensions: ValidatedBoardDimensions,
): ControlledDomainAdapter<PositionObject> {
  const adapter: ControlledDomainAdapter<PositionObject> = {
    classify: classifyPositionProp,
    comparisonToken: positionComparisonToken,
    createValueError: (error, context) =>
      positionValueError(
        error,
        context.value,
        context.boardId,
        context.revision,
      ),
    normalizeValue: (value) => normalizePositionInput(value, dimensions),
  };
  return Object.freeze(adapter);
}

export interface NormalizePositionDomainOptions {
  readonly input: unknown;
  readonly previousMetadata: ControlledDomainMetadata;
  readonly boardId: string | null;
  /** Must come from `validateBoardDimensions`. */
  readonly dimensions: ValidatedBoardDimensions;
  readonly development: boolean;
}

function currentCommittedIntentId(
  input: unknown,
  current: NormalizedControlledValue<PositionObject>,
): string | undefined {
  if (current.tier !== 'envelope') {
    return undefined;
  }

  try {
    if (typeof input !== 'object' || input === null || Array.isArray(input)) {
      return undefined;
    }
    const value = (input as Readonly<Record<string, unknown>>)[
      'committedIntentId'
    ];
    return typeof value === 'string' ? value : undefined;
  } catch {
    // Commit correlation is a non-semantic hint. Hostile or malformed access
    // cannot invalidate an otherwise valid current position.
    return undefined;
  }
}

function currentTransitionHint(
  input: unknown,
  current: NormalizedControlledValue<PositionObject>,
  dimensions: ValidatedBoardDimensions,
): Readonly<{
  hint: Readonly<BoardTransition> | null;
  warning: Readonly<TransitionHintWarning> | null;
}> {
  if (current.tier !== 'envelope') {
    return Object.freeze({ hint: null, warning: null });
  }

  let rawTransition: unknown;
  try {
    if (typeof input !== 'object' || input === null || Array.isArray(input)) {
      return Object.freeze({ hint: null, warning: null });
    }
    rawTransition = (input as Readonly<Record<string, unknown>>)['transition'];
  } catch {
    return Object.freeze({
      hint: null,
      warning: Object.freeze({
        code: 'malformed' as const,
        message: 'Board transition could not be read.',
      }),
    });
  }
  return snapshotTransitionHint(rawTransition, dimensions);
}

export function normalizePositionDomain(
  options: NormalizePositionDomainOptions,
): NormalizedPositionDomainResult {
  const result = normalizeControlledDomain({
    adapter: positionAdapter(options.dimensions),
    boardId: options.boardId,
    development: options.development,
    domain: 'position',
    input: options.input,
    previousMetadata: options.previousMetadata,
  });

  if (!result.ok) {
    return result;
  }

  const committedIntentId = currentCommittedIntentId(
    options.input,
    result.current,
  );
  const transition = currentTransitionHint(
    options.input,
    result.current,
    options.dimensions,
  );
  const current: NormalizedPositionValue = Object.freeze({
    ...result.current,
    ...(committedIntentId === undefined ? {} : { committedIntentId }),
    ...(transition.hint === null ? {} : { transition: transition.hint }),
    ...(transition.warning === null
      ? {}
      : { transitionWarning: transition.warning }),
  });
  return Object.freeze({ ...result, current });
}
