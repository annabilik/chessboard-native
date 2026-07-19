import { defaultAnnotationStyle } from '../annotation-style';
import type { ChessboardProps } from '../Chessboard';
import { applyAnnotationOperation } from '../core/annotation-operations';
import type {
  AnnotationOperation,
  ArrowAnnotation,
  ChessboardStyles,
  MoveIntent,
  PieceData,
  PieceInteractionContext,
  SquareActivationIntent,
  SquarePressContext,
} from '../public-types';
import type { ReactChessboardArrow, ReactChessboardOptions } from './types';

export const REACT_CHESSBOARD_DEFAULT_POSITION =
  'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR';

const EMPTY_OPTIONS: Readonly<ReactChessboardOptions> = Object.freeze({});
const EMPTY_POSITION = Object.freeze({});
const EMPTY_ARROWS: readonly Readonly<ReactChessboardArrow>[] = Object.freeze(
  [],
);
const UNSUPPORTED_OPTIONS = Object.freeze([
  'allowAutoScroll',
  'onMouseOutSquare',
  'onMouseOverSquare',
  'onSquareRightClick',
] as const);

export interface ReactChessboardArrowEntry {
  readonly annotation: Readonly<ArrowAnnotation>;
  readonly arrow: Readonly<ReactChessboardArrow>;
}

function requireNonEmptyString(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`${name} must be a non-empty string.`);
  }
  return value;
}

function copyArrow(
  value: unknown,
  index: number,
): Readonly<ReactChessboardArrow> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError(`arrows[${String(index)}] must be an arrow object.`);
  }
  const arrow = value as Readonly<Record<string, unknown>>;
  return Object.freeze({
    color: requireNonEmptyString(
      arrow['color'],
      `arrows[${String(index)}].color`,
    ),
    endSquare: requireNonEmptyString(
      arrow['endSquare'],
      `arrows[${String(index)}].endSquare`,
    ),
    startSquare: requireNonEmptyString(
      arrow['startSquare'],
      `arrows[${String(index)}].startSquare`,
    ),
  });
}

function encodeIdPart(value: string): string {
  return `${String(value.length)}:${value}`;
}

function arrowIdentity(arrow: Readonly<ReactChessboardArrow>): string {
  return [arrow.startSquare, arrow.endSquare, arrow.color]
    .map(encodeIdPart)
    .join('|');
}

/** Pure, deterministic conversion from controlled compatibility arrows. */
export function mapReactChessboardArrows(
  value: unknown,
): readonly Readonly<ReactChessboardArrowEntry>[] {
  if (!Array.isArray(value)) {
    throw new TypeError('arrows must be an array.');
  }
  const occurrences = new Map<string, number>();
  const entries = (value as readonly unknown[]).map((candidate, index) => {
    const arrow = copyArrow(candidate, index);
    const identity = arrowIdentity(arrow);
    const occurrence = occurrences.get(identity) ?? 0;
    occurrences.set(identity, occurrence + 1);
    const id = `react-chessboard-compat:arrow:${identity}:${String(occurrence)}`;
    return Object.freeze({
      annotation: Object.freeze({
        color: arrow.color,
        from: arrow.startSquare,
        id,
        to: arrow.endSquare,
        type: 'arrow' as const,
      }),
      arrow,
    });
  });
  return Object.freeze(entries);
}

function arrowFromAnnotation(
  annotation: Readonly<ArrowAnnotation>,
): Readonly<ReactChessboardArrow> {
  return Object.freeze({
    color: annotation.color,
    endSquare: annotation.to,
    startSquare: annotation.from,
  });
}

/** Reduce one native delta without retaining or committing an arrow list. */
export function applyReactChessboardArrowOperation(
  entries: readonly Readonly<ReactChessboardArrowEntry>[],
  operation: Readonly<AnnotationOperation>,
): readonly Readonly<ReactChessboardArrow>[] | null {
  const result = applyAnnotationOperation({
    boardId: operation.boardId,
    current: Object.freeze({
      revision: operation.baseAnnotationRevision,
      value: Object.freeze(entries.map((entry) => entry.annotation)),
    }),
    operation,
  });
  if (result.status !== 'applied') {
    return null;
  }
  const arrows: Readonly<ReactChessboardArrow>[] = [];
  for (const annotation of result.next.value) {
    if (annotation.type !== 'arrow') {
      return null;
    }
    arrows.push(arrowFromAnnotation(annotation));
  }
  return Object.freeze(arrows);
}

