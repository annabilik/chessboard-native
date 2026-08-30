import {
  act,
  render,
  renderHook,
  waitFor,
} from '@testing-library/react-native';
import {
  StrictMode,
  Suspense,
  useState,
  type PropsWithChildren,
  type ReactElement,
} from 'react';
import { View } from 'react-native';
import {
  ReduceMotion,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import {
  STANDARD_BOARD_DIMENSIONS,
  validateBoardDimensions,
  type ValidatedBoardDimensions,
} from '../../src/core/dimensions';
import type { NormalizedPositionValue } from '../../src/internal/position-domain';
import type {
  PendingCommitHandoffDescriptor,
  PendingCommitTransitionAcknowledgement,
} from '../../src/internal/pending-commit-handoff';
import { sampleTransitionPresentation } from '../../src/internal/transition-presentation';
import {
  DEFAULT_TRANSITION_DURATION_MS,
  normalizeTransitionDurationMs,
  usePositionTransitionRuntime,
  type PendingHandoffTransitionExitDisposition,
} from '../../src/internal/use-position-transition-runtime';
import type { BoardTransition, PositionObject } from '../../src/public-types';
import {
  createBoardSurfaceLayout,
  type BoardSurfaceLayout,
} from '../../src/render/board-layout';

jest.mock('react-native-reanimated', () => {
  const actual = jest.requireActual<typeof import('react-native-reanimated')>(
    'react-native-reanimated',
  );
  return {
    ...actual,
    withTiming: jest.fn((...args: Parameters<typeof actual.withTiming>) =>
      actual.withTiming(...args),
    ),
  };
});

const mockWithTiming = jest.mocked(withTiming);

const STANDARD_LAYOUT = createBoardSurfaceLayout(
  { height: 800, width: 800 },
  STANDARD_BOARD_DIMENSIONS,
  'white',
);

const FOUR_BY_FOUR_DIMENSIONS = validateBoardDimensions({
  columns: 4,
  rows: 4,
});
const FOUR_BY_FOUR_LAYOUT = createBoardSurfaceLayout(
  { height: 400, width: 400 },
  FOUR_BY_FOUR_DIMENSIONS,
  'white',
);

function position(
  revision: number,
  value: PositionObject,
  transition?: Readonly<BoardTransition>,
): NormalizedPositionValue {
  return Object.freeze({
    revision,
    tier: 'envelope' as const,
    value: Object.freeze(value),
    ...(transition === undefined ? {} : { transition }),
  });
}

function pendingHandoff(
  overrides: Partial<PendingCommitHandoffDescriptor> = {},
): Readonly<PendingCommitHandoffDescriptor> {
  return Object.freeze({
    boardId: 'runtime',
    epoch: 7,
    fromRevision: 1,
    intentId: 'intent:runtime',
    piece: Object.freeze({ id: 'runner', pieceType: 'wR' }),
    source: Object.freeze({ kind: 'board' as const, square: 'a1' }),
    targetSquare: 'b1',
    toRevision: 2,
    ...overrides,
  });
}

function mountedPendingAcknowledgement(
  transition: ReturnType<typeof useHarness>,
): Readonly<PendingCommitTransitionAcknowledgement> {
  const actor = transition?.presentation.pending.find(
    ({ kind }) => kind === 'pending-handoff',
  );
  if (transition === null || actor === undefined) {
    throw new Error('Expected one mounted pending-handoff actor.');
  }
  return Object.freeze({
    actorKey: actor.actorKey,
    presentationEpoch: transition.presentation.epoch,
  });
}

interface HarnessProps {
  readonly development?: boolean;
  readonly dimensions?: ValidatedBoardDimensions | null;
  readonly durationMs?: number;
  readonly geometryEpoch?: number | null;
  readonly layout?: Readonly<BoardSurfaceLayout> | null;
  readonly logWarning?: (message: string) => void;
  readonly onPendingHandoffExit?: (
    acknowledgement: Readonly<PendingCommitTransitionAcknowledgement>,
    disposition: PendingHandoffTransitionExitDisposition,
  ) => void;
  readonly pendingHandoff?: Readonly<PendingCommitHandoffDescriptor> | null;
  readonly pendingHandoffAcknowledgement?: Readonly<PendingCommitTransitionAcknowledgement> | null;
  readonly pendingHandoffRequired?: boolean;
  readonly position: NormalizedPositionValue | null;
  readonly reducedMotion?: boolean;
}

function useHarness({
  development = false,
  dimensions = STANDARD_BOARD_DIMENSIONS,
  durationMs = 300,
  geometryEpoch = 0,
  layout = STANDARD_LAYOUT,
  logWarning,
  onPendingHandoffExit,
  pendingHandoff = null,
  pendingHandoffAcknowledgement = null,
  pendingHandoffRequired = false,
  position: current,
  reducedMotion = false,
}: HarnessProps) {
  return usePositionTransitionRuntime({
    development,
    dimensions,
    durationMs,
    geometryEpoch,
    layout,
    ...(logWarning === undefined ? {} : { logWarning }),
    ...(onPendingHandoffExit === undefined ? {} : { onPendingHandoffExit }),
    pendingHandoff,
    pendingHandoffAcknowledgement,
    pendingHandoffRequired,
    position: current,
    reducedMotion,
  });
}

function StrictWrapper({ children }: PropsWithChildren): ReactElement {
  return <StrictMode>{children}</StrictMode>;
}

function RuntimeProbe({ current }: { current: NormalizedPositionValue }) {
  const transition = useHarness({
    durationMs: 1_000,
    position: current,
  });
  return (
    <View
      testID={transition === null ? 'transition-settled' : 'transition-active'}
    />
  );
}

function observeProgressWrites(progress: SharedValue<number>): unknown[] {
  const writes: unknown[] = [];
  let current: unknown = progress.value;
  Object.defineProperty(progress, 'value', {
    configurable: true,
    enumerable: true,
    get: () => current,
    set: (next: unknown) => {
      writes.push(next);
      current = next;
    },
  });
  return writes;
}

describe('mounted controlled-position transition runtime', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it('[PARITY-BEHAVIOR-B09] validates the public duration and reserves zero for snap behavior', () => {
    expect(normalizeTransitionDurationMs(undefined)).toBe(
      DEFAULT_TRANSITION_DURATION_MS,
    );
    expect(normalizeTransitionDurationMs(0)).toBe(0);
    expect(normalizeTransitionDurationMs(125.5)).toBe(125.5);
    expect(() => normalizeTransitionDurationMs(-1)).toThrow(
      'Chessboard transitionDurationMs must be a finite non-negative number.',
    );
    expect(() => normalizeTransitionDurationMs(Number.NaN)).toThrow(RangeError);
    expect(() => normalizeTransitionDurationMs('300')).toThrow(RangeError);
  });

  it('does not animate initial mount or an explicit semantic no-op revision', async () => {
    const value = {
      a1: Object.freeze({ id: 'runner', pieceType: 'wR' }),
    };
    const hook = await renderHook(useHarness, {
      initialProps: { position: position(1, value) },
    });

    expect(hook.result.current).toBeNull();
    await hook.rerender({ position: position(2, value) });
    expect(hook.result.current).toBeNull();
  });

  it('[CBN-CONTRACT-005-VISUAL-NONCANONICAL] mounts detached A-B operations and clears them after completion', async () => {
    const a = position(1, {
      a1: Object.freeze({ id: 'runner', pieceType: 'wR' }),
    });
    const b = position(2, {
      b1: Object.freeze({ id: 'runner', pieceType: 'wR' }),
    });
    const hook = await renderHook(useHarness, {
      initialProps: { position: a },
    });

    expect(hook.result.current).toBeNull();
    await hook.rerender({ position: b });
    expect(hook.result.current?.plan).toEqual(
      expect.objectContaining({
        epoch: 0,
        fromRevision: 1,
        toRevision: 2,
      }),
    );
    expect(hook.result.current?.plan.moves).toEqual([
      expect.objectContaining({ from: 'a1', to: 'b1' }),
    ]);
    expect(hook.result.current?.plan).not.toHaveProperty('position');
    expect(hook.result.current?.plan).not.toHaveProperty('beforePosition');
    expect(hook.result.current?.plan).not.toHaveProperty('afterPosition');
    expect(hook.result.current?.progress.value).toBe(0);

    await act(() => {
      jest.advanceTimersByTime(160);
    });
    expect(hook.result.current?.progress.value).toBeGreaterThan(0);
    expect(hook.result.current?.progress.value).toBeLessThan(1);

    await act(() => {
      jest.advanceTimersByTime(160);
    });
    expect(hook.result.current).toBeNull();
  });

  it('forces an elected timing animation to ignore the system scale while the runtime reduced-motion gate still snaps', async () => {
    const a = position(1, {
      a1: Object.freeze({ id: 'runner', pieceType: 'wR' }),
    });
    const b = position(2, {
      b1: Object.freeze({ id: 'runner', pieceType: 'wR' }),
    });
    mockWithTiming.mockClear();
    const animated = await renderHook(useHarness, {
      initialProps: {
        durationMs: 200,
        position: a,
        reducedMotion: false,
      },
    });
    await animated.rerender({
      durationMs: 200,
      position: b,
      reducedMotion: false,
    });

    expect(mockWithTiming).toHaveBeenCalledWith(
      1,
      {
        duration: 200,
        reduceMotion: ReduceMotion.Never,
      },
      expect.any(Function),
    );
    await animated.unmount();

    mockWithTiming.mockClear();
    const reduced = await renderHook(useHarness, {
      initialProps: {
        durationMs: 200,
        position: a,
        reducedMotion: true,
      },
    });
    await reduced.rerender({
      durationMs: 200,
      position: b,
      reducedMotion: true,
    });

    expect(reduced.result.current).toBeNull();
    expect(mockWithTiming).not.toHaveBeenCalled();
    await reduced.unmount();
  });

  it('mounts an exact pending handoff paused, starts a fresh full clock only after ACK, and snaps on ACK revocation', async () => {
    const a = position(1, {
      a1: Object.freeze({ id: 'runner', pieceType: 'wR' }),
    });
    const b = position(2, {
      b1: Object.freeze({ id: 'runner', pieceType: 'wR' }),
    });
    const onPendingHandoffExit = jest.fn();
    const baseProps: HarnessProps = {
      durationMs: 1_000,
      onPendingHandoffExit,
      pendingHandoff: null,
      pendingHandoffAcknowledgement: null,
      position: a,
    };
    const hook = await renderHook(useHarness, { initialProps: baseProps });

    await hook.rerender({
      ...baseProps,
      pendingHandoff: pendingHandoff(),
      position: b,
    });
    const paused = hook.result.current;
    if (paused === null) {
      throw new Error('Expected one paused pending handoff.');
    }
    expect(paused.progress.value).toBe(0);
    expect(paused.presentation.pending).toEqual([
      expect.objectContaining({ kind: 'pending-handoff' }),
    ]);
    await act(() => {
      jest.advanceTimersByTime(32);
    });
    expect(paused.progress.value).toBe(0);

    const acknowledgement = mountedPendingAcknowledgement(paused);
    await hook.rerender({
      ...baseProps,
      pendingHandoff: pendingHandoff(),
      pendingHandoffAcknowledgement: acknowledgement,
      position: b,
    });
    expect(hook.result.current?.progress.value).toBe(0);
    await act(() => {
      jest.advanceTimersByTime(500);
    });
    expect(hook.result.current?.progress.value).toBeCloseTo(0.5);

    await hook.rerender({
      ...baseProps,
      pendingHandoff: pendingHandoff(),
      pendingHandoffAcknowledgement: null,
      position: b,
    });
    expect(hook.result.current).toBeNull();
    expect(onPendingHandoffExit).toHaveBeenCalledWith(
      acknowledgement,
      'aborted',
    );
  });

  it('reports exact completion before retiring a completed pending handoff', async () => {
    const a = position(1, {
      a1: Object.freeze({ id: 'runner', pieceType: 'wR' }),
    });
    const b = position(2, {
      b1: Object.freeze({ id: 'runner', pieceType: 'wR' }),
    });
    const onPendingHandoffExit = jest.fn();
    const baseProps: HarnessProps = {
      durationMs: 1_000,
      onPendingHandoffExit,
      pendingHandoff: null,
      pendingHandoffAcknowledgement: null,
      position: a,
    };
    const hook = await renderHook(useHarness, { initialProps: baseProps });

    await hook.rerender({
      ...baseProps,
      pendingHandoff: pendingHandoff(),
      position: b,
    });
    const acknowledgement = mountedPendingAcknowledgement(hook.result.current);
    await hook.rerender({
      ...baseProps,
      pendingHandoff: pendingHandoff(),
      pendingHandoffAcknowledgement: acknowledgement,
      position: b,
    });
    await act(() => {
      jest.advanceTimersByTime(1_000);
    });

    expect(onPendingHandoffExit).toHaveBeenCalledTimes(1);
    expect(onPendingHandoffExit).toHaveBeenCalledWith(
      acknowledgement,
      'completed',
    );
    expect(hook.result.current).toBeNull();
  });

  it('reports an interrupted handoff when a semantic successor cannot mount', async () => {
    const a = position(1, {
      a1: Object.freeze({ id: 'runner', pieceType: 'wR' }),
    });
    const b = position(2, {
      b1: Object.freeze({ id: 'runner', pieceType: 'wR' }),
    });
    const sameValueSuccessor = position(3, b.value);
    const onPendingHandoffExit = jest.fn();
    const baseProps: HarnessProps = {
      durationMs: 1_000,
      onPendingHandoffExit,
      pendingHandoff: null,
      pendingHandoffAcknowledgement: null,
      position: a,
    };
    const hook = await renderHook(useHarness, { initialProps: baseProps });

    await hook.rerender({
      ...baseProps,
      pendingHandoff: pendingHandoff(),
      position: b,
    });
    const acknowledgement = mountedPendingAcknowledgement(hook.result.current);
    await hook.rerender({
      ...baseProps,
      position: sameValueSuccessor,
    });

    expect(hook.result.current).toBeNull();
    expect(onPendingHandoffExit).toHaveBeenCalledTimes(1);
    expect(onPendingHandoffExit).toHaveBeenCalledWith(
      acknowledgement,
      'aborted',
    );
  });

  it('fails closed for missing handoff actors and bounds an unacknowledged paused mount', async () => {
    const a = position(1, {
      a1: Object.freeze({ id: 'runner', pieceType: 'wR' }),
    });
    const b = position(2, {
      b1: Object.freeze({ id: 'runner', pieceType: 'wR' }),
    });
    const baseProps: HarnessProps = {
      durationMs: 1_000,
      pendingHandoff: null,
      pendingHandoffAcknowledgement: null,
      position: a,
    };
    const malformed = await renderHook(useHarness, {
      initialProps: baseProps,
    });
    await malformed.rerender({
      ...baseProps,
      pendingHandoff: pendingHandoff({ targetSquare: 'c1' }),
      position: b,
    });
    expect(malformed.result.current).toBeNull();

    const requiredButUnavailable = await renderHook(useHarness, {
      initialProps: baseProps,
    });
    await requiredButUnavailable.rerender({
      ...baseProps,
      pendingHandoffRequired: true,
      position: b,
    });
    expect(requiredButUnavailable.result.current).toBeNull();

    const missingAck = await renderHook(useHarness, {
      initialProps: baseProps,
    });
    await missingAck.rerender({
      ...baseProps,
      pendingHandoff: pendingHandoff(),
      position: b,
    });
    expect(missingAck.result.current?.progress.value).toBe(0);
    await act(() => {
      jest.advanceTimersByTime(65);
    });
    expect(missingAck.result.current).toBeNull();
  });

  it('uses committed B as the successor baseline and snaps special handoffs on geometry changes', async () => {
    const a = position(1, {
      a1: Object.freeze({ id: 'runner', pieceType: 'wR' }),
    });
    const b = position(2, {
      b1: Object.freeze({ id: 'runner', pieceType: 'wR' }),
    });
    const c = position(3, {
      c1: Object.freeze({ id: 'runner', pieceType: 'wR' }),
    });
    const onPendingHandoffExit = jest.fn();
    const baseProps: HarnessProps = {
      durationMs: 1_000,
      geometryEpoch: 0,
      onPendingHandoffExit,
      pendingHandoff: null,
      pendingHandoffAcknowledgement: null,
      position: a,
    };
    const successor = await renderHook(useHarness, {
      initialProps: baseProps,
    });
    await successor.rerender({
      ...baseProps,
      pendingHandoff: pendingHandoff(),
      position: b,
    });
    expect(successor.result.current?.progress.value).toBe(0);
    const supersededAcknowledgement = mountedPendingAcknowledgement(
      successor.result.current,
    );
    await successor.rerender({ ...baseProps, position: c });
    expect(onPendingHandoffExit).toHaveBeenCalledWith(
      supersededAcknowledgement,
      'superseded',
    );
    expect(successor.result.current?.plan).toEqual(
      expect.objectContaining({ fromRevision: 2, toRevision: 3 }),
    );
    expect(successor.result.current?.plan.moves).toEqual([
      expect.objectContaining({ from: 'b1', to: 'c1' }),
    ]);

    const pausedGeometry = await renderHook(useHarness, {
      initialProps: baseProps,
    });
    await pausedGeometry.rerender({
      ...baseProps,
      pendingHandoff: pendingHandoff(),
      position: b,
    });
    expect(pausedGeometry.result.current?.progress.value).toBe(0);
    await pausedGeometry.rerender({
      ...baseProps,
      geometryEpoch: 1,
      pendingHandoff: pendingHandoff(),
      position: b,
    });
    expect(pausedGeometry.result.current).toBeNull();

    const geometry = await renderHook(useHarness, {
      initialProps: baseProps,
    });
    await geometry.rerender({
      ...baseProps,
      pendingHandoff: pendingHandoff(),
      position: b,
    });
    const acknowledgement = mountedPendingAcknowledgement(
      geometry.result.current,
    );
    await geometry.rerender({
      ...baseProps,
      pendingHandoff: pendingHandoff(),
      pendingHandoffAcknowledgement: acknowledgement,
      position: b,
    });
    await act(() => {
      jest.advanceTimersByTime(500);
    });
    expect(geometry.result.current?.progress.value).toBeCloseTo(0.5);
    await geometry.rerender({
      ...baseProps,
      geometryEpoch: 1,
      pendingHandoff: pendingHandoff(),
      pendingHandoffAcknowledgement: acknowledgement,
      position: b,
    });
    expect(geometry.result.current).toBeNull();
  });

  it('bypasses pending preparation for zero duration and reduced motion', async () => {
    const a = position(1, {
      a1: Object.freeze({ id: 'runner', pieceType: 'wR' }),
    });
    const b = position(2, {
      b1: Object.freeze({ id: 'runner', pieceType: 'wR' }),
    });
    for (const options of [
      { durationMs: 0, reducedMotion: false },
      { durationMs: 1_000, reducedMotion: true },
    ]) {
      const hook = await renderHook(useHarness, {
        initialProps: {
          ...options,
          pendingHandoff: null,
          pendingHandoffAcknowledgement: null,
          position: a,
        } satisfies HarnessProps,
      });
      await hook.rerender({
        ...options,
        pendingHandoff: pendingHandoff(),
        pendingHandoffAcknowledgement: null,
        position: b,
      });
      expect(hook.result.current).toBeNull();
    }
  });

  it('[PARITY-BEHAVIOR-B10] [CBN-CONTRACT-006-LATEST-PROP-WINS] replaces A-B with continuous exact B-C work and ignores stale completion', async () => {
    const a = position(1, {
      a1: Object.freeze({ id: 'runner', pieceType: 'wR' }),
    });
    const b = position(2, {
      b1: Object.freeze({ id: 'runner', pieceType: 'wR' }),
    });
    const c = position(3, {
      c1: Object.freeze({ id: 'runner', pieceType: 'wR' }),
    });
    const hook = await renderHook(useHarness, {
      initialProps: { durationMs: 1_000, position: a },
    });

    await hook.rerender({ durationMs: 1_000, position: b });
    expect(hook.result.current?.plan.epoch).toBe(0);

    await act(() => {
      jest.advanceTimersByTime(600);
    });
    const aToB = hook.result.current;
    if (aToB === null) {
      throw new Error('Expected the A-B presentation to remain active.');
    }
    const sampled = sampleTransitionPresentation(
      aToB.presentation,
      aToB.progress.value,
    ).actors.find(({ actor }) => actor.role === 'current');
    if (sampled === undefined) {
      throw new Error('Expected one sampled A-B current actor.');
    }
    await hook.rerender({ durationMs: 1_000, position: c });
    expect(hook.result.current?.progress).not.toBe(aToB.progress);
    const retiredProgress = aToB.progress.get();
    expect(hook.result.current?.plan).toEqual(
      expect.objectContaining({
        epoch: 1,
        fromRevision: 2,
        toRevision: 3,
      }),
    );
    expect(hook.result.current?.plan.moves).toEqual([
      expect.objectContaining({ from: 'b1', to: 'c1' }),
    ]);
    expect(hook.result.current?.presentation.current[0]).toEqual(
      expect.objectContaining({
        startOpacity: sampled.opacity,
        startPoint: sampled.point,
      }),
    );
    expect(hook.result.current?.durationMs).toBe(1_000);

    await act(() => {
      jest.advanceTimersByTime(420);
    });
    expect(aToB.progress.get()).toBe(retiredProgress);
    expect(hook.result.current?.plan.epoch).toBe(1);

    await act(() => {
      jest.advanceTimersByTime(600);
    });
    expect(hook.result.current).toBeNull();
  });

  it('isolates repeated 200 ms transitions from every retired epoch clock at a 125 ms cadence', async () => {
    const squarePosition = (
      revision: number,
      square: 'e2' | 'e4',
    ): NormalizedPositionValue =>
      position(revision, {
        [square]: Object.freeze({ id: 'pawn', pieceType: 'wP' }),
      });
    const hook = await renderHook(useHarness, {
      initialProps: {
        durationMs: 200,
        position: squarePosition(0, 'e2'),
      },
    });
    const retiredClocks: {
      readonly progress: SharedValue<number>;
      readonly value: number;
    }[] = [];
    let priorClock: SharedValue<number> | null = null;

    for (let change = 1; change <= 18; change += 1) {
      await hook.rerender({
        durationMs: 200,
        position: squarePosition(change, change % 2 === 0 ? 'e2' : 'e4'),
      });
      const mounted = hook.result.current;
      if (mounted === null) {
        throw new Error(`Expected transition ${String(change)} to mount.`);
      }
      expect(mounted.durationMs).toBe(200);
      if (priorClock !== null) {
        expect(mounted.progress).not.toBe(priorClock);
        retiredClocks.push({
          progress: priorClock,
          value: priorClock.get(),
        });
      }
      await act(() => {
        jest.advanceTimersByTime(125);
      });
      for (const retired of retiredClocks) {
        expect(retired.progress.get()).toBe(retired.value);
      }
      priorClock = mounted.progress;
    }

    await act(() => {
      jest.advanceTimersByTime(210);
    });
    expect(hook.result.current).toBeNull();
  });

  it('[PARITY-BEHAVIOR-B16] settles a cancelled transition when a preserved Suspense tree is revealed', async () => {
    type HarnessState = Readonly<{
      current: NormalizedPositionValue;
      mode: 'suspended' | 'visible';
    }>;
    const never = new Promise<never>(() => undefined);
    const a = position(1, {
      a1: Object.freeze({ id: 'runner', pieceType: 'wR' }),
    });
    const b = position(2, {
      b1: Object.freeze({ id: 'runner', pieceType: 'wR' }),
    });
    let updateHarness: ((next: HarnessState) => void) | undefined;

    function NeverCommits(): ReactElement {
      // eslint-disable-next-line @typescript-eslint/only-throw-error -- React Suspense hides committed effects by throwing a pending thenable.
      throw never;
    }

    function Harness(): ReactElement {
      const [state, setState] = useState<HarnessState>({
        current: a,
        mode: 'visible',
      });
      updateHarness = setState;
      return (
        <Suspense fallback={<View testID="transition-fallback" />}>
          {state.mode === 'suspended' ? <NeverCommits /> : null}
          <RuntimeProbe current={state.current} />
        </Suspense>
      );
    }

    const result = await render(<Harness />);
    const update = updateHarness;
    if (update === undefined) {
      throw new Error('Expected the Suspense harness state setter.');
    }
    await act(() => {
      update({ current: b, mode: 'visible' });
    });
    expect(result.queryByTestId('transition-active')).not.toBeNull();

    await act(() => {
      jest.advanceTimersByTime(100);
      update({ current: b, mode: 'suspended' });
    });
    expect(result.queryByTestId('transition-fallback')).not.toBeNull();

    await act(() => {
      update({ current: b, mode: 'visible' });
    });
    await waitFor(() => {
      expect(result.queryByTestId('transition-settled')).not.toBeNull();
    });
    await act(() => {
      jest.advanceTimersByTime(1_020);
    });
    expect(result.queryByTestId('transition-active')).toBeNull();
  });

  it('does not publish orphan terminal progress writes after cancellation or unmount', async () => {
    const a = position(1, {
      a1: Object.freeze({ id: 'runner', pieceType: 'wR' }),
    });
    const b = position(2, {
      b1: Object.freeze({ id: 'runner', pieceType: 'wR' }),
    });
    const cancelled = await renderHook(useHarness, {
      initialProps: { position: a },
    });
    await cancelled.rerender({ position: b });
    const cancelledProgress = cancelled.result.current?.progress;
    if (cancelledProgress === undefined) {
      throw new Error('Expected an active transition before cancellation.');
    }
    const cancellationWrites = observeProgressWrites(cancelledProgress);

    await cancelled.rerender({ position: null });
    expect(cancelled.result.current).toBeNull();
    expect(cancellationWrites).not.toContain(1);
    await cancelled.unmount();
    expect(cancellationWrites).not.toContain(1);

    const unmounted = await renderHook(useHarness, {
      initialProps: { position: a },
    });
    await unmounted.rerender({ position: b });
    const unmountedProgress = unmounted.result.current?.progress;
    if (unmountedProgress === undefined) {
      throw new Error('Expected an active transition before unmount.');
    }
    const unmountWrites = observeProgressWrites(unmountedProgress);

    await unmounted.unmount();
    expect(unmountWrites).not.toContain(1);
  });

  it.each([
    {
      label: 'reduced motion',
      props: { durationMs: 300, reducedMotion: true },
    },
    {
      label: 'zero duration',
      props: { durationMs: 0, reducedMotion: false },
    },
  ])(
    '[CBN-CONTRACT-017-REDUCED-MOTION] settles current state for $label',
    async ({ props }) => {
      const a = position(1, {
        a1: Object.freeze({ id: 'runner', pieceType: 'wR' }),
      });
      const b = position(2, {
        b1: Object.freeze({ id: 'runner', pieceType: 'wR' }),
      });
      const hook = await renderHook(useHarness, {
        initialProps: {
          durationMs: 300,
          geometryEpoch: 0,
          position: a,
          reducedMotion: false,
        },
      });

      await hook.rerender({ ...props, position: b });
      expect(hook.result.current).toBeNull();
    },
  );

  it('[PARITY-OPTION-SHOW-ANIMATIONS] snaps immediately when reduced motion becomes active and does not replay the settled revision', async () => {
    const a = position(1, {
      a1: Object.freeze({ id: 'runner', pieceType: 'wR' }),
    });
    const b = position(2, {
      b1: Object.freeze({ id: 'runner', pieceType: 'wR' }),
    });
    const hook = await renderHook(useHarness, {
      initialProps: { position: a, reducedMotion: false },
    });

    await hook.rerender({ position: b, reducedMotion: false });
    expect(hook.result.current).not.toBeNull();
    await hook.rerender({ position: b, reducedMotion: true });
    expect(hook.result.current).toBeNull();
    await hook.rerender({ position: b, reducedMotion: false });
    expect(hook.result.current).toBeNull();
  });

  it('[PARITY-BEHAVIOR-B08] rebases active work through orientation changes with the remaining deadline', async () => {
    const a = position(1, {
      a1: Object.freeze({ id: 'runner', pieceType: 'wR' }),
    });
    const b = position(2, {
      b1: Object.freeze({ id: 'runner', pieceType: 'wR' }),
    });
    const hook = await renderHook(useHarness, {
      initialProps: {
        durationMs: 1_000,
        geometryEpoch: 0,
        position: a,
      },
    });

    await hook.rerender({
      durationMs: 1_000,
      geometryEpoch: 0,
      position: b,
    });
    expect(hook.result.current).not.toBeNull();
    await act(() => {
      jest.advanceTimersByTime(300);
    });
    const beforeRebase = hook.result.current;
    if (beforeRebase === null) {
      throw new Error('Expected active work before the geometry rebase.');
    }
    const sampledProgress = beforeRebase.progress.value;
    const sampled = sampleTransitionPresentation(
      beforeRebase.presentation,
      sampledProgress,
    ).actors.find(({ actor }) => actor.role === 'current');
    if (sampled === undefined) {
      throw new Error('Expected one sampled current actor.');
    }
    const blackLayout = createBoardSurfaceLayout(
      { height: 800, width: 800 },
      STANDARD_BOARD_DIMENSIONS,
      'black',
    );
    await hook.rerender({
      durationMs: 1_000,
      geometryEpoch: 1,
      layout: blackLayout,
      position: b,
    });
    expect(hook.result.current).not.toBeNull();
    expect(hook.result.current?.progress).not.toBe(beforeRebase.progress);
    expect(hook.result.current?.presentation.epoch).not.toBe(
      beforeRebase.presentation.epoch,
    );
    expect(hook.result.current?.presentation.current[0]?.startPoint).toEqual(
      sampled.point,
    );
    expect(hook.result.current?.presentation.current[0]?.endPoint).toEqual({
      x: 0.8125,
      y: 0.0625,
    });
    expect(sampledProgress).toBeCloseTo(0.18);
    expect(hook.result.current?.durationMs).toBeCloseTo(700, 0);
    await act(() => {
      jest.advanceTimersByTime(200);
    });
    const firstRebase = hook.result.current;
    if (firstRebase === null) {
      throw new Error(
        'Expected active work before the second geometry rebase.',
      );
    }
    await hook.rerender({
      durationMs: 1_000,
      geometryEpoch: 2,
      layout: createBoardSurfaceLayout(
        { height: 400, width: 400 },
        STANDARD_BOARD_DIMENSIONS,
        'black',
      ),
      position: b,
    });
    expect(hook.result.current?.presentation.epoch).not.toBe(
      firstRebase.presentation.epoch,
    );
    expect(hook.result.current?.durationMs).toBeCloseTo(500, 0);
    await act(() => {
      jest.advanceTimersByTime(550);
    });
    expect(hook.result.current).toBeNull();
  });

  it('dispatches malformed hint diagnostics once after commit in development', async () => {
    const logWarning = jest.fn<undefined, [string]>();
    const a = position(1, {
      a1: Object.freeze({ id: 'runner', pieceType: 'wR' }),
    });
    const staleHint = Object.freeze({
      from: 'a1',
      fromRevision: 0,
      to: 'b1',
      toRevision: 2,
    });
    const b = position(
      2,
      {
        b1: Object.freeze({ id: 'runner', pieceType: 'wR' }),
      },
      staleHint,
    );
    const hook = await renderHook(useHarness, {
      initialProps: { development: true, logWarning, position: a },
      wrapper: StrictWrapper,
    });

    await hook.rerender({ development: true, logWarning, position: b });
    expect(logWarning).toHaveBeenCalledTimes(1);
    expect(logWarning).toHaveBeenCalledWith(
      'Board transition revisions 0 -> 2 do not match 1 -> 2.',
    );

    await hook.rerender({
      development: true,
      logWarning,
      position: position(2, {
        b1: Object.freeze({ id: 'runner', pieceType: 'wR' }),
      }),
    });
    expect(logWarning).toHaveBeenCalledTimes(1);
  });

  it('preserves hint diagnostics while replanning a simultaneous position and geometry change', async () => {
    const logWarning = jest.fn<undefined, [string]>();
    const a = position(1, {
      a1: Object.freeze({ id: 'runner', pieceType: 'wR' }),
    });
    const b = position(
      2,
      {
        b1: Object.freeze({ id: 'runner', pieceType: 'wR' }),
      },
      Object.freeze({
        from: 'a1',
        fromRevision: 0,
        to: 'b1',
        toRevision: 2,
      }),
    );
    const hook = await renderHook(useHarness, {
      initialProps: {
        development: true,
        geometryEpoch: 0,
        logWarning,
        position: a,
      },
    });

    await hook.rerender({
      development: true,
      geometryEpoch: 1,
      layout: createBoardSurfaceLayout(
        { height: 800, width: 800 },
        STANDARD_BOARD_DIMENSIONS,
        'black',
      ),
      logWarning,
      position: b,
    });
    expect(hook.result.current).not.toBeNull();
    expect(logWarning).toHaveBeenCalledWith(
      'Board transition revisions 0 -> 2 do not match 1 -> 2.',
    );
  });

  it('snaps a simultaneous logical-dimension shrink before planning the old square domain', async () => {
    const hook = await renderHook(useHarness, {
      initialProps: {
        dimensions: STANDARD_BOARD_DIMENSIONS,
        geometryEpoch: 0,
        layout: STANDARD_LAYOUT,
        position: position(1, {
          h8: Object.freeze({ id: 'runner', pieceType: 'wR' }),
        }),
      },
    });

    await hook.rerender({
      dimensions: FOUR_BY_FOUR_DIMENSIONS,
      geometryEpoch: 1,
      layout: FOUR_BY_FOUR_LAYOUT,
      position: position(2, {
        d4: Object.freeze({ id: 'runner', pieceType: 'wR' }),
      }),
    });

    expect(hook.result.current).toBeNull();
  });

  it('clears active presentation when the current position becomes unavailable', async () => {
    const hook = await renderHook(useHarness, {
      initialProps: {
        position: position(1, {
          a1: Object.freeze({ id: 'runner', pieceType: 'wR' }),
        }),
      },
    });
    await hook.rerender({
      position: position(2, {
        b1: Object.freeze({ id: 'runner', pieceType: 'wR' }),
      }),
    });
    expect(hook.result.current).not.toBeNull();

    await hook.rerender({ position: null });
    expect(hook.result.current).toBeNull();
  });
});
