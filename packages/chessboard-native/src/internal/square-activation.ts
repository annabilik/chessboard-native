import { parseSquareId } from '../core/coordinates';
import type { NormalizedBoardModel } from './board-model';
import type {
  MoveIntent,
  OnSquareActivate,
  PieceData,
  Revision,
  SquareActivationIntent,
  SquareId,
} from '../public-types';

/** Inputs currently delivered by the native board and adjustable control. */
export type SquareActivationInput = Extract<
  SquareActivationIntent['input'],
  'touch' | 'accessibility'
>;

/** Activation payload before its board-scoped identity is allocated. */
export type SquareActivationRequest = Omit<SquareActivationIntent, 'intentId'>;

/** Move payload accepted by the mounted move-request runtime. */
export type PlannedMoveRequest = Omit<MoveIntent, 'intentId'>;

export interface PlanSquareActivationOptions {
  /** Defaults to an ordinary square activation. */
  readonly action?: SquareActivationIntent['action'];
  /** Whether a committed square-activation callback is available. */
  readonly activationEnabled: boolean;
  readonly input: SquareActivationInput;
  readonly model: Readonly<NormalizedBoardModel>;
  /** Whether the existing move-request runtime can accept a request. */
  readonly moveEnabled: boolean;
  readonly square: SquareId;
}

export type SquareActivationPlan =
  | Readonly<{ readonly type: 'blocked' }>
  | Readonly<{ readonly type: 'fallback' }>
  | Readonly<{
      readonly type: 'request-move';
      readonly request: Readonly<PlannedMoveRequest>;
    }>
  | Readonly<{
      readonly type: 'emit-activation';
      readonly request: Readonly<SquareActivationRequest>;
    }>;

export type SquareActivationHandler = OnSquareActivate;

export interface SquareActivationEmitter {
  readonly dispose: () => void;
  readonly emit: (request: Readonly<SquareActivationRequest>) => string | null;
  readonly setHandler: (handler: SquareActivationHandler | undefined) => void;
}

export interface CreateSquareActivationEmitterOptions {
  readonly boardId: string;
  /** Internal deterministic prefix; normally omitted. */
  readonly intentIdPrefix?: string;
  /** Internal deterministic sequence seed; normally omitted. */
  readonly nextIntentSequence?: number;
}

const BLOCKED_PLAN: Readonly<{ readonly type: 'blocked' }> = Object.freeze({
  type: 'blocked',
});
const FALLBACK_PLAN: Readonly<{ readonly type: 'fallback' }> = Object.freeze({
  type: 'fallback',
});

