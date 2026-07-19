import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';
import type {
  AccessibilityActionEvent,
  AccessibilityActionInfo,
  AccessibilityValue,
} from 'react-native';

import type { NormalizedBoardModel } from '../internal/board-model';
import type { MoveIntentLifecycle } from '../internal/interaction-reducer';
import type { ProviderSpareSelectionDescriptor } from '../internal/provider-spare-selection';
import type {
  BoardActionAccessibilityContext,
  BoardOrientation,
  ChessboardAccessibility,
  ChessboardAccessibilityAction,
  MoveIntent,
  PieceData,
  Revision,
  SquareAccessibilityContext,
  SquareId,
} from '../public-types';
import {
  accessibilityCursorIndex,
  canMoveAccessibilityCursor,
  createInitialAccessibilityCursor,
  moveAccessibilityCursor,
  reconcileAccessibilityCursor,
  type AccessibilityCursorAction,
} from './cursor';

const EMPTY_ACTIONS: readonly AccessibilityActionInfo[] = Object.freeze([]);

type DirectionalCursorAction = Exclude<
  AccessibilityCursorAction,
  'increment' | 'decrement'
>;

const ACTION_ORDER = Object.freeze([
  'increment',
  'decrement',
  'move-cursor-left',
  'move-cursor-right',
  'move-cursor-up',
  'move-cursor-down',
] as const satisfies readonly AccessibilityCursorAction[]);

const ACTION_LABELS: Readonly<Record<DirectionalCursorAction, string>> =
  Object.freeze({
    'move-cursor-down': 'Move cursor down',
    'move-cursor-left': 'Move cursor left',
    'move-cursor-right': 'Move cursor right',
    'move-cursor-up': 'Move cursor up',
  });

type InteractiveAccessibilityAction = Extract<
  ChessboardAccessibilityAction,
  | 'activate-square'
  | 'cancel-move'
  | 'cancel-spare'
  | 'clear-selection'
  | 'place-spare'
  | 'remove-piece'
  | 'start-arrow'
  | 'finish-arrow'
  | 'toggle-square-annotation'
  | 'cancel-annotation'
>;

type LabeledAccessibilityAction =
  DirectionalCursorAction | InteractiveAccessibilityAction;

type NativeMoveAccessibilityAction =
  'activate' | 'cancel-move' | 'clear-selection' | 'remove-piece';

type NativeSpareAccessibilityAction = 'cancel-spare' | 'place-spare';

type NativeAnnotationAccessibilityAction =
  | 'start-arrow'
  | 'finish-arrow'
  | 'toggle-square-annotation'
  | 'cancel-annotation';

const INTERACTIVE_ACTION_LABELS: Readonly<
  Record<InteractiveAccessibilityAction, string>
> = Object.freeze({
  'activate-square': 'Activate square',
  'cancel-annotation': 'Cancel annotation',
  'cancel-move': 'Cancel move',
  'cancel-spare': 'Cancel spare selection',
  'clear-selection': 'Clear selection',
  'finish-arrow': 'Finish arrow',
  'place-spare': 'Place selected spare',
  'remove-piece': 'Remove piece',
  'start-arrow': 'Start arrow',
  'toggle-square-annotation': 'Toggle square annotation',
});

const STANDARD_PIECE_LABELS: Readonly<Record<string, string>> = Object.freeze({
  bB: 'black bishop',
  bK: 'black king',
  bN: 'black knight',
  bP: 'black pawn',
  bQ: 'black queen',
  bR: 'black rook',
  wB: 'white bishop',
  wK: 'white king',
  wN: 'white knight',
  wP: 'white pawn',
  wQ: 'white queen',
  wR: 'white rook',
});

export interface BoardAccessibilityProps {
  readonly accessibilityActions: readonly AccessibilityActionInfo[];
  readonly accessibilityHint: string;
  readonly accessibilityLabel: string;
  readonly accessibilityValue: Readonly<AccessibilityValue>;
  readonly onAccessibilityAction: (event: AccessibilityActionEvent) => void;
}

