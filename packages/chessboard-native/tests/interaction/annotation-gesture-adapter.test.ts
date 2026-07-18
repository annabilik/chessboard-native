import {
  annotationToolsEqual,
  createAnnotationGestureAdapterState,
  normalizeAnnotationTool,
  reduceAnnotationGestureAdapter,
  type AnnotationGestureAdapterState,
  type AnnotationGestureCorrelation,
  type AnnotationGestureSnapshot,
} from '../../src/internal/annotation-gesture-adapter';

const ARROW_TOOL = Object.freeze({
  color: '#ef4444',
  opacity: 0.6,
  type: 'arrow' as const,
  width: 24,
});

const SQUARE_TOOL = Object.freeze({
  color: '#22c55e',
  shape: 'circle' as const,
  type: 'square' as const,
});

function snapshot(
  overrides: Partial<AnnotationGestureSnapshot> = {},
): Readonly<AnnotationGestureSnapshot> {
  return Object.freeze({
    annotationRevision: 7,
    boardId: 'annotations',
    geometryEpoch: 3,
    positionRevision: 5,
    providerGeometryRevision: 11,
    providerLifecycleRevision: 13,
    tool: ARROW_TOOL,
    ...overrides,
  });
}

function correlation(
  token: number,
  overrides: Partial<AnnotationGestureCorrelation> = {},
): Readonly<AnnotationGestureCorrelation> {
  return Object.freeze({
    annotationRevision: 7,
    boardId: 'annotations',
    geometryEpoch: 3,
    positionRevision: 5,
    providerGeometryRevision: 11,
    providerLifecycleRevision: 13,
    token,
    ...overrides,
  });
}

function initial(): Readonly<AnnotationGestureAdapterState> {
  return createAnnotationGestureAdapterState({ boardId: 'annotations' });
}