function isRevision(value: unknown): value is Revision {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isCanonicalSquare(value: unknown): value is SquareId {
  return typeof value === 'string' && /^[a-z][1-9][0-9]?$/.test(value);
}

function copyPiece(piece: Readonly<PieceData>): Readonly<PieceData> {
  return Object.freeze({
    ...(piece.id === undefined ? {} : { id: piece.id }),
    pieceType: piece.pieceType,
  });
}

function currentPiece(
  model: Readonly<NormalizedBoardModel>,
  square: SquareId,
): Readonly<PieceData> | null {
  const piece = model.position?.value[square];
  return piece ?? null;
}

function isActivationAction(
  value: unknown,
): value is SquareActivationIntent['action'] {
  return value === 'activate' || value === 'clear-selection';
}

function isActivationInput(
  value: unknown,
): value is SquareActivationIntent['input'] {
  return value === 'touch' || value === 'keyboard' || value === 'accessibility';
}

function validCurrentSquare(
  model: Readonly<NormalizedBoardModel>,
  square: SquareId,
): boolean {
  if (model.dimensions === null) {
    return false;
  }
  try {
    parseSquareId(square, model.dimensions);
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolve one activation from the current normalized controlled snapshot.
 *
 * The result contains detached intent data only. It never retains or changes
 * the position or selection that produced it.
 */
export function planSquareActivation(
  options: Readonly<PlanSquareActivationOptions>,
): Readonly<SquareActivationPlan> {
  const { model, square } = options;
  if (
    model.status !== 'ready' ||
    model.boardId === null ||
    model.position === null ||
    !validCurrentSquare(model, square)
  ) {
    return BLOCKED_PLAN;
  }

  const action = options.action ?? 'activate';
  const selection = model.selection;
  const selectedSquare = selection?.value.selectedSquare ?? null;
  const isDestination =
    selection?.value.destinationSquares?.includes(square) ?? false;
  const isDisabled =
    selection?.value.disabledSquares?.includes(square) ?? false;
  const selectedSourceIsDisabled =
    selectedSquare !== null &&
    (selection?.value.disabledSquares?.includes(selectedSquare) ?? false);

  // An explicit clear remains possible when a selected square is disabled;
  // ordinary activation never escapes the consumer's disabled-square gate.
  if (action === 'activate' && (isDisabled || selectedSourceIsDisabled)) {
    return BLOCKED_PLAN;
  }

  // Square activation is the opt-in for selection-driven tap/accessibility
  // behavior. Without it, callers retain their existing transient fallback.
  if (!options.activationEnabled) {
    return FALLBACK_PLAN;
  }

  if (
    action === 'activate' &&
    options.moveEnabled &&
    isDestination &&
    selectedSquare !== null
  ) {
    const sourcePiece = currentPiece(model, selectedSquare);
    if (sourcePiece !== null) {
      const request: Readonly<PlannedMoveRequest> = Object.freeze({
        basePositionRevision: model.position.revision,
        boardId: model.boardId,
        input: options.input === 'touch' ? 'tap' : 'accessibility',
        piece: copyPiece(sourcePiece),
        source: Object.freeze({
          kind: 'board' as const,
          square: selectedSquare,
        }),
        targetSquare: square,
      });
      return Object.freeze({ request, type: 'request-move' });
    }
  }

  const targetPiece = currentPiece(model, square);
  const request: Readonly<SquareActivationRequest> = Object.freeze({
    action,
    basePositionRevision: model.position.revision,
    baseSelectionRevision: selection?.revision ?? null,
    boardId: model.boardId,
    input: options.input,
    isDestination,
    piece: targetPiece === null ? null : copyPiece(targetPiece),
    selectedSquare,
    square,
  });
  return Object.freeze({ request, type: 'emit-activation' });
}

function validateBoardId(boardId: string): string {
  if (boardId.trim().length === 0) {
    throw new RangeError('boardId must be non-empty.');
  }
  return boardId;
}

function validatePrefix(prefix: string): string {
  if (prefix.length === 0) {
    throw new RangeError('intentIdPrefix must be non-empty.');
  }
  return prefix;
}

function validateSequence(sequence: number): number {
  if (!Number.isSafeInteger(sequence) || sequence < 0) {
    throw new RangeError(
      'nextIntentSequence must be a non-negative safe integer.',
    );
  }
  return sequence;
}

function defaultIntentPrefix(boardId: string): string {
  return `activation:${String(boardId.length)}:${boardId}:`;
}

function copyActivationRequest(
  request: Readonly<SquareActivationRequest>,
  boardId: string,
): Readonly<SquareActivationRequest> | null {
  try {
    if (
      request.boardId !== boardId ||
      !isRevision(request.basePositionRevision) ||
      (request.baseSelectionRevision !== null &&
        !isRevision(request.baseSelectionRevision)) ||
      !isCanonicalSquare(request.square) ||
      (request.selectedSquare !== null &&
        !isCanonicalSquare(request.selectedSquare)) ||
      typeof request.isDestination !== 'boolean' ||
      !isActivationAction(request.action) ||
      !isActivationInput(request.input)
    ) {
      return null;
    }

    let piece: Readonly<PieceData> | null = null;
    if (request.piece !== null) {
      if (
        typeof request.piece !== 'object' ||
        Array.isArray(request.piece) ||
        typeof request.piece.pieceType !== 'string' ||
        request.piece.pieceType.length === 0 ||
        (request.piece.id !== undefined && typeof request.piece.id !== 'string')
      ) {
        return null;
      }
      piece = copyPiece(request.piece);
    }

    return Object.freeze({
      action: request.action,
      basePositionRevision: request.basePositionRevision,
      baseSelectionRevision: request.baseSelectionRevision,
      boardId,
      input: request.input,
      isDestination: request.isDestination,
      piece,
      selectedSquare: request.selectedSquare,
      square: request.square,
    });
  } catch {
    return null;
  }
}

/** Allocate and emit detached board-scoped activation intents. */
export function createSquareActivationEmitter(
  options: Readonly<CreateSquareActivationEmitterOptions>,
): SquareActivationEmitter {
  const boardId = validateBoardId(options.boardId);
  const prefix = validatePrefix(
    options.intentIdPrefix ?? defaultIntentPrefix(boardId),
  );
  let nextIntentSequence: number | null = validateSequence(
    options.nextIntentSequence ?? 0,
  );
  let handler: SquareActivationHandler | undefined;
  let disposed = false;

  const allocateIntentId = (): string | null => {
    const sequence = nextIntentSequence;
    if (sequence === null) {
      return null;
    }
    nextIntentSequence =
      sequence === Number.MAX_SAFE_INTEGER ? null : sequence + 1;
    return `${prefix}${String(sequence)}`;
  };

  return {
    dispose: (): void => {
      disposed = true;
      handler = undefined;
    },
    emit: (request): string | null => {
      if (disposed || handler === undefined) {
        return null;
      }
      const detached = copyActivationRequest(request, boardId);
      if (detached === null) {
        return null;
      }
      const intentId = allocateIntentId();
      if (intentId === null) {
        return null;
      }
      const intent: Readonly<SquareActivationIntent> = Object.freeze({
        ...detached,
        intentId,
      });
      try {
        handler(intent);
      } catch {
        // An observational activation callback cannot break board input.
      }
      return intentId;
    },
    setHandler: (nextHandler): void => {
      if (disposed) {
        return;
      }
      handler = typeof nextHandler === 'function' ? nextHandler : undefined;
    },
  };
}