function pieceData(
  piece: Readonly<PieceData> | null,
): Readonly<{ readonly pieceType: string }> | null {
  return piece === null ? null : Object.freeze({ pieceType: piece.pieceType });
}

function pieceHandlerArgs(
  context: Readonly<PieceInteractionContext>,
  spareSquare: 'piece-type' | 'null',
) {
  return Object.freeze({
    isSparePiece: context.source.kind === 'spare',
    piece: Object.freeze({ pieceType: context.piece.pieceType }),
    square:
      context.source.kind === 'board'
        ? context.source.square
        : spareSquare === 'piece-type'
          ? context.piece.pieceType
          : null,
  });
}

function squareHandlerArgs(
  context: Readonly<SquareActivationIntent | SquarePressContext>,
) {
  return Object.freeze({
    piece: pieceData(context.piece),
    square: context.square,
  });
}

function dropHandlerArgs(intent: Readonly<MoveIntent>) {
  const sourceSquare =
    intent.source.kind === 'board'
      ? intent.source.square
      : intent.piece.pieceType;
  return Object.freeze({
    piece: Object.freeze({
      isSparePiece: intent.source.kind === 'spare',
      pieceType: intent.piece.pieceType,
      position: sourceSquare,
    }),
    sourceSquare,
    targetSquare: intent.targetSquare,
  });
}

function assertUnsupportedOptionsAbsent(
  options: Readonly<ReactChessboardOptions>,
): void {
  const record = options as Readonly<Record<string, unknown>>;
  for (const name of UNSUPPORTED_OPTIONS) {
    if (record[name] !== undefined) {
      throw new TypeError(
        `react-chessboard compatibility option "${name}" is unavailable on React Native.`,
      );
    }
  }
}

function createStyles(
  options: Readonly<ReactChessboardOptions>,
): Readonly<ChessboardStyles> {
  return Object.freeze({
    ...(options.boardStyle === undefined ? {} : { board: options.boardStyle }),
    ...(options.squareStyle === undefined
      ? {}
      : { square: options.squareStyle }),
    ...(options.lightSquareStyle === undefined
      ? {}
      : { lightSquare: options.lightSquareStyle }),
    ...(options.darkSquareStyle === undefined
      ? {}
      : { darkSquare: options.darkSquareStyle }),
    ...(options.dropSquareStyle === undefined
      ? {}
      : { dropTarget: options.dropSquareStyle }),
    ...(options.draggingPieceStyle === undefined
      ? {}
      : { draggingPiece: options.draggingPieceStyle }),
    ...(options.draggingPieceGhostStyle === undefined
      ? {}
      : { draggingPieceGhost: options.draggingPieceGhostStyle }),
    ...(options.lightSquareNotationStyle === undefined
      ? {}
      : { lightSquareNotation: options.lightSquareNotationStyle }),
    ...(options.darkSquareNotationStyle === undefined
      ? {}
      : { darkSquareNotation: options.darkSquareNotationStyle }),
    ...(options.alphaNotationStyle === undefined
      ? {}
      : { fileNotation: options.alphaNotationStyle }),
    ...(options.numericNotationStyle === undefined
      ? {}
      : { rankNotation: options.numericNotationStyle }),
  });
}