describe('annotation gesture adapter', () => {
  it('detaches valid tools, rejects malformed tools, and compares semantic values', () => {
    const input = {
      color: '#ef4444',
      extra: 'ignored',
      opacity: 0.6,
      type: 'arrow',
      width: 24,
    };
    const normalized = normalizeAnnotationTool(input);

    expect(normalized).toEqual(ARROW_TOOL);
    expect(normalized).not.toBe(input);
    expect(Object.isFrozen(normalized)).toBe(true);
    expect(annotationToolsEqual(ARROW_TOOL, { ...ARROW_TOOL })).toBe(true);
    expect(annotationToolsEqual(ARROW_TOOL, { ...ARROW_TOOL, width: 25 })).toBe(
      false,
    );
    expect(
      normalizeAnnotationTool({ color: '#f00', opacity: 2, type: 'arrow' }),
    ).toBeNull();
    expect(
      normalizeAnnotationTool({ color: '#f00', shape: 'x', type: 'square' }),
    ).toBeNull();
    expect(normalizeAnnotationTool(null)).toBeNull();
  });

  it('arms an explicit arrow with a visible nonpersistent anchor and finalizes a different square', () => {
    const first = reduceAnnotationGestureAdapter(initial(), {
      correlation: correlation(1),
      input: 'touch',
      snapshot: snapshot(),
      square: 'a1',
      type: 'activate',
    });

    expect(first.candidate).toBeNull();
    expect(first.state.interaction).toEqual(
      expect.objectContaining({ kind: 'armed-arrow', sourceSquare: 'a1' }),
    );
    expect(first.state.presentation).toEqual({
      baseAnnotationRevision: 7,
      basePositionRevision: 5,
      boardId: 'annotations',
      draft: {
        color: '#ef4444',
        shape: 'border',
        square: 'a1',
        type: 'square',
      },
      geometryEpoch: 3,
      providerGeometryRevision: 11,
      providerLifecycleRevision: 13,
    });
    expect(Object.isFrozen(first.state.presentation?.draft)).toBe(true);

    const second = reduceAnnotationGestureAdapter(first.state, {
      correlation: correlation(2),
      input: 'touch',
      snapshot: snapshot(),
      square: 'c3',
      type: 'activate',
    });

    expect(second.state.interaction).toBeNull();
    expect(second.state.presentation).toBeNull();
    expect(second.candidate).toEqual({
      annotation: {
        color: '#ef4444',
        from: 'a1',
        opacity: 0.6,
        to: 'c3',
        type: 'arrow',
        width: 24,
      },
      baseAnnotationRevision: 7,
      basePositionRevision: 5,
      boardId: 'annotations',
      geometryEpoch: 3,
      input: 'touch',
      path: 'explicit',
      providerGeometryRevision: 11,
      providerLifecycleRevision: 13,
      token: 2,
    });
    expect(Object.isFrozen(second.candidate)).toBe(true);
    expect(Object.isFrozen(second.candidate?.annotation)).toBe(true);
  });

  it('cancels a same-square explicit arrow and emits a square tool on one activation', () => {
    const armed = reduceAnnotationGestureAdapter(initial(), {
      correlation: correlation(1),
      input: 'touch',
      snapshot: snapshot(),
      square: 'b2',
      type: 'activate',
    });
    const sameSquare = reduceAnnotationGestureAdapter(armed.state, {
      correlation: correlation(2),
      input: 'touch',
      snapshot: snapshot(),
      square: 'b2',
      type: 'activate',
    });

    expect(sameSquare.candidate).toBeNull();
    expect(sameSquare.state.interaction).toBeNull();
    expect(sameSquare.state.presentation).toBeNull();

    const squareSnapshot = snapshot({ tool: SQUARE_TOOL });
    const square = reduceAnnotationGestureAdapter(initial(), {
      correlation: correlation(3),
      input: 'accessibility',
      snapshot: squareSnapshot,
      square: 'd4',
      type: 'activate',
    });

    expect(square.candidate).toEqual(
      expect.objectContaining({
        annotation: {
          color: '#22c55e',
          shape: 'circle',
          square: 'd4',
          type: 'square',
        },
        input: 'accessibility',
        path: 'explicit',
      }),
    );
    expect(square.state.interaction).toBeNull();
  });

  it.each(['long-press', 'two-finger'] as const)(
    'draws through distinct square boundaries and finalizes one %s candidate',
    (path) => {
      const started = reduceAnnotationGestureAdapter(initial(), {
        correlation: correlation(10),
        input: 'touch',
        path,
        snapshot: snapshot(),
        sourceSquare: 'a1',
        targetSquare: 'a1',
        type: 'start',
      });
      const unchanged = reduceAnnotationGestureAdapter(started.state, {
        correlation: correlation(10),
        targetSquare: 'a1',
        type: 'update',
      });
      const moved = reduceAnnotationGestureAdapter(unchanged.state, {
        correlation: correlation(10),
        targetSquare: 'b2',
        type: 'update',
      });

      expect(unchanged.state).toBe(started.state);
      expect(moved.state.presentation?.draft).toEqual({
        color: '#ef4444',
        from: 'a1',
        opacity: 0.6,
        to: 'b2',
        type: 'arrow',
        width: 24,
      });

      const finalized = reduceAnnotationGestureAdapter(moved.state, {
        correlation: correlation(10),
        snapshot: snapshot(),
        targetSquare: 'c3',
        type: 'finalize',
      });

      expect(finalized.candidate).toEqual(
        expect.objectContaining({ path, token: 10 }),
      );
      expect(finalized.candidate?.annotation).toEqual(
        expect.objectContaining({ from: 'a1', to: 'c3' }),
      );
      expect(finalized.state.presentation).toBeNull();
    },
  );

  it('moves square-tool drafts to the current target and cancels off-board terminals', () => {
    const squareSnapshot = snapshot({ tool: SQUARE_TOOL });
    const started = reduceAnnotationGestureAdapter(initial(), {
      correlation: correlation(20),
      input: 'touch',
      path: 'long-press',
      snapshot: squareSnapshot,
      sourceSquare: 'a1',
      targetSquare: 'b2',
      type: 'start',
    });

    expect(started.state.presentation?.draft).toEqual({
      color: '#22c55e',
      shape: 'circle',
      square: 'b2',
      type: 'square',
    });

    const offBoard = reduceAnnotationGestureAdapter(started.state, {
      correlation: correlation(20),
      snapshot: squareSnapshot,
      targetSquare: null,
      type: 'finalize',
    });
    expect(offBoard.candidate).toBeNull();
    expect(offBoard.state.interaction).toBeNull();
  });

  it('rejects foreign tokens and synchronously clears stale revision or tool correlations', () => {
    const started = reduceAnnotationGestureAdapter(initial(), {
      correlation: correlation(30),
      input: 'touch',
      path: 'two-finger',
      snapshot: snapshot(),
      sourceSquare: 'a1',
      targetSquare: 'b2',
      type: 'start',
    });
    const foreign = reduceAnnotationGestureAdapter(started.state, {
      correlation: correlation(31),
      targetSquare: 'c3',
      type: 'update',
    });
    expect(foreign.state).toBe(started.state);

    const equalTool = reduceAnnotationGestureAdapter(started.state, {
      snapshot: snapshot({ tool: { ...ARROW_TOOL } }),
      type: 'synchronize',
    });
    expect(equalTool.state).toBe(started.state);

    for (const stale of [
      snapshot({ annotationRevision: 8 }),
      snapshot({ positionRevision: 6 }),
      snapshot({ geometryEpoch: 4 }),
      snapshot({ providerGeometryRevision: 12 }),
      snapshot({ providerLifecycleRevision: 14 }),
      snapshot({ tool: { ...ARROW_TOOL, color: '#00f' } }),
    ]) {
      const cleared = reduceAnnotationGestureAdapter(started.state, {
        snapshot: stale,
        type: 'synchronize',
      });
      expect(cleared.state.interaction).toBeNull();
      expect(cleared.state.presentation).toBeNull();
    }
  });

  it('replacement starts detach the new lifecycle and correlated cancellation cannot clear it from an old token', () => {
    const first = reduceAnnotationGestureAdapter(initial(), {
      correlation: correlation(40),
      input: 'touch',
      path: 'long-press',
      snapshot: snapshot(),
      sourceSquare: 'a1',
      targetSquare: 'b2',
      type: 'start',
    });
    const replacement = reduceAnnotationGestureAdapter(first.state, {
      correlation: correlation(41),
      input: 'touch',
      path: 'two-finger',
      snapshot: snapshot(),
      sourceSquare: 'c3',
      targetSquare: 'd4',
      type: 'start',
    });
    const staleCancel = reduceAnnotationGestureAdapter(replacement.state, {
      correlation: correlation(40),
      type: 'cancel',
    });

    expect(staleCancel.state).toBe(replacement.state);
    expect(staleCancel.state.interaction).toEqual(
      expect.objectContaining({
        path: 'two-finger',
        sourceSquare: 'c3',
        targetSquare: 'd4',
      }),
    );
    const cancelled = reduceAnnotationGestureAdapter(staleCancel.state, {
      correlation: correlation(41),
      type: 'cancel',
    });
    expect(cancelled.state.interaction).toBeNull();
  });
});
