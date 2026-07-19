import type {
  OnPieceDragStart,
  OnPiecePress,
  PieceData,
  PieceInteractionContext,
  Revision,
  SquareId,
} from '../public-types';

type PieceInteractionSource =
  | Readonly<{ readonly kind: 'board'; readonly square: SquareId }>
  | Readonly<{ readonly kind: 'spare'; readonly spareId: string }>;

/** Detach and freeze callback data at one verified interaction boundary. */
export function createPieceInteractionContext(options: {
  readonly basePositionRevision: Revision;
  readonly boardId: string;
  readonly piece: Readonly<PieceData>;
  readonly source: PieceInteractionSource;
}): Readonly<PieceInteractionContext> {
  const source =
    options.source.kind === 'board'
      ? Object.freeze({
          kind: 'board' as const,
          square: options.source.square,
        })
      : Object.freeze({
          kind: 'spare' as const,
          spareId: options.source.spareId,
        });
  return Object.freeze({
    basePositionRevision: options.basePositionRevision,
    boardId: options.boardId,
    piece: Object.freeze({
      ...(options.piece.id === undefined ? {} : { id: options.piece.id }),
      pieceType: options.piece.pieceType,
    }),
    source,
  }) as Readonly<PieceInteractionContext>;
}

export interface PieceInteractionEmitter {
  readonly dispose: () => void;
  readonly emitDragStart: (
    context: Readonly<PieceInteractionContext>,
  ) => boolean;
  readonly emitPress: (context: Readonly<PieceInteractionContext>) => boolean;
  readonly setHandlers: (handlers: {
    readonly onPieceDragStart?: OnPieceDragStart;
    readonly onPiecePress?: OnPiecePress;
  }) => void;
}

/** Create one board-scoped, exception-isolated observational callback sink. */
export function createPieceInteractionEmitter(
  boardId: string,
): PieceInteractionEmitter {
  let onPieceDragStart: OnPieceDragStart | undefined;
  let onPiecePress: OnPiecePress | undefined;
  let disposed = false;

  const emit = (
    handler: OnPiecePress | OnPieceDragStart | undefined,
    context: Readonly<PieceInteractionContext>,
  ): boolean => {
    if (disposed || handler === undefined || context.boardId !== boardId) {
      return false;
    }
    const detached = createPieceInteractionContext(context);
    try {
      handler(detached);
    } catch {
      // Observational callbacks cannot break the authoritative input runtime.
    }
    return true;
  };

  return Object.freeze({
    dispose: (): void => {
      disposed = true;
      onPieceDragStart = undefined;
      onPiecePress = undefined;
    },
    emitDragStart: (context: Readonly<PieceInteractionContext>): boolean =>
      emit(onPieceDragStart, context),
    emitPress: (context: Readonly<PieceInteractionContext>): boolean =>
      emit(onPiecePress, context),
    setHandlers: (handlers: {
      readonly onPieceDragStart?: OnPieceDragStart;
      readonly onPiecePress?: OnPiecePress;
    }): void => {
      if (disposed) {
        return;
      }
      onPieceDragStart =
        typeof handlers.onPieceDragStart === 'function'
          ? handlers.onPieceDragStart
          : undefined;
      onPiecePress =
        typeof handlers.onPiecePress === 'function'
          ? handlers.onPiecePress
          : undefined;
    },
  });
}