/** Internal bridge from the single accessibility control to move requests. */
export interface BoardAccessibilityMoveInteraction {
  readonly enabled: boolean;
  readonly lifecycle: Readonly<MoveIntentLifecycle> | null;
  readonly request: (draft: Omit<MoveIntent, 'intentId'>) => boolean;
  readonly cancel: () => void;
  readonly sourceResetRevision?: number;
}

/** Internal bridge from the single accessibility control to square intents. */
export interface BoardAccessibilitySquareInteraction {
  readonly enabled: boolean;
  readonly activate: (square: SquareId) => boolean;
  readonly clearSelection: (square: SquareId) => boolean;
}

/** Internal bridge from provider spare selection to the matching board. */
export interface BoardAccessibilitySpareInteraction {
  readonly cancel: () => void;
  readonly enabled: boolean;
  readonly place: (square: SquareId) => boolean;
  readonly selection: Readonly<ProviderSpareSelectionDescriptor> | null;
}

/** Internal bridge from the single accessibility control to annotations. */
export interface BoardAccessibilityAnnotationInteraction {
  readonly activate: (
    action: Exclude<NativeAnnotationAccessibilityAction, 'cancel-annotation'>,
    square: SquareId,
  ) => boolean;
  readonly cancel: () => boolean;
  readonly enabled: boolean;
  readonly mode: 'idle' | 'armed-arrow' | 'drawing';
  readonly sourceSquare: SquareId | null;
  readonly tool: 'arrow' | 'square' | null;
}

interface AccessibilityCursorState {
  readonly feedbackRevision: number;
  readonly square: SquareId | null;
}

interface AccessibilityMoveSource {
  readonly basePositionRevision: Revision;
  readonly boardId: string;
  readonly columns: number;
  readonly orientation: BoardOrientation;
  readonly piece: Readonly<PieceData>;
  readonly rows: number;
  readonly square: SquareId;
}

interface PendingMoveProjection {
  readonly sourceSquare: SquareId | null;
  readonly targetSquare: SquareId | null;
}

const EMPTY_PENDING_MOVE: Readonly<PendingMoveProjection> = Object.freeze({
  sourceSquare: null,
  targetSquare: null,
});

function pieceLabel(piece: Readonly<PieceData> | null): string {
  if (piece === null) {
    return 'empty';
  }
  return STANDARD_PIECE_LABELS[piece.pieceType] ?? `${piece.pieceType} piece`;
}

/** English fallback used when the consumer does not supply a formatter. */
export function formatDefaultSquareAccessibilityValue(
  context: SquareAccessibilityContext,
): string {
  const states: string[] = [];
  if (context.isSelected) {
    states.push('selected');
  }
  if (context.isDestination) {
    states.push('possible destination');
  }
  if (context.isDisabled) {
    states.push('disabled');
  }
  if (context.isPendingSource) {
    states.push('pending move source');
  }
  if (context.isPendingTarget) {
    states.push('pending move target');
  }

  return [`${context.square}, ${pieceLabel(context.piece)}`, ...states].join(
    '; ',
  );
}

function preferredCursorSquare(model: NormalizedBoardModel): SquareId | null {
  return model.selection?.value.selectedSquare ?? null;
}

function initialCursorSquare(model: NormalizedBoardModel): SquareId | null {
  if (model.dimensions === null || model.orientation === null) {
    return null;
  }
  return createInitialAccessibilityCursor(
    model.dimensions,
    model.orientation,
    preferredCursorSquare(model),
  );
}

function isCursorAction(value: string): value is AccessibilityCursorAction {
  return (ACTION_ORDER as readonly string[]).includes(value);
}

function isControlledSquareDisabled(
  model: NormalizedBoardModel,
  square: SquareId,
): boolean {
  return (
    model.status === 'disabled' ||
    (model.selection?.value.disabledSquares?.includes(square) ?? false)
  );
}

