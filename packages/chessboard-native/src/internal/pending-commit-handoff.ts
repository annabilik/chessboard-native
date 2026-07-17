import type {
  MoveSource,
  PieceData,
  Revision,
  SquareId,
} from '../public-types';
import type {
  InteractionEpoch,
  MoveIntentLifecycle,
} from './interaction-reducer';
import type { NormalizedPositionValue } from './position-domain';

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

export interface DerivePendingCommitHandoffOptions {
  readonly boardId: string | null;
  readonly lifecycle: Readonly<MoveIntentLifecycle> | null;
  readonly position: Readonly<NormalizedPositionValue> | null;
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
 * Derive one exact pending-to-controlled presentation handoff.
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
