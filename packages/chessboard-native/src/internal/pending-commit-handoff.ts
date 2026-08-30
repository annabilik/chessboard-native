import type {
  BoardTransition,
  MoveSource,
  PieceData,
  PositionObject,
  Revision,
  SquareId,
} from '../public-types';
import type { ValidatedBoardDimensions } from '../core/dimensions';
import type {
  InteractionEpoch,
  MoveIntentLifecycle,
} from './interaction-reducer';
import type { NormalizedPositionValue } from './position-domain';
import { inferPromotionTransition } from './transition-planner';

/**
 * Detached correlation for replacing one pending visual with its controlled
 * commit. It deliberately retains no canonical position value.
 */
export interface PendingCommitHandoffDescriptor {
  readonly boardId: string;
  readonly epoch: InteractionEpoch;
  readonly fromRevision: Revision;
  readonly intentId: string;
  readonly piece: Readonly<PieceData>;
  readonly source: Readonly<MoveSource>;
  readonly targetSquare: SquareId | null;
  readonly toRevision: Revision;
}

/** Exact mounted pending actor whose canonical mapper is ready to animate. */
export interface PendingCommitTransitionAcknowledgement {
  readonly actorKey: string;
  readonly presentationEpoch: InteractionEpoch;
}

/**
 * One exact pair of mounted handoff hosts whose canonical p0 mapper may ACK.
 *
 * Host generations are allocated by the mounted BoardSurface whenever either
 * structural host is (re)prepared. The serial is monotonic for that surface,
 * so a delayed UI-runtime callback can never satisfy a replacement lifetime
 * that happens to reuse the same semantic actor key and presentation epoch.
 */
export interface PendingCommitMapperLease extends PendingCommitTransitionAcknowledgement {
  readonly canonicalHostGeneration: number;
  readonly pendingHostGeneration: number;
  readonly serial: number;
}

export interface DerivePendingCommitHandoffOptions {
  readonly boardId: string | null;
  readonly lifecycle: Readonly<MoveIntentLifecycle> | null;
  readonly position: Readonly<NormalizedPositionValue> | null;
}

export interface PendingCommitSuccessorOptions {
  readonly dimensions: ValidatedBoardDimensions;
  readonly handoff: Readonly<PendingCommitHandoffDescriptor>;
  readonly position: Readonly<NormalizedPositionValue>;
}

function copyPiece(piece: Readonly<PieceData>): Readonly<PieceData> {
  return Object.freeze({
    ...(piece.id === undefined ? {} : { id: piece.id }),
    pieceType: piece.pieceType,
  });
}

function copySource(source: Readonly<MoveSource>): Readonly<MoveSource> {
  return source.kind === 'board'
    ? Object.freeze({ kind: 'board' as const, square: source.square })
    : Object.freeze({ kind: 'spare' as const, spareId: source.spareId });
}

/**
 * Derive one exact drag pending-to-controlled presentation handoff.
 *
 * The returned value is correlation and actor metadata only. It can seed a
 * visual transition, but it cannot render or restore a semantic position.
 */
export function derivePendingCommitHandoff({
  boardId,
  lifecycle,
  position,
}: DerivePendingCommitHandoffOptions): Readonly<PendingCommitHandoffDescriptor> | null {
  if (boardId === null || lifecycle === null) {
    return null;
  }
  if (
    position?.tier !== 'envelope' ||
    (lifecycle.phase !== 'deciding' && lifecycle.phase !== 'awaiting-commit')
  ) {
    return null;
  }

  const intent = lifecycle.intent;
  const committedIntentId = position.committedIntentId;
  if (
    intent.input !== 'drag' ||
    lifecycle.boardId !== boardId ||
    intent.boardId !== boardId ||
    intent.basePositionRevision !== lifecycle.positionRevision ||
    position.revision <= lifecycle.positionRevision ||
    !committedIntentId?.trim() ||
    committedIntentId !== intent.intentId
  ) {
    return null;
  }

  return Object.freeze({
    boardId,
    epoch: lifecycle.epoch,
    fromRevision: lifecycle.positionRevision,
    intentId: intent.intentId,
    piece: copyPiece(intent.piece),
    source: copySource(intent.source),
    targetSquare: intent.targetSquare,
    toRevision: position.revision,
  });
}

