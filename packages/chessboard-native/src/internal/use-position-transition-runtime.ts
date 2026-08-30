import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import {
  cancelAnimation,
  makeMutable,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import type { ValidatedBoardDimensions } from '../core/dimensions';
import type { Revision } from '../public-types';
import type { BoardSurfaceLayout } from '../render/board-layout';
import type {
  PendingCommitHandoffDescriptor,
  PendingCommitTransitionAcknowledgement,
} from './pending-commit-handoff';
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
  readonly pendingHandoffAcknowledgement: Readonly<PendingCommitTransitionAcknowledgement> | null;
  readonly deadlineMs: number;
  readonly geometryEpoch: Revision;
  readonly targetKey: string;
}

type UnmountedPositionTransition = Omit<
  ActivePositionTransition,
  'pendingHandoffAcknowledgement' | 'progress'
>;

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
  readonly onPendingHandoffExit?: (
    acknowledgement: Readonly<PendingCommitTransitionAcknowledgement>,
    disposition: PendingHandoffTransitionExitDisposition,
  ) => void;
  readonly pendingHandoff?: Readonly<PendingCommitHandoffDescriptor> | null;
  readonly pendingHandoffAcknowledgement?: Readonly<PendingCommitTransitionAcknowledgement> | null;
  /** A correlated request must not silently degrade into an ordinary fade. */
  readonly pendingHandoffRequired?: boolean;
  readonly position: NormalizedPositionValue | null;
  readonly reducedMotion: boolean;
}

export type PendingHandoffTransitionExitDisposition =
  'aborted' | 'completed' | 'superseded';

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

function pendingHandoffAcknowledgementFor(
  presentation: Readonly<TransitionPresentation>,
): Readonly<PendingCommitTransitionAcknowledgement> | null {
  const pendingHandoffActors = presentation.pending.filter(
    ({ kind }) => kind === 'pending-handoff',
  );
  const actor =
    pendingHandoffActors.length === 1 ? pendingHandoffActors[0] : null;
  return actor === null || actor === undefined
    ? null
    : Object.freeze({
        actorKey: actor.actorKey,
        presentationEpoch: presentation.epoch,
      });
}

