import { ChessboardError } from '../ChessboardError';
import {
  STANDARD_BOARD_DIMENSIONS,
  validateBoardDimensions,
  validateOrientation,
  type ValidatedBoardDimensions,
} from '../core/dimensions';
import type {
  BoardAnnotation,
  BoardOrientation,
  PlainSelection,
  PositionObject,
} from '../public-types';
import { normalizeAnnotationDomain } from './annotation-domain';
import {
  createControlledDomainMetadata,
  type ControlledDomainMetadata,
  type NormalizedControlledValue,
} from './controlled-domain';
import { normalizePositionDomain } from './position-domain';
import { normalizeSelectionDomain } from './selection-domain';
import { safeErrorMessage } from './safe-error';

export interface BoardModelMetadata {
  readonly boardId: string | null;
  readonly position: ControlledDomainMetadata;
  readonly annotations: ControlledDomainMetadata;
  readonly selection: ControlledDomainMetadata;
}

export interface NormalizedBoardModel {
  readonly status: 'ready' | 'disabled';
  readonly boardId: string | null;
  readonly dimensions: ValidatedBoardDimensions | null;
  readonly orientation: BoardOrientation | null;
  readonly position: NormalizedControlledValue<PositionObject> | null;
  readonly annotations: NormalizedControlledValue<
    readonly Readonly<BoardAnnotation>[]
  > | null;
  readonly selection: NormalizedControlledValue<
    Readonly<PlainSelection>
  > | null;
}

export interface PreparedBoardModel {
  readonly model: NormalizedBoardModel;
  readonly errors: readonly ChessboardError[];
  readonly nextMetadata: BoardModelMetadata;
}

export interface PrepareBoardModelOptions {
  readonly boardId: unknown;
  readonly position: unknown;
  readonly dimensions?: unknown;
  readonly orientation?: unknown;
  readonly annotations?: unknown;
  readonly selection?: unknown;
  readonly development: boolean;
  readonly previousMetadata: BoardModelMetadata;
}

export function createBoardModelMetadata(): BoardModelMetadata {
  return Object.freeze({
    annotations: createControlledDomainMetadata(),
    boardId: null,
    position: createControlledDomainMetadata(),
    selection: createControlledDomainMetadata(),
  });
}

function normalizeBoardId(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError('boardId must be a non-empty string.');
  }
  return value;
}

function recover(
  error: ChessboardError,
  development: boolean,
): ChessboardError {
  if (development) {
    throw error;
  }
  return error;
}

function createMetadata(
  previous: BoardModelMetadata,
  boardId: string | null,
  position: ControlledDomainMetadata,
  annotations: ControlledDomainMetadata,
  selection: ControlledDomainMetadata,
): BoardModelMetadata {
  if (
    previous.boardId === boardId &&
    previous.position === position &&
    previous.annotations === annotations &&
    previous.selection === selection
  ) {
    return previous;
  }
  return Object.freeze({ annotations, boardId, position, selection });
}

function finish(
  model: NormalizedBoardModel,
  errors: readonly ChessboardError[],
  nextMetadata: BoardModelMetadata,
): PreparedBoardModel {
  return Object.freeze({
    errors: Object.freeze([...errors]),
    model: Object.freeze(model),
    nextMetadata,
  });
}

function disabledModel(
  boardId: string | null,
  dimensions: ValidatedBoardDimensions | null,
  orientation: BoardOrientation | null,
): NormalizedBoardModel {
  return {
    annotations: null,
    boardId,
    dimensions,
    orientation,
    position: null,
    selection: null,
    status: 'disabled',
  };
}

/**
 * Prepare the current render from current props and committed metadata only.
 * Metadata contains correlation state, never a renderable semantic snapshot.
 */
export function prepareBoardModel(
  options: PrepareBoardModelOptions,
): PreparedBoardModel {
  const { development, previousMetadata } = options;
  let boardId: string;
  try {
    boardId = normalizeBoardId(options.boardId);
  } catch (cause) {
    const error = recover(
      new ChessboardError(
        safeErrorMessage(cause, 'Invalid boardId.'),
        { boardId: null, code: 'INVALID_BOARD_ID', revision: null },
        cause,
      ),
      development,
    );
    return finish(disabledModel(null, null, null), [error], previousMetadata);
  }

  if (
    previousMetadata.boardId !== null &&
    previousMetadata.boardId !== boardId
  ) {
    const error = recover(
      new ChessboardError(
        `boardId changed from "${previousMetadata.boardId}" to "${boardId}" while mounted.`,
        { boardId, code: 'BOARD_ID_CHANGED', revision: null },
      ),
      development,
    );
    return finish(disabledModel(null, null, null), [error], previousMetadata);
  }

  const acceptedBoardId = previousMetadata.boardId ?? boardId;
  const boardMetadata = createMetadata(
    previousMetadata,
    acceptedBoardId,
    previousMetadata.position,
    previousMetadata.annotations,
    previousMetadata.selection,
  );

  let dimensions: ValidatedBoardDimensions;
  try {
    dimensions =
      options.dimensions === undefined
        ? STANDARD_BOARD_DIMENSIONS
        : validateBoardDimensions(options.dimensions);
  } catch (cause) {
    const error = recover(
      new ChessboardError(
        safeErrorMessage(cause, 'Invalid board dimensions.'),
        { boardId, code: 'INVALID_DIMENSIONS', revision: null },
        cause,
      ),
      development,
    );
    return finish(disabledModel(boardId, null, null), [error], boardMetadata);
  }

  let orientation: BoardOrientation;
  try {
    orientation =
      options.orientation === undefined
        ? 'white'
        : validateOrientation(options.orientation);
  } catch (cause) {
    const error = recover(
      new ChessboardError(
        safeErrorMessage(cause, 'Invalid board orientation.'),
        { boardId, code: 'INVALID_ORIENTATION', revision: null },
        cause,
      ),
      development,
    );
    return finish(
      disabledModel(boardId, dimensions, null),
      [error],
      boardMetadata,
    );
  }

  const position = normalizePositionDomain({
    boardId,
    development,
    dimensions,
    input: options.position,
    previousMetadata: previousMetadata.position,
  });
  const annotations =
    options.annotations === undefined
      ? null
      : normalizeAnnotationDomain({
          boardId,
          development,
          dimensions,
          input: options.annotations,
          previousMetadata: previousMetadata.annotations,
        });
  const selection =
    options.selection === undefined
      ? null
      : normalizeSelectionDomain({
          boardId,
          development,
          dimensions,
          input: options.selection,
          previousMetadata: previousMetadata.selection,
        });

  const errors: ChessboardError[] = [];
  if (!position.ok) {
    errors.push(position.error);
  }
  if (annotations !== null && !annotations.ok) {
    errors.push(annotations.error);
  }
  if (selection !== null && !selection.ok) {
    errors.push(selection.error);
  }

  const nextMetadata = createMetadata(
    boardMetadata,
    acceptedBoardId,
    position.nextMetadata,
    annotations?.nextMetadata ?? previousMetadata.annotations,
    selection?.nextMetadata ?? previousMetadata.selection,
  );
  const disabled = !position.ok;

  return finish(
    disabled
      ? disabledModel(boardId, dimensions, orientation)
      : {
          annotations: annotations?.current ?? null,
          boardId,
          dimensions,
          orientation,
          position: position.current,
          selection: selection?.current ?? null,
          status: 'ready',
        },
    errors,
    nextMetadata,
  );
}
