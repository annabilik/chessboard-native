import { type ReactElement } from 'react';
import { StyleSheet, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';

import { useReducedMotion } from '../accessibility/reduced-motion';
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

/** Fixed presentation-only lift; public drag styling remains a later API. */
export const DRAG_OVERLAY_LIFT_SCALE = 1.08;

type DragOverlayProps = {
  readonly boardId: string;
  readonly piece: Readonly<PieceData>;
  readonly presentation: Readonly<InteractionPresentationSharedValues>;
  readonly renderer: PieceRenderer;
  readonly size: number;
  readonly style: Readonly<ViewStyle>;
  readonly testID?: string;
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
): Readonly<ViewStyle> {
  'worklet';
  const dragging =
    presentation.phase.value === INTERACTION_PRESENTATION_PHASE.DRAG;

  return {
    opacity: dragging ? 1 : 0,
    transform: [
      { translateX: presentation.pointerX.value - size / 2 },
      { translateY: presentation.pointerY.value - size / 2 },
      { scale: dragging && !reducedMotion ? DRAG_OVERLAY_LIFT_SCALE : 1 },
    ],
  };
}

/**
 * Board-local drag artwork whose pointer transform never crosses React or JS
 * during pan updates. It contains one visual piece, not a position snapshot.
 */
export function DragOverlay({
  boardId,
  piece,
  presentation,
  renderer,
  size,
  source,
  square,
  style,
  testID,
}: DragOverlayProps): ReactElement {
  const reducedMotion = useReducedMotion();
  const animatedStyle = useAnimatedStyle(
    () => resolveDragOverlayAnimatedStyle(presentation, size, reducedMotion),
    [presentation, reducedMotion, size],
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
