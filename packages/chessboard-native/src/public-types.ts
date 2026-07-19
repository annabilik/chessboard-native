import type { JSXElementConstructor, ReactElement } from 'react';
import type { StyleProp, TextStyle, ViewStyle } from 'react-native';

/**
 * Monotonic consumer-owned snapshot revision.
 *
 * Revisions are non-negative safe integers. A changed semantic snapshot must
 * receive a greater revision; an explicit no-op commit may do the same.
 *
 * @public
 */
export type Revision = number;

/**
 * Canonical lowercase square name from `a1` through `z99`.
 *
 * Orientation never changes a square ID.
 *
 * @public
 */
export type SquareId = string;

/**
 * Open piece vocabulary. The bundled chess vocabulary is `wP` through `bK`.
 *
 * @public
 */
export type PieceType = string;

/** Standard single-character piece codes accepted by FEN piece placement. @public */
export type FenPieceCode =
  'p' | 'r' | 'n' | 'b' | 'q' | 'k' | 'P' | 'R' | 'N' | 'B' | 'Q' | 'K';

/** Consumer-owned piece data. @public */
export interface PieceData {
  /** Piece renderer key. */
  readonly pieceType: PieceType;
  /** Optional stable identity, unique within one position. */
  readonly id?: string;
}

/** Deeply readonly sparse position keyed by canonical square IDs. @public */
export type PositionObject = Readonly<
  Partial<Record<SquareId, Readonly<PieceData>>>
>;

/**
 * FEN piece placement for an 8x8 board, or an object position for any supported
 * dimensions.
 *
 * @public
 */
export type PositionInput = string | PositionObject;

/** Supported board dimensions: 1..99 rows and 1..26 columns. @public */
export interface BoardDimensions {
  readonly rows: number;
  readonly columns: number;
}

/** Board-local coordinates measured from the top-left of the board. @public */
export interface BoardPoint {
  readonly x: number;
  readonly y: number;
}

/** Positive measured content size of a board. @public */
export interface BoardSize {
  readonly width: number;
  readonly height: number;
}

/** White-at-bottom or black-at-bottom presentation. @public */
export type BoardOrientation = 'white' | 'black';

/**
 * Presentation-only actor correlation for one exact controlled revision pair.
 * The hint never changes position state or asks the board to validate chess
 * rules.
 *
 * @public
 */
export interface BoardTransition {
  /** Exact previous controlled position revision. */
  readonly fromRevision: Revision;
  /** Exact enclosing controlled position revision. */
  readonly toRevision: Revision;
  /** Primary actor square in `fromRevision`. */
  readonly from: SquareId;
  /** Primary actor square in `toRevision`. */
  readonly to: SquareId;
  /** Required target type when the primary actor changes type; omit otherwise. */
  readonly promotion?: PieceType;
  /** Actor square removed or replaced from `fromRevision`, including off-target captures. */
  readonly capturedSquare?: SquareId;
  /** Optional second continuing actor, used for coordinated moves such as castling. */
  readonly rookMove?: Readonly<{ from: SquareId; to: SquareId }>;
}

/** Revisioned position envelope for commit correlation and transition hints. @public */
export interface ControlledPosition {
  readonly value: PositionInput;
  readonly revision: Revision;
  readonly committedIntentId?: string;
  readonly transition?: BoardTransition;
}

/** Plain controlled selection presentation. @public */
export interface PlainSelection {
  readonly selectedSquare: SquareId | null;
  readonly destinationSquares?: readonly SquareId[];
  readonly disabledSquares?: readonly SquareId[];
  /** Discriminates this plain form from a revisioned selection. */
  readonly revision?: never;
}

/** Revisioned controlled selection presentation with an inline revision. @public */
export interface ControlledSelection {
  readonly selectedSquare: SquareId | null;
  readonly destinationSquares?: readonly SquareId[];
  readonly disabledSquares?: readonly SquareId[];
  readonly revision: Revision;
}

/** Position prop accepted by the plain and revisioned API tiers. @public */
export type PositionProp = PositionInput | ControlledPosition;

/** Selection prop accepted by the plain and revisioned API tiers. @public */
export type SelectionProp = PlainSelection | ControlledSelection;

/** Board or provider spare source for move intents and piece visuals. @public */
export type MoveSource =
  | { readonly kind: 'board'; readonly square: SquareId }
  | { readonly kind: 'spare'; readonly spareId: string };

/** Input modality that created a move intent. @public */
export type MoveInput = 'drag' | 'tap' | 'keyboard' | 'accessibility';