/** Translate the familiar options object into the primary controlled API. */
export function createReactChessboardProps(
  value?: Readonly<ReactChessboardOptions>,
): ChessboardProps {
  const options = value ?? EMPTY_OPTIONS;
  assertUnsupportedOptionsAbsent(options);
  const arrowEntries = mapReactChessboardArrows(options.arrows ?? EMPTY_ARROWS);
  const onArrowsChange = options.onArrowsChange;
  const onPieceDrop = options.onPieceDrop;
  const rows = options.chessboardRows ?? 8;
  const columns = options.chessboardColumns ?? 8;
  const annotations = Object.freeze(
    arrowEntries.map((entry) => entry.annotation),
  );

  return {
    annotations,
    boardId: options.id ?? 'chessboard',
    dimensions: Object.freeze({ columns, rows }),
    gesture: Object.freeze({
      activationDistance: options.dragActivationDistance ?? 1,
      allowDragOffBoard: options.allowDragOffBoard ?? true,
    }),
    orientation: options.boardOrientation ?? 'white',
    position:
      options.position ??
      (rows === 8 && columns === 8
        ? REACT_CHESSBOARD_DEFAULT_POSITION
        : EMPTY_POSITION),
    reduceMotion: options.showAnimations === false ? 'always' : 'system',
    showNotation: options.showNotation ?? true,
    styles: createStyles(options),
    transitionDurationMs: options.animationDurationInMs ?? 300,
    ...(options.arrowOptions === undefined
      ? {}
      : { annotationStyle: options.arrowOptions }),
    ...(onArrowsChange === undefined
      ? {}
      : {
          annotationPolicies: Object.freeze({
            clearOnBoardPress: options.clearArrowsOnClick ?? true,
            clearOnPositionChange: options.clearArrowsOnPositionChange ?? true,
          }),
          onAnnotationOperation: (operation: Readonly<AnnotationOperation>) => {
            const arrows = applyReactChessboardArrowOperation(
              arrowEntries,
              operation,
            );
            if (arrows !== null) {
              onArrowsChange(Object.freeze({ arrows }));
            }
          },
          ...(options.allowDrawingArrows === false
            ? {}
            : {
                annotationTool: Object.freeze({
                  color:
                    options.arrowOptions?.color ?? defaultAnnotationStyle.color,
                  type: 'arrow' as const,
                }),
              }),
        }),
    ...(onPieceDrop === undefined
      ? {}
      : {
          interactionPermissions: Object.freeze({
            accessibility: true,
            drag: options.allowDragging ?? true,
          }),
          onMoveRequest: (intent: Readonly<MoveIntent>) => {
            try {
              const accepted: unknown = onPieceDrop(dropHandlerArgs(intent));
              return accepted === true
                ? Object.freeze({ status: 'accepted' as const })
                : Object.freeze({ status: 'rejected' as const });
            } catch {
              return Object.freeze({ status: 'rejected' as const });
            }
          },
        }),
    ...(options.canDragPiece === undefined
      ? {}
      : {
          canDragPiece: (context: Readonly<PieceInteractionContext>) =>
            options.canDragPiece?.(pieceHandlerArgs(context, 'piece-type')) ===
            true,
        }),
    ...(options.onPieceClick === undefined
      ? {}
      : {
          onPiecePress: (context: Readonly<PieceInteractionContext>) => {
            options.onPieceClick?.(pieceHandlerArgs(context, 'piece-type'));
          },
        }),
    ...(options.onPieceDrag === undefined
      ? {}
      : {
          onPieceDragStart: (context: Readonly<PieceInteractionContext>) => {
            options.onPieceDrag?.(pieceHandlerArgs(context, 'null'));
          },
        }),
    ...(options.onSquareClick === undefined
      ? {}
      : {
          onSquareActivate: (context: Readonly<SquareActivationIntent>) => {
            options.onSquareClick?.(squareHandlerArgs(context));
          },
        }),
    ...(options.onSquareMouseDown === undefined
      ? {}
      : {
          onSquarePressIn: (context: Readonly<SquarePressContext>) => {
            options.onSquareMouseDown?.(squareHandlerArgs(context));
          },
        }),
    ...(options.onSquareMouseUp === undefined
      ? {}
      : {
          onSquarePressOut: (context: Readonly<SquarePressContext>) => {
            options.onSquareMouseUp?.(squareHandlerArgs(context));
          },
        }),
    ...(options.pieces === undefined ? {} : { pieceRenderers: options.pieces }),
    ...(options.squareRenderer === undefined
      ? {}
      : { renderSquare: options.squareRenderer }),
    ...(options.squareStyles === undefined
      ? {}
      : { squareStyles: options.squareStyles }),
  };
}
