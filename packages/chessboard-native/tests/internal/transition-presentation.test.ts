import {
  MAX_TRANSITION_PRESENTATION_RESIDUALS,
  MIN_TRANSITION_PRESENTATION_OPACITY,
  createTransitionPresentation,
  projectTransitionPresentationActor,
  rebaseTransitionPresentation,
  sampleTransitionPresentation,
  type PendingCommitHandoffDescriptor,
  type TransitionPresentation,
  type TransitionVisualPoint,
} from '../../src/internal/transition-presentation';
import type {
  EnterPieceTransition,
  ExitPieceTransition,
  MovePieceTransition,
  PositionTransitionPlan,
  ReplacePieceTransition,
} from '../../src/internal/transition-planner';
import type {
  BoardOrientation,
  MoveSource,
  PieceData,
} from '../../src/public-types';
import {
  createBoardSurfaceLayout,
  type BoardSurfaceLayout,
} from '../../src/render/board-layout';

function piece(id: string, pieceType = 'token'): Readonly<PieceData> {
  return Object.freeze({ id, pieceType });
}

function move(
  from: string,
  to: string,
  actor: Readonly<PieceData>,
): Readonly<MovePieceTransition> {
  return Object.freeze({
    after: actor,
    before: actor,
    from,
    kind: 'move',
    matchedBy: 'piece-id',
    to,
  });
}

function replacement(
  from: string,
  to: string,
  before: Readonly<PieceData>,
  after: Readonly<PieceData>,
): Readonly<ReplacePieceTransition> {
  return Object.freeze({
    after,
    before,
    from,
    kind: 'replace',
    matchedBy: 'piece-id',
    to,
  });
}

function exit(
  from: string,
  actor: Readonly<PieceData>,
): Readonly<ExitPieceTransition> {
  return Object.freeze({
    from,
    kind: 'exit',
    piece: actor,
    reason: 'removed',
  });
}

function enter(
  to: string,
  actor: Readonly<PieceData>,
): Readonly<EnterPieceTransition> {
  return Object.freeze({
    kind: 'enter',
    piece: actor,
    reason: 'added',
    to,
  });
}

function plan(
  fromRevision: number,
  toRevision: number,
  epoch: number,
  operations: Partial<PositionTransitionPlan> = {},
): Readonly<PositionTransitionPlan> {
  return Object.freeze({
    enters: Object.freeze([]),
    epoch,
    exits: Object.freeze([]),
    fromRevision,
    hasAmbiguity: false,
    hint: null,
    moves: Object.freeze([]),
    replacements: Object.freeze([]),
    toRevision,
    ...operations,
  });
}

function layout(
  columns: number,
  rows = 1,
  width = columns * 100,
  height = rows * 100,
  orientation: BoardOrientation = 'white',
): Readonly<BoardSurfaceLayout> {
  return createBoardSurfaceLayout(
    { height, width },
    { columns, rows },
    orientation,
  );
}

function squarePoint(
  board: Readonly<BoardSurfaceLayout>,
  square: string,
): Readonly<TransitionVisualPoint> {
  const cell = board.cells.find((candidate) => candidate.square === square);
  if (cell === undefined) {
    throw new Error(`Expected ${square} in the test layout.`);
  }
  return Object.freeze({
    x: (cell.rect.left + cell.rect.width / 2) / board.size.width,
    y: (cell.rect.top + cell.rect.height / 2) / board.size.height,
  });
}

function expectPoint(
  actual: Readonly<TransitionVisualPoint>,
  expected: Readonly<TransitionVisualPoint>,
): void {
  expect(actual.x).toBeCloseTo(expected.x);
  expect(actual.y).toBeCloseTo(expected.y);
}

function onlyCurrent(
  presentation: Readonly<TransitionPresentation>,
): Readonly<TransitionPresentation['current'][number]> {
  expect(presentation.current).toHaveLength(1);
  const actor = presentation.current[0];
  if (actor === undefined) {
    throw new Error('Expected one current presentation actor.');
  }
  return actor;
}