/** A request to change consumer-owned position state. @public */
export interface MoveIntent {
  readonly intentId: string;
  readonly boardId: string;
  readonly basePositionRevision: Revision;
  readonly source: MoveSource;
  readonly targetSquare: SquareId | null;
  readonly piece: PieceData;
  readonly input: MoveInput;
}

/** Validation result for a move request; it never commits position state. @public */
export type MoveDecision =
  | { readonly status: 'accepted' }
  | { readonly status: 'rejected'; readonly reason?: string };

/** Cancellable consumer validation callback for a move intent. @public */
export type OnMoveRequest = (
  intent: MoveIntent,
  context: { signal: AbortSignal },
) => MoveDecision | Promise<MoveDecision>;

/** Decision and controlled-commit timeout budgets, in milliseconds. @public */
export interface MoveRequestTimeouts {
  /** Defaults to 10,000 ms. */
  readonly decisionMs: number;
  /** Defaults to 1,500 ms after acceptance. */
  readonly commitMs: number;
}

/** Input gates for the public controlled move-request surface. @public */
export interface InteractionPermissions {
  /** Enables board and targeted spare drag input; defaults to true with a callback. */
  readonly drag?: boolean;
  /**
   * Enables the adjustable control's source, target, remove, and cancel actions.
   * This also gates destination-to-move routing for accessibility activation.
   * Defaults to true. Drag also fails closed when this is false so the board
   * cannot expose a drag-only move path. Touch activation remains available.
   */
  readonly accessibility?: boolean;
}

/** Native gesture-recognition tuning shared by a board and targeted spares. @public */
export interface ChessboardGestureOptions {
  /** Activation distance in native points; defaults to 4. */
  readonly activationDistance?: number;
}

/** Consumer-owned arrow annotation. @public */
export interface ArrowAnnotation {
  /**
   * Stable logical identity, unique within a collection and never recycled
   * within one controlled annotation revision lineage.
   */
  readonly id: string;
  readonly type: 'arrow';
  readonly from: SquareId;
  readonly to: SquareId;
  readonly color: string;
  /** Optional stroke width in the fixed 2048-wide annotation coordinate space. */
  readonly width?: number;
  readonly opacity?: number;
  readonly shape?: 'straight' | 'knight';
  readonly layer?: 'belowPieces' | 'abovePieces';
}

/** Consumer-owned square annotation. @public */
export interface SquareAnnotation {
  /**
   * Stable logical identity, unique within a collection and never recycled
   * within one controlled annotation revision lineage.
   */
  readonly id: string;
  readonly type: 'square';
  readonly square: SquareId;
  readonly color: string;
  readonly shape?: 'fill' | 'circle' | 'dot' | 'border';
  readonly layer?: 'belowPieces' | 'abovePieces';
}

/** Persistent consumer-owned board annotation. @public */
export type BoardAnnotation = ArrowAnnotation | SquareAnnotation;

/** Transient annotation candidate that cannot carry a persistent consumer ID. @public */
export type AnnotationDraft =
  | {
      readonly id?: never;
      readonly type: 'arrow';
      readonly from: SquareId;
      readonly to: SquareId;
      readonly color: string;
      /** Optional stroke width in the fixed 2048-wide annotation coordinate space. */
      readonly width?: number;
      readonly opacity?: number;
      readonly shape?: 'straight' | 'knight';
      readonly layer?: 'belowPieces' | 'abovePieces';
    }
  | {
      readonly id?: never;
      readonly type: 'square';
      readonly square: SquareId;
      readonly color: string;
      readonly shape?: 'fill' | 'circle' | 'dot' | 'border';
      readonly layer?: 'belowPieces' | 'abovePieces';
    };

/** Revisioned controlled annotation collection. @public */
export interface ControlledAnnotations {
  readonly value: readonly BoardAnnotation[];
  readonly revision: Revision;
}

/** Annotation prop accepted by the plain and revisioned API tiers. @public */
export type AnnotationsProp =
  readonly BoardAnnotation[] | ControlledAnnotations;

/** Correlation shared by every annotation delta. @public */
export interface AnnotationOperationBase {
  readonly operationId: string;
  readonly boardId: string;
  readonly baseAnnotationRevision: Revision;
  readonly input: 'touch' | 'keyboard' | 'accessibility' | 'policy';
}

/**
 * A revision-correlated annotation delta. Operations never replace the whole
 * controlled collection.
 *
 * @public
 */