function createSquareContext(
  model: NormalizedBoardModel,
  square: SquareId,
  pendingMove: Readonly<PendingMoveProjection>,
): SquareAccessibilityContext | null {
  if (model.boardId === null || model.orientation === null) {
    return null;
  }

  const selection = model.selection?.value;
  return Object.freeze({
    boardId: model.boardId,
    isDestination: selection?.destinationSquares?.includes(square) ?? false,
    isDisabled: isControlledSquareDisabled(model, square),
    isPendingSource: pendingMove.sourceSquare === square,
    isPendingTarget: pendingMove.targetSquare === square,
    isSelected: selection?.selectedSquare === square,
    orientation: model.orientation,
    piece: model.position?.value[square] ?? null,
    square,
  });
}

function fallbackActionLabel(action: LabeledAccessibilityAction): string {
  if (
    action === 'activate-square' ||
    action === 'clear-selection' ||
    action === 'cancel-move' ||
    action === 'cancel-spare' ||
    action === 'place-spare' ||
    action === 'remove-piece' ||
    action === 'start-arrow' ||
    action === 'finish-arrow' ||
    action === 'toggle-square-annotation' ||
    action === 'cancel-annotation'
  ) {
    return INTERACTIVE_ACTION_LABELS[action];
  }
  return ACTION_LABELS[action];
}

function actionLabel(
  action: LabeledAccessibilityAction,
  accessibility: ChessboardAccessibility | undefined,
  context: SquareAccessibilityContext,
): string {
  if (accessibility?.formatActionLabel === undefined) {
    return fallbackActionLabel(action);
  }

  const actionContext: BoardActionAccessibilityContext = Object.freeze({
    action,
    boardId: context.boardId,
    piece: context.piece,
    square: context.square,
  });
  return accessibility.formatActionLabel(actionContext);
}

function uniqueActionLabel(
  formattedLabel: string,
  action: LabeledAccessibilityAction,
  labels: ReadonlySet<string>,
): string {
  const fallback = fallbackActionLabel(action);
  const normalizedLabel = formattedLabel.trim();
  let label =
    normalizedLabel.length === 0 || labels.has(normalizedLabel)
      ? fallback
      : normalizedLabel;
  if (!labels.has(label)) {
    return label;
  }

  let suffix = 1;
  do {
    label = `${fallback} (${action} ${String(suffix)})`;
    suffix += 1;
  } while (labels.has(label));
  return label;
}

function piecesMatch(
  left: Readonly<PieceData> | null | undefined,
  right: Readonly<PieceData>,
): boolean {
  return (
    left !== null &&
    left !== undefined &&
    left.id === right.id &&
    left.pieceType === right.pieceType
  );
}

function copyPiece(piece: Readonly<PieceData>): Readonly<PieceData> {
  return Object.freeze({
    ...(piece.id === undefined ? {} : { id: piece.id }),
    pieceType: piece.pieceType,
  });
}

function createMoveSource(
  model: NormalizedBoardModel,
  square: SquareId,
): Readonly<AccessibilityMoveSource> | null {
  if (
    model.boardId === null ||
    model.dimensions === null ||
    model.orientation === null ||
    model.position === null
  ) {
    return null;
  }
  const piece = model.position.value[square];
  if (piece === undefined) {
    return null;
  }
  return Object.freeze({
    basePositionRevision: model.position.revision,
    boardId: model.boardId,
    columns: model.dimensions.columns,
    orientation: model.orientation,
    piece: copyPiece(piece),
    rows: model.dimensions.rows,
    square,
  });
}

function moveSourceIsCurrent(
  source: Readonly<AccessibilityMoveSource>,
  model: NormalizedBoardModel,
  enabled: boolean,
): boolean {
  return (
    enabled &&
    model.status === 'ready' &&
    model.boardId === source.boardId &&
    model.dimensions?.columns === source.columns &&
    model.dimensions.rows === source.rows &&
    model.orientation === source.orientation &&
    model.position !== null &&
    model.position.revision === source.basePositionRevision &&
    piecesMatch(model.position.value[source.square], source.piece)
  );
}

