import fc from 'fast-check';

import {
  STANDARD_BOARD_DIMENSIONS,
  validateBoardDimensions,
} from '../../src/core/dimensions';
import type {
  BoardTransition,
  PieceData,
  PositionObject,
} from '../../src/public-types';
import {
  inferPositionTransition,
  planPositionTransition,
  type TransitionPositionSnapshot,
} from '../../src/internal/transition-planner';

const dimensions = STANDARD_BOARD_DIMENSIONS;

function snapshot(
  revision: number,
  value: PositionObject,
  transition?: Readonly<BoardTransition>,
): TransitionPositionSnapshot {
  return {
    revision,
    value,
    ...(transition === undefined ? {} : { transition }),
  };
}

function requirePlan(
  result: ReturnType<typeof planPositionTransition>,
): NonNullable<ReturnType<typeof planPositionTransition>['plan']> {
  if (result.plan === null) {
    throw new Error('Expected a transition plan.');
  }
  return result.plan;
}

describe('controlled position transition planner', () => {
  it('settles initial mounts and semantic no-ops without a transition plan', () => {
    const position = { e4: { id: 'pawn', pieceType: 'wP' } } as const;

    expect(
      planPositionTransition({
        after: snapshot(4, position),
        before: null,
        dimensions,
        epoch: 0,
      }),
    ).toEqual({ plan: null, warnings: [] });

    const hintedInitialMount = planPositionTransition({
      after: snapshot(4, position, {
        from: 'e2',
        fromRevision: 3,
        to: 'e4',
        toRevision: 4,
      }),
      before: null,
      dimensions,
      epoch: 1,
    });
    expect(hintedInitialMount.plan).toBeNull();
    expect(hintedInitialMount.warnings).toEqual([
      expect.objectContaining({ code: 'revision-mismatch' }),
    ]);

    expect(
      planPositionTransition({
        after: snapshot(5, position),
        before: snapshot(4, position),
        dimensions,
        epoch: 1,
      }),
    ).toEqual({ plan: null, warnings: [] });

    const hintedNoOp = planPositionTransition({
      after: snapshot(
        5,
        {
          a1: { pieceType: 'wR' },
          b1: { pieceType: 'wR' },
        },
        {
          from: 'a1',
          fromRevision: 4,
          to: 'b1',
          toRevision: 5,
        },
      ),
      before: snapshot(4, {
        a1: { pieceType: 'wR' },
        b1: { pieceType: 'wR' },
      }),
      dimensions,
      epoch: 2,
    });
    expect(hintedNoOp.plan).toBeNull();
    expect(hintedNoOp.warnings).toEqual([
      expect.objectContaining({ code: 'position-mismatch' }),
    ]);

    const hintedReusedRevision = planPositionTransition({
      after: snapshot(4, position, {
        from: 'e2',
        fromRevision: 3,
        to: 'e4',
        toRevision: 4,
      }),
      before: snapshot(4, position),
      dimensions,
      epoch: 3,
    });
    expect(hintedReusedRevision.plan).toBeNull();
    expect(hintedReusedRevision.warnings).toEqual([
      expect.objectContaining({ code: 'revision-mismatch' }),
    ]);
  });

  it('[PARITY-EXPORT-GET-POSITION-UPDATES] matches stable IDs first and unique anonymous actors without chess ownership', () => {
    const inferred = inferPositionTransition({
      after: {
        c3: { pieceType: 'custom-dragon' },
        e4: { id: 'pawn', pieceType: 'wP' },
      },
      before: {
        a1: { pieceType: 'custom-dragon' },
        e2: { id: 'pawn', pieceType: 'wP' },
      },
      dimensions,
    });

    expect(inferred).toEqual({
      enters: [],
      exits: [],
      hasAmbiguity: false,
      moves: [
        {
          after: { pieceType: 'custom-dragon' },
          before: { pieceType: 'custom-dragon' },
          from: 'a1',
          kind: 'move',
          matchedBy: 'piece-type',
          to: 'c3',
        },
        {
          after: { id: 'pawn', pieceType: 'wP' },
          before: { id: 'pawn', pieceType: 'wP' },
          from: 'e2',
          kind: 'move',
          matchedBy: 'piece-id',
          to: 'e4',
        },
      ],
      replacements: [],
    });
  });

  it('keeps IDs authoritative across type changes and never falls them back to anonymous actors', () => {
    const inferred = inferPositionTransition({
      after: {
        a8: { id: 'promoting-pawn', pieceType: 'wQ' },
        h8: { pieceType: 'wP' },
      },
      before: {
        a7: { id: 'promoting-pawn', pieceType: 'wP' },
        h7: { id: 'removed-pawn', pieceType: 'wP' },
      },
      dimensions,
    });

    expect(inferred.replacements).toEqual([
      {
        after: { id: 'promoting-pawn', pieceType: 'wQ' },
        before: { id: 'promoting-pawn', pieceType: 'wP' },
        from: 'a7',
        kind: 'replace',
        matchedBy: 'piece-id',
        to: 'a8',
      },
    ]);
    expect(inferred.moves).toEqual([]);
    expect(inferred.exits).toEqual([
      {
        from: 'h7',
        kind: 'exit',
        piece: { id: 'removed-pawn', pieceType: 'wP' },
        reason: 'removed',
      },
    ]);
    expect(inferred.enters).toEqual([
      {
        kind: 'enter',
        piece: { pieceType: 'wP' },
        reason: 'added',
        to: 'h8',
      },
    ]);
  });

  it('does not trust a direct explicit match that contradicts stable identity', () => {
    const inferred = inferPositionTransition({
      after: {
        e4: { id: 'other-pawn', pieceType: 'wP' },
      },
      before: {
        e2: { id: 'pawn', pieceType: 'wP' },
      },
      dimensions,
      explicitMatch: { from: 'e2', to: 'e4' },
    });

    expect(inferred.moves).toEqual([]);
    expect(inferred.exits).toEqual([
      expect.objectContaining({ from: 'e2', reason: 'removed' }),
    ]);
    expect(inferred.enters).toEqual([
      expect.objectContaining({ reason: 'added', to: 'e4' }),
    ]);
  });

  it('uses mutually unique standard geometry without enforcing legality', () => {
    const inferred = inferPositionTransition({
      after: {
        c3: { pieceType: 'wN' },
        f3: { pieceType: 'wN' },
      },
      before: {
        b1: { pieceType: 'wN' },
        g1: { pieceType: 'wN' },
      },
      dimensions,
    });

    expect(inferred.moves).toEqual([
      expect.objectContaining({
        from: 'b1',
        matchedBy: 'geometry',
        to: 'c3',
      }),
      expect.objectContaining({
        from: 'g1',
        matchedBy: 'geometry',
        to: 'f3',
      }),
    ]);
    expect(inferred.hasAmbiguity).toBe(false);
  });

  it('represents an ordinary capture as one deterministic move plus the captured exit', () => {
    const inferred = inferPositionTransition({
      after: {
        d5: { id: 'white-pawn', pieceType: 'wP' },
      },
      before: {
        d5: { id: 'black-pawn', pieceType: 'bP' },
        e4: { id: 'white-pawn', pieceType: 'wP' },
      },
      dimensions,
    });

    expect(inferred.moves).toEqual([
      expect.objectContaining({
        from: 'e4',
        matchedBy: 'piece-id',
        to: 'd5',
      }),
    ]);
    expect(inferred.exits).toEqual([
      {
        from: 'd5',
        kind: 'exit',
        piece: { id: 'black-pawn', pieceType: 'bP' },
        reason: 'captured',
      },
    ]);
    expect(inferred.enters).toEqual([]);
  });

  it('[PARITY-BEHAVIOR-B14] degrades identical candidate ties independently of object insertion order', () => {
    const first = inferPositionTransition({
      after: {
        a8: { pieceType: 'wR' },
        h1: { pieceType: 'wR' },
      },
      before: {
        a1: { pieceType: 'wR' },
        h8: { pieceType: 'wR' },
      },
      dimensions,
    });
    const reordered = inferPositionTransition({
      after: {
        h1: { pieceType: 'wR' },
        a8: { pieceType: 'wR' },
      },
      before: {
        h8: { pieceType: 'wR' },
        a1: { pieceType: 'wR' },
      },
      dimensions,
    });

    expect(reordered).toEqual(first);
    expect(first.moves).toEqual([]);
    expect(first.hasAmbiguity).toBe(true);
    expect(first.exits.map((exit) => [exit.from, exit.reason])).toEqual([
      ['a1', 'ambiguous'],
      ['h8', 'ambiguous'],
    ]);
    expect(first.enters.map((enter) => [enter.to, enter.reason])).toEqual([
      ['h1', 'ambiguous'],
      ['a8', 'ambiguous'],
    ]);
  });

  it('never reuses one anonymous source to explain two targets', () => {
    const inferred = inferPositionTransition({
      after: {
        b2: { pieceType: 'custom-dragon' },
        c3: { pieceType: 'custom-dragon' },
      },
      before: {
        a1: { pieceType: 'custom-dragon' },
      },
      dimensions,
    });

    expect(inferred.moves).toEqual([]);
    expect(inferred.exits).toHaveLength(1);
    expect(inferred.enters).toHaveLength(2);
    expect(inferred.hasAmbiguity).toBe(true);
  });

  it('bounds anonymous geometry inference on the maximum supported rectangular variant', () => {
    const variantDimensions = validateBoardDimensions({
      columns: 26,
      rows: 99,
    });
    const squares: string[] = [];
    for (let rank = 1; rank <= 99; rank += 1) {
      for (let fileIndex = 0; fileIndex < 26; fileIndex += 1) {
        squares.push(
          `${String.fromCharCode('a'.charCodeAt(0) + fileIndex)}${String(rank)}`,
        );
      }
    }
    const before = Object.fromEntries(
      squares
        .slice(0, 1000)
        .map((square) => [square, { pieceType: 'wR' }] as const),
    );
    const after = Object.fromEntries(
      squares
        .slice(-1000)
        .map((square) => [square, { pieceType: 'wR' }] as const),
    );

    const inferred = inferPositionTransition({
      after,
      before,
      dimensions: variantDimensions,
    });

    expect(inferred.moves).toEqual([]);
    expect(inferred.exits).toHaveLength(1000);
    expect(inferred.enters).toHaveLength(1000);
    expect(inferred.hasAmbiguity).toBe(true);
  });

  it('lets one exact ordinary hint resolve an anonymous ambiguity', () => {
    const transition = {
      from: 'a1',
      fromRevision: 10,
      to: 'a8',
      toRevision: 11,
    } as const satisfies BoardTransition;
    const result = planPositionTransition({
      after: snapshot(
        11,
        {
          a8: { pieceType: 'wR' },
          h1: { pieceType: 'wR' },
        },
        transition,
      ),
      before: snapshot(10, {
        a1: { pieceType: 'wR' },
        h8: { pieceType: 'wR' },
      }),
      dimensions,
      epoch: 7,
    });
    const plan = requirePlan(result);

    expect(result.warnings).toEqual([]);
    expect(plan.moves).toEqual([
      expect.objectContaining({
        from: 'a1',
        matchedBy: 'explicit',
        to: 'a8',
      }),
      expect.objectContaining({
        from: 'h8',
        matchedBy: 'piece-type',
        to: 'h1',
      }),
    ]);
    expect(plan.hasAmbiguity).toBe(false);
    expect(plan.hint).toEqual(transition);
    expect(plan.hint).not.toBe(transition);
  });

  it('rejects a correlated hint that would fabricate movement between unchanged anonymous endpoints', () => {
    const result = planPositionTransition({
      after: snapshot(
        11,
        {
          a1: { pieceType: 'wR' },
          c3: { pieceType: 'wP' },
          h1: { pieceType: 'wR' },
        },
        {
          from: 'a1',
          fromRevision: 10,
          to: 'h1',
          toRevision: 11,
        },
      ),
      before: snapshot(10, {
        a1: { pieceType: 'wR' },
        c2: { pieceType: 'wP' },
        h1: { pieceType: 'wR' },
      }),
      dimensions,
      epoch: 8,
    });
    const plan = requirePlan(result);

    expect(result.warnings).toEqual([
      expect.objectContaining({ code: 'position-mismatch' }),
    ]);
    expect(plan.hint).toBeNull();
    expect(plan.moves).toEqual([
      expect.objectContaining({ from: 'c2', to: 'c3' }),
    ]);
  });

  it('keeps stable IDs authoritative when an exact hint adds, removes, or changes identity', () => {
    const cases = [
      {
        after: { e4: { id: 'pawn', pieceType: 'wP' } },
        before: { e2: { pieceType: 'wP' } },
      },
      {
        after: { e4: { pieceType: 'wP' } },
        before: { e2: { id: 'pawn', pieceType: 'wP' } },
      },
      {
        after: { e4: { id: 'other-pawn', pieceType: 'wP' } },
        before: { e2: { id: 'pawn', pieceType: 'wP' } },
      },
    ] as const;

    for (const [index, value] of cases.entries()) {
      const result = planPositionTransition({
        after: snapshot(2, value.after, {
          from: 'e2',
          fromRevision: 1,
          to: 'e4',
          toRevision: 2,
        }),
        before: snapshot(1, value.before),
        dimensions,
        epoch: index,
      });

      expect(result.warnings).toEqual([
        expect.objectContaining({ code: 'identity-mismatch' }),
      ]);
      expect(requirePlan(result).hint).toBeNull();
    }
  });

  it('ignores stale and identity-conflicting hints without invalidating the current diff', () => {
    const stale = planPositionTransition({
      after: snapshot(
        3,
        { e4: { id: 'pawn', pieceType: 'wP' } },
        {
          from: 'e2',
          fromRevision: 0,
          to: 'e4',
          toRevision: 3,
        },
      ),
      before: snapshot(2, { e2: { id: 'pawn', pieceType: 'wP' } }),
      dimensions,
      epoch: 1,
    });
    expect(stale.warnings).toEqual([
      expect.objectContaining({ code: 'revision-mismatch' }),
    ]);
    expect(requirePlan(stale).moves).toEqual([
      expect.objectContaining({
        from: 'e2',
        matchedBy: 'piece-id',
        to: 'e4',
      }),
    ]);
    expect(requirePlan(stale).hint).toBeNull();

    const conflict = planPositionTransition({
      after: snapshot(
        3,
        { e4: { id: 'other-pawn', pieceType: 'wP' } },
        {
          from: 'e2',
          fromRevision: 2,
          to: 'e4',
          toRevision: 3,
        },
      ),
      before: snapshot(2, { e2: { id: 'pawn', pieceType: 'wP' } }),
      dimensions,
      epoch: 2,
    });
    expect(conflict.warnings).toEqual([
      expect.objectContaining({ code: 'identity-mismatch' }),
    ]);
    expect(requirePlan(conflict).moves).toEqual([]);
    expect(requirePlan(conflict).exits).toHaveLength(1);
    expect(requirePlan(conflict).enters).toHaveLength(1);
  });

  it('[PARITY-BEHAVIOR-B12] validates and detaches reserved capture and rook hints without applying their special semantics', () => {
    const transition: BoardTransition = {
      capturedSquare: 'd5',
      from: 'e5',
      fromRevision: 4,
      rookMove: { from: 'h1', to: 'f1' },
      to: 'd6',
      toRevision: 5,
    };
    const result = planPositionTransition({
      after: snapshot(
        5,
        {
          d6: { id: 'pawn', pieceType: 'wP' },
          f1: { id: 'rook', pieceType: 'wR' },
        },
        transition,
      ),
      before: snapshot(4, {
        d5: { id: 'captured', pieceType: 'bP' },
        e5: { id: 'pawn', pieceType: 'wP' },
        h1: { id: 'rook', pieceType: 'wR' },
      }),
      dimensions,
      epoch: 3,
    });
    const plan = requirePlan(result);

    expect(result.warnings).toEqual([]);
    expect(plan.hint).toEqual(transition);
    expect(plan.hint).not.toBe(transition);
    expect(plan.hint?.rookMove).not.toBe(transition.rookMove);
    expect(Object.isFrozen(plan.hint)).toBe(true);
    expect(Object.isFrozen(plan.hint?.rookMove)).toBe(true);
    expect(plan.exits).toEqual([
      expect.objectContaining({ from: 'd5', reason: 'removed' }),
    ]);
  });

  it('rejects contradictory promotion, capture, and rook hint details while retaining the inferred diff', () => {
    const promotion = planPositionTransition({
      after: snapshot(
        2,
        { e8: { id: 'pawn', pieceType: 'wP' } },
        {
          from: 'e7',
          fromRevision: 1,
          promotion: 'wP',
          to: 'e8',
          toRevision: 2,
        },
      ),
      before: snapshot(1, { e7: { id: 'pawn', pieceType: 'wP' } }),
      dimensions,
      epoch: 1,
    });
    expect(promotion.warnings).toEqual([
      expect.objectContaining({ code: 'position-mismatch' }),
    ]);
    expect(requirePlan(promotion).hint).toBeNull();

    const capture = planPositionTransition({
      after: snapshot(
        2,
        {
          d5: { id: 'mover', pieceType: 'wP' },
          d6: { id: 'victim', pieceType: 'bP' },
        },
        {
          capturedSquare: 'd5',
          from: 'e4',
          fromRevision: 1,
          to: 'd5',
          toRevision: 2,
        },
      ),
      before: snapshot(1, {
        d5: { id: 'victim', pieceType: 'bP' },
        e4: { id: 'mover', pieceType: 'wP' },
      }),
      dimensions,
      epoch: 2,
    });
    expect(capture.warnings).toEqual([
      expect.objectContaining({ code: 'position-mismatch' }),
    ]);
    expect(requirePlan(capture).hint).toBeNull();

    const rook = planPositionTransition({
      after: snapshot(
        2,
        {
          f1: { pieceType: 'wR' },
          g1: { id: 'king', pieceType: 'wK' },
          h1: { pieceType: 'wR' },
        },
        {
          from: 'e1',
          fromRevision: 1,
          rookMove: { from: 'h1', to: 'f1' },
          to: 'g1',
          toRevision: 2,
        },
      ),
      before: snapshot(1, {
        e1: { id: 'king', pieceType: 'wK' },
        f1: { pieceType: 'wR' },
        h1: { pieceType: 'wR' },
      }),
      dimensions,
      epoch: 3,
    });
    expect(rook.warnings).toEqual([
      expect.objectContaining({ code: 'position-mismatch' }),
    ]);
    expect(requirePlan(rook).hint).toBeNull();

    const capturedRook = planPositionTransition({
      after: snapshot(
        2,
        {
          f1: { pieceType: 'wR' },
          g1: { id: 'king', pieceType: 'wK' },
        },
        {
          capturedSquare: 'h1',
          from: 'e1',
          fromRevision: 1,
          rookMove: { from: 'h1', to: 'f1' },
          to: 'g1',
          toRevision: 2,
        },
      ),
      before: snapshot(1, {
        e1: { id: 'king', pieceType: 'wK' },
        h1: { pieceType: 'wR' },
      }),
      dimensions,
      epoch: 4,
    });
    expect(capturedRook.warnings).toEqual([
      expect.objectContaining({ code: 'position-mismatch' }),
    ]);
    expect(requirePlan(capturedRook).hint).toBeNull();
  });

  it('permits explicit king and rook paths to cross for rules-free variant castling', () => {
    const result = planPositionTransition({
      after: snapshot(
        2,
        {
          f1: { id: 'rook', pieceType: 'wR' },
          g1: { id: 'king', pieceType: 'wK' },
        },
        {
          from: 'f1',
          fromRevision: 1,
          rookMove: { from: 'g1', to: 'f1' },
          to: 'g1',
          toRevision: 2,
        },
      ),
      before: snapshot(1, {
        f1: { id: 'king', pieceType: 'wK' },
        g1: { id: 'rook', pieceType: 'wR' },
      }),
      dimensions,
      epoch: 5,
    });
    const plan = requirePlan(result);

    expect(result.warnings).toEqual([]);
    expect(plan.hint).not.toBeNull();
    expect(plan.moves).toEqual([
      expect.objectContaining({ from: 'f1', to: 'g1' }),
      expect.objectContaining({ from: 'g1', to: 'f1' }),
    ]);
  });

  it('[CBN-CONTRACT-005-VISUAL-NONCANONICAL] returns detached deeply frozen presentation data without either canonical position', () => {
    const beforePiece = { id: 'pawn', pieceType: 'wP' };
    const afterPiece = { id: 'pawn', pieceType: 'wP' };
    const before = { e2: beforePiece };
    const after = { e4: afterPiece };
    const result = planPositionTransition({
      after: snapshot(2, after),
      before: snapshot(1, before),
      dimensions,
      epoch: 4,
    });
    const plan = requirePlan(result);
    const move = plan.moves[0];

    expect(move).toBeDefined();
    expect(plan).not.toHaveProperty('before');
    expect(plan).not.toHaveProperty('after');
    expect(Object.isFrozen(plan)).toBe(true);
    expect(Object.isFrozen(plan.moves)).toBe(true);
    expect(Object.isFrozen(move)).toBe(true);
    expect(Object.isFrozen(move?.before)).toBe(true);
    expect(move?.before).not.toBe(beforePiece);
    expect(move?.after).not.toBe(afterPiece);

    beforePiece.pieceType = 'changed';
    afterPiece.pieceType = 'changed';
    expect(move?.before.pieceType).toBe('wP');
    expect(move?.after.pieceType).toBe('wP');
  });

  it('[PARITY-BEHAVIOR-B10] [CBN-CONTRACT-007-REVISION-EPOCH] correlates each plan to the supplied epoch and exact adjacent semantic revisions', () => {
    const a = snapshot(20, { a1: { id: 'piece', pieceType: 'custom' } });
    const b = snapshot(21, { b2: { id: 'piece', pieceType: 'custom' } });
    const c = snapshot(22, { c3: { id: 'piece', pieceType: 'custom' } });
    const ab = requirePlan(
      planPositionTransition({
        after: b,
        before: a,
        dimensions,
        epoch: 8,
      }),
    );
    const bc = requirePlan(
      planPositionTransition({
        after: c,
        before: b,
        dimensions,
        epoch: 9,
      }),
    );

    expect(ab).toEqual(
      expect.objectContaining({
        epoch: 8,
        fromRevision: 20,
        toRevision: 21,
      }),
    );
    expect(bc).toEqual(
      expect.objectContaining({
        epoch: 9,
        fromRevision: 21,
        toRevision: 22,
      }),
    );
    expect(bc.moves).toEqual([
      expect.objectContaining({ from: 'b2', to: 'c3' }),
    ]);
  });

  it('warns and settles when a changed position does not advance its revision', () => {
    const result = planPositionTransition({
      after: snapshot(4, { e4: { pieceType: 'wP' } }),
      before: snapshot(4, { e2: { pieceType: 'wP' } }),
      dimensions,
      epoch: 2,
    });

    expect(result.plan).toBeNull();
    expect(result.warnings).toEqual([
      expect.objectContaining({ code: 'revision-mismatch' }),
    ]);
  });

  it('is insertion-order invariant and assigns every changed stable ID at most once', () => {
    const squares: string[] = [
      'a1',
      'b1',
      'c1',
      'd1',
      'e1',
      'f1',
      'g1',
      'h1',
      'a2',
      'b2',
      'c2',
      'd2',
      'e2',
      'f2',
      'g2',
      'h2',
    ];

    fc.assert(
      fc.property(
        fc.integer({ max: 8, min: 0 }).chain((length) =>
          fc.tuple(
            fc.shuffledSubarray(squares, {
              maxLength: length,
              minLength: length,
            }),
            fc.shuffledSubarray(squares, {
              maxLength: length,
              minLength: length,
            }),
            fc.array(fc.constantFrom('wP', 'bN', 'custom'), {
              maxLength: length,
              minLength: length,
            }),
          ),
        ),
        ([beforeSquares, afterSquares, pieceTypes]) => {
          const beforeEntries: [string, PieceData][] = beforeSquares.map(
            (square, index) => [
              square,
              {
                id: `piece-${String(index)}`,
                pieceType: pieceTypes[index] ?? 'custom',
              },
            ],
          );
          const afterEntries: [string, PieceData][] = afterSquares.map(
            (square, index) => [
              square,
              {
                id: `piece-${String(index)}`,
                pieceType: pieceTypes[index] ?? 'custom',
              },
            ],
          );
          const forward = inferPositionTransition({
            after: Object.fromEntries(afterEntries),
            before: Object.fromEntries(beforeEntries),
            dimensions,
          });
          const reverse = inferPositionTransition({
            after: Object.fromEntries([...afterEntries].reverse()),
            before: Object.fromEntries([...beforeEntries].reverse()),
            dimensions,
          });

          expect(reverse).toEqual(forward);
          const assignedSources = [
            ...forward.moves.map((move) => move.from),
            ...forward.replacements.map((replacement) => replacement.from),
          ];
          const assignedTargets = [
            ...forward.moves.map((move) => move.to),
            ...forward.replacements.map((replacement) => replacement.to),
          ];
          expect(new Set(assignedSources).size).toBe(assignedSources.length);
          expect(new Set(assignedTargets).size).toBe(assignedTargets.length);
          expect(forward.exits).toEqual([]);
          expect(forward.enters).toEqual([]);
        },
      ),
      { numRuns: 200 },
    );
  });
});