function exactPromotionHintMatches(options: {
  readonly handoff: Readonly<PendingCommitHandoffDescriptor>;
  readonly targetPiece: Readonly<PieceData>;
  readonly transition: Readonly<BoardTransition> | undefined;
}): boolean {
  const { handoff, targetPiece, transition } = options;
  return (
    handoff.source.kind === 'board' &&
    transition?.from === handoff.source.square &&
    transition.to === handoff.targetSquare &&
    transition.fromRevision === handoff.fromRevision &&
    transition.toRevision === handoff.toRevision &&
    transition.promotion === targetPiece.pieceType
  );
}

function inferredStandardPromotionMatches(options: {
  readonly dimensions: ValidatedBoardDimensions;
  readonly handoff: Readonly<PendingCommitHandoffDescriptor>;
  readonly targetPiece: Readonly<PieceData>;
}): boolean {
  const { dimensions, handoff, targetPiece } = options;
  const targetSquare = handoff.targetSquare;
  if (handoff.source.kind !== 'board' || targetSquare === null) {
    return false;
  }
  // Promotion inference is deliberately anonymous. Stable public IDs remain
  // correlated above; this stripped pair proves only the standard geometry
  // and piece-role change, never identity.
  const before: PositionObject = Object.freeze({
    [handoff.source.square]: Object.freeze({
      pieceType: handoff.piece.pieceType,
    }),
  });
  const after: PositionObject = Object.freeze({
    [targetSquare]: Object.freeze({ pieceType: targetPiece.pieceType }),
  });
  const promotion = inferPromotionTransition({ after, before, dimensions });
  return (
    promotion?.from === handoff.source.square &&
    promotion.to === targetSquare &&
    promotion.before.pieceType === handoff.piece.pieceType &&
    promotion.after.pieceType === targetPiece.pieceType
  );
}

/**
 * Validate that an exact correlation also has one plausible canonical actor.
 *
 * This is deliberately separate from `derivePendingCommitHandoff`: deriving
 * correlation never reads a renderable value, while the one-commit visual
 * preparation must fail closed when a consumer reuses an intent ID for an
 * unrelated target.
 */
export function pendingCommitHandoffHasCanonicalSuccessor({
  dimensions,
  handoff,
  position,
}: PendingCommitSuccessorOptions): boolean {
  const targetSquare = handoff.targetSquare;
  if (
    targetSquare === null ||
    position.tier !== 'envelope' ||
    position.revision !== handoff.toRevision ||
    position.committedIntentId !== handoff.intentId
  ) {
    return false;
  }
  const targetPiece = position.value[targetSquare];
  if (targetPiece === undefined) {
    return false;
  }
  if (handoff.piece.id !== undefined) {
    if (targetPiece.id !== handoff.piece.id) {
      return false;
    }
    if (targetPiece.pieceType === handoff.piece.pieceType) {
      return true;
    }
    return (
      exactPromotionHintMatches({
        handoff,
        targetPiece,
        transition: position.transition,
      }) ||
      inferredStandardPromotionMatches({ dimensions, handoff, targetPiece })
    );
  }
  if (targetPiece.id !== undefined) {
    return false;
  }
  if (
    handoff.source.kind === 'board' &&
    handoff.source.square !== targetSquare
  ) {
    const retainedSource = position.value[handoff.source.square];
    if (
      retainedSource?.id === undefined &&
      retainedSource?.pieceType === handoff.piece.pieceType
    ) {
      return false;
    }
  }
  if (targetPiece.pieceType === handoff.piece.pieceType) {
    return true;
  }
  if (
    exactPromotionHintMatches({
      handoff,
      targetPiece,
      transition: position.transition,
    })
  ) {
    return true;
  }
  return inferredStandardPromotionMatches({
    dimensions,
    handoff,
    targetPiece,
  });
}
