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
      readonly type: 'drag-cancel';
    })
  | (BoardGestureSignalBase & {
      readonly targetSquare: SquareId;
      readonly type: 'tap';
    });

export interface BoardGestureTestIds {
  readonly pan: string;
  readonly plane: string;
  readonly tap: string;
}

interface BoardGestureLayerProps {
  readonly activationDistance?: number;
  readonly boardId: string;
  readonly enabled?: boolean;
  readonly geometry: Readonly<BoardGestureGeometry>;
  readonly occupiedSquares: readonly SquareId[];
  readonly onSignal: (signal: Readonly<BoardGestureSignal>) => void;
  readonly positionRevision: Revision;
  readonly presentation: InteractionPresentationSharedValues;
}

/** Stable board-owned native test identifiers for deterministic adapter tests. */
export function getBoardGestureTestIds(
  boardId: string,
): Readonly<BoardGestureTestIds> {
  return Object.freeze({
    pan: `chessboard-native:${boardId}:pan`,
    plane: `chessboard-native:${boardId}:gesture-plane`,
    tap: `chessboard-native:${boardId}:tap`,
  });
}

function isOccupiedGestureSquare(
  square: SquareId | null,
  occupiedSquares: readonly SquareId[],
): square is SquareId {
  'worklet';

  if (square === null) {
    return false;
  }
  for (const occupiedSquare of occupiedSquares) {
    if (occupiedSquare === square) {
      return true;
    }
  }
  return false;
}

function createBoardGestures(options: {
  readonly activationDistance: number;
  readonly boardId: string;
  readonly enabled: boolean;
  readonly geometry: Readonly<BoardGestureGeometry>;
  readonly occupiedSquares: readonly SquareId[];
  readonly onSignal: (signal: Readonly<BoardGestureSignal>) => void;
  readonly positionRevision: Revision;
  readonly presentation: InteractionPresentationSharedValues;
  readonly panActive: { value: number };
  readonly panSourceSquare: { value: SquareId | null };
  readonly tapSourceSquare: { value: SquareId | null };
  readonly testIds: Readonly<BoardGestureTestIds>;
}): ComposedGesture {
  const {
    activationDistance,
    boardId,
    enabled,
    geometry,
    occupiedSquares,
    onSignal,
    panActive,
    panSourceSquare,
    positionRevision,
    presentation,
    tapSourceSquare,
    testIds,
  } = options;
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
    .enabled(enabled)
    .minPointers(1)
    .maxPointers(1)
    .minDistance(activationDistance)
    .shouldCancelWhenOutside(false)
    .withTestId(testIds.pan)
    .onBegin((event) => {
      'worklet';
      const sourceSquare = hitTest(event.x, event.y);
      const occupied = isOccupiedGestureSquare(sourceSquare, occupiedSquares);
      panSourceSquare.value = occupied ? sourceSquare : null;
    })
    .onStart((event) => {
      'worklet';
      const sourceSquare = panSourceSquare.value;
      if (sourceSquare === null) {
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
        gestureToken: event.handlerTag,
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
      if (!success || panActive.value !== 1 || sourceSquare === null) {
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
        gestureToken: event.handlerTag,
        pointerX: event.x,
        pointerY: event.y,
        positionRevision,
        sourceSquare,
        targetSquare,
        type: 'drag-end',
      });
      resetInteractionPresentationSharedValues(presentation);
    })
    .onFinalize((event) => {
      'worklet';
      const sourceSquare = panSourceSquare.value;
      if (panActive.value === 1 && sourceSquare !== null) {
        panActive.value = 0;
        scheduleOnRN(onSignal, {
          boardId,
          geometryRevision: geometry.revision,
          gestureToken: event.handlerTag,
          positionRevision,
          sourceSquare,
          type: 'drag-cancel',
        });
      }
      panSourceSquare.value = null;
      resetInteractionPresentationSharedValues(presentation);
    });

  const tap = Gesture.Tap()
    .enabled(enabled)
    .minPointers(1)
    .numberOfTaps(1)
    .maxDistance(activationDistance)
    .shouldCancelWhenOutside(true)
    .withTestId(testIds.tap)
    .onBegin((event) => {
      'worklet';
      const sourceSquare = hitTest(event.x, event.y);
      const occupied = isOccupiedGestureSquare(sourceSquare, occupiedSquares);
      tapSourceSquare.value = occupied ? sourceSquare : null;
    })
    .onEnd((event, success) => {
      'worklet';
      const sourceSquare = tapSourceSquare.value;
      const targetSquare = hitTest(event.x, event.y);
      if (success && sourceSquare !== null && targetSquare === sourceSquare) {
        scheduleOnRN(onSignal, {
          boardId,
          geometryRevision: geometry.revision,
          gestureToken: event.handlerTag,
          positionRevision,
          sourceSquare,
          targetSquare,
          type: 'tap',
        });
      }
    })
    .onFinalize(() => {
      'worklet';
      tapSourceSquare.value = null;
    });

  return Gesture.Exclusive(pan, tap);
}

/**
 * One accessibility-hidden native hit plane for the entire measured board.
 *
 * Only activation and terminal events cross to JS. Per-frame pan hit testing,
 * target updates, and pointer transforms stay in shared values.
 */
export function BoardGestureLayer({
  activationDistance = DEFAULT_DRAG_ACTIVATION_DISTANCE,
  boardId,
  enabled = false,
  geometry,
  occupiedSquares,
  onSignal,
  positionRevision,
  presentation,
}: BoardGestureLayerProps): ReactElement {
  const panActive = useSharedValue(0);
  const panSourceSquare = useSharedValue<SquareId | null>(null);
  const tapSourceSquare = useSharedValue<SquareId | null>(null);
  const testIds = useMemo(() => getBoardGestureTestIds(boardId), [boardId]);
  const gesture = useMemo(
    () =>
      createBoardGestures({
        activationDistance,
        boardId,
        enabled,
        geometry,
        occupiedSquares,
        onSignal,
        panActive,
        panSourceSquare,
        positionRevision,
        presentation,
        tapSourceSquare,
        testIds,
      }),
    [
      activationDistance,
      boardId,
      enabled,
      geometry,
      occupiedSquares,
      onSignal,
      panActive,
      panSourceSquare,
      positionRevision,
      presentation,
      tapSourceSquare,
      testIds,
    ],
  );

  useLayoutEffect(() => {
    panActive.value = 0;
    panSourceSquare.value = null;
    tapSourceSquare.value = null;
    resetInteractionPresentationSharedValues(presentation);
    return () => {
      panActive.value = 0;
      panSourceSquare.value = null;
      tapSourceSquare.value = null;
      resetInteractionPresentationSharedValues(presentation);
    };
  }, [
    enabled,
    geometry,
    panActive,
    panSourceSquare,
    positionRevision,
    presentation,
    tapSourceSquare,
  ]);

  const plane = (
    <View
      accessibilityElementsHidden
      accessible={false}
      collapsable={false}
      importantForAccessibility="no-hide-descendants"
      pointerEvents={enabled ? 'auto' : 'none'}
      style={styles.plane}
      testID={testIds.plane}
    />
  );

  return enabled ? (
    <GestureDetector gesture={gesture}>{plane}</GestureDetector>
  ) : (
    plane
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
