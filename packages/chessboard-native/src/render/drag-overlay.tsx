import { type ReactElement } from 'react';
import { StyleSheet, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  type SharedValue,
} from 'react-native-reanimated';

import type { InteractionPresentationSharedValues } from '../internal/interaction-presentation';
import { INTERACTION_PRESENTATION_PHASE } from '../internal/interaction-presentation';
import type {
  MoveSource,
  PieceData,
  PieceRenderer,
  SquareId,
} from '../public-types';
import {
  InteractionPieceVisual,
  resolveBoardVisualSquare,
} from './interaction-piece-visual';

/** Pinned native default carried by `defaultTheme.draggingPiece`. */
export const DRAG_OVERLAY_LIFT_SCALE = 1.2;

export interface DragOverlayWindowOrigin {
  readonly ready: SharedValue<number>;
  readonly x: SharedValue<number>;
  readonly y: SharedValue<number>;
}

type DragOverlayProps = {
  readonly boardId: string;
  readonly piece: Readonly<PieceData>;
  readonly presentation: Readonly<InteractionPresentationSharedValues>;
  readonly reducedMotion: boolean;
  readonly renderer: PieceRenderer;
  readonly size: number;
  readonly style: Readonly<ViewStyle>;
  readonly testID?: string;
  readonly windowOrigin?: Readonly<DragOverlayWindowOrigin>;
} & (
  | {
      readonly source: Extract<MoveSource, { readonly kind: 'board' }>;
      readonly square: SquareId;
    }
  | {
      readonly source: Extract<MoveSource, { readonly kind: 'spare' }>;
      readonly square: SquareId | null;
    }
);

/**
 * Resolve the exact style used by the overlay worklet. Keeping this function
 * pure makes the UI-thread calculation deterministic without a React render.
 */
export function resolveDragOverlayAnimatedStyle(
  presentation: Readonly<InteractionPresentationSharedValues>,
  size: number,
  reducedMotion: boolean,
  windowOriginX = 0,
  windowOriginY = 0,
  windowOriginReady = 1,
  draggingPieceTransform?: ViewStyle['transform'],
): Readonly<ViewStyle> {
  'worklet';
  const dragging =
    presentation.phase.value === INTERACTION_PRESENTATION_PHASE.DRAG;
  const activeTransform =
    dragging && !reducedMotion
      ? draggingPieceTransform !== undefined &&
        typeof draggingPieceTransform !== 'string'
        ? draggingPieceTransform
        : [{ scale: DRAG_OVERLAY_LIFT_SCALE }]
      : [];

  return {
    opacity: dragging && windowOriginReady === 1 ? 1 : 0,
    transform: [
      {
        translateX:
          presentation.pointerWindowX.value - windowOriginX - size / 2,
      },
      {
        translateY:
          presentation.pointerWindowY.value - windowOriginY - size / 2,
      },
      ...activeTransform,
    ],
  };
}

/**
 * Provider-level drag artwork whose window-space pointer transform never
 * crosses React or JS during pan updates. It contains one visual piece, not a
 * position snapshot.
 */
export function DragOverlay({
  boardId,
  piece,
  presentation,
  reducedMotion,
  renderer,
  size,
  source,
  square,
  style,
  testID,
  windowOrigin,
}: DragOverlayProps): ReactElement {
  const animatedStyle = useAnimatedStyle(
    () =>
      resolveDragOverlayAnimatedStyle(
        presentation,
        size,
        reducedMotion,
        windowOrigin?.x.value ?? 0,
        windowOrigin?.y.value ?? 0,
        windowOrigin?.ready.value ?? 1,
        style.transform,
      ),
    [presentation, reducedMotion, size, style.transform, windowOrigin],
  );

  return (
    <Animated.View
      accessibilityElementsHidden
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={[
        internalStyles.overlay,
        { height: size, width: size },
        animatedStyle,
      ]}
      testID={testID}
    >
      {source.kind === 'board' ? (
        <InteractionPieceVisual
          boardId={boardId}
          containerStyle={internalStyles.piece}
          kind="drag-overlay"
          piece={piece}
          renderer={renderer}
          size={size}
          source={source}
          square={resolveBoardVisualSquare(square)}
          style={style}
        />
      ) : (
        <InteractionPieceVisual
          boardId={boardId}
          containerStyle={internalStyles.piece}
          kind="drag-overlay"
          piece={piece}
          renderer={renderer}
          size={size}
          source={source}
          square={square}
          style={style}
        />
      )}
    </Animated.View>
  );
}

const internalStyles = StyleSheet.create({
  overlay: {
    left: 0,
    pointerEvents: 'none',
    position: 'absolute',
    top: 0,
    zIndex: 70,
  },
  piece: {
    height: '100%',
    width: '100%',
  },
});
