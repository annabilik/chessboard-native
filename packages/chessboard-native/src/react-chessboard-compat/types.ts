import type { StyleProp, TextStyle, ViewStyle } from 'react-native';

import type {
  AnnotationStyle,
  BoardOrientation,
  PieceRenderers,
  PieceType,
  SquareRenderer,
  SquareStyles,
} from '../public-types';

/** Upstream-shaped arrow value used by the compatibility options object. @public */
export interface ReactChessboardArrow {
  readonly startSquare: string;
  readonly endSquare: string;
  readonly color: string;
}

/** Upstream-shaped piece payload. Stable native actor IDs stay intentionally absent. @public */
export interface ReactChessboardPieceData {
  readonly pieceType: PieceType;
}

/** Sparse upstream-shaped object position accepted by the compatibility adapter. @public */
export type ReactChessboardPosition = Readonly<
  Partial<Record<string, Readonly<ReactChessboardPieceData>>>
>;

/** Native square callback payload corresponding to upstream square handlers. @public */
export interface ReactChessboardSquareHandlerArgs {
  readonly piece: Readonly<ReactChessboardPieceData> | null;
  readonly square: string;
}

/** Native piece callback payload corresponding to upstream piece handlers. @public */
export interface ReactChessboardPieceHandlerArgs {
  readonly isSparePiece: boolean;
  readonly piece: Readonly<ReactChessboardPieceData>;
  readonly square: string | null;
}

/** Upstream-shaped active drag payload used by the Boolean drop callback. @public */
export interface ReactChessboardDraggingPieceData {
  readonly isSparePiece: boolean;
  readonly position: string;
  readonly pieceType: PieceType;
}

/** Upstream-shaped Boolean drop callback payload. @public */
export interface ReactChessboardPieceDropHandlerArgs {
  readonly piece: Readonly<ReactChessboardDraggingPieceData>;
  readonly sourceSquare: string;
  readonly targetSquare: string | null;
}

/**
 * React Native compatibility options using the pinned react-chessboard 5.10
 * property names.
 *
 * Values that depend on the DOM use their native equivalents. Pointer hover,
 * right-click, and ancestor auto-scroll are deliberately unavailable. Position
 * and arrows remain controlled inputs; callbacks never mutate either value.
 *
 * @public
 */
export interface ReactChessboardOptions {
  readonly id?: string;

  readonly pieces?: PieceRenderers;
  readonly position?: string | ReactChessboardPosition;

  readonly boardOrientation?: BoardOrientation;
  readonly chessboardRows?: number;
  readonly chessboardColumns?: number;

  readonly boardStyle?: StyleProp<ViewStyle>;
  readonly squareStyle?: StyleProp<ViewStyle>;
  readonly squareStyles?: SquareStyles;
  readonly darkSquareStyle?: StyleProp<ViewStyle>;
  readonly lightSquareStyle?: StyleProp<ViewStyle>;
  readonly dropSquareStyle?: StyleProp<ViewStyle>;
  readonly draggingPieceStyle?: StyleProp<ViewStyle>;
  readonly draggingPieceGhostStyle?: StyleProp<ViewStyle>;

  readonly darkSquareNotationStyle?: StyleProp<TextStyle>;
  readonly lightSquareNotationStyle?: StyleProp<TextStyle>;
  readonly alphaNotationStyle?: StyleProp<TextStyle>;
  readonly numericNotationStyle?: StyleProp<TextStyle>;
  readonly showNotation?: boolean;

  readonly animationDurationInMs?: number;
  readonly showAnimations?: boolean;

  readonly allowDragging?: boolean;
  readonly allowDragOffBoard?: boolean;
  /** Ancestor auto-scroll discovery is intentionally unavailable on native. */
  readonly allowAutoScroll?: never;
  readonly dragActivationDistance?: number;

  readonly allowDrawingArrows?: boolean;
  readonly arrows?: readonly Readonly<ReactChessboardArrow>[];
  readonly arrowOptions?: Readonly<AnnotationStyle>;
  readonly clearArrowsOnClick?: boolean;
  readonly clearArrowsOnPositionChange?: boolean;

  readonly canDragPiece?: (
    args: Readonly<ReactChessboardPieceHandlerArgs>,
  ) => boolean;
  readonly onArrowsChange?: (args: {
    readonly arrows: readonly Readonly<ReactChessboardArrow>[];
  }) => void;
  readonly onPieceClick?: (
    args: Readonly<ReactChessboardPieceHandlerArgs>,
  ) => void;
  readonly onPieceDrag?: (
    args: Readonly<ReactChessboardPieceHandlerArgs>,
  ) => void;
  readonly onPieceDrop?: (
    args: Readonly<ReactChessboardPieceDropHandlerArgs>,
  ) => boolean;
  readonly onSquareClick?: (
    args: Readonly<ReactChessboardSquareHandlerArgs>,
  ) => void;
  /** Native press-in callback; no React.MouseEvent is manufactured. */
  readonly onSquareMouseDown?: (
    args: Readonly<ReactChessboardSquareHandlerArgs>,
  ) => void;
  /** Native press-out callback; no React.MouseEvent is manufactured. */
  readonly onSquareMouseUp?: (
    args: Readonly<ReactChessboardSquareHandlerArgs>,
  ) => void;

  /** Pointer hover is intentionally unavailable in the native 1.0 target. */
  readonly onMouseOutSquare?: never;
  /** Pointer hover is intentionally unavailable in the native 1.0 target. */
  readonly onMouseOverSquare?: never;
  /** Native annotation gestures replace right-click. */
  readonly onSquareRightClick?: never;

  readonly squareRenderer?: SquareRenderer;
}

/** Props for the compatibility-subpath Chessboard component. @public */
export interface ReactChessboardProps {
  readonly options?: Readonly<ReactChessboardOptions>;
}
