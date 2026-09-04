import { type ReactElement } from 'react';
import { Platform, StyleSheet, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  type SharedValue,
} from 'react-native-reanimated';

import type { InteractionPresentationSharedValues } from '../internal/interaction-presentation';
import { INTERACTION_PRESENTATION_PHASE } from '../internal/interaction-presentation';
import {
  resolveDragOverlayCenter,
  type DragOverlayBounds,
} from '../internal/drag-overlay-bounds';
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
export const DRAG_OVERLAY_OFFSCREEN_POSITION = -100_000;

/** Resolve Android's static paint transform independently from pointer layout. */
export function resolveDragOverlayStaticTransform(
  draggingPieceTransform: ViewStyle['transform'],
  reducedMotion: boolean,
  quiescent: boolean,
  useLayoutPosition: boolean,
): ViewStyle['transform'] | undefined {
  if (!useLayoutPosition || quiescent || reducedMotion) {
    return undefined;
  }
  return draggingPieceTransform !== undefined &&
    typeof draggingPieceTransform !== 'string'
    ? draggingPieceTransform
    : [{ scale: DRAG_OVERLAY_LIFT_SCALE }];
}

export interface DragOverlayWindowOrigin {
  readonly ready: SharedValue<number>;
  readonly x: SharedValue<number>;
  readonly y: SharedValue<number>;
}

type DragOverlayProps = {
  readonly boardId: string;
  readonly bounds?: Readonly<DragOverlayBounds> | null;
  readonly piece: Readonly<PieceData>;
  readonly presentation: Readonly<InteractionPresentationSharedValues>;
  readonly quiescent?: boolean;
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
  bounds: Readonly<DragOverlayBounds> | null = null,
  useLayoutPosition = false,
): Readonly<ViewStyle> {
  'worklet';
  const phase = presentation.phase.value;
  const dragging =
    phase === INTERACTION_PRESENTATION_PHASE.DRAG ||
    phase === INTERACTION_PRESENTATION_PHASE.DRAG_TERMINAL;
  const center = resolveDragOverlayCenter(presentation, bounds);
  const left = center.x - windowOriginX - size / 2;
  const top = center.y - windowOriginY - size / 2;

  // RN 0.86 + Reanimated 4.5 can flush queued transform/opacity props after
  // Fabric removes an active host. Android moves this single absolute overlay
  // through the commit-safe layout path; it never reflows board children.
  if (useLayoutPosition) {
    const visible = dragging && windowOriginReady === 1;
    return {
      left: visible ? left : DRAG_OVERLAY_OFFSCREEN_POSITION,
      top: visible ? top : DRAG_OVERLAY_OFFSCREEN_POSITION,
    };
  }

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
        translateX: left,
      },
      {
        translateY: top,
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
  bounds = null,
  piece,
  presentation,
  quiescent = false,
  reducedMotion,
  renderer,
  size,
  source,
  square,
  style,
  testID,
  windowOrigin,
}: DragOverlayProps): ReactElement {
  const useLayoutPosition = Platform.OS === 'android';
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
        bounds,
        useLayoutPosition,
      ),
    [
      bounds,
      presentation,
      reducedMotion,
      size,
      style.transform,
      useLayoutPosition,
      windowOrigin,
    ],
  );
  const staticTransform = resolveDragOverlayStaticTransform(
    style.transform,
    reducedMotion,
    quiescent,
    useLayoutPosition,
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
        // Never emit an explicit `transform: undefined`: React Native's Fabric
        // prop diff rewrites an explicit undefined to null and hands it to the
        // transform processor, whose development-only validator throws on the
        // first quiescent commit after every drop. Omitting the key lets the
        // diff emit its removal sentinel without running the processor.
        useLayoutPosition && staticTransform !== undefined
          ? { transform: staticTransform }
          : null,
        // Omitting the animated style is the descriptor-retirement barrier;
        // overriding its values would leave the stale native descriptor live.
        quiescent ? internalStyles.quiescent : animatedStyle,
      ]}
      testID={testID}
    >
      {quiescent ? null : source.kind === 'board' ? (
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
  quiescent: {
    opacity: 0,
  },
});