function handoff(
  overrides: Partial<PendingCommitHandoffDescriptor> = {},
): Readonly<PendingCommitHandoffDescriptor> {
  return Object.freeze({
    boardId: 'board',
    epoch: 0,
    fromRevision: 1,
    intentId: 'intent-1',
    piece: piece('runner'),
    source: Object.freeze({ kind: 'board' as const, square: 'a1' }),
    targetSquare: 'b1',
    toRevision: 2,
    ...overrides,
  });
}

describe('pure transition presentation continuity', () => {
  it('starts exact B-C work at the sampled A-B point and opacity', () => {
    const board = layout(3);
    const runner = piece('runner');
    const abPlan = plan(1, 2, 4, {
      moves: Object.freeze([move('a1', 'b1', runner)]),
    });
    const ab = createTransitionPresentation({
      currentLayout: board,
      plan: abPlan,
      previousLayout: board,
    });
    const sampled = sampleTransitionPresentation(ab, 0.6);
    const sampledRunner = sampled.actors.find(
      ({ actor }) => actor.role === 'current',
    );
    if (sampledRunner === undefined) {
      throw new Error('Expected the sampled A-B runner.');
    }

    const bcPlan = plan(2, 3, 5, {
      moves: Object.freeze([move('b1', 'c1', runner)]),
    });
    const bc = createTransitionPresentation({
      currentLayout: board,
      plan: bcPlan,
      previousLayout: board,
      prior: sampled,
    });
    const actor = onlyCurrent(bc);

    expect(bc).toEqual(
      expect.objectContaining({ epoch: 5, fromRevision: 2, toRevision: 3 }),
    );
    expect(actor.kind).toBe('move');
    expect(actor.fromAnchor).toEqual({ piece: runner, square: 'b1' });
    expect(actor.toAnchor).toEqual({ piece: runner, square: 'c1' });
    expect(actor.startOpacity).toBe(sampledRunner.opacity);
    expectPoint(actor.startPoint, sampledRunner.point);
    expectPoint(actor.endPoint, squarePoint(board, 'c1'));

    const projected = projectTransitionPresentationActor(actor, board);
    expect(projected).toEqual({
      endOpacity: 1,
      endTranslateX: 0,
      endTranslateY: 0,
      startOpacity: 1,
      startTranslateX: -140,
      startTranslateY: 0,
    });
  });

  it('carries an unconsumed prior current actor toward its same canonical square', () => {
    const board = layout(5);
    const runner = piece('runner');
    const sentry = piece('sentry');
    const ab = createTransitionPresentation({
      currentLayout: board,
      plan: plan(1, 2, 10, {
        moves: Object.freeze([
          move('a1', 'b1', runner),
          move('d1', 'e1', sentry),
        ]),
      }),
      previousLayout: board,
    });
    const sampled = sampleTransitionPresentation(ab, 0.5);
    const priorSentry = sampled.actors.find(
      ({ actor }) => actor.toAnchor?.piece.id === 'sentry',
    );
    if (priorSentry === undefined) {
      throw new Error('Expected a sampled sentry.');
    }

    const next = createTransitionPresentation({
      currentLayout: board,
      plan: plan(2, 3, 11, {
        moves: Object.freeze([move('b1', 'c1', runner)]),
      }),
      previousLayout: board,
      prior: sampled,
    });
    const carried = next.current.find(({ kind }) => kind === 'carry');
    if (carried === undefined) {
      throw new Error('Expected the unchanged sentry to be carried.');
    }

    expect(carried.currentSquare).toBe('e1');
    expect(carried.fromAnchor).toEqual({ piece: sentry, square: 'e1' });
    expect(carried.toAnchor).toEqual({ piece: sentry, square: 'e1' });
    expect(carried.startOpacity).toBe(priorSentry.opacity);
    expectPoint(carried.startPoint, priorSentry.point);
    expectPoint(carried.endPoint, squarePoint(board, 'e1'));
    expect(next.current.map(({ kind }) => kind).sort()).toEqual([
      'carry',
      'move',
    ]);
  });

  it('continues detached exits, replacement artwork, and pending artwork as fading residuals', () => {
    const board = layout(6);
    const victim = piece('victim');
    const pawn = piece('pawn', 'wP');
    const queen = piece('pawn', 'wQ');
    const runner = piece('runner');
    const first = createTransitionPresentation({
      currentLayout: board,
      pendingHandoff: handoff({
        piece: runner,
        source: Object.freeze({ kind: 'board', square: 'd1' }),
        targetSquare: 'e1',
      }),
      plan: plan(1, 2, 20, {
        exits: Object.freeze([exit('a1', victim)]),
        moves: Object.freeze([move('d1', 'e1', runner)]),
        replacements: Object.freeze([replacement('b1', 'c1', pawn, queen)]),
      }),
      previousLayout: board,
    });
    const sampled = sampleTransitionPresentation(first, 0.4);
    const priorFading = sampled.actors.filter(
      ({ actor }) => actor.role !== 'current',
    );
    expect(priorFading).toHaveLength(3);
    expect(priorFading.map(({ opacity }) => opacity)).toEqual([0.6, 0.6, 0.6]);

    const next = createTransitionPresentation({
      currentLayout: board,
      plan: plan(2, 3, 21),
      previousLayout: board,
      prior: sampled,
    });
    const detachedResiduals = next.detached.filter(
      ({ kind }) => kind === 'residual',
    );
    const pendingResiduals = next.pending.filter(
      ({ kind }) => kind === 'residual',
    );

    expect(detachedResiduals).toHaveLength(2);
    expect(pendingResiduals).toHaveLength(1);
    expect(next.residualCount).toBe(3);
    for (const actor of [...detachedResiduals, ...pendingResiduals]) {
      expect(actor.startOpacity).toBeCloseTo(0.6);
      expect(actor.endOpacity).toBe(0);
      expectPoint(actor.startPoint, actor.endPoint);
    }
    expect(sampleTransitionPresentation(next, 1).actors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ opacity: 0 }),
        expect.objectContaining({ opacity: 0 }),
        expect.objectContaining({ opacity: 0 }),
      ]),
    );
  });

  it.each([
    ['resized white geometry', layout(3, 2, 600, 400, 'white')],
    ['resized black geometry', layout(3, 2, 600, 400, 'black')],
  ] as const)(
    'rebases a sampled origin and the canonical endpoint through %s',
    (_label, nextLayout) => {
      const initialLayout = layout(3, 2, 300, 200, 'white');
      const runner = piece('runner');
      const initial = createTransitionPresentation({
        currentLayout: initialLayout,
        plan: plan(1, 2, 30, {
          moves: Object.freeze([move('a1', 'c2', runner)]),
        }),
        previousLayout: initialLayout,
      });
      const sample = sampleTransitionPresentation(initial, 0.25);
      const sampledRunner = sample.actors.find(
        ({ actor }) => actor.role === 'current',
      );
      if (sampledRunner === undefined) {
        throw new Error('Expected a sampled runner.');
      }

      const rebased = rebaseTransitionPresentation({
        epoch: 31,
        layout: nextLayout,
        presentation: initial,
        progress: 0.25,
      });
      const actor = onlyCurrent(rebased);

      expect(rebased).toEqual(
        expect.objectContaining({
          epoch: 31,
          fromRevision: 1,
          toRevision: 2,
        }),
      );
      expectPoint(actor.startPoint, sampledRunner.point);
      expectPoint(actor.endPoint, squarePoint(nextLayout, 'c2'));
      expect(actor.currentSquare).toBe('c2');
      expect(actor.toAnchor?.square).toBe('c2');

      const projection = projectTransitionPresentationActor(actor, nextLayout);
      if (projection === null) {
        throw new Error('Expected a rebased pixel projection.');
      }
      const target = squarePoint(nextLayout, 'c2');
      expect(projection.startTranslateX).toBeCloseTo(
        (sampledRunner.point.x - target.x) * nextLayout.size.width,
      );
      expect(projection.startTranslateY).toBeCloseTo(
        (sampledRunner.point.y - target.y) * nextLayout.size.height,
      );
      expect(projection.endTranslateX).toBeCloseTo(0);
      expect(projection.endTranslateY).toBeCloseTo(0);
    },
  );

  it('crossfades an exact board pending move at its already rendered target', () => {
    const board = layout(2);
    const runner = piece('runner');
    const presentation = createTransitionPresentation({
      currentLayout: board,
      pendingHandoff: handoff(),
      plan: plan(1, 2, 40, {
        moves: Object.freeze([move('a1', 'b1', runner)]),
      }),
      previousLayout: board,
    });
    const current = onlyCurrent(presentation);
    const pending = presentation.pending[0];
    if (pending === undefined) {
      throw new Error('Expected the pending board artwork.');
    }

    expect(current).toEqual(
      expect.objectContaining({
        currentSquare: 'b1',
        kind: 'move',
        startOpacity: 0,
      }),
    );
    expectPoint(current.startPoint, squarePoint(board, 'b1'));
    expectPoint(current.endPoint, squarePoint(board, 'b1'));
    expect(pending).toEqual(
      expect.objectContaining({
        endOpacity: 0,
        kind: 'pending-handoff',
        rendererSource: { kind: 'board', square: 'a1' },
        rendererSquare: 'b1',
        startOpacity: 1,
      }),
    );
    expectPoint(pending.startPoint, squarePoint(board, 'b1'));
    expectPoint(pending.endPoint, squarePoint(board, 'b1'));
  });

  it('replaces exact promotion source artwork with target artwork in place', () => {
    const board = layout(2);
    const pawn = piece('pawn', 'wP');
    const queen = piece('pawn', 'wQ');
    const presentation = createTransitionPresentation({
      currentLayout: board,
      pendingHandoff: handoff({ piece: pawn }),
      plan: plan(1, 2, 41, {
        replacements: Object.freeze([replacement('a1', 'b1', pawn, queen)]),
      }),
      previousLayout: board,
    });

    const current = onlyCurrent(presentation);
    expect(current.kind).toBe('replace-enter');
    expect(current.piece).toEqual(queen);
    expect(current.startOpacity).toBe(0);
    expectPoint(current.startPoint, squarePoint(board, 'b1'));
    expect(presentation.detached).toEqual([]);
    expect(presentation.pending).toEqual([
      expect.objectContaining({
        kind: 'pending-handoff',
        piece: pawn,
        rendererSquare: 'b1',
        startOpacity: 1,
      }),
    ]);
  });

  it('crossfades an exact spare placement at the controlled target', () => {
    const board = layout(2);
    const queen = piece('spare-queen', 'wQ');
    const source: Readonly<MoveSource> = Object.freeze({
      kind: 'spare',
      spareId: 'white-queen',
    });
    const presentation = createTransitionPresentation({
      currentLayout: board,
      pendingHandoff: handoff({ piece: queen, source }),
      plan: plan(1, 2, 42, {
        enters: Object.freeze([enter('b1', queen)]),
      }),
      previousLayout: board,
    });

    const current = onlyCurrent(presentation);
    expect(current).toEqual(
      expect.objectContaining({
        kind: 'enter',
        startOpacity: 0,
        startPoint: squarePoint(board, 'b1'),
      }),
    );
    expect(presentation.pending).toEqual([
      expect.objectContaining({
        kind: 'pending-handoff',
        rendererSource: source,
        rendererSquare: 'b1',
        startOpacity: 1,
      }),
    ]);
  });

  it.each([
    ['source', handoff({ source: { kind: 'board', square: 'b1' } })],
    ['piece', handoff({ piece: piece('other') })],
    ['target', handoff({ targetSquare: 'a1' })],
    ['from revision', handoff({ fromRevision: 0 })],
    ['to revision', handoff({ toRevision: 3 })],
  ] as const)(
    'leaves an ordinary move for a mismatched %s',
    (_label, pending) => {
      const board = layout(2);
      const presentation = createTransitionPresentation({
        currentLayout: board,
        pendingHandoff: pending,
        plan: plan(1, 2, 50, {
          moves: Object.freeze([move('a1', 'b1', piece('runner'))]),
        }),
        previousLayout: board,
      });
      const actor = onlyCurrent(presentation);

      expect(presentation.pending).toEqual([]);
      expect(actor.startOpacity).toBe(1);
      expectPoint(actor.startPoint, squarePoint(board, 'a1'));
      expectPoint(actor.endPoint, squarePoint(board, 'b1'));
    },
  );

  it('keeps an off-board pending removal on the ordinary exit path', () => {
    const board = layout(2);
    const runner = piece('runner');
    const presentation = createTransitionPresentation({
      currentLayout: board,
      pendingHandoff: handoff({ targetSquare: null }),
      plan: plan(1, 2, 51, {
        exits: Object.freeze([exit('a1', runner)]),
      }),
      previousLayout: board,
    });

    expect(presentation.current).toEqual([]);
    expect(presentation.pending).toEqual([]);
    expect(presentation.detached).toEqual([
      expect.objectContaining({
        endOpacity: 0,
        kind: 'exit',
        piece: runner,
        rendererSquare: 'a1',
        startOpacity: 1,
      }),
    ]);
  });

  it('prunes sub-pixel alpha residuals and caps retained actors', () => {
    const board = layout(11, 6, 1_100, 600);
    const exits = board.cells.map(({ square }, index) =>
      exit(square, piece(`actor-${String(index)}`)),
    );
    expect(exits).toHaveLength(66);
    const first = createTransitionPresentation({
      currentLayout: board,
      plan: plan(1, 2, 60, { exits: Object.freeze(exits) }),
      previousLayout: board,
    });
    const secondPlan = plan(2, 3, 61);

    const capped = createTransitionPresentation({
      currentLayout: board,
      plan: secondPlan,
      previousLayout: board,
      prior: sampleTransitionPresentation(first, 0.5),
      residualLimit: MAX_TRANSITION_PRESENTATION_RESIDUALS + 100,
    });
    expect(capped.residualCount).toBe(MAX_TRANSITION_PRESENTATION_RESIDUALS);
    expect(capped.detached).toHaveLength(MAX_TRANSITION_PRESENTATION_RESIDUALS);

    const limited = createTransitionPresentation({
      currentLayout: board,
      plan: secondPlan,
      previousLayout: board,
      prior: sampleTransitionPresentation(first, 0.5),
      residualLimit: 2,
    });
    expect(limited.residualCount).toBe(2);

    const pruned = createTransitionPresentation({
      currentLayout: board,
      plan: secondPlan,
      previousLayout: board,
      prior: sampleTransitionPresentation(
        first,
        1 - MIN_TRANSITION_PRESENTATION_OPACITY / 2,
      ),
    });
    expect(pruned.residualCount).toBe(0);
    expect(pruned.detached).toEqual([]);

    expect(() =>
      createTransitionPresentation({
        currentLayout: board,
        plan: secondPlan,
        previousLayout: board,
        residualLimit: -1,
      }),
    ).toThrow(
      'Transition presentation residualLimit must be a non-negative safe integer.',
    );
  });

  it('projects normalized movement into exact rectangular board pixels', () => {
    const board = layout(3, 2, 300, 200, 'white');
    const presentation = createTransitionPresentation({
      currentLayout: board,
      plan: plan(1, 2, 70, {
        moves: Object.freeze([move('a1', 'c2', piece('runner'))]),
      }),
      previousLayout: board,
    });
    const actor = onlyCurrent(presentation);

    expect(projectTransitionPresentationActor(actor, board)).toEqual({
      endOpacity: 1,
      endTranslateX: 0,
      endTranslateY: 0,
      startOpacity: 1,
      startTranslateX: -200,
      startTranslateY: 100,
    });
    expect(
      projectTransitionPresentationActor(actor, layout(1, 1, 100, 100)),
    ).toBeNull();
  });
});
