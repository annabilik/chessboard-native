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

/** JS-boundary events; continuous pan updates intentionally are not included. */
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
      readonly targetSquare: SquareId;
      readonly selectionRevision: Revision | null;
      readonly type: 'tap';
    });

export interface BoardGestureTestIds {
  readonly pan: string;
  readonly tap: string;
}

interface BoardGestureLayerProps {
  readonly activationDistance?: number;
  readonly boardId: string;
  readonly dragEnabled?: boolean;
  readonly tapEnabled?: boolean;
  readonly draggableSquares: readonly SquareId[];
  readonly geometry: Readonly<BoardGestureGeometry>;
  readonly onSignal: (signal: Readonly<BoardGestureSignal>) => void;
  readonly positionRevision: Revision;
  readonly presentation: InteractionPresentationSharedValues;
  readonly selectionRevision: Revision | null;
}

/** Stable board-owned native test identifiers for deterministic adapter tests. */
export function getBoardGestureTestIds(
  boardId: string,
): Readonly<BoardGestureTestIds> {
  return Object.freeze({
    pan: `chessboard-native:${boardId}:pan`,
    tap: `chessboard-native:${boardId}:tap`,
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
  readonly boardId: string;
  readonly dragEnabled: boolean;
  readonly draggableSquares: readonly SquareId[];
  readonly geometry: Readonly<BoardGestureGeometry>;
  readonly onSignal: (signal: Readonly<BoardGestureSignal>) => void;
  readonly positionRevision: Revision;
  readonly presentation: InteractionPresentationSharedValues;
  readonly currentSelectionRevision: { value: Revision | null };
  readonly nextGestureToken: { value: number | null };
  readonly panActive: { value: number };
  readonly panCancelReason: { value: number };
  readonly panGestureToken: { value: number | null };
  readonly panSourceSquare: { value: SquareId | null };
  readonly tapGestureToken: { value: number | null };
  readonly tapSelectionRevision: { value: Revision | null };
  readonly tapSourceSquare: { value: SquareId | null };
  readonly tapEnabled: boolean;
  readonly testIds: Readonly<BoardGestureTestIds>;
}): ComposedGesture {
  const {
    activationDistance,
    boardId,
    dragEnabled,
    draggableSquares,
    geometry,
    onSignal,
    currentSelectionRevision,
    nextGestureToken,
    panActive,
    panCancelReason,
    panGestureToken,
    panSourceSquare,
    positionRevision,
    presentation,
    tapGestureToken,
    tapSelectionRevision,
    tapSourceSquare,
    tapEnabled,
    testIds,
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
      presentation.pointerX.value = event.x;
      presentation.pointerY.value = event.y;
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
      presentation.pointerX.value = event.x;
      presentation.pointerY.value = event.y;
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
      presentation.pointerX.value = event.x;
      presentation.pointerY.value = event.y;
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
      tapSourceSquare.value = null;
      tapSelectionRevision.value = null;
    });

  return Gesture.Exclusive(pan, tap);
}

/**
 * When enabled, one accessibility-hidden native hit plane covers the measured
 * board. Disabled mode mounts no native plane and creates no recognizers.
 *
 * Only activation and terminal events cross to JS. Per-frame pan hit testing,
 * target updates, and pointer transforms stay in shared values.
 */
export function BoardGestureLayer({
  activationDistance = DEFAULT_DRAG_ACTIVATION_DISTANCE,
  boardId,
  dragEnabled = false,
  draggableSquares,
  geometry,
  onSignal,
  positionRevision,
  presentation,
  selectionRevision,
  tapEnabled = false,
}: BoardGestureLayerProps): ReactElement | null {
  const currentSelectionRevision = useSharedValue<Revision | null>(
    selectionRevision,
  );
  const nextGestureToken = useSharedValue<number | null>(0);
  const panActive = useSharedValue(0);
  const panCancelReason = useSharedValue(0);
  const panGestureToken = useSharedValue<number | null>(null);
  const panSourceSquare = useSharedValue<SquareId | null>(null);
  const tapGestureToken = useSharedValue<number | null>(null);
  const tapSelectionRevision = useSharedValue<Revision | null>(null);
  const tapSourceSquare = useSharedValue<SquareId | null>(null);
  const testIds = useMemo(() => getBoardGestureTestIds(boardId), [boardId]);
  const gesture = useMemo(() => {
    if (!dragEnabled && !tapEnabled) {
      return null;
    }

    return createBoardGestures({
      activationDistance,
      boardId,
      dragEnabled,
      draggableSquares,
      geometry,
      onSignal,
      currentSelectionRevision,
      nextGestureToken,
      panActive,
      panCancelReason,
      panGestureToken,
      panSourceSquare,
      positionRevision,
      presentation,
      tapGestureToken,
      tapSelectionRevision,
      tapSourceSquare,
      tapEnabled,
      testIds,
    });
  }, [
    activationDistance,
    boardId,
    dragEnabled,
    draggableSquares,
    geometry,
    onSignal,
    currentSelectionRevision,
    nextGestureToken,
    panActive,
    panCancelReason,
    panGestureToken,
    panSourceSquare,
    positionRevision,
    presentation,
    tapGestureToken,
    tapSelectionRevision,
    tapSourceSquare,
    tapEnabled,
    testIds,
  ]);

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
    panActive.value = 0;
    panCancelReason.value = 0;
    panGestureToken.value = null;
    panSourceSquare.value = null;
    tapGestureToken.value = null;
    tapSelectionRevision.value = null;
    tapSourceSquare.value = null;
    resetInteractionPresentationSharedValues(presentation);
    return () => {
      panActive.value = 0;
      panCancelReason.value = 0;
      panGestureToken.value = null;
      panSourceSquare.value = null;
      tapGestureToken.value = null;
      tapSelectionRevision.value = null;
      tapSourceSquare.value = null;
      resetInteractionPresentationSharedValues(presentation);
    };
  }, [
    dragEnabled,
    geometry,
    panActive,
    panCancelReason,
    panGestureToken,
    panSourceSquare,
    positionRevision,
    presentation,
    tapEnabled,
    tapGestureToken,
    tapSelectionRevision,
    tapSourceSquare,
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

  return <GestureDetector gesture={gesture}>{plane}</GestureDetector>;
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
