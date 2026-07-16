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
import { positionComparisonToken } from './position-domain';
import type { NormalizedPositionValue } from './position-domain';
import {
  planPositionTransition,
  type PositionTransitionPlan,
  type TransitionPositionSnapshot,
  validatePositionTransitionHint,
} from './transition-planner';

export const DEFAULT_TRANSITION_DURATION_MS = 300;

export interface MountedPositionTransition {
  readonly durationMs: number;
  readonly plan: Readonly<PositionTransitionPlan>;
  readonly progress: SharedValue<number>;
}

interface ActivePositionTransition extends MountedPositionTransition {
  readonly geometryEpoch: Revision;
  readonly targetKey: string;
}

interface CommittedTransitionInput {
  readonly durationMs: number;
  readonly geometryEpoch: Revision | null;
  readonly key: string | null;
  readonly reducedMotion: boolean;
  readonly snapshot: Readonly<TransitionPositionSnapshot> | null;
}

interface UsePositionTransitionRuntimeOptions {
  readonly development: boolean;
  readonly dimensions: ValidatedBoardDimensions | null;
  readonly durationMs: number;
  readonly geometryEpoch: Revision | null;
  readonly logWarning?: (message: string) => void;
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

/**
 * Mount pure transition plans without ever rendering the retained comparison
 * snapshot. The latest controlled position is always projected independently.
 */
export function usePositionTransitionRuntime({
  development,
  dimensions,
  durationMs,
  geometryEpoch,
  logWarning = defaultWarningLogger,
  position,
  reducedMotion,
}: UsePositionTransitionRuntimeOptions): Readonly<MountedPositionTransition> | null {
  const progress = useSharedValue(1);
  const [active, setActive] =
    useState<Readonly<ActivePositionTransition> | null>(null);
  const activeRef = useRef<Readonly<ActivePositionTransition> | null>(null);
  const committedRef = useRef<Readonly<CommittedTransitionInput>>(
    Object.freeze({
      durationMs,
      geometryEpoch,
      key: null,
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
    (epoch: number, targetKey: string, targetGeometryEpoch: number): void => {
      const current = activeRef.current;
      if (current?.plan.epoch !== epoch) {
        return;
      }
      if (
        current.targetKey !== targetKey ||
        current.geometryEpoch !== targetGeometryEpoch
      ) {
        return;
      }
      clearActive();
    },
    [clearActive],
  );

  useLayoutEffect(() => {
    const snapshot = position === null ? null : snapshotPosition(position);
    const current: Readonly<CommittedTransitionInput> = Object.freeze({
      durationMs,
      geometryEpoch,
      key: currentKey,
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

    cancelAnimation(progress);
    progress.value = 1;
    clearActive();

    const semanticChanged = previous.key !== current.key;
    const geometryStable =
      previous.geometryEpoch !== null &&
      current.geometryEpoch !== null &&
      previous.geometryEpoch === current.geometryEpoch;
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

    if (!semanticChanged || current.snapshot === null || dimensions === null) {
      return;
    }

    if (previous.snapshot !== null && !geometryStable) {
      if (current.snapshot.transitionWarning !== undefined) {
        reportWarning(
          current.snapshot.transitionWarning.code,
          current.snapshot.transitionWarning.message,
        );
      }
      if (current.snapshot.transition !== undefined) {
        const validation = validatePositionTransitionHint({
          after: current.snapshot,
          before: previous.snapshot,
        });
        if (validation.warning !== null) {
          reportWarning(validation.warning.code, validation.warning.message);
        }
      }
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
      !geometryStable ||
      reducedMotion ||
      durationMs === 0 ||
      current.key === null
    ) {
      return;
    }

    const nextActive: Readonly<ActivePositionTransition> = Object.freeze({
      durationMs,
      geometryEpoch: current.geometryEpoch,
      plan: planning.plan,
      progress,
      targetKey: current.key,
    });
    progress.value = 0;
    activeRef.current = nextActive;
    setActive(nextActive);
    const planEpoch = planning.plan.epoch;
    const targetKey = current.key;
    const targetGeometryEpoch = current.geometryEpoch;
    progress.value = withTiming(
      1,
      { duration: durationMs },
      (finished): void => {
        if (finished) {
          scheduleOnRN(finishActive, planEpoch, targetKey, targetGeometryEpoch);
        }
      },
    );
  }, [
    active,
    clearActive,
    currentKey,
    development,
    dimensions,
    durationMs,
    finishActive,
    geometryEpoch,
    logWarning,
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
    active.geometryEpoch === geometryEpoch &&
    !reducedMotion &&
    durationMs > 0
    ? active
    : null;
}
