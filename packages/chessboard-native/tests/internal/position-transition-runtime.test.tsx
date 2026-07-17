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
  STANDARD_BOARD_DIMENSIONS,
  validateBoardDimensions,
  type ValidatedBoardDimensions,
} from '../../src/core/dimensions';
import type { NormalizedPositionValue } from '../../src/internal/position-domain';
import { sampleTransitionPresentation } from '../../src/internal/transition-presentation';
import {
  DEFAULT_TRANSITION_DURATION_MS,
  normalizeTransitionDurationMs,
  usePositionTransitionRuntime,
} from '../../src/internal/use-position-transition-runtime';
import type { BoardTransition, PositionObject } from '../../src/public-types';
import {
  createBoardSurfaceLayout,
  type BoardSurfaceLayout,
} from '../../src/render/board-layout';

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

interface HarnessProps {
  readonly development?: boolean;
  readonly dimensions?: ValidatedBoardDimensions | null;
  readonly durationMs?: number;
  readonly geometryEpoch?: number | null;
  readonly layout?: Readonly<BoardSurfaceLayout> | null;
  readonly logWarning?: (message: string) => void;
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
    expect(hook.result.current?.plan.epoch).toBe(1);

    await act(() => {
      jest.advanceTimersByTime(600);
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
