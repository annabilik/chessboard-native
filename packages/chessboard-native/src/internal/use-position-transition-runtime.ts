import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import {
  cancelAnimation,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import type { ValidatedBoardDimensions } from '../core/dimensions';
import type { Revision } from '../public-types';
import type { BoardSurfaceLayout } from '../render/board-layout';
import type { PendingCommitHandoffDescriptor } from './pending-commit-handoff';
import { positionComparisonToken } from './position-domain';
import type { NormalizedPositionValue } from './position-domain';
import {
  planPositionTransition,
  type PositionTransitionPlan,
  type TransitionPositionSnapshot,
} from './transition-planner';
import {
  createTransitionPresentation,
  rebaseTransitionPresentation,
  sampleTransitionPresentation,
  type TransitionPresentation,
} from './transition-presentation';

export const DEFAULT_TRANSITION_DURATION_MS = 300;

export interface MountedPositionTransition {
  readonly durationMs: number;
  readonly plan: Readonly<PositionTransitionPlan>;
  readonly presentation: Readonly<TransitionPresentation>;
  readonly progress: SharedValue<number>;
}

interface ActivePositionTransition extends MountedPositionTransition {
  readonly deadlineMs: number;
  readonly geometryEpoch: Revision;
  readonly targetKey: string;
}

interface CommittedTransitionInput {
  readonly dimensions: ValidatedBoardDimensions | null;
  readonly durationMs: number;
  readonly geometryEpoch: Revision | null;
  readonly key: string | null;
  readonly layout: Readonly<BoardSurfaceLayout> | null;
  readonly reducedMotion: boolean;
  readonly snapshot: Readonly<TransitionPositionSnapshot> | null;
}

function sameDimensions(
  previous: ValidatedBoardDimensions | null,
  current: ValidatedBoardDimensions | null,
): boolean {
  if (previous === null || current === null) {
    return previous === current;
  }
  return previous.columns === current.columns && previous.rows === current.rows;
}

interface UsePositionTransitionRuntimeOptions {
  readonly development: boolean;
  readonly dimensions: ValidatedBoardDimensions | null;
  readonly durationMs: number;
  readonly geometryEpoch: Revision | null;
  readonly layout: Readonly<BoardSurfaceLayout> | null;
  readonly logWarning?: (message: string) => void;
  readonly pendingHandoff?: Readonly<PendingCommitHandoffDescriptor> | null;
  readonly position: NormalizedPositionValue | null;
  readonly reducedMotion: boolean;
}

function defaultWarningLogger(message: string): void {
  console.warn(`[chessboard-native] ${message}`);
}

export function normalizeTransitionDurationMs(value: unknown): number {
  if (value === undefined) {
    return DEFAULT_TRANSITION_DURATION_MS;
  }
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new RangeError(
      'Chessboard transitionDurationMs must be a finite non-negative number.',
    );
  }
  return value;
}

function snapshotPosition(
  position: NormalizedPositionValue,
): Readonly<TransitionPositionSnapshot> {
  return Object.freeze({
    revision: position.revision,
    value: position.value,
    ...(position.transition === undefined
      ? {}
      : { transition: position.transition }),
    ...(position.transitionWarning === undefined
      ? {}
      : { transitionWarning: position.transitionWarning }),
  });
}

function positionKey(position: NormalizedPositionValue | null): string | null {
  return position === null
    ? null
    : `${position.tier}:${String(position.revision)}:${positionComparisonToken(position.value)}`;
}

function sameCommittedInput(
  previous: Readonly<CommittedTransitionInput>,
  current: Readonly<CommittedTransitionInput>,
): boolean {
  return (
    sameDimensions(previous.dimensions, current.dimensions) &&
    previous.durationMs === current.durationMs &&
    previous.geometryEpoch === current.geometryEpoch &&
    previous.key === current.key &&
    previous.reducedMotion === current.reducedMotion
  );
}

function nextEpoch(epoch: number): number {
  if (epoch === Number.MAX_SAFE_INTEGER) {
    throw new RangeError('Transition epoch exhausted.');
  }
  return epoch + 1;
}

function clampProgress(value: number): number {
  if (!Number.isFinite(value) || value >= 1) {
    return 1;
  }
  return value <= 0 ? 0 : value;
}

function presentationHasActors(
  presentation: Readonly<TransitionPresentation>,
): boolean {
  return (
    presentation.current.length > 0 ||
    presentation.detached.length > 0 ||
    presentation.pending.length > 0
  );
}

/**
 * Mount pure transition plans without ever rendering the retained comparison
 * snapshot. The latest controlled position is always projected independently.
 */