export type AnnotationOperation =
  | (AnnotationOperationBase & {
      readonly type: 'add';
      /** Stable identity assigned to the persistent annotation if applied. */
      readonly annotationId: string;
      readonly annotation: AnnotationDraft;
    })
  | (AnnotationOperationBase & {
      readonly type: 'toggle';
      /** Stable identity assigned only when this toggle was an add at its base. */
      readonly annotationId: string;
      readonly annotation: AnnotationDraft;
      readonly matchingIdsAtBase: readonly string[];
    })
  | (AnnotationOperationBase & {
      readonly type: 'remove';
      readonly annotationId: string;
    })
  | (AnnotationOperationBase & {
      readonly type: 'clear';
      readonly annotationIdsAtBase: readonly string[];
      readonly reason: 'board-press' | 'position-change' | 'consumer-action';
    });

/** Independent policies that request controlled annotation deltas. @public */
export interface AnnotationPolicies {
  /** Request removal of annotations observed when the board is pressed. */
  readonly clearOnBoardPress?: boolean;
  /** Request removal of annotations observed after a position revision changes. */
  readonly clearOnPositionChange?: boolean;
}

/**
 * Synchronous notification for one immutable annotation delta.
 *
 * The callback result is ignored. Only a subsequently published `annotations`
 * prop can commit the requested change.
 *
 * @public
 */
export type OnAnnotationOperation = (
  operation: Readonly<AnnotationOperation>,
) => void;

/** Consumer-selected annotation presentation tool. @public */
export type AnnotationTool =
  | {
      readonly type: 'arrow';
      readonly color: string;
      /** Optional stroke width in the fixed 2048-wide annotation coordinate space. */
      readonly width?: number;
      readonly opacity?: number;
    }
  | {
      readonly type: 'square';
      readonly color: string;
      readonly shape?: 'fill' | 'circle' | 'dot' | 'border';
    }
  | null;

/** A consumer-owned square activation request. @public */
export interface SquareActivationIntent {
  readonly intentId: string;
  readonly boardId: string;
  readonly basePositionRevision: Revision;
  readonly baseSelectionRevision: Revision | null;
  readonly square: SquareId;
  readonly piece: PieceData | null;
  readonly selectedSquare: SquareId | null;
  readonly isDestination: boolean;
  readonly action: 'activate' | 'clear-selection';
  readonly input: 'touch' | 'keyboard' | 'accessibility';
}

/** Synchronous notification for one consumer-owned square activation. @public */
export type OnSquareActivate = (
  intent: Readonly<SquareActivationIntent>,
) => void;

/** Current controlled context captured when one native square press begins. @public */
export interface SquarePressContext {
  readonly boardId: string;
  readonly basePositionRevision: Revision;
  readonly square: SquareId;
  readonly piece: Readonly<PieceData> | null;
}

/** Non-committing notification when one current native square press begins. @public */
export type OnSquarePressIn = (context: Readonly<SquarePressContext>) => void;

/** Non-committing notification when one accepted native square press ends. @public */
export type OnSquarePressOut = (context: Readonly<SquarePressContext>) => void;

/** Derived logical square data used by visual renderers. @public */
export interface BoardSquare {
  readonly square: SquareId;
  readonly isLight: boolean;
}

/** Current controlled context for piece press and drag-start callbacks. @public */
export type PieceInteractionContext =
  | {
      readonly boardId: string;
      readonly basePositionRevision: Revision;
      readonly source: { readonly kind: 'board'; readonly square: SquareId };
      readonly piece: Readonly<PieceData>;
    }
  | {
      readonly boardId: string;
      readonly basePositionRevision: Revision;
      readonly source: { readonly kind: 'spare'; readonly spareId: string };
      readonly piece: Readonly<PieceData>;
    };

/** Non-committing notification for one current piece activation. @public */
export type OnPiecePress = (context: Readonly<PieceInteractionContext>) => void;

/** Non-committing notification after one current native drag activates. @public */
export type OnPieceDragStart = (
  context: Readonly<PieceInteractionContext>,
) => void;

/** Synchronous board or spare drag permission evaluated from current props. @public */
export type CanDragPiece = (
  context: Readonly<PieceInteractionContext>,
) => boolean;

/** Visual interaction flags for a square renderer. @public */
export interface SquareVisualState {
  readonly isSelected: boolean;
  readonly isDestination: boolean;
  readonly isDisabled: boolean;
  readonly isPressed: boolean;
  readonly isDropTarget: boolean;
  readonly isPendingSource: boolean;
  readonly isPendingTarget: boolean;
}

/** Visual interaction flags for a piece renderer. @public */
export interface PieceVisualState {
  readonly isPressed: boolean;
  readonly isDragging: boolean;
  readonly isGhost: boolean;
  readonly isPending: boolean;
  readonly isTransitioning: boolean;
}