function acknowledgementsMatch(
  left: Readonly<PendingCommitTransitionAcknowledgement> | null,
  right: Readonly<PendingCommitTransitionAcknowledgement> | null,
): boolean {
  return (
    left !== null &&
    right !== null &&
    left.actorKey === right.actorKey &&
    left.presentationEpoch === right.presentationEpoch
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
  onPendingHandoffExit,
  pendingHandoff = null,
  pendingHandoffAcknowledgement = null,
  pendingHandoffRequired = false,
  position,
  reducedMotion,
}: UsePositionTransitionRuntimeOptions): Readonly<MountedPositionTransition> | null {
  const [active, setActive] =
    useState<Readonly<ActivePositionTransition> | null>(null);
  const activeRef = useRef<Readonly<ActivePositionTransition> | null>(null);
  const startedActiveRef = useRef<Readonly<ActivePositionTransition> | null>(
    null,
  );
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

  const clearActive = useCallback(
    (disposition?: PendingHandoffTransitionExitDisposition): void => {
      const current = activeRef.current;
      const acknowledgement = current?.pendingHandoffAcknowledgement ?? null;
      if (disposition !== undefined && acknowledgement !== null) {
        onPendingHandoffExit?.(acknowledgement, disposition);
      }
      startedActiveRef.current = null;
      activeRef.current = null;
      setActive((mounted) => (mounted === null ? mounted : null));
    },
    [onPendingHandoffExit],
  );

  const finishActive = useCallback(
    (epoch: number, targetKey: string): void => {
      const current = activeRef.current;
      if (current?.presentation.epoch !== epoch) {
        return;
      }
      if (current.targetKey !== targetKey) {
        return;
      }
      clearActive('completed');
    },
    [clearActive],
  );

  const startActive = useCallback(
    (candidate: Readonly<ActivePositionTransition>): boolean => {
      if (
        activeRef.current !== candidate ||
        startedActiveRef.current === candidate
      ) {
        return false;
      }
      const started: Readonly<ActivePositionTransition> = Object.freeze({
        ...candidate,
        deadlineMs: Date.now() + candidate.durationMs,
      });
      activeRef.current = started;
      startedActiveRef.current = started;
      setActive(started);
      const presentationEpoch = started.presentation.epoch;
      const targetKey = started.targetKey;
      started.progress.set(
        withTiming(1, { duration: started.durationMs }, (finished): void => {
          if (finished) {
            scheduleOnRN(finishActive, presentationEpoch, targetKey);
          }
        }),
      );
      return true;
    },
    [finishActive],
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
        clearActive('aborted');
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
      mounted === null ? 1 : clampProgress(mounted.progress.get());
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
      nextTransition: Readonly<UnmountedPositionTransition>,
      animationDurationMs: number,
    ): void => {
      // A progress clock belongs to exactly one mounted presentation epoch.
      // Retiring hosts can therefore retain the cancelled prior clock without
      // receiving writes from a newer semantic transition.
      const progress = makeMutable(0);
      const nextActive: Readonly<ActivePositionTransition> = Object.freeze({
        ...nextTransition,
        deadlineMs: Number.POSITIVE_INFINITY,
        durationMs: animationDurationMs,
        pendingHandoffAcknowledgement: pendingHandoffAcknowledgementFor(
          nextTransition.presentation,
        ),
        progress,
      });
      activeRef.current = nextActive;
      setActive(nextActive);
      if (nextActive.pendingHandoffAcknowledgement === null) {
        startActive(nextActive);
      }
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
        cancelAnimation(mounted.progress);
        clearActive('aborted');
        return;
      }
      if (!geometryChanged) {
        return;
      }
      if (mounted.pendingHandoffAcknowledgement !== null) {
        cancelAnimation(mounted.progress);
        clearActive('aborted');
        return;
      }

      const remainingDurationMs = Math.max(
        0,
        Math.min(mounted.durationMs, mounted.deadlineMs - Date.now()),
      );
      cancelAnimation(mounted.progress);
      clearActive();
      if (remainingDurationMs <= 0) {
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
        return;
      }
      mount(
        Object.freeze({
          deadlineMs: mounted.deadlineMs,
          durationMs: remainingDurationMs,
          geometryEpoch: current.geometryEpoch,
          plan: mounted.plan,
          presentation,
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
    if (mounted !== null) {
      cancelAnimation(mounted.progress);
    }

    if (current.snapshot === null || dimensions === null || dimensionsChanged) {
      clearActive('aborted');
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
      (pendingHandoffRequired && pendingHandoff === null) ||
      reducedMotion ||
      durationMs === 0 ||
      current.key === null ||
      current.geometryEpoch === null ||
      current.layout === null ||
      previous.layout === null
    ) {
      clearActive('aborted');
      return;
    }

    const presentation = createTransitionPresentation({
      currentLayout: current.layout,
      pendingHandoff,
      plan: planning.plan,
      previousLayout: previous.layout,
      prior,
    });
    if (
      pendingHandoff !== null &&
      pendingHandoffAcknowledgementFor(presentation) === null
    ) {
      clearActive('aborted');
      return;
    }
    if (!presentationHasActors(presentation)) {
      clearActive('aborted');
      return;
    }

    const nextActive: Readonly<UnmountedPositionTransition> = Object.freeze({
      deadlineMs: Date.now() + durationMs,
      durationMs,
      geometryEpoch: current.geometryEpoch,
      plan: planning.plan,
      presentation,
      targetKey: current.key,
    });
    clearActive('superseded');
    mount(nextActive, durationMs);
  }, [
    active,
    clearActive,
    currentKey,
    development,
    dimensions,
    durationMs,
    geometryEpoch,
    layout,
    logWarning,
    pendingHandoff,
    pendingHandoffRequired,
    position,
    reducedMotion,
    startActive,
  ]);

  useLayoutEffect(() => {
    if (
      active === null ||
      activeRef.current !== active ||
      active.pendingHandoffAcknowledgement === null
    ) {
      return;
    }
    const acknowledged = acknowledgementsMatch(
      active.pendingHandoffAcknowledgement,
      pendingHandoffAcknowledgement,
    );
    if (startedActiveRef.current === active) {
      if (!acknowledged) {
        cancelAnimation(active.progress);
        clearActive('aborted');
      }
      return;
    }
    if (acknowledged) {
      startActive(active);
      return;
    }
    let mounted = true;
    const fallbackTimer = setTimeout(() => {
      if (
        mounted &&
        activeRef.current === active &&
        startedActiveRef.current !== active
      ) {
        clearActive('aborted');
      }
    }, 64);
    return () => {
      mounted = false;
      clearTimeout(fallbackTimer);
    };
  }, [active, clearActive, pendingHandoffAcknowledgement, startActive]);

  useLayoutEffect(
    () => () => {
      const mounted = activeRef.current;
      if (mounted !== null) {
        cancelAnimation(mounted.progress);
      }
      startedActiveRef.current = null;
      activeRef.current = null;
    },
    [],
  );

  return active !== null &&
    active.targetKey === currentKey &&
    !reducedMotion &&
    durationMs > 0
    ? active
    : null;
}
