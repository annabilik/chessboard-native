import { useLayoutEffect, useMemo, type ReactElement } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  Gesture,
  GestureDetector,
  type ComposedGesture,
} from 'react-native-gesture-handler';
import { useSharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import type { Revision, SquareId } from '../public-types';
import {
  INTERACTION_PRESENTATION_PHASE,
  resetInteractionPresentationSharedValues,
  type InteractionPresentationSharedValues,
} from '../internal/interaction-presentation';
import { hitTestGesturePoint } from './gesture-hit-test';

/** Internal native activation distance until the public gesture options land. */
export const DEFAULT_DRAG_ACTIVATION_DISTANCE = 4;

/** Internal native long-press delay until public gesture options land. */
export const DEFAULT_ANNOTATION_LONG_PRESS_DURATION_MS = 500;

/** Immutable board geometry captured by one native gesture configuration. */
export interface BoardGestureGeometry {
  readonly columns: number;
  readonly height: number;
  readonly revision: number;
  readonly rows: number;
  readonly visualSquares: readonly SquareId[];
  readonly width: number;
}

interface BoardGestureSignalBase {
  readonly boardId: string;
  readonly geometryRevision: number;
  readonly gestureToken: number;
  readonly positionRevision: Revision;
  readonly sourceSquare: SquareId;
}

export type AnnotationGestureKind = 'long-press' | 'two-finger';

interface AnnotationGestureSignalBase extends BoardGestureSignalBase {
  readonly annotationRevision: Revision;
  readonly gestureKind: AnnotationGestureKind;
  readonly targetSquare: SquareId | null;
}

/** JS boundaries; per-frame pan updates intentionally are not included. */
export type BoardGestureSignal =
  | (BoardGestureSignalBase & {
      readonly pointerX: number;
      readonly pointerY: number;
      readonly targetSquare: SquareId | null;
      readonly type: 'drag-start';
    })
  | (BoardGestureSignalBase & {
      readonly pointerX: number;
      readonly pointerY: number;
      readonly targetSquare: SquareId | null;
      readonly type: 'drag-end';
    })
  | (BoardGestureSignalBase & {
      readonly reason: 'second-finger' | 'user';
      readonly type: 'drag-cancel';
    })
  | (BoardGestureSignalBase & {
      readonly annotationRevision: Revision | null;
      readonly targetSquare: SquareId;
      readonly selectionRevision: Revision | null;
      readonly type: 'tap';
    })
  | (AnnotationGestureSignalBase & {
      readonly type: 'annotation-start';
    })
  | (AnnotationGestureSignalBase & {
      readonly type: 'annotation-update';
    })
  | (AnnotationGestureSignalBase & {
      readonly type: 'annotation-end';
    })
  | (AnnotationGestureSignalBase & {
      readonly reason: 'pointer-count' | 'second-finger' | 'user';
      readonly type: 'annotation-cancel';
    });

export interface BoardGestureTestIds {
  readonly longPress: string;
  readonly pan: string;
  readonly tap: string;
  readonly twoFinger: string;
}

interface BoardGestureLayerProps {
  readonly activationDistance?: number;
  readonly annotationEnabled?: boolean;
  readonly annotationRevision?: Revision | null;
  readonly boardId: string;
  readonly dragEnabled?: boolean;
  readonly tapEnabled?: boolean;
  readonly draggableSquares: readonly SquareId[];
  readonly geometry: Readonly<BoardGestureGeometry>;
  readonly onSignal: (signal: Readonly<BoardGestureSignal>) => void;
  readonly positionRevision: Revision;
  readonly presentation: InteractionPresentationSharedValues;
  readonly resetKey: string;
  readonly selectionRevision: Revision | null;
}

/** Stable board-owned native test identifiers for deterministic adapter tests. */
export function getBoardGestureTestIds(
  boardId: string,
): Readonly<BoardGestureTestIds> {
  return Object.freeze({
    longPress: `chessboard-native:${boardId}:annotation-long-press`,
    pan: `chessboard-native:${boardId}:pan`,
    tap: `chessboard-native:${boardId}:tap`,
    twoFinger: `chessboard-native:${boardId}:annotation-two-finger`,
  });
}

function includesGestureSquare(
  square: SquareId | null,
  squares: readonly SquareId[],
): square is SquareId {
  'worklet';

  if (square === null) {
    return false;
  }
  for (const candidate of squares) {
    if (candidate === square) {
      return true;
    }
  }
  return false;
}

function createBoardGestures(options: {
  readonly activationDistance: number;
  readonly annotationEnabled: boolean;
  readonly boardId: string;
  readonly dragEnabled: boolean;
  readonly draggableSquares: readonly SquareId[];
  readonly geometry: Readonly<BoardGestureGeometry>;
  readonly onSignal: (signal: Readonly<BoardGestureSignal>) => void;
  readonly positionRevision: Revision;
  readonly presentation: InteractionPresentationSharedValues;
  readonly currentAnnotationRevision: { value: Revision | null };
  readonly currentSelectionRevision: { value: Revision | null };
  readonly longPressActive: { value: number };
  readonly longPressCancelReason: { value: number };
  readonly longPressGestureToken: { value: number | null };
  readonly longPressRevision: { value: Revision | null };
  readonly longPressSourceSquare: { value: SquareId | null };
  readonly longPressTargetSquare: { value: SquareId | null };
  readonly nextGestureToken: { value: number | null };
  readonly panActive: { value: number };
  readonly panCancelReason: { value: number };
  readonly panGestureToken: { value: number | null };
  readonly panSourceSquare: { value: SquareId | null };
  readonly tapGestureToken: { value: number | null };
  readonly tapAnnotationRevision: { value: Revision | null };
  readonly tapSelectionRevision: { value: Revision | null };
  readonly tapSourceSquare: { value: SquareId | null };
  readonly tapEnabled: boolean;
  readonly testIds: Readonly<BoardGestureTestIds>;
  readonly twoFingerActive: { value: number };
  readonly twoFingerCancelReason: { value: number };
  readonly twoFingerGestureToken: { value: number | null };
  readonly twoFingerReleaseTerminal: { value: number };
  readonly twoFingerRevision: { value: Revision | null };
  readonly twoFingerSourceSquare: { value: SquareId | null };
  readonly twoFingerTargetSquare: { value: SquareId | null };
}): ComposedGesture {
  const {
    activationDistance,
    annotationEnabled,
    boardId,
    dragEnabled,
    draggableSquares,
    geometry,
    onSignal,
    currentAnnotationRevision,
    currentSelectionRevision,
    longPressActive,
    longPressCancelReason,
    longPressGestureToken,
    longPressRevision,
    longPressSourceSquare,
    longPressTargetSquare,
    nextGestureToken,
    panActive,
    panCancelReason,
    panGestureToken,
    panSourceSquare,
    positionRevision,
    presentation,
    tapAnnotationRevision,
    tapGestureToken,
    tapSelectionRevision,
    tapSourceSquare,
    tapEnabled,
    testIds,
    twoFingerActive,
    twoFingerCancelReason,
    twoFingerGestureToken,
    twoFingerReleaseTerminal,
    twoFingerRevision,
    twoFingerSourceSquare,
    twoFingerTargetSquare,
  } = options;
  const allocateGestureToken = (): number | null => {
    'worklet';
    const token = nextGestureToken.value;
    if (token === null) {
      return null;
    }
    nextGestureToken.value =
      token === Number.MAX_SAFE_INTEGER ? null : token + 1;
    return token;
  };
  const hitTest = (x: number, y: number): SquareId | null => {
    'worklet';
    return hitTestGesturePoint(
      x,
      y,
      geometry.width,
      geometry.height,
      geometry.columns,
      geometry.rows,
      geometry.visualSquares,
    );
  };
  const updatePointer = (
    x: number,
    y: number,
    absoluteX: number,
    absoluteY: number,
  ): void => {
    'worklet';
    presentation.pointerX.value = x;
    presentation.pointerY.value = y;
    presentation.pointerWindowX.value = Number.isFinite(absoluteX)
      ? absoluteX
      : x;
    presentation.pointerWindowY.value = Number.isFinite(absoluteY)
      ? absoluteY
      : y;
  };
  const averageTouchPoint = (
    touches: readonly Readonly<{ readonly x: number; readonly y: number }>[],
  ): Readonly<{ readonly x: number; readonly y: number }> | null => {
    'worklet';
    if (touches.length !== 2) {
      return null;
    }
    const first = touches[0];
    const second = touches[1];
    if (first === undefined || second === undefined) {
      return null;
    }
    return {
      x: (first.x + second.x) / 2,
      y: (first.y + second.y) / 2,
    };
  };

  const pan = Gesture.Pan()
    .enabled(dragEnabled)
    .minPointers(1)
    .maxPointers(1)
    .minDistance(activationDistance)
    .shouldCancelWhenOutside(false)
    .withTestId(testIds.pan)
    .onTouchesDown((event, stateManager) => {
      'worklet';
      const touch = event.allTouches[0];
      if (event.allTouches.length !== 1 || touch === undefined) {
        if (panActive.value === 1) {
          panCancelReason.value = 1;
        } else {
          panSourceSquare.value = null;
        }
        stateManager.fail();
        return;
      }
      const sourceSquare = hitTest(touch.x, touch.y);
      const draggable = includesGestureSquare(sourceSquare, draggableSquares);
      panCancelReason.value = 0;
      panSourceSquare.value = draggable ? sourceSquare : null;
      if (!draggable) {
        stateManager.fail();
      }
    })
    .onBegin((event) => {
      'worklet';
      panGestureToken.value = allocateGestureToken();
      const sourceSquare = hitTest(event.x, event.y);
      const draggable = includesGestureSquare(sourceSquare, draggableSquares);
      panCancelReason.value = 0;
      panSourceSquare.value = draggable ? sourceSquare : null;
    })
    .onStart((event) => {
      'worklet';
      const sourceSquare = panSourceSquare.value;
      const gestureToken = panGestureToken.value;
      if (sourceSquare === null || gestureToken === null) {
        return;
      }

      const targetSquare = hitTest(event.x, event.y);
      panActive.value = 1;
      presentation.phase.value = INTERACTION_PRESENTATION_PHASE.DRAG;
      presentation.sourceSquare.value = sourceSquare;
      presentation.targetSquare.value = targetSquare;
      updatePointer(event.x, event.y, event.absoluteX, event.absoluteY);
      scheduleOnRN(onSignal, {
        boardId,
        geometryRevision: geometry.revision,
        gestureToken,
        pointerX: event.x,
        pointerY: event.y,
        positionRevision,
        sourceSquare,
        targetSquare,
        type: 'drag-start',
      });
    })
    .onUpdate((event) => {
      'worklet';
      if (panActive.value !== 1) {
        return;
      }
      updatePointer(event.x, event.y, event.absoluteX, event.absoluteY);
      presentation.targetSquare.value = hitTest(event.x, event.y);
    })
    .onEnd((event, success) => {
      'worklet';
      const sourceSquare = panSourceSquare.value;
      const gestureToken = panGestureToken.value;
      if (
        !success ||
        panActive.value !== 1 ||
        sourceSquare === null ||
        gestureToken === null
      ) {
        return;
      }

      const targetSquare = hitTest(event.x, event.y);
      updatePointer(event.x, event.y, event.absoluteX, event.absoluteY);
      presentation.targetSquare.value = targetSquare;
      panActive.value = 0;
      scheduleOnRN(onSignal, {
        boardId,
        geometryRevision: geometry.revision,
        gestureToken,
        pointerX: event.x,
        pointerY: event.y,
        positionRevision,
        sourceSquare,
        targetSquare,
        type: 'drag-end',
      });
      resetInteractionPresentationSharedValues(presentation);
    })
    .onFinalize(() => {
      'worklet';
      const sourceSquare = panSourceSquare.value;
      const gestureToken = panGestureToken.value;
      if (
        panActive.value === 1 &&
        sourceSquare !== null &&
        gestureToken !== null
      ) {
        panActive.value = 0;
        scheduleOnRN(onSignal, {
          boardId,
          geometryRevision: geometry.revision,
          gestureToken,
          positionRevision,
          reason: panCancelReason.value === 1 ? 'second-finger' : 'user',
          sourceSquare,
          type: 'drag-cancel',
        });
      }
      panGestureToken.value = null;
      panSourceSquare.value = null;
      panCancelReason.value = 0;
      resetInteractionPresentationSharedValues(presentation);
    });

  const tap = Gesture.Tap()
    .enabled(tapEnabled)
    .minPointers(1)
    .numberOfTaps(1)
    .maxDistance(activationDistance)
    .shouldCancelWhenOutside(true)
    .withTestId(testIds.tap)
    .onTouchesDown((event, stateManager) => {
      'worklet';
      if (event.allTouches.length !== 1) {
        tapAnnotationRevision.value = null;
        tapGestureToken.value = null;
        tapSelectionRevision.value = null;
        tapSourceSquare.value = null;
        stateManager.fail();
      }
    })
    .onBegin((event) => {
      'worklet';
      tapGestureToken.value = allocateGestureToken();
      tapSourceSquare.value = hitTest(event.x, event.y);
      tapAnnotationRevision.value = currentAnnotationRevision.value;
      tapSelectionRevision.value = currentSelectionRevision.value;
    })
    .onEnd((event, success) => {
      'worklet';
      const sourceSquare = tapSourceSquare.value;
      const targetSquare = hitTest(event.x, event.y);
      const gestureToken = tapGestureToken.value;
      if (
        success &&
        sourceSquare !== null &&
        targetSquare === sourceSquare &&
        gestureToken !== null
      ) {
        scheduleOnRN(onSignal, {
          boardId,
          annotationRevision: tapAnnotationRevision.value,
          geometryRevision: geometry.revision,
          gestureToken,
          positionRevision,
          selectionRevision: tapSelectionRevision.value,
          sourceSquare,
          targetSquare,
          type: 'tap',
        });
      }
    })
    .onFinalize(() => {
      'worklet';
      tapGestureToken.value = null;
      tapAnnotationRevision.value = null;
      tapSourceSquare.value = null;
      tapSelectionRevision.value = null;
    });

  const longPress = Gesture.Pan()
    .enabled(annotationEnabled)
    .minPointers(1)
    .maxPointers(1)
    .activateAfterLongPress(DEFAULT_ANNOTATION_LONG_PRESS_DURATION_MS)
    .shouldCancelWhenOutside(false)
    .withTestId(testIds.longPress)
    .onTouchesDown((event, stateManager) => {
      'worklet';
      const touch = event.allTouches[0];
      if (event.allTouches.length !== 1 || touch === undefined) {
        if (longPressActive.value === 1) {
          longPressCancelReason.value = 1;
        } else {
          longPressSourceSquare.value = null;
        }
        stateManager.fail();
        return;
      }
      longPressCancelReason.value = 0;
      longPressSourceSquare.value = hitTest(touch.x, touch.y);
      if (longPressSourceSquare.value === null) {
        stateManager.fail();
      }
    })
    .onBegin((event) => {
      'worklet';
      longPressGestureToken.value = allocateGestureToken();
      longPressRevision.value = currentAnnotationRevision.value;
      longPressCancelReason.value = 0;
      longPressSourceSquare.value = hitTest(event.x, event.y);
      longPressTargetSquare.value = longPressSourceSquare.value;
    })
    .onStart((event) => {
      'worklet';
      const annotationRevision = longPressRevision.value;
      const gestureToken = longPressGestureToken.value;
      const sourceSquare = longPressSourceSquare.value;
      if (
        annotationRevision === null ||
        gestureToken === null ||
        sourceSquare === null
      ) {
        return;
      }
      const targetSquare = hitTest(event.x, event.y);
      longPressActive.value = 1;
      longPressTargetSquare.value = targetSquare;
      scheduleOnRN(onSignal, {
        annotationRevision,
        boardId,
        geometryRevision: geometry.revision,
        gestureKind: 'long-press',
        gestureToken,
        positionRevision,
        sourceSquare,
        targetSquare,
        type: 'annotation-start',
      });
    })
    .onUpdate((event) => {
      'worklet';
      if (longPressActive.value !== 1) {
        return;
      }
      const targetSquare = hitTest(event.x, event.y);
      if (targetSquare === longPressTargetSquare.value) {
        return;
      }
      longPressTargetSquare.value = targetSquare;
      const annotationRevision = longPressRevision.value;
      const gestureToken = longPressGestureToken.value;
      const sourceSquare = longPressSourceSquare.value;
      if (
        annotationRevision !== null &&
        gestureToken !== null &&
        sourceSquare !== null
      ) {
        scheduleOnRN(onSignal, {
          annotationRevision,
          boardId,
          geometryRevision: geometry.revision,
          gestureKind: 'long-press',
          gestureToken,
          positionRevision,
          sourceSquare,
          targetSquare,
          type: 'annotation-update',
        });
      }
    })
    .onEnd((event, success) => {
      'worklet';
      const annotationRevision = longPressRevision.value;
      const gestureToken = longPressGestureToken.value;
      const sourceSquare = longPressSourceSquare.value;
      if (
        !success ||
        longPressActive.value !== 1 ||
        annotationRevision === null ||
        gestureToken === null ||
        sourceSquare === null
      ) {
        return;
      }
      const targetSquare = hitTest(event.x, event.y);
      longPressTargetSquare.value = targetSquare;
      longPressActive.value = 0;
      scheduleOnRN(onSignal, {
        annotationRevision,
        boardId,
        geometryRevision: geometry.revision,
        gestureKind: 'long-press',
        gestureToken,
        positionRevision,
        sourceSquare,
        targetSquare,
        type: 'annotation-end',
      });
    })
    .onFinalize(() => {
      'worklet';
      const annotationRevision = longPressRevision.value;
      const gestureToken = longPressGestureToken.value;
      const sourceSquare = longPressSourceSquare.value;
      if (
        longPressActive.value === 1 &&
        annotationRevision !== null &&
        gestureToken !== null &&
        sourceSquare !== null
      ) {
        longPressActive.value = 0;
        scheduleOnRN(onSignal, {
          annotationRevision,
          boardId,
          geometryRevision: geometry.revision,
          gestureKind: 'long-press',
          gestureToken,
          positionRevision,
          reason: longPressCancelReason.value === 1 ? 'second-finger' : 'user',
          sourceSquare,
          targetSquare: longPressTargetSquare.value,
          type: 'annotation-cancel',
        });
      }
      longPressGestureToken.value = null;
      longPressRevision.value = null;
      longPressSourceSquare.value = null;
      longPressTargetSquare.value = null;
      longPressCancelReason.value = 0;
    });

  const twoFinger = Gesture.Pan()
    .enabled(annotationEnabled)
    .minPointers(2)
    .maxPointers(2)
    .minDistance(activationDistance)
    .averageTouches(true)
    .shouldCancelWhenOutside(false)
    .withTestId(testIds.twoFinger)
    .onTouchesDown((event, stateManager) => {
      'worklet';
      if (event.allTouches.length > 2) {
        if (twoFingerActive.value === 1) {
          twoFingerCancelReason.value = 1;
        }
        stateManager.fail();
        return;
      }
      const focal = averageTouchPoint(event.allTouches);
      if (focal !== null) {
        twoFingerSourceSquare.value = hitTest(focal.x, focal.y);
        twoFingerTargetSquare.value = twoFingerSourceSquare.value;
      }
    })
    .onBegin((event) => {
      'worklet';
      twoFingerGestureToken.value = allocateGestureToken();
      twoFingerRevision.value = currentAnnotationRevision.value;
      twoFingerCancelReason.value = 0;
      twoFingerReleaseTerminal.value = 0;
      const sourceSquare =
        twoFingerSourceSquare.value ?? hitTest(event.x, event.y);
      twoFingerSourceSquare.value = sourceSquare;
      twoFingerTargetSquare.value = sourceSquare;
    })
    .onStart((event) => {
      'worklet';
      const annotationRevision = twoFingerRevision.value;
      const gestureToken = twoFingerGestureToken.value;
      const sourceSquare = twoFingerSourceSquare.value;
      if (
        annotationRevision === null ||
        gestureToken === null ||
        sourceSquare === null
      ) {
        return;
      }
      const targetSquare = hitTest(event.x, event.y);
      twoFingerActive.value = 1;
      twoFingerTargetSquare.value = targetSquare;
      scheduleOnRN(onSignal, {
        annotationRevision,
        boardId,
        geometryRevision: geometry.revision,
        gestureKind: 'two-finger',
        gestureToken,
        positionRevision,
        sourceSquare,
        targetSquare,
        type: 'annotation-start',
      });
    })
    .onUpdate((event) => {
      'worklet';
      if (twoFingerActive.value !== 1) {
        return;
      }
      if (event.numberOfPointers !== 2) {
        if (event.numberOfPointers === 1 && twoFingerCancelReason.value === 0) {
          twoFingerReleaseTerminal.value = 1;
        } else {
          twoFingerCancelReason.value = 1;
        }
        return;
      }
      const targetSquare = hitTest(event.x, event.y);
      if (targetSquare === twoFingerTargetSquare.value) {
        return;
      }
      twoFingerTargetSquare.value = targetSquare;
      const annotationRevision = twoFingerRevision.value;
      const gestureToken = twoFingerGestureToken.value;
      const sourceSquare = twoFingerSourceSquare.value;
      if (
        annotationRevision !== null &&
        gestureToken !== null &&
        sourceSquare !== null
      ) {
        scheduleOnRN(onSignal, {
          annotationRevision,
          boardId,
          geometryRevision: geometry.revision,
          gestureKind: 'two-finger',
          gestureToken,
          positionRevision,
          sourceSquare,
          targetSquare,
          type: 'annotation-update',
        });
      }
    })
    .onTouchesUp((event) => {
      'worklet';
      if (
        twoFingerActive.value === 1 &&
        event.numberOfTouches === 1 &&
        twoFingerCancelReason.value === 0
      ) {
        // Android fails an active minPointers(2) pan on the normal 2 -> 1
        // release. Preserve that release as our terminal boundary and finish
        // from the last target measured while both pointers were present.
        twoFingerReleaseTerminal.value = 1;
      }
    })
    .onEnd((_event, success) => {
      'worklet';
      const annotationRevision = twoFingerRevision.value;
      const gestureToken = twoFingerGestureToken.value;
      const sourceSquare = twoFingerSourceSquare.value;
      if (
        !success ||
        twoFingerActive.value !== 1 ||
        twoFingerCancelReason.value !== 0 ||
        annotationRevision === null ||
        gestureToken === null ||
        sourceSquare === null
      ) {
        return;
      }
      const targetSquare = twoFingerTargetSquare.value;
      twoFingerActive.value = 0;
      scheduleOnRN(onSignal, {
        annotationRevision,
        boardId,
        geometryRevision: geometry.revision,
        gestureKind: 'two-finger',
        gestureToken,
        positionRevision,
        sourceSquare,
        targetSquare,
        type: 'annotation-end',
      });
    })
    .onFinalize(() => {
      'worklet';
      const annotationRevision = twoFingerRevision.value;
      const gestureToken = twoFingerGestureToken.value;
      const sourceSquare = twoFingerSourceSquare.value;
      if (
        twoFingerActive.value === 1 &&
        annotationRevision !== null &&
        gestureToken !== null &&
        sourceSquare !== null
      ) {
        twoFingerActive.value = 0;
        if (
          twoFingerReleaseTerminal.value === 1 &&
          twoFingerCancelReason.value === 0
        ) {
          scheduleOnRN(onSignal, {
            annotationRevision,
            boardId,
            geometryRevision: geometry.revision,
            gestureKind: 'two-finger',
            gestureToken,
            positionRevision,
            sourceSquare,
            targetSquare: twoFingerTargetSquare.value,
            type: 'annotation-end',
          });
        } else {
          scheduleOnRN(onSignal, {
            annotationRevision,
            boardId,
            geometryRevision: geometry.revision,
            gestureKind: 'two-finger',
            gestureToken,
            positionRevision,
            reason:
              twoFingerCancelReason.value === 1 ? 'pointer-count' : 'user',
            sourceSquare,
            targetSquare: twoFingerTargetSquare.value,
            type: 'annotation-cancel',
          });
        }
      }
      twoFingerGestureToken.value = null;
      twoFingerRevision.value = null;
      twoFingerSourceSquare.value = null;
      twoFingerTargetSquare.value = null;
      twoFingerCancelReason.value = 0;
      twoFingerReleaseTerminal.value = 0;
    });

  const ordinary = Gesture.Exclusive(pan, tap);
  return annotationEnabled
    ? Gesture.Race(longPress, twoFinger, ordinary)
    : ordinary;
}

/**
 * When enabled, one accessibility-hidden native hit plane covers the measured
 * board. Disabled mode mounts no native plane and creates no recognizers.
 *
 * Only activation, annotation target-square changes, and terminal events cross
 * to JS. Per-frame pan hit testing, piece targets, and pointer transforms stay
 * in shared values.
 */
export function BoardGestureLayer({
  activationDistance = DEFAULT_DRAG_ACTIVATION_DISTANCE,
  annotationEnabled = false,
  annotationRevision = null,
  boardId,
  dragEnabled = false,
  draggableSquares,
  geometry,
  onSignal,
  positionRevision,
  presentation,
  resetKey,
  selectionRevision,
  tapEnabled = false,
}: BoardGestureLayerProps): ReactElement | null {
  const currentAnnotationRevision = useSharedValue<Revision | null>(
    annotationRevision,
  );
  const currentSelectionRevision = useSharedValue<Revision | null>(
    selectionRevision,
  );
  const longPressActive = useSharedValue(0);
  const longPressCancelReason = useSharedValue(0);
  const longPressGestureToken = useSharedValue<number | null>(null);
  const longPressRevision = useSharedValue<Revision | null>(null);
  const longPressSourceSquare = useSharedValue<SquareId | null>(null);
  const longPressTargetSquare = useSharedValue<SquareId | null>(null);
  const nextGestureToken = useSharedValue<number | null>(0);
  const panActive = useSharedValue(0);
  const panCancelReason = useSharedValue(0);
  const panGestureToken = useSharedValue<number | null>(null);
  const panSourceSquare = useSharedValue<SquareId | null>(null);
  const tapAnnotationRevision = useSharedValue<Revision | null>(null);
  const tapGestureToken = useSharedValue<number | null>(null);
  const tapSelectionRevision = useSharedValue<Revision | null>(null);
  const tapSourceSquare = useSharedValue<SquareId | null>(null);
  const twoFingerActive = useSharedValue(0);
  const twoFingerCancelReason = useSharedValue(0);
  const twoFingerGestureToken = useSharedValue<number | null>(null);
  const twoFingerReleaseTerminal = useSharedValue(0);
  const twoFingerRevision = useSharedValue<Revision | null>(null);
  const twoFingerSourceSquare = useSharedValue<SquareId | null>(null);
  const twoFingerTargetSquare = useSharedValue<SquareId | null>(null);
  const testIds = useMemo(() => getBoardGestureTestIds(boardId), [boardId]);
  const detectorKey = JSON.stringify([
    activationDistance,
    annotationEnabled,
    boardId,
    dragEnabled,
    draggableSquares,
    geometry.revision,
    positionRevision,
    resetKey,
    selectionRevision,
    tapEnabled,
  ]);
  const gesture = useMemo(() => {
    if (!annotationEnabled && !dragEnabled && !tapEnabled) {
      return null;
    }

    return createBoardGestures({
      activationDistance,
      annotationEnabled,
      boardId,
      dragEnabled,
      draggableSquares,
      geometry,
      onSignal,
      currentAnnotationRevision,
      currentSelectionRevision,
      longPressActive,
      longPressCancelReason,
      longPressGestureToken,
      longPressRevision,
      longPressSourceSquare,
      longPressTargetSquare,
      nextGestureToken,
      panActive,
      panCancelReason,
      panGestureToken,
      panSourceSquare,
      positionRevision,
      presentation,
      tapAnnotationRevision,
      tapGestureToken,
      tapSelectionRevision,
      tapSourceSquare,
      tapEnabled,
      testIds,
      twoFingerActive,
      twoFingerCancelReason,
      twoFingerGestureToken,
      twoFingerReleaseTerminal,
      twoFingerRevision,
      twoFingerSourceSquare,
      twoFingerTargetSquare,
    });
  }, [
    activationDistance,
    annotationEnabled,
    boardId,
    dragEnabled,
    draggableSquares,
    geometry,
    onSignal,
    currentAnnotationRevision,
    currentSelectionRevision,
    longPressActive,
    longPressCancelReason,
    longPressGestureToken,
    longPressRevision,
    longPressSourceSquare,
    longPressTargetSquare,
    nextGestureToken,
    panActive,
    panCancelReason,
    panGestureToken,
    panSourceSquare,
    positionRevision,
    presentation,
    tapAnnotationRevision,
    tapGestureToken,
    tapSelectionRevision,
    tapSourceSquare,
    tapEnabled,
    testIds,
    twoFingerActive,
    twoFingerCancelReason,
    twoFingerGestureToken,
    twoFingerReleaseTerminal,
    twoFingerRevision,
    twoFingerSourceSquare,
    twoFingerTargetSquare,
  ]);

  useLayoutEffect(() => {
    currentAnnotationRevision.value = annotationRevision;
  }, [annotationRevision, currentAnnotationRevision]);

  useLayoutEffect(() => {
    currentSelectionRevision.value = selectionRevision;
    tapSelectionRevision.value = null;
    tapSourceSquare.value = null;
  }, [
    currentSelectionRevision,
    selectionRevision,
    tapSelectionRevision,
    tapSourceSquare,
  ]);

  useLayoutEffect(() => {
    longPressActive.value = 0;
    longPressCancelReason.value = 0;
    longPressGestureToken.value = null;
    longPressRevision.value = null;
    longPressSourceSquare.value = null;
    longPressTargetSquare.value = null;
    panActive.value = 0;
    panCancelReason.value = 0;
    panGestureToken.value = null;
    panSourceSquare.value = null;
    tapAnnotationRevision.value = null;
    tapGestureToken.value = null;
    tapSelectionRevision.value = null;
    tapSourceSquare.value = null;
    twoFingerActive.value = 0;
    twoFingerCancelReason.value = 0;
    twoFingerGestureToken.value = null;
    twoFingerReleaseTerminal.value = 0;
    twoFingerRevision.value = null;
    twoFingerSourceSquare.value = null;
    twoFingerTargetSquare.value = null;
    resetInteractionPresentationSharedValues(presentation);
    return () => {
      longPressActive.value = 0;
      longPressCancelReason.value = 0;
      longPressGestureToken.value = null;
      longPressRevision.value = null;
      longPressSourceSquare.value = null;
      longPressTargetSquare.value = null;
      panActive.value = 0;
      panCancelReason.value = 0;
      panGestureToken.value = null;
      panSourceSquare.value = null;
      tapAnnotationRevision.value = null;
      tapGestureToken.value = null;
      tapSelectionRevision.value = null;
      tapSourceSquare.value = null;
      twoFingerActive.value = 0;
      twoFingerCancelReason.value = 0;
      twoFingerGestureToken.value = null;
      twoFingerReleaseTerminal.value = 0;
      twoFingerRevision.value = null;
      twoFingerSourceSquare.value = null;
      twoFingerTargetSquare.value = null;
      resetInteractionPresentationSharedValues(presentation);
    };
  }, [
    annotationEnabled,
    dragEnabled,
    geometry,
    longPressActive,
    longPressCancelReason,
    longPressGestureToken,
    longPressRevision,
    longPressSourceSquare,
    longPressTargetSquare,
    panActive,
    panCancelReason,
    panGestureToken,
    panSourceSquare,
    positionRevision,
    presentation,
    tapAnnotationRevision,
    tapEnabled,
    tapGestureToken,
    tapSelectionRevision,
    tapSourceSquare,
    twoFingerActive,
    twoFingerCancelReason,
    twoFingerGestureToken,
    twoFingerReleaseTerminal,
    twoFingerRevision,
    twoFingerSourceSquare,
    twoFingerTargetSquare,
  ]);

  if (gesture === null) {
    return null;
  }

  const plane = (
    <View
      accessibilityElementsHidden
      accessible={false}
      collapsable={false}
      importantForAccessibility="no-hide-descendants"
      pointerEvents="auto"
      style={styles.plane}
    />
  );

  return (
    <GestureDetector gesture={gesture} key={detectorKey}>
      {plane}
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  plane: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 60,
  },
});