/** Reusable visual defaults layered over the built-in native theme. @public */
export interface ChessboardTheme {
  /** Root paint; layout, border widths, and transforms are measurement-owned. */
  readonly board?: StyleProp<ViewStyle>;
  /** Base paint shared by every square. */
  readonly square?: StyleProp<ViewStyle>;
  /** Paint layered onto light squares. */
  readonly lightSquare?: StyleProp<ViewStyle>;
  /** Paint layered onto dark squares. */
  readonly darkSquare?: StyleProp<ViewStyle>;
  /** Controlled destination-square paint layered after canonical square styles. */
  readonly destinationSquare?: StyleProp<ViewStyle>;
  /** Controlled disabled-square paint layered after selected-square paint. */
  readonly disabledSquare?: StyleProp<ViewStyle>;
  /** Active drop-target paint layered after every other named square state. */
  readonly dropTarget?: StyleProp<ViewStyle>;
  /** Active drag-overlay paint layered after static piece paint. */
  readonly draggingPiece?: StyleProp<ViewStyle>;
  /** Active board or spare source-ghost paint layered after static piece paint. */
  readonly draggingPieceGhost?: StyleProp<ViewStyle>;
  /** Notation contrast layered onto light squares. */
  readonly lightSquareNotation?: StyleProp<TextStyle>;
  /** Notation contrast layered onto dark squares. */
  readonly darkSquareNotation?: StyleProp<TextStyle>;
  /** File-label typography and placement. */
  readonly fileNotation?: StyleProp<TextStyle>;
  /** Rank-label typography and placement. */
  readonly rankNotation?: StyleProp<TextStyle>;
  /** Static piece-host paint. */
  readonly piece?: StyleProp<ViewStyle>;
  /** Controlled selected-square paint layered after destination-square paint. */
  readonly selectedSquare?: StyleProp<ViewStyle>;
}

/** Per-instance visual overrides applied after the theme. @public */
export interface ChessboardStyles {
  /** Root paint; layout, border widths, and transforms are measurement-owned. */
  readonly board?: StyleProp<ViewStyle>;
  /** Base paint shared by every square. */
  readonly square?: StyleProp<ViewStyle>;
  /** Paint layered onto light squares. */
  readonly lightSquare?: StyleProp<ViewStyle>;
  /** Paint layered onto dark squares. */
  readonly darkSquare?: StyleProp<ViewStyle>;
  /** Controlled destination-square paint layered after canonical square styles. */
  readonly destinationSquare?: StyleProp<ViewStyle>;
  /** Controlled disabled-square paint layered after selected-square paint. */
  readonly disabledSquare?: StyleProp<ViewStyle>;
  /** Active drop-target paint layered after every other named square state. */
  readonly dropTarget?: StyleProp<ViewStyle>;
  /** Active drag-overlay paint layered after static piece paint. */
  readonly draggingPiece?: StyleProp<ViewStyle>;
  /** Active board or spare source-ghost paint layered after static piece paint. */
  readonly draggingPieceGhost?: StyleProp<ViewStyle>;
  /** Notation contrast layered onto light squares. */
  readonly lightSquareNotation?: StyleProp<TextStyle>;
  /** Notation contrast layered onto dark squares. */
  readonly darkSquareNotation?: StyleProp<TextStyle>;
  /** File-label typography and placement. */
  readonly fileNotation?: StyleProp<TextStyle>;
  /** Rank-label typography and placement. */
  readonly rankNotation?: StyleProp<TextStyle>;
  /** Static piece-host paint. */
  readonly piece?: StyleProp<ViewStyle>;
  /** Controlled selected-square paint layered after destination-square paint. */
  readonly selectedSquare?: StyleProp<ViewStyle>;
}

/** Declarative visual overrides keyed by canonical square ID. @public */
export type SquareStyles = Readonly<
  Partial<Record<SquareId, StyleProp<ViewStyle>>>
>;

/** Visual-only square renderer input; it intentionally exposes no handlers. @public */
export interface SquareRendererProps {
  readonly boardId: string;
  readonly square: SquareId;
  readonly piece: PieceData | null;
  readonly size: number;
  readonly state: SquareVisualState;
  readonly style: Readonly<ViewStyle>;
}

/** Visual-only piece renderer input; it intentionally exposes no handlers. @public */
export type PieceRendererProps = {
  /** Owning board, or the named target board for a spare-source visual. */
  readonly boardId: string;
  readonly piece: PieceData;
  readonly size: number;
  readonly state: PieceVisualState;
  readonly style: Readonly<ViewStyle>;
} & (
  | {
      /** Board source for a controlled piece visual. */
      readonly source: Extract<MoveSource, { readonly kind: 'board' }>;
      /** Current canonical board square for this visual. */
      readonly square: SquareId;
    }
  | {
      /** Provider spare source for an external or board-target visual. */
      readonly source: Extract<MoveSource, { readonly kind: 'spare' }>;
      /** Null outside a board; the current target square once projected on one. */
      readonly square: SquareId | null;
    }
);