function pendingLifecycleProjection(
  interaction: BoardAccessibilityMoveInteraction | undefined,
  model: NormalizedBoardModel,
): Readonly<PendingMoveProjection> | null {
  const lifecycle = interaction?.lifecycle;
  if (
    interaction?.enabled !== true ||
    lifecycle === null ||
    lifecycle === undefined ||
    lifecycle.phase === 'idle' ||
    lifecycle.boardId !== model.boardId ||
    lifecycle.positionRevision !== model.position?.revision
  ) {
    return null;
  }

  const source =
    lifecycle.phase === 'tap' || lifecycle.phase === 'drag'
      ? lifecycle.context.source
      : lifecycle.intent.source;
  const piece =
    lifecycle.phase === 'tap' || lifecycle.phase === 'drag'
      ? lifecycle.context.piece
      : lifecycle.intent.piece;
  if (
    source.kind === 'board' &&
    !piecesMatch(model.position.value[source.square], piece)
  ) {
    return null;
  }
  const targetSquare =
    lifecycle.phase === 'tap' || lifecycle.phase === 'drag'
      ? lifecycle.targetSquare
      : lifecycle.intent.targetSquare;
  return Object.freeze({
    sourceSquare: source.kind === 'board' ? source.square : null,
    targetSquare,
  });
}

function createMoveDraft(
  source: Readonly<AccessibilityMoveSource>,
  targetSquare: SquareId | null,
): Omit<MoveIntent, 'intentId'> {
  return Object.freeze({
    basePositionRevision: source.basePositionRevision,
    boardId: source.boardId,
    input: 'accessibility',
    piece: source.piece,
    source: Object.freeze({ kind: 'board' as const, square: source.square }),
    targetSquare,
  });
}

function boardLabel(
  accessibility: ChessboardAccessibility | undefined,
  model: NormalizedBoardModel,
): string {
  if (accessibility?.boardLabel !== undefined) {
    return accessibility.boardLabel;
  }
  return model.orientation === null
    ? 'Chessboard, unavailable'
    : `Chessboard, ${model.orientation} orientation`;
}

function boardHint(
  accessibility: ChessboardAccessibility | undefined,
  disabled: boolean,
): string {
  if (accessibility?.boardHint !== undefined) {
    return accessibility.boardHint;
  }
  return disabled
    ? 'Board is unavailable.'
    : 'Swipe up or down to move through squares. Use the actions menu to move in a direction.';
}

