import {
  createInteractionState,
  reduceInteraction,
  type MoveIntentLifecycle,
} from '../../src/internal/interaction-reducer';
import {
  derivePendingCommitHandoff,
  type DerivePendingCommitHandoffOptions,
} from '../../src/internal/pending-commit-handoff';
import type { NormalizedPositionValue } from '../../src/internal/position-domain';
import type { MoveIntent, PositionObject } from '../../src/public-types';

const BOARD_ID = 'analysis';
const BASE_REVISION = 7;
const INTENT_ID = 'move:analysis:1';
const EMPTY_POSITION: PositionObject = Object.freeze({});

function intent(overrides: Partial<MoveIntent> = {}): Readonly<MoveIntent> {
  return Object.freeze({
    basePositionRevision: BASE_REVISION,
    boardId: BOARD_ID,
    input: 'drag' as const,
    intentId: INTENT_ID,
    piece: Object.freeze({ id: 'runner', pieceType: 'wR' }),
    source: Object.freeze({ kind: 'board' as const, square: 'a1' }),
    targetSquare: 'b1',
    ...overrides,
  });
}

function deciding(
  move: Readonly<MoveIntent> = intent(),
): Readonly<Extract<MoveIntentLifecycle, { phase: 'deciding' }>> {
  const result = reduceInteraction(
    createInteractionState({
      boardId: BOARD_ID,
      positionRevision: BASE_REVISION,
    }),
    { intent: move, type: 'request' },
  ).state;
  if (result.phase !== 'deciding') {
    throw new Error('Expected a deciding move lifecycle.');
  }
  return result;
}

function awaitingCommit(
  move: Readonly<MoveIntent> = intent(),
): Readonly<Extract<MoveIntentLifecycle, { phase: 'awaiting-commit' }>> {
  const pending = deciding(move);
  const result = reduceInteraction(pending, {
    decision: { status: 'accepted' },
    epoch: pending.epoch,
    intentId: pending.intent.intentId,
    type: 'decision-resolved',
  }).state;
  if (result.phase !== 'awaiting-commit') {
    throw new Error('Expected an awaiting-commit move lifecycle.');
  }
  return result;
}

function position(
  revision = BASE_REVISION + 1,
  committedIntentId: string | null = INTENT_ID,
  tier: NormalizedPositionValue['tier'] = 'envelope',
): Readonly<NormalizedPositionValue> {
  return Object.freeze({
    ...(committedIntentId === null ? {} : { committedIntentId }),
    revision,
    tier,
    value: EMPTY_POSITION,
  });
}

function options(
  overrides: Partial<DerivePendingCommitHandoffOptions> = {},
): DerivePendingCommitHandoffOptions {
  return {
    boardId: BOARD_ID,
    lifecycle: awaitingCommit(),
    position: position(),
    ...overrides,
  };
}

describe('pending controlled-commit handoff derivation', () => {
  it.each([
    ['deciding', deciding()],
    ['awaiting-commit', awaitingCommit()],
  ] as const)(
    'derives detached correlation from the %s phase',
    (_phase, lifecycle) => {
      const handoff = derivePendingCommitHandoff(options({ lifecycle }));

      expect(handoff).toEqual({
        boardId: BOARD_ID,
        epoch: lifecycle.epoch,
        fromRevision: BASE_REVISION,
        intentId: INTENT_ID,
        piece: { id: 'runner', pieceType: 'wR' },
        source: { kind: 'board', square: 'a1' },
        targetSquare: 'b1',
        toRevision: BASE_REVISION + 1,
      });
      expect(Object.keys(handoff ?? {}).sort()).toEqual([
        'boardId',
        'epoch',
        'fromRevision',
        'intentId',
        'piece',
        'source',
        'targetSquare',
        'toRevision',
      ]);
      expect(handoff).not.toHaveProperty('position');
      expect(handoff).not.toHaveProperty('value');
      expect(handoff).not.toHaveProperty('input');
    },
  );

  it('copies board and spare actors into deeply frozen presentation data', () => {
    const boardLifecycle = awaitingCommit();
    const boardHandoff = derivePendingCommitHandoff(
      options({ lifecycle: boardLifecycle }),
    );
    expect(boardHandoff?.piece).not.toBe(boardLifecycle.intent.piece);
    expect(boardHandoff?.source).not.toBe(boardLifecycle.intent.source);
    expect(Object.isFrozen(boardHandoff)).toBe(true);
    expect(Object.isFrozen(boardHandoff?.piece)).toBe(true);
    expect(Object.isFrozen(boardHandoff?.source)).toBe(true);

    const spareLifecycle = awaitingCommit(
      intent({
        input: 'accessibility',
        source: Object.freeze({
          kind: 'spare' as const,
          spareId: 'white-queen',
        }),
        targetSquare: null,
      }),
    );
    const spareHandoff = derivePendingCommitHandoff(
      options({ lifecycle: spareLifecycle }),
    );
    expect(spareHandoff).toEqual(
      expect.objectContaining({
        source: { kind: 'spare', spareId: 'white-queen' },
        targetSquare: null,
      }),
    );
    expect(Object.isFrozen(spareHandoff?.source)).toBe(true);
  });

  it.each([
    ['missing board', { boardId: null }],
    ['missing lifecycle', { lifecycle: null }],
    ['missing position', { position: null }],
    [
      'idle lifecycle',
      {
        lifecycle: createInteractionState({
          boardId: BOARD_ID,
          positionRevision: BASE_REVISION,
        }),
      },
    ],
    ['foreign mounted board', { boardId: 'other-board' }],
    ['unchanged revision', { position: position(BASE_REVISION) }],
    ['older revision', { position: position(BASE_REVISION - 1) }],
    ['plain position tier', { position: position(8, INTENT_ID, 'plain') }],
    ['missing commit ID', { position: position(8, null) }],
    ['empty commit ID', { position: position(8, '') }],
    ['blank commit ID', { position: position(8, '   ') }],
    ['different commit ID', { position: position(8, 'other-intent') }],
  ] as const)('rejects %s', (_label, overrides) => {
    expect(
      derivePendingCommitHandoff(
        options(overrides as Partial<DerivePendingCommitHandoffOptions>),
      ),
    ).toBeNull();
  });

  it('rejects inconsistent raw lifecycle board and revision correlation', () => {
    const current = awaitingCommit();
    const foreignIntent = Object.freeze({
      ...current,
      intent: Object.freeze({ ...current.intent, boardId: 'other-board' }),
    });
    expect(
      derivePendingCommitHandoff(options({ lifecycle: foreignIntent })),
    ).toBeNull();

    const staleIntent = Object.freeze({
      ...current,
      intent: Object.freeze({
        ...current.intent,
        basePositionRevision: BASE_REVISION - 1,
      }),
    });
    expect(
      derivePendingCommitHandoff(options({ lifecycle: staleIntent })),
    ).toBeNull();
  });

  it('does not read or retain the canonical position value', () => {
    const current = Object.defineProperties(
      {
        committedIntentId: INTENT_ID,
        revision: BASE_REVISION + 1,
        tier: 'envelope',
      },
      {
        value: {
          enumerable: true,
          get: () => {
            throw new Error('Canonical position must not be read.');
          },
        },
      },
    ) as unknown as NormalizedPositionValue;

    expect(derivePendingCommitHandoff(options({ position: current }))).toEqual(
      expect.objectContaining({
        fromRevision: BASE_REVISION,
        toRevision: BASE_REVISION + 1,
      }),
    );
  });
});
