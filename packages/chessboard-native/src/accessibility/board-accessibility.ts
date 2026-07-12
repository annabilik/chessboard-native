import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';
import type {
  AccessibilityActionEvent,
  AccessibilityActionInfo,
  AccessibilityValue,
} from 'react-native';

import type { NormalizedBoardModel } from '../internal/board-model';
import type {
  BoardActionAccessibilityContext,
  ChessboardAccessibility,
  PieceData,
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

interface AccessibilityCursorState {
  readonly feedbackRevision: number;
  readonly square: SquareId | null;
}

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

function createSquareContext(
  model: NormalizedBoardModel,
  square: SquareId,
): SquareAccessibilityContext | null {
  if (model.boardId === null || model.orientation === null) {
    return null;
  }

  const selection = model.selection?.value;
  return Object.freeze({
    boardId: model.boardId,
    isDestination: selection?.destinationSquares?.includes(square) ?? false,
    isDisabled:
      model.status === 'disabled' ||
      (selection?.disabledSquares?.includes(square) ?? false),
    isPendingSource: false,
    isPendingTarget: false,
    isSelected: selection?.selectedSquare === square,
    orientation: model.orientation,
    piece: model.position?.value[square] ?? null,
    square,
  });
}

function actionLabel(
  action: DirectionalCursorAction,
  accessibility: ChessboardAccessibility | undefined,
  context: SquareAccessibilityContext,
): string {
  if (accessibility?.formatActionLabel === undefined) {
    return ACTION_LABELS[action];
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
  action: DirectionalCursorAction,
  labels: ReadonlySet<string>,
): string {
  const fallback = ACTION_LABELS[action];
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
): BoardAccessibilityProps {
  const [cursorState, setCursorState] = useState<AccessibilityCursorState>(
    () => ({ feedbackRevision: 0, square: initialCursorSquare(model) }),
  );
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

  const disabled = model.status === 'disabled' || cursor === null;
  const squareContext =
    cursor === null ? null : createSquareContext(model, cursor);

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
    return available.length === 0 ? EMPTY_ACTIONS : Object.freeze(available);
  }, [
    accessibility,
    cursor,
    dimensions,
    model.status,
    orientation,
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

  const onAccessibilityAction = useCallback(
    (event: AccessibilityActionEvent): void => {
      const actionName = event.nativeEvent.actionName;
      if (
        disabled ||
        !isCursorAction(actionName) ||
        dimensions === null ||
        orientation === null
      ) {
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
    [dimensions, disabled, orientation, preferredSquare],
  );

  return {
    accessibilityActions: actions,
    accessibilityHint: boardHint(accessibility, disabled),
    accessibilityLabel: boardLabel(accessibility, model),
    accessibilityValue: value,
    onAccessibilityAction,
  };
}
