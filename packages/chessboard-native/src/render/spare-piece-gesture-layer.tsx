import { useMemo, type ReactElement } from 'react';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import {
  INTERACTION_PRESENTATION_PHASE,
  type InteractionPresentationSharedValues,
} from '../internal/interaction-presentation';
import { DEFAULT_DRAG_ACTIVATION_DISTANCE } from './board-gesture-layer';

export type SparePieceGestureSignal =
  | {
      readonly gestureToken: number;
      readonly type: 'start';
    }
  | {
      readonly gestureToken: number;
      readonly pointerWindowX: number;
      readonly pointerWindowY: number;
      readonly type: 'release';
    }
  | {
      readonly gestureToken: number;
      readonly reason: 'second-finger' | 'user';
      readonly type: 'cancel';
    };

interface SparePieceGestureLayerProps {
  readonly children: ReactElement;
  readonly enabled: boolean;
  readonly onSignal: (signal: Readonly<SparePieceGestureSignal>) => void;
  readonly presentation: Readonly<InteractionPresentationSharedValues>;
  readonly spareId: string;
}

export function getSparePieceGestureTestId(spareId: string): string {
  return `chessboard-native:spare:${spareId}:pan`;
}

/**
 * One-pointer external pan source.
 *
 * Continuous coordinates stay in UI-thread shared values. Only activation,
 * terminal release, and cancellation cross to JS. Release deliberately leaves
 * presentation active until fresh provider verification completes.
 */
export function SparePieceGestureLayer({
  children,
  enabled,
  onSignal,
  presentation,
  spareId,
}: SparePieceGestureLayerProps): ReactElement {
  const nextGestureToken = useSharedValue<number | null>(0);
  const panActive = useSharedValue(0);
  const panCancelReason = useSharedValue(0);
  const panGestureToken = useSharedValue<number | null>(null);
  const testID = getSparePieceGestureTestId(spareId);

  const gesture = useMemo(() => {
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
        : Number.NaN;
      presentation.pointerWindowY.value = Number.isFinite(absoluteY)
        ? absoluteY
        : Number.NaN;
    };

    return Gesture.Pan()
      .enabled(enabled)
      .minPointers(1)
      .maxPointers(1)
      .minDistance(DEFAULT_DRAG_ACTIVATION_DISTANCE)
      .shouldCancelWhenOutside(false)
      .withTestId(testID)
      .onTouchesDown((event, stateManager) => {
        'worklet';
        if (event.allTouches.length !== 1) {
          if (panActive.value === 1) {
            panCancelReason.value = 1;
          }
          stateManager.fail();
        }
      })
      .onBegin((event) => {
        'worklet';
        panGestureToken.value = allocateGestureToken();
        panCancelReason.value = 0;
        updatePointer(event.x, event.y, event.absoluteX, event.absoluteY);
      })
      .onStart((event) => {
        'worklet';
        const gestureToken = panGestureToken.value;
        if (gestureToken === null) {
          return;
        }
        panActive.value = 1;
        presentation.phase.value = INTERACTION_PRESENTATION_PHASE.DRAG;
        presentation.epoch.value = gestureToken;
        presentation.sourceSquare.value = null;
        presentation.targetSquare.value = null;
        updatePointer(event.x, event.y, event.absoluteX, event.absoluteY);
        scheduleOnRN(onSignal, {
          gestureToken,
          type: 'start',
        });
      })
      .onUpdate((event) => {
        'worklet';
        if (panActive.value !== 1) {
          return;
        }
        updatePointer(event.x, event.y, event.absoluteX, event.absoluteY);
      })
      .onEnd((event, success) => {
        'worklet';
        const gestureToken = panGestureToken.value;
        if (!success || panActive.value !== 1 || gestureToken === null) {
          return;
        }
        updatePointer(event.x, event.y, event.absoluteX, event.absoluteY);
        panActive.value = 0;
        scheduleOnRN(onSignal, {
          gestureToken,
          pointerWindowX: presentation.pointerWindowX.value,
          pointerWindowY: presentation.pointerWindowY.value,
          type: 'release',
        });
      })
      .onFinalize(() => {
        'worklet';
        const gestureToken = panGestureToken.value;
        if (panActive.value === 1 && gestureToken !== null) {
          panActive.value = 0;
          scheduleOnRN(onSignal, {
            gestureToken,
            reason: panCancelReason.value === 1 ? 'second-finger' : 'user',
            type: 'cancel',
          });
        }
        panGestureToken.value = null;
        panCancelReason.value = 0;
      });
  }, [
    enabled,
    nextGestureToken,
    onSignal,
    panActive,
    panCancelReason,
    panGestureToken,
    presentation,
    testID,
  ]);

  return <GestureDetector gesture={gesture}>{children}</GestureDetector>;
}
