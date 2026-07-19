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
  /** Canonical source square. */
  readonly startSquare: string;
  /** Canonical destination square. */
  readonly endSquare: string;
  /** Native color used to paint the arrow. */
  readonly color: string;
}

/** Upstream-shaped piece payload. Stable native actor IDs stay intentionally absent. @public */
export interface ReactChessboardPieceData {
  /** Piece renderer key. */
  readonly pieceType: PieceType;
}

/** Sparse upstream-shaped object position accepted by the compatibility adapter. @public */
export type ReactChessboardPosition = Readonly<
  Partial<Record<string, Readonly<ReactChessboardPieceData>>>
>;

/** Native square callback payload corresponding to upstream square handlers. @public */
export interface ReactChessboardSquareHandlerArgs {
  /** Detached piece at the square, or null when it is empty. */
  readonly piece: Readonly<ReactChessboardPieceData> | null;
  /** Canonical square that emitted the callback. */
  readonly square: string;
}

/** Native piece callback payload corresponding to upstream piece handlers. @public */
export interface ReactChessboardPieceHandlerArgs {
  /** Whether the piece originates from a provider spare source. */
  readonly isSparePiece: boolean;
  /** Detached current piece payload. */
  readonly piece: Readonly<ReactChessboardPieceData>;
  /**
   * Canonical square for a board source. For a spare source, `canDragPiece`
   * and `onPieceClick` receive the piece type as an upstream-compatible
   * pseudo-square, while `onPieceDrag` receives null.
   */
  readonly square: string | null;
}

/** Upstream-shaped active drag payload used by the Boolean drop callback. @public */
export interface ReactChessboardDraggingPieceData {
  /** Whether the active source is an external spare. */
  readonly isSparePiece: boolean;
  /**
   * Canonical board source square, or the spare piece type used as an
   * upstream-compatible pseudo-square for a spare source.
   */
  readonly position: string;
  /** Piece renderer key. */
  readonly pieceType: PieceType;
}

/** Upstream-shaped Boolean drop callback payload. @public */
export interface ReactChessboardPieceDropHandlerArgs {
  /** Detached active piece and source description. */
  readonly piece: Readonly<ReactChessboardDraggingPieceData>;
  /**
   * Canonical board source square, or the spare piece type used as an
   * upstream-compatible pseudo-square for a spare source.
   */
  readonly sourceSquare: string;
  /** Canonical destination square, or null for an off-board drop. */
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
  /** Stable board identity; defaults to `chessboard`. */
  readonly id?: string;

  /** Whole-map native piece renderer replacement. */
  readonly pieces?: PieceRenderers;
  /** Controlled position; defaults to the starting 8x8 position. */
  readonly position?: string | ReactChessboardPosition;

  /** Visual orientation; defaults to white at the bottom. */
  readonly boardOrientation?: BoardOrientation;
  /** Number of canonical ranks; defaults to 8. */
  readonly chessboardRows?: number;
  /** Number of canonical files; defaults to 8. */
  readonly chessboardColumns?: number;

  /** Native root-board paint. */
  readonly boardStyle?: StyleProp<ViewStyle>;
  /** Native base paint shared by every square. */
  readonly squareStyle?: StyleProp<ViewStyle>;
  /** Native per-square paint keyed by canonical square ID. */
  readonly squareStyles?: SquareStyles;
  /** Native paint layered onto dark squares. */
  readonly darkSquareStyle?: StyleProp<ViewStyle>;
  /** Native paint layered onto light squares. */
  readonly lightSquareStyle?: StyleProp<ViewStyle>;
  /** Native paint for the current drag target. */
  readonly dropSquareStyle?: StyleProp<ViewStyle>;
  /** Native paint for the active drag overlay. */
  readonly draggingPieceStyle?: StyleProp<ViewStyle>;
  /** Native paint for the active source ghost. */
  readonly draggingPieceGhostStyle?: StyleProp<ViewStyle>;

  /** Native notation paint on dark squares. */
  readonly darkSquareNotationStyle?: StyleProp<TextStyle>;
  /** Native notation paint on light squares. */
  readonly lightSquareNotationStyle?: StyleProp<TextStyle>;
  /** Native file-label typography and placement. */
  readonly alphaNotationStyle?: StyleProp<TextStyle>;
  /** Native rank-label typography and placement. */
  readonly numericNotationStyle?: StyleProp<TextStyle>;
  /** Show decorative file and rank labels; defaults to true. */
  readonly showNotation?: boolean;

  /** Controlled-position transition duration in milliseconds; defaults to 300. */
  readonly animationDurationInMs?: number;
  /** Enable controlled-position transitions; defaults to true. */
  readonly showAnimations?: boolean;

  /** Enable move drag input when `onPieceDrop` is supplied; defaults to true. */
  readonly allowDragging?: boolean;
  /** Allow the active overlay center to leave the board; defaults to true. */
  readonly allowDragOffBoard?: boolean;
  /** Ancestor auto-scroll discovery is intentionally unavailable on native. */
  readonly allowAutoScroll?: never;
  /** Native drag activation distance in points; defaults to 1. */
  readonly dragActivationDistance?: number;

  /** Enable native arrow input when `onArrowsChange` is supplied; defaults to true. */
  readonly allowDrawingArrows?: boolean;
  /** Current controlled arrow collection. */
  readonly arrows?: readonly Readonly<ReactChessboardArrow>[];
  /** Whole-value native arrow geometry and presentation configuration. */
  readonly arrowOptions?: Readonly<AnnotationStyle>;
  /** Request controlled arrow clearing on board press; defaults to true. */
  readonly clearArrowsOnClick?: boolean;
  /** Request controlled arrow clearing after position changes; defaults to true. */
  readonly clearArrowsOnPositionChange?: boolean;

  /** Current-snapshot permission callback for board or spare dragging. */
  readonly canDragPiece?: (
    args: Readonly<ReactChessboardPieceHandlerArgs>,
  ) => boolean;
  /** Receives a proposed complete arrow array without committing it. */
  readonly onArrowsChange?: (args: {
    readonly arrows: readonly Readonly<ReactChessboardArrow>[];
  }) => void;
  /** Observes one current native piece activation. */
  readonly onPieceClick?: (
    args: Readonly<ReactChessboardPieceHandlerArgs>,
  ) => void;
  /** Observes one current native piece drag activation. */
  readonly onPieceDrag?: (
    args: Readonly<ReactChessboardPieceHandlerArgs>,
  ) => void;
  /** Accepts or rejects a move request without committing the position. */
  readonly onPieceDrop?: (
    args: Readonly<ReactChessboardPieceDropHandlerArgs>,
  ) => boolean;
  /** Observes one native square activation. */
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

  /** Visual-only native square renderer. */
  readonly squareRenderer?: SquareRenderer;
}

/** Props for the compatibility-subpath Chessboard component. @public */
export interface ReactChessboardProps {
  /** Familiar react-chessboard options adapted to native controlled behavior. */
  readonly options?: Readonly<ReactChessboardOptions>;
}
