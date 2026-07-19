import type { SharedValue } from 'react-native-reanimated';

import {
  resolveDragOverlayCenter,
  type DragOverlayBounds,
} from '../../src/internal/drag-overlay-bounds';
import {
  INTERACTION_PRESENTATION_PHASE,
  type InteractionPresentationPhase,
  type InteractionPresentationSharedValues,
} from '../../src/internal/interaction-presentation';

function sharedValue<Value>(initialValue: Value): SharedValue<Value> {
  let currentValue = initialValue;
  return {
    addListener: () => undefined,
    get value() {
      return currentValue;
    },
    set value(value: Value) {
      currentValue = value;
    },
    get: () => currentValue,
    modify: (modifier) => {
      if (modifier !== undefined) {
        currentValue = modifier(currentValue);
      }
    },
    removeListener: () => undefined,
    set: (value) => {
      currentValue =
        typeof value === 'function'
          ? (value as (current: Value) => Value)(currentValue)
          : value;
    },
  };
}

function presentation(): Readonly<InteractionPresentationSharedValues> {
  return Object.freeze({
    epoch: sharedValue<number | null>(0),
    phase: sharedValue<InteractionPresentationPhase>(
      INTERACTION_PRESENTATION_PHASE.DRAG,
    ),
    pointerWindowX: sharedValue(220),
    pointerWindowY: sharedValue(180),
    pointerX: sharedValue(120),
    pointerY: sharedValue(80),
    sourceSquare: sharedValue<string | null>('a2'),
    targetSquare: sharedValue<string | null>(null),
  });
}

describe('drag overlay bounds', () => {
  it.each([
    {
      expected: { x: 100, y: 200 },
      local: { x: -30, y: 70 },
      window: { x: 70, y: 200 },
    },
    {
      expected: { x: 200, y: 130 },
      local: { x: 130, y: -20 },
      window: { x: 230, y: 110 },
    },
    {
      expected: { x: 145, y: 165 },
      local: { x: 45, y: 35 },
      window: { x: 145, y: 165 },
    },
  ])(
    'clamps a board-local pointer to its visual center limits: %#',
    ({ expected, local, window }) => {
      const values = presentation();
      values.pointerX.value = local.x;
      values.pointerY.value = local.y;
      values.pointerWindowX.value = window.x;
      values.pointerWindowY.value = window.y;
      const targetBefore = values.targetSquare.value;
      const bounds: Readonly<DragOverlayBounds> = Object.freeze({
        height: 70,
        kind: 'gesture',
        width: 100,
      });

      expect(resolveDragOverlayCenter(values, bounds)).toEqual(expected);
      expect(values.pointerX.value).toBe(local.x);
      expect(values.pointerY.value).toBe(local.y);
      expect(values.pointerWindowX.value).toBe(window.x);
      expect(values.pointerWindowY.value).toBe(window.y);
      expect(values.targetSquare.value).toBe(targetBefore);
    },
  );

  it('clamps a spare overlay to current target-board window bounds', () => {
    const values = presentation();
    const bounds: Readonly<DragOverlayBounds> = Object.freeze({
      height: sharedValue(60),
      kind: 'window',
      ready: sharedValue(1),
      width: sharedValue(80),
      x: sharedValue(50),
      y: sharedValue(75),
    });

    expect(resolveDragOverlayCenter(values, bounds)).toEqual({
      x: 130,
      y: 135,
    });
  });

  it.each([
    {
      bounds: Object.freeze({
        height: sharedValue(60),
        kind: 'window' as const,
        ready: sharedValue(0),
        width: sharedValue(80),
        x: sharedValue(50),
        y: sharedValue(75),
      }),
      name: 'unready window bounds',
    },
    {
      bounds: Object.freeze({
        height: 0,
        kind: 'gesture' as const,
        width: 80,
      }),
      name: 'invalid gesture bounds',
    },
  ])('fails open for $name', ({ bounds }) => {
    const values = presentation();

    expect(resolveDragOverlayCenter(values, bounds)).toEqual({
      x: 220,
      y: 180,
    });
  });
});
