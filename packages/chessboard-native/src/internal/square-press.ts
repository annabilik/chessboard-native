import type {
  OnSquarePressIn,
  OnSquarePressOut,
  PieceData,
  Revision,
  SquareId,
  SquarePressContext,
} from '../public-types';

type SquarePressHandler = OnSquarePressIn | OnSquarePressOut;

/** Detach and freeze callback data at one verified native press boundary. */
export function createSquarePressContext(options: {
  readonly basePositionRevision: Revision;
  readonly boardId: string;
  readonly piece: Readonly<PieceData> | null;
  readonly square: SquareId;
}): Readonly<SquarePressContext> {
  const piece =
    options.piece === null
      ? null
      : Object.freeze({
          ...(options.piece.id === undefined ? {} : { id: options.piece.id }),
          pieceType: options.piece.pieceType,
        });
  return Object.freeze({
    basePositionRevision: options.basePositionRevision,
    boardId: options.boardId,
    piece,
    square: options.square,
  });
}

/** Invoke an observational square-press callback without affecting input. */
export function emitSquarePress(
  handler: SquarePressHandler | undefined,
  context: Readonly<SquarePressContext>,
): boolean {
  if (handler === undefined) {
    return false;
  }
  const detached = createSquarePressContext(context);
  try {
    handler(detached);
  } catch {
    // Observational callbacks cannot break the authoritative input runtime.
  }
  return true;
}
