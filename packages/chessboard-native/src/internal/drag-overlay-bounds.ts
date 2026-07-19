import type { SharedValue } from 'react-native-reanimated';

import type { InteractionPresentationSharedValues } from './interaction-presentation';

/** Board-local overlay-center limits driven by the active gesture point. */
export interface GestureDragOverlayBounds {
  readonly kind: 'gesture';
  readonly height: number;
  readonly width: number;
}

/** Window-space overlay-center limits shared by an external drag target. */
export interface WindowDragOverlayBounds {
  readonly kind: 'window';
  readonly height: SharedValue<number>;
  readonly ready: SharedValue<number>;
  readonly width: SharedValue<number>;
  readonly x: SharedValue<number>;
  readonly y: SharedValue<number>;
}

/** Optional visual limits for one active provider drag overlay. */
export type DragOverlayBounds =
  GestureDragOverlayBounds | WindowDragOverlayBounds;

/** Window-space center used by the provider overlay worklet. */
export interface DragOverlayCenter {
  readonly x: number;
  readonly y: number;
}

function positiveFinite(value: number): boolean {
  'worklet';
  return Number.isFinite(value) && value > 0;
}

function clamp(value: number, minimum: number, maximum: number): number {
  'worklet';
  return Math.min(Math.max(value, minimum), maximum);
}

/**
 * Resolve visual overlay limits without changing the raw gesture pointer.
 *
 * A board drag uses local gesture coordinates so ancestor/provider offsets do
 * not cross to JS. A spare drag uses the target board's cached window bounds.
 * Missing or invalid bounds fail open visually; semantic release verification
 * remains an independent, fail-closed boundary.
 */
export function resolveDragOverlayCenter(
  presentation: Readonly<InteractionPresentationSharedValues>,
  bounds: Readonly<DragOverlayBounds> | null,
): Readonly<DragOverlayCenter> {
  'worklet';
  const pointerWindowX = presentation.pointerWindowX.value;
  const pointerWindowY = presentation.pointerWindowY.value;
  if (
    bounds === null ||
    !Number.isFinite(pointerWindowX) ||
    !Number.isFinite(pointerWindowY)
  ) {
    return { x: pointerWindowX, y: pointerWindowY };
  }

  if (bounds.kind === 'gesture') {
    const pointerX = presentation.pointerX.value;
    const pointerY = presentation.pointerY.value;
    if (
      !positiveFinite(bounds.width) ||
      !positiveFinite(bounds.height) ||
      !Number.isFinite(pointerX) ||
      !Number.isFinite(pointerY)
    ) {
      return { x: pointerWindowX, y: pointerWindowY };
    }
    return {
      x: pointerWindowX + clamp(pointerX, 0, bounds.width) - pointerX,
      y: pointerWindowY + clamp(pointerY, 0, bounds.height) - pointerY,
    };
  }

  const x = bounds.x.value;
  const y = bounds.y.value;
  const width = bounds.width.value;
  const height = bounds.height.value;
  const maximumX = x + width;
  const maximumY = y + height;
  if (
    bounds.ready.value !== 1 ||
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    !positiveFinite(width) ||
    !positiveFinite(height) ||
    !Number.isFinite(maximumX) ||
    !Number.isFinite(maximumY)
  ) {
    return { x: pointerWindowX, y: pointerWindowY };
  }
  return {
    x: clamp(pointerWindowX, x, maximumX),
    y: clamp(pointerWindowY, y, maximumY),
  };
}