/** Custom visual square renderer. @public */
export type SquareRenderer = (
  props: SquareRendererProps,
) => ReactElement | null;

/** Custom visual piece component. @public */
export type PieceRenderer = JSXElementConstructor<PieceRendererProps>;

/** Piece renderer lookup keyed by the open piece vocabulary. @public */
export type PieceRenderers = Readonly<
  Partial<Record<PieceType, PieceRenderer>>
>;

/**
 * Whole-value annotation geometry and presentation configuration.
 *
 * The three colors are defaults for future annotation tools. Persistent
 * controlled annotations always render their own required `color` value.
 *
 * @public
 */
export interface AnnotationStyle {
  /** Default color reserved for future consumer drawing tools. */
  readonly color: string;
  /** Secondary color reserved for future consumer drawing tools. */
  readonly secondaryColor: string;
  /** Tertiary color reserved for future consumer drawing tools. */
  readonly tertiaryColor: string;
  /** Target inset divisor relative to one square; must be greater than zero. */
  readonly arrowLengthReducerDenominator: number;
  /** Shared-target inset divisor relative to one square; must be greater than zero. */
  readonly sameTargetArrowLengthReducerDenominator: number;
  /** Default stroke-width divisor relative to one square; must be greater than zero. */
  readonly arrowWidthDenominator: number;
  /** Width multiplier reserved for a future active drawing draft; must be greater than zero. */
  readonly activeArrowWidthMultiplier: number;
  /** Default persistent-arrow opacity, clamped to the inclusive range 0..1. */
  readonly opacity: number;
  /** Opacity reserved for a future active drawing draft, clamped to 0..1. */
  readonly activeOpacity: number;
  /** Shaft start offset as a fraction of one square; zero starts at its center. */
  readonly arrowStartOffset: number;
}

/** Consumer preference for animation reduction. @public */
export type ReduceMotion = 'system' | 'always' | 'never';

/** Data supplied to the square accessibility value formatter. @public */
export interface SquareAccessibilityContext {
  readonly boardId: string;
  readonly orientation: BoardOrientation;
  readonly square: SquareId;
  readonly piece: PieceData | null;
  readonly isSelected: boolean;
  readonly isDisabled: boolean;
  readonly isDestination: boolean;
  readonly isPendingSource: boolean;
  readonly isPendingTarget: boolean;
}

/** Action names exposed by the single adjustable board control. @public */
export type ChessboardAccessibilityAction =
  | 'move-cursor-left'
  | 'move-cursor-right'
  | 'move-cursor-up'
  | 'move-cursor-down'
  | 'activate-square'
  | 'clear-selection'
  | 'cancel-move'
  | 'remove-piece'
  | 'place-spare'
  | 'cancel-spare'
  | 'start-arrow'
  | 'finish-arrow'
  | 'toggle-square-annotation'
  | 'cancel-annotation';

/** Data supplied to a board accessibility action-label formatter. @public */
export interface BoardActionAccessibilityContext {
  readonly boardId: string;
  readonly action: ChessboardAccessibilityAction;
  readonly square: SquareId;
  readonly piece: PieceData | null;
}

/** Data supplied after a move request reaches a terminal presentation state. @public */
export interface MoveOutcomeAccessibilityContext {
  readonly intent: MoveIntent;
  readonly outcome: 'committed' | 'rejected' | 'cancelled' | 'timed-out';
  readonly reason?: string;
}

/** Single-control accessibility labels, formatters, and announcements. @public */
export interface ChessboardAccessibility {
  /** Full board-label override; include an orientation summary when desired. */
  readonly boardLabel?: string;
  /** Full board-hint override. */
  readonly boardHint?: string;
  /** Replaces the square value; empty output falls back to the default value. */
  readonly formatSquareValue?: (context: SquareAccessibilityContext) => string;
  /** Formats directional and interactive actions; labels stay non-empty/unique. */
  readonly formatActionLabel?: (
    context: BoardActionAccessibilityContext,
  ) => string;
  readonly formatMoveOutcome?: (
    context: MoveOutcomeAccessibilityContext,
  ) => string | null;
  /** Non-empty correlation ID and message, spoken once per mounted board. */
  readonly announcement?: Readonly<{ id: string; message: string }>;
}