/** Own the transient cursor and project it onto one stable native control. */
export function useBoardAccessibility(
  model: NormalizedBoardModel,
  accessibility: ChessboardAccessibility | undefined,
  moveInteraction?: BoardAccessibilityMoveInteraction,
  squareInteraction?: BoardAccessibilitySquareInteraction,
  spareInteraction?: BoardAccessibilitySpareInteraction,
  annotationInteraction?: BoardAccessibilityAnnotationInteraction,
): BoardAccessibilityProps {
  const [cursorState, setCursorState] = useState<AccessibilityCursorState>(
    () => ({ feedbackRevision: 0, square: initialCursorSquare(model) }),
  );
  const [storedMoveSource, setStoredMoveSource] =
    useState<Readonly<AccessibilityMoveSource> | null>(null);
  const sourceResetRevision = moveInteraction?.sourceResetRevision;
  useEffect(() => {
    setStoredMoveSource(null);
  }, [sourceResetRevision]);
  const squareActivationEnabled = squareInteraction?.enabled === true;
  const annotationEnabled = annotationInteraction?.enabled === true;
  useEffect(() => {
    if (squareActivationEnabled || annotationEnabled) {
      setStoredMoveSource(null);
    }
  }, [annotationEnabled, squareActivationEnabled]);
  const dimensions = model.dimensions;
  const orientation = model.orientation;
  const preferredSquare = preferredCursorSquare(model);
  const storedCursor = cursorState.square;
  const cursor =
    dimensions === null || orientation === null
      ? null
      : reconcileAccessibilityCursor(
          storedCursor,
          dimensions,
          orientation,
          preferredSquare,
        );

  useEffect(() => {
    setCursorState((current) => {
      if (dimensions === null || orientation === null) {
        return current.square === null ? current : { ...current, square: null };
      }
      const reconciled = reconcileAccessibilityCursor(
        current.square,
        dimensions,
        orientation,
        preferredSquare,
      );
      return current.square === reconciled
        ? current
        : { ...current, square: reconciled };
    });
  }, [dimensions, orientation, preferredSquare]);

  const moveEnabled = moveInteraction?.enabled === true;
  const activeSpareSelection =
    spareInteraction?.selection?.targetBoardId === model.boardId
      ? spareInteraction.selection
      : null;
  const activeMoveSource =
    !squareActivationEnabled &&
    !annotationEnabled &&
    storedMoveSource !== null &&
    moveSourceIsCurrent(storedMoveSource, model, moveEnabled)
      ? storedMoveSource
      : null;

  useEffect(() => {
    if (storedMoveSource !== null && activeMoveSource === null) {
      setStoredMoveSource(null);
    }
  }, [activeMoveSource, storedMoveSource]);

  const disabled = model.status === 'disabled' || cursor === null;
  const lifecycleProjection = pendingLifecycleProjection(
    moveInteraction,
    model,
  );
  const pendingMove =
    lifecycleProjection ??
    (activeMoveSource === null
      ? EMPTY_PENDING_MOVE
      : Object.freeze({
          sourceSquare: activeMoveSource.square,
          targetSquare:
            cursor === null || cursor === activeMoveSource.square
              ? null
              : cursor,
        }));
  const hasPendingLifecycle = lifecycleProjection !== null;
  const squareContext =
    cursor === null ? null : createSquareContext(model, cursor, pendingMove);
  const controlledSelectedSquare =
    model.selection?.value.selectedSquare ?? null;
  const selectedSourceDisabled =
    controlledSelectedSquare !== null &&
    isControlledSquareDisabled(model, controlledSelectedSquare);
  const activeMoveSourceDisabled =
    activeMoveSource !== null &&
    isControlledSquareDisabled(model, activeMoveSource.square);

  const actions = useMemo(() => {
    const activeDimensions = dimensions;
    const activeOrientation = orientation;
    if (
      model.status === 'disabled' ||
      cursor === null ||
      squareContext === null ||
      activeDimensions === null ||
      activeOrientation === null
    ) {
      return EMPTY_ACTIONS;
    }

    const available: AccessibilityActionInfo[] = [];
    const labels = new Set<string>();
    for (const action of ACTION_ORDER) {
      if (
        !canMoveAccessibilityCursor(
          cursor,
          action,
          activeDimensions,
          activeOrientation,
        )
      ) {
        continue;
      }

      if (action === 'increment' || action === 'decrement') {
        if (Platform.OS === 'android') {
          available.push(Object.freeze({ name: action }));
        }
        continue;
      }

      const formattedLabel = actionLabel(action, accessibility, squareContext);
      const label = uniqueActionLabel(formattedLabel, action, labels);
      labels.add(label);
      available.push(Object.freeze({ label, name: action }));
    }

    if (activeSpareSelection !== null) {
      const spareContext: SquareAccessibilityContext = Object.freeze({
        ...squareContext,
        piece: activeSpareSelection.piece,
      });
      const nativeSpareActions: Readonly<{
        action: Extract<
          InteractiveAccessibilityAction,
          'cancel-spare' | 'place-spare'
        >;
        name: NativeSpareAccessibilityAction;
      }>[] = [
        ...(spareInteraction?.enabled !== true ||
        hasPendingLifecycle ||
        squareContext.isDisabled
          ? []
          : [
              Object.freeze({
                action: 'place-spare' as const,
                name: 'place-spare' as const,
              }),
            ]),
        Object.freeze({
          action: 'cancel-spare' as const,
          name: 'cancel-spare' as const,
        }),
      ];
      for (const { action, name } of nativeSpareActions) {
        const formattedLabel = actionLabel(action, accessibility, spareContext);
        const label = uniqueActionLabel(formattedLabel, action, labels);
        labels.add(label);
        available.push(Object.freeze({ label, name }));
      }
    } else if (hasPendingLifecycle && moveEnabled) {
      const action = 'cancel-move' as const;
      const formattedLabel = actionLabel(action, accessibility, squareContext);
      const label = uniqueActionLabel(formattedLabel, action, labels);
      available.push(Object.freeze({ label, name: action }));
    } else if (annotationEnabled) {
      const nativeAnnotationActions: Readonly<{
        action: Extract<
          InteractiveAccessibilityAction,
          NativeAnnotationAccessibilityAction
        >;
        name: NativeAnnotationAccessibilityAction;
      }>[] =
        annotationInteraction.mode === 'armed-arrow'
          ? [
              ...(annotationInteraction.sourceSquare !== cursor
                ? [
                    Object.freeze({
                      action: 'finish-arrow' as const,
                      name: 'finish-arrow' as const,
                    }),
                  ]
                : []),
              Object.freeze({
                action: 'cancel-annotation' as const,
                name: 'cancel-annotation' as const,
              }),
            ]
          : annotationInteraction.mode === 'drawing'
            ? [
                Object.freeze({
                  action: 'cancel-annotation' as const,
                  name: 'cancel-annotation' as const,
                }),
              ]
            : annotationInteraction.tool === 'arrow'
              ? [
                  Object.freeze({
                    action: 'start-arrow' as const,
                    name: 'start-arrow' as const,
                  }),
                ]
              : annotationInteraction.tool === 'square'
                ? [
                    Object.freeze({
                      action: 'toggle-square-annotation' as const,
                      name: 'toggle-square-annotation' as const,
                    }),
                  ]
                : [];
      for (const { action, name } of nativeAnnotationActions) {
        const formattedLabel = actionLabel(
          action,
          accessibility,
          squareContext,
        );
        const label = uniqueActionLabel(formattedLabel, action, labels);
        labels.add(label);
        available.push(Object.freeze({ label, name }));
      }
    } else if (squareActivationEnabled) {
      const nativeActions: Readonly<{
        action: InteractiveAccessibilityAction;
        name: NativeMoveAccessibilityAction;
      }>[] = [];
      if (
        !hasPendingLifecycle &&
        !squareContext.isDisabled &&
        !selectedSourceDisabled
      ) {
        nativeActions.push(
          Object.freeze({
            action: 'activate-square' as const,
            name: 'activate' as const,
          }),
        );
      }
      if (controlledSelectedSquare !== null) {
        nativeActions.push(
          Object.freeze({
            action: 'clear-selection' as const,
            name: 'clear-selection' as const,
          }),
        );
      }
      if (
        moveEnabled &&
        !hasPendingLifecycle &&
        !squareContext.isDisabled &&
        squareContext.piece !== null
      ) {
        nativeActions.push(
          Object.freeze({
            action: 'remove-piece' as const,
            name: 'remove-piece' as const,
          }),
        );
      }
      if (hasPendingLifecycle && moveEnabled) {
        nativeActions.push(
          Object.freeze({
            action: 'cancel-move' as const,
            name: 'cancel-move' as const,
          }),
        );
      }

      for (const { action, name } of nativeActions) {
        const formattedLabel = actionLabel(
          action,
          accessibility,
          squareContext,
        );
        const label = uniqueActionLabel(formattedLabel, action, labels);
        labels.add(label);
        available.push(Object.freeze({ label, name }));
      }
    } else if (moveEnabled) {
      const nativeMoveActions: Readonly<{
        action: InteractiveAccessibilityAction;
        name: NativeMoveAccessibilityAction;
      }>[] = [];
      if (hasPendingLifecycle) {
        nativeMoveActions.push(
          Object.freeze({
            action: 'cancel-move' as const,
            name: 'cancel-move' as const,
          }),
        );
      } else if (activeMoveSource !== null) {
        if (!squareContext.isDisabled && !activeMoveSourceDisabled) {
          nativeMoveActions.push(
            Object.freeze({
              action: 'activate-square' as const,
              name: 'activate' as const,
            }),
          );
        }
        if (!activeMoveSourceDisabled) {
          nativeMoveActions.push(
            Object.freeze({
              action: 'remove-piece' as const,
              name: 'remove-piece' as const,
            }),
          );
        }
        nativeMoveActions.push(
          Object.freeze({
            action: 'cancel-move' as const,
            name: 'cancel-move' as const,
          }),
        );
      } else if (!squareContext.isDisabled && squareContext.piece !== null) {
        nativeMoveActions.push(
          Object.freeze({
            action: 'activate-square' as const,
            name: 'activate' as const,
          }),
          Object.freeze({
            action: 'remove-piece' as const,
            name: 'remove-piece' as const,
          }),
        );
      }

      for (const { action, name } of nativeMoveActions) {
        const formattedLabel = actionLabel(
          action,
          accessibility,
          squareContext,
        );
        const label = uniqueActionLabel(formattedLabel, action, labels);
        labels.add(label);
        available.push(Object.freeze({ label, name }));
      }
    }
    return available.length === 0 ? EMPTY_ACTIONS : Object.freeze(available);
  }, [
    activeMoveSource,
    activeMoveSourceDisabled,
    activeSpareSelection,
    accessibility,
    annotationEnabled,
    annotationInteraction,
    cursor,
    controlledSelectedSquare,
    dimensions,
    hasPendingLifecycle,
    model.status,
    moveEnabled,
    orientation,
    selectedSourceDisabled,
    squareActivationEnabled,
    squareContext,
  ]);

  const value = useMemo<Readonly<AccessibilityValue>>(() => {
    if (
      cursor === null ||
      squareContext === null ||
      dimensions === null ||
      orientation === null
    ) {
      return Object.freeze({ text: 'Board unavailable' });
    }

    const formattedText = accessibility?.formatSquareValue?.(squareContext);
    const text =
      formattedText === undefined || formattedText.trim().length === 0
        ? formatDefaultSquareAccessibilityValue(squareContext)
        : formattedText.trim();
    return Object.freeze({
      max: dimensions.rows * dimensions.columns - 1,
      min: 0,
      now: accessibilityCursorIndex(cursor, dimensions, orientation),
      text,
    });
  }, [accessibility, cursor, dimensions, orientation, squareContext]);

  const announcedFeedbackRevision = useRef(0);
  useEffect(() => {
    if (
      announcedFeedbackRevision.current === cursorState.feedbackRevision ||
      Platform.OS !== 'android'
    ) {
      return;
    }
    announcedFeedbackRevision.current = cursorState.feedbackRevision;
    if (value.text !== undefined) {
      AccessibilityInfo.announceForAccessibility(value.text);
    }
  }, [cursorState.feedbackRevision, value.text]);

  const requestExplicitFeedback = useCallback((): void => {
    setCursorState((current) => ({
      ...current,
      feedbackRevision: current.feedbackRevision + 1,
    }));
  }, []);

  const onAccessibilityAction = useCallback(
    (event: AccessibilityActionEvent): void => {
      const actionName = event.nativeEvent.actionName;
      if (disabled || dimensions === null || orientation === null) {
        return;
      }

      if (!isCursorAction(actionName)) {
        if (actionName === 'cancel-spare') {
          if (activeSpareSelection !== null) {
            spareInteraction?.cancel();
            requestExplicitFeedback();
          }
          return;
        }

        if (actionName === 'place-spare') {
          if (
            activeSpareSelection !== null &&
            spareInteraction?.enabled === true &&
            !hasPendingLifecycle &&
            squareContext?.isDisabled !== true &&
            spareInteraction.place(cursor)
          ) {
            requestExplicitFeedback();
          }
          return;
        }

        if (activeSpareSelection !== null) {
          return;
        }

        if (hasPendingLifecycle && moveEnabled) {
          if (actionName === 'cancel-move') {
            moveInteraction.cancel();
          }
          return;
        }

        if (annotationEnabled) {
          if (actionName === 'cancel-annotation') {
            if (
              annotationInteraction.mode !== 'idle' &&
              annotationInteraction.cancel()
            ) {
              requestExplicitFeedback();
            }
            return;
          }
          const isAllowedActivation =
            actionName === 'start-arrow'
              ? annotationInteraction.mode === 'idle' &&
                annotationInteraction.tool === 'arrow'
              : actionName === 'finish-arrow'
                ? annotationInteraction.mode === 'armed-arrow' &&
                  annotationInteraction.sourceSquare !== cursor
                : actionName === 'toggle-square-annotation'
                  ? annotationInteraction.mode === 'idle' &&
                    annotationInteraction.tool === 'square'
                  : false;
          if (
            isAllowedActivation &&
            (actionName === 'start-arrow' ||
              actionName === 'finish-arrow' ||
              actionName === 'toggle-square-annotation') &&
            annotationInteraction.activate(actionName, cursor)
          ) {
            requestExplicitFeedback();
          }
          return;
        }

        if (actionName === 'clear-selection') {
          if (
            squareActivationEnabled &&
            controlledSelectedSquare !== null &&
            squareInteraction.clearSelection(cursor)
          ) {
            requestExplicitFeedback();
          }
          return;
        }

        if (actionName === 'activate' && squareActivationEnabled) {
          if (
            !hasPendingLifecycle &&
            squareContext?.isDisabled !== true &&
            !selectedSourceDisabled &&
            squareInteraction.activate(cursor)
          ) {
            requestExplicitFeedback();
          }
          return;
        }

        if (!moveEnabled) {
          return;
        }

        if (actionName === 'cancel-move') {
          if (activeMoveSource !== null || hasPendingLifecycle) {
            setStoredMoveSource(null);
            moveInteraction.cancel();
            if (!hasPendingLifecycle) {
              requestExplicitFeedback();
            }
          }
          return;
        }

        if (hasPendingLifecycle) {
          return;
        }

        if (actionName === 'activate') {
          if (activeMoveSource === null) {
            if (squareContext?.isDisabled === true) {
              return;
            }
            const source = createMoveSource(model, cursor);
            if (source !== null) {
              setStoredMoveSource(source);
              requestExplicitFeedback();
            }
            return;
          }
          if (squareContext?.isDisabled === true || activeMoveSourceDisabled) {
            return;
          }
          if (
            moveInteraction.request(createMoveDraft(activeMoveSource, cursor))
          ) {
            setStoredMoveSource(null);
            requestExplicitFeedback();
          }
          return;
        }

        if (actionName === 'remove-piece') {
          const source = activeMoveSource ?? createMoveSource(model, cursor);
          if (
            source !== null &&
            !isControlledSquareDisabled(model, source.square) &&
            moveInteraction.request(createMoveDraft(source, null))
          ) {
            setStoredMoveSource(null);
            requestExplicitFeedback();
          }
        }
        return;
      }

      const activeDimensions = dimensions;
      const activeOrientation = orientation;
      setCursorState((current) => {
        const from = reconcileAccessibilityCursor(
          current.square,
          activeDimensions,
          activeOrientation,
          preferredSquare,
        );
        const next = canMoveAccessibilityCursor(
          from,
          actionName,
          activeDimensions,
          activeOrientation,
        )
          ? moveAccessibilityCursor(
              from,
              actionName,
              activeDimensions,
              activeOrientation,
            )
          : from;
        if (next === from) {
          return current.square === from
            ? current
            : { ...current, square: from };
        }
        return {
          feedbackRevision: current.feedbackRevision + 1,
          square: next,
        };
      });
    },
    [
      activeMoveSource,
      activeMoveSourceDisabled,
      activeSpareSelection,
      annotationEnabled,
      annotationInteraction,
      cursor,
      controlledSelectedSquare,
      dimensions,
      disabled,
      hasPendingLifecycle,
      model,
      moveEnabled,
      moveInteraction,
      orientation,
      preferredSquare,
      requestExplicitFeedback,
      selectedSourceDisabled,
      squareActivationEnabled,
      squareContext,
      squareInteraction,
      spareInteraction,
    ],
  );

  return {
    accessibilityActions: actions,
    accessibilityHint: boardHint(accessibility, disabled),
    accessibilityLabel: boardLabel(accessibility, model),
    accessibilityValue: value,
    onAccessibilityAction,
  };
}