export function usePositionTransitionRuntime({
  development,
  dimensions,
  durationMs,
  geometryEpoch,
  layout,
  logWarning = defaultWarningLogger,
  pendingHandoff = null,
  position,
  reducedMotion,
}: UsePositionTransitionRuntimeOptions): Readonly<MountedPositionTransition> | null {
  const progress = useSharedValue(1);
  const [active, setActive] =
    useState<Readonly<ActivePositionTransition> | null>(null);
  const activeRef = useRef<Readonly<ActivePositionTransition> | null>(null);
  const committedRef = useRef<Readonly<CommittedTransitionInput>>(
    Object.freeze({
      dimensions,
      durationMs,
      geometryEpoch,
      key: null,
      layout: null,
      reducedMotion,
      snapshot: null,
    }),
  );
  const nextEpochRef = useRef(0);
  const reportedWarningsRef = useRef(new Set<string>());
  const currentKey = positionKey(position);

  const clearActive = useCallback((): void => {
    activeRef.current = null;
    setActive((current) => (current === null ? current : null));
  }, []);

  const finishActive = useCallback(
    (epoch: number, targetKey: string): void => {
      const current = activeRef.current;
      if (current?.presentation.epoch !== epoch) {
        return;
      }
      if (current.targetKey !== targetKey) {
        return;
      }
      clearActive();
    },
    [clearActive],
  );

  useLayoutEffect(() => {
    const snapshot = position === null ? null : snapshotPosition(position);
    const current: Readonly<CommittedTransitionInput> = Object.freeze({
      dimensions,
      durationMs,
      geometryEpoch,
      key: currentKey,
      layout,
      reducedMotion,
      snapshot,
    });
    const previous = committedRef.current;
    if (sameCommittedInput(previous, current)) {
      if (active !== null && activeRef.current !== active) {
        progress.value = 1;
        clearActive();
      }
      return;
    }

    const semanticChanged = previous.key !== current.key;
    const dimensionsChanged = !sameDimensions(
      previous.dimensions,
      current.dimensions,
    );
    const geometryChanged = previous.geometryEpoch !== current.geometryEpoch;
    const durationChanged = previous.durationMs !== current.durationMs;
    const mounted = activeRef.current;
    const mountedProgress =
      mounted === null ? 1 : clampProgress(progress.get());
    committedRef.current = current;
    const reportWarning = (code: string, message: string): void => {
      if (!development) {
        return;
      }
      const warningKey = `${current.key ?? 'unavailable'}:${code}:${message}`;
      if (reportedWarningsRef.current.has(warningKey)) {
        return;
      }
      reportedWarningsRef.current.add(warningKey);
      logWarning(message);
    };

    const mount = (
      nextActive: Readonly<ActivePositionTransition>,
      animationDurationMs: number,
    ): void => {
      progress.value = 0;
      activeRef.current = nextActive;
      setActive(nextActive);
      const presentationEpoch = nextActive.presentation.epoch;
      const targetKey = nextActive.targetKey;
      progress.value = withTiming(
        1,
        { duration: animationDurationMs },
        (finished): void => {
          if (finished) {
            scheduleOnRN(finishActive, presentationEpoch, targetKey);
          }
        },
      );
    };

    if (!semanticChanged) {
      if (mounted === null) {
        return;
      }
      if (
        mounted.targetKey !== current.key ||
        dimensionsChanged ||
        reducedMotion ||
        durationMs === 0 ||
        durationChanged ||
        current.geometryEpoch === null ||
        current.layout === null
      ) {
        cancelAnimation(progress);
        progress.value = 1;
        clearActive();
        return;
      }
      if (!geometryChanged) {
        return;
      }

      const remainingDurationMs = Math.max(
        0,
        Math.min(mounted.durationMs, mounted.deadlineMs - Date.now()),
      );
      cancelAnimation(progress);
      clearActive();
      if (remainingDurationMs <= 0) {
        progress.value = 1;
        return;
      }
      const epoch = nextEpochRef.current;
      nextEpochRef.current = nextEpoch(epoch);
      const presentation = rebaseTransitionPresentation({
        epoch,
        layout: current.layout,
        presentation: mounted.presentation,
        progress: mountedProgress,
      });
      if (!presentationHasActors(presentation)) {
        progress.value = 1;
        return;
      }
      mount(
        Object.freeze({
          deadlineMs: mounted.deadlineMs,
          durationMs: remainingDurationMs,
          geometryEpoch: current.geometryEpoch,
          plan: mounted.plan,
          presentation,
          progress,
          targetKey: mounted.targetKey,
        }),
        remainingDurationMs,
      );
      return;
    }

    const prior =
      mounted?.targetKey !== previous.key
        ? null
        : sampleTransitionPresentation(mounted.presentation, mountedProgress);
    cancelAnimation(progress);
    progress.value = 1;
    clearActive();

    if (current.snapshot === null || dimensions === null || dimensionsChanged) {
      return;
    }

    const epoch = nextEpochRef.current;
    const planning = planPositionTransition({
      after: current.snapshot,
      before: previous.snapshot,
      dimensions,
      epoch,
    });
    if (planning.plan !== null) {
      nextEpochRef.current = nextEpoch(epoch);
    }
    for (const warning of planning.warnings) {
      reportWarning(warning.code, warning.message);
    }

    if (
      planning.plan === null ||
      reducedMotion ||
      durationMs === 0 ||
      current.key === null ||
      current.geometryEpoch === null ||
      current.layout === null ||
      previous.layout === null
    ) {
      return;
    }

    const presentation = createTransitionPresentation({
      currentLayout: current.layout,
      pendingHandoff,
      plan: planning.plan,
      previousLayout: previous.layout,
      prior,
    });
    if (!presentationHasActors(presentation)) {
      return;
    }

    const nextActive: Readonly<ActivePositionTransition> = Object.freeze({
      deadlineMs: Date.now() + durationMs,
      durationMs,
      geometryEpoch: current.geometryEpoch,
      plan: planning.plan,
      presentation,
      progress,
      targetKey: current.key,
    });
    mount(nextActive, durationMs);
  }, [
    active,
    clearActive,
    currentKey,
    development,
    dimensions,
    durationMs,
    finishActive,
    geometryEpoch,
    layout,
    logWarning,
    pendingHandoff,
    position,
    progress,
    reducedMotion,
  ]);

  useLayoutEffect(
    () => () => {
      cancelAnimation(progress);
      progress.value = 1;
      activeRef.current = null;
    },
    [progress],
  );

  return active !== null &&
    active.targetKey === currentKey &&
    !reducedMotion &&
    durationMs > 0
    ? active
    : null;
}
