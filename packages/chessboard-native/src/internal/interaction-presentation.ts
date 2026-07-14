import { useMemo } from 'react';
import { useSharedValue, type SharedValue } from 'react-native-reanimated';

import type { PieceData, SquareId } from '../public-types';
import type {
  InteractionEpoch,
  MoveIntentLifecycle,
} from './interaction-reducer';

/** Numeric phases are cheap to read from gesture and animated-style worklets. */
export const INTERACTION_PRESENTATION_PHASE = Object.freeze({
  IDLE: 0,
  TAP: 1,
  DRAG: 2,
  DECIDING: 3,
  AWAITING_COMMIT: 4,
} as const);

export type InteractionPresentationPhase =
  (typeof INTERACTION_PRESENTATION_PHASE)[keyof typeof INTERACTION_PRESENTATION_PHASE];

/**
 * Board-local values mutated by gesture worklets. They contain presentation
 * coordinates and correlation only, never a position or annotation snapshot.
 */
export interface InteractionPresentationSharedValues {
  readonly phase: SharedValue<InteractionPresentationPhase>;
  readonly epoch: SharedValue<InteractionEpoch | null>;
  readonly sourceSquare: SharedValue<SquareId | null>;
  readonly targetSquare: SharedValue<SquareId | null>;
  readonly pointerX: SharedValue<number>;
  readonly pointerY: SharedValue<number>;
  readonly pointerWindowX: SharedValue<number>;
  readonly pointerWindowY: SharedValue<number>;
}

/** Detached React-side projection used to choose transient piece visuals. */
export interface InteractionPresentation {
  readonly boardId: string;
  readonly epoch: InteractionEpoch | null;
  readonly phase: InteractionPresentationPhase;
  readonly sourceSquare: SquareId | null;
  readonly targetSquare: SquareId | null;
  readonly piece: Readonly<PieceData> | null;
  readonly isLifted: boolean;
  readonly showsSourceGhost: boolean;
  readonly isPending: boolean;
}

function boardSourceSquare(
  lifecycle: Exclude<MoveIntentLifecycle, { readonly phase: 'idle' }>,
): SquareId | null {
  const source =
    lifecycle.phase === 'tap' || lifecycle.phase === 'drag'
      ? lifecycle.context.source
      : lifecycle.intent.source;
  return source.kind === 'board' ? source.square : null;
}

/**
 * Project reducer correlation into visual-only state. The projection cannot be
 * used as a semantic render source because it deliberately contains no
 * position, annotation collection, or selection snapshot.
 */
export function projectInteractionPresentation(
  lifecycle: Readonly<MoveIntentLifecycle>,
): Readonly<InteractionPresentation> {
  if (lifecycle.phase === 'idle') {
    return Object.freeze({
      boardId: lifecycle.boardId,
      epoch: null,
      isLifted: false,
      isPending: false,
      phase: INTERACTION_PRESENTATION_PHASE.IDLE,
      piece: null,
      showsSourceGhost: false,
      sourceSquare: null,
      targetSquare: null,
    });
  }

  const targeting = lifecycle.phase === 'tap' || lifecycle.phase === 'drag';
  const phase =
    lifecycle.phase === 'tap'
      ? INTERACTION_PRESENTATION_PHASE.TAP
      : lifecycle.phase === 'drag'
        ? INTERACTION_PRESENTATION_PHASE.DRAG
        : lifecycle.phase === 'deciding'
          ? INTERACTION_PRESENTATION_PHASE.DECIDING
          : INTERACTION_PRESENTATION_PHASE.AWAITING_COMMIT;
  const piece = targeting ? lifecycle.context.piece : lifecycle.intent.piece;
  const targetSquare = targeting
    ? lifecycle.targetSquare
    : lifecycle.intent.targetSquare;
  const sourceSquare = boardSourceSquare(lifecycle);
  const isPending =
    lifecycle.phase === 'deciding' || lifecycle.phase === 'awaiting-commit';

  return Object.freeze({
    boardId: lifecycle.boardId,
    epoch: lifecycle.epoch,
    isLifted: lifecycle.phase === 'drag',
    isPending,
    phase,
    piece,
    showsSourceGhost:
      sourceSquare !== null && (lifecycle.phase === 'drag' || isPending),
    sourceSquare,
    targetSquare,
  });
}

/** Allocate one private set of UI-thread values for a mounted board adapter. */
export function useInteractionPresentationSharedValues(): Readonly<InteractionPresentationSharedValues> {
  const phase = useSharedValue<InteractionPresentationPhase>(
    INTERACTION_PRESENTATION_PHASE.IDLE,
  );
  const epoch = useSharedValue<InteractionEpoch | null>(null);
  const sourceSquare = useSharedValue<SquareId | null>(null);
  const targetSquare = useSharedValue<SquareId | null>(null);
  const pointerX = useSharedValue(0);
  const pointerY = useSharedValue(0);
  const pointerWindowX = useSharedValue(0);
  const pointerWindowY = useSharedValue(0);

  return useMemo(
    () =>
      Object.freeze({
        epoch,
        phase,
        pointerX,
        pointerY,
        pointerWindowX,
        pointerWindowY,
        sourceSquare,
        targetSquare,
      }),
    [
      epoch,
      phase,
      pointerWindowX,
      pointerWindowY,
      pointerX,
      pointerY,
      sourceSquare,
      targetSquare,
    ],
  );
}

/** Clear every transient value after idle, invalidation, or unmount. */
export function resetInteractionPresentationSharedValues(
  values: Readonly<InteractionPresentationSharedValues>,
): void {
  'worklet';
  values.epoch.value = null;
  values.sourceSquare.value = null;
  values.targetSquare.value = null;
  values.pointerX.value = 0;
  values.pointerY.value = 0;
  values.pointerWindowX.value = 0;
  values.pointerWindowY.value = 0;
  values.phase.value = INTERACTION_PRESENTATION_PHASE.IDLE;
}

/** Synchronize reducer metadata without disturbing an active pan pointer. */
export function syncInteractionPresentationSharedValues(
  values: Readonly<InteractionPresentationSharedValues>,
  presentation: Readonly<InteractionPresentation>,
): void {
  'worklet';
  if (presentation.phase === INTERACTION_PRESENTATION_PHASE.IDLE) {
    resetInteractionPresentationSharedValues(values);
    return;
  }

  values.epoch.value = presentation.epoch;
  values.sourceSquare.value = presentation.sourceSquare;
  values.targetSquare.value = presentation.targetSquare;
  values.phase.value = presentation.phase;
}

/** Update only board-local pointer coordinates during an active gesture. */
export function updateInteractionPresentationPointer(
  values: Readonly<InteractionPresentationSharedValues>,
  x: number,
  y: number,
  windowX: number = x,
  windowY: number = y,
): void {
  'worklet';
  if (
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    !Number.isFinite(windowX) ||
    !Number.isFinite(windowY)
  ) {
    return;
  }
  values.pointerX.value = x;
  values.pointerY.value = y;
  values.pointerWindowX.value = windowX;
  values.pointerWindowY.value = windowY;
}
