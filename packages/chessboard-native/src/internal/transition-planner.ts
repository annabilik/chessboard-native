import { parseSquareId } from '../core/coordinates';
import type { ValidatedBoardDimensions } from '../core/dimensions';
import type {
  BoardTransition,
  PieceData,
  PositionObject,
  Revision,
  SquareId,
} from '../public-types';
import type { TransitionHintWarning } from './transition-hint';

export type TransitionEpoch = number;

export type TransitionMatchBasis =
  'explicit' | 'piece-id' | 'geometry' | 'piece-type';

export interface MovePieceTransition {
  readonly kind: 'move';
  readonly from: SquareId;
  readonly to: SquareId;
  readonly before: Readonly<PieceData>;
  readonly after: Readonly<PieceData>;
  readonly matchedBy: TransitionMatchBasis;
}

export interface ReplacePieceTransition {
  readonly kind: 'replace';
  readonly from: SquareId;
  readonly to: SquareId;
  readonly before: Readonly<PieceData>;
  readonly after: Readonly<PieceData>;
  readonly matchedBy: 'explicit' | 'piece-id';
}

export interface ExitPieceTransition {
  readonly kind: 'exit';
  readonly from: SquareId;
  readonly piece: Readonly<PieceData>;
  readonly reason: 'removed' | 'captured' | 'ambiguous';
}

export interface EnterPieceTransition {
  readonly kind: 'enter';
  readonly to: SquareId;
  readonly piece: Readonly<PieceData>;
  readonly reason: 'added' | 'ambiguous';
}

export interface InferredPositionTransition {
  readonly moves: readonly Readonly<MovePieceTransition>[];
  readonly replacements: readonly Readonly<ReplacePieceTransition>[];
  readonly exits: readonly Readonly<ExitPieceTransition>[];
  readonly enters: readonly Readonly<EnterPieceTransition>[];
  readonly hasAmbiguity: boolean;
}

export interface TransitionPositionSnapshot {
  readonly revision: Revision;
  readonly value: PositionObject;
  readonly transition?: Readonly<BoardTransition>;
  readonly transitionWarning?: Readonly<TransitionHintWarning>;
}

export interface PositionTransitionPlan extends InferredPositionTransition {
  readonly epoch: TransitionEpoch;
  readonly fromRevision: Revision;
  readonly toRevision: Revision;
  readonly hint: Readonly<BoardTransition> | null;
}

export interface PositionTransitionPlanningResult {
  readonly plan: Readonly<PositionTransitionPlan> | null;
  readonly warnings: readonly Readonly<TransitionHintWarning>[];
}

interface PieceEntry {
  readonly square: SquareId;
  readonly piece: Readonly<PieceData>;
}

interface ExplicitMatch {
  readonly from: SquareId;
  readonly to: SquareId;
}

const EMPTY_WARNINGS: readonly Readonly<TransitionHintWarning>[] =
  Object.freeze([]);
const MAX_GEOMETRY_CANDIDATE_PAIRS = 4096;

function clonePiece(piece: Readonly<PieceData>): Readonly<PieceData> {
  return Object.freeze({
    pieceType: piece.pieceType,
    ...(piece.id === undefined ? {} : { id: piece.id }),
  });
}

function cloneHint(hint: Readonly<BoardTransition>): Readonly<BoardTransition> {
  return Object.freeze({
    from: hint.from,
    fromRevision: hint.fromRevision,
    to: hint.to,
    toRevision: hint.toRevision,
    ...(hint.promotion === undefined ? {} : { promotion: hint.promotion }),
    ...(hint.capturedSquare === undefined
      ? {}
      : { capturedSquare: hint.capturedSquare }),
    ...(hint.rookMove === undefined
      ? {}
      : {
          rookMove: Object.freeze({
            from: hint.rookMove.from,
            to: hint.rookMove.to,
          }),
        }),
  });
}

function cloneWarning(
  warning: Readonly<TransitionHintWarning>,
): Readonly<TransitionHintWarning> {
  return Object.freeze({ code: warning.code, message: warning.message });
}

function createWarning(
  code: TransitionHintWarning['code'],
  message: string,
): Readonly<TransitionHintWarning> {
  return Object.freeze({ code, message });
}

function squareOrder(
  left: SquareId,
  right: SquareId,
  dimensions: ValidatedBoardDimensions,
): number {
  const leftCoordinate = parseSquareId(left, dimensions);
  const rightCoordinate = parseSquareId(right, dimensions);
  return (
    leftCoordinate.rank - rightCoordinate.rank ||
    leftCoordinate.fileIndex - rightCoordinate.fileIndex
  );
}

function positionEntries(
  position: PositionObject,
  dimensions: ValidatedBoardDimensions,
): readonly Readonly<PieceEntry>[] {
  const entries: Readonly<PieceEntry>[] = [];
  for (const square of Object.keys(position)) {
    const piece = position[square];
    if (piece !== undefined) {
      entries.push(Object.freeze({ piece, square }));
    }
  }
  entries.sort((left, right) =>
    squareOrder(left.square, right.square, dimensions),
  );
  return Object.freeze(entries);
}

function findPieceSquareById(
  position: PositionObject,
  id: string,
): SquareId | null {
  for (const square of Object.keys(position)) {
    if (position[square]?.id === id) {
      return square;
    }
  }
  return null;
}

function identityIsCompatible(
  before: Readonly<PieceData>,
  after: Readonly<PieceData>,
): boolean {
  if (before.id === undefined && after.id === undefined) {
    return true;
  }
  return (
    before.id !== undefined && after.id !== undefined && before.id === after.id
  );
}

function samePiece(
  before: Readonly<PieceData>,
  after: Readonly<PieceData>,
): boolean {
  return before.pieceType === after.pieceType && before.id === after.id;
}

function endpointContentsAreUnchanged(
  before: PositionObject,
  after: PositionObject,
  from: SquareId,
  to: SquareId,
): boolean {
  const sourceBefore = before[from];
  const sourceAfter = after[from];
  const targetBefore = before[to];
  const targetAfter = after[to];
  return (
    sourceBefore !== undefined &&
    sourceAfter !== undefined &&
    targetBefore !== undefined &&
    targetAfter !== undefined &&
    samePiece(sourceBefore, sourceAfter) &&
    samePiece(targetBefore, targetAfter)
  );
}

function standardPieceGeometryMatches(
  pieceType: string,
  from: SquareId,
  to: SquareId,
  dimensions: ValidatedBoardDimensions,
): boolean {
  const match = /^([wb])([PNBRQK])$/.exec(pieceType);
  if (match === null || from === to) {
    return false;
  }

  const source = parseSquareId(from, dimensions);
  const target = parseSquareId(to, dimensions);
  const fileDelta = target.fileIndex - source.fileIndex;
  const rankDelta = target.rank - source.rank;
  const absoluteFileDelta = Math.abs(fileDelta);
  const absoluteRankDelta = Math.abs(rankDelta);
  const role = match[2];

  switch (role) {
    case 'P': {
      const direction = match[1] === 'w' ? 1 : -1;
      return (
        (fileDelta === 0 &&
          (rankDelta === direction || rankDelta === direction * 2)) ||
        (absoluteFileDelta === 1 && rankDelta === direction)
      );
    }
    case 'N':
      return (
        (absoluteFileDelta === 1 && absoluteRankDelta === 2) ||
        (absoluteFileDelta === 2 && absoluteRankDelta === 1)
      );
    case 'B':
      return absoluteFileDelta > 0 && absoluteFileDelta === absoluteRankDelta;
    case 'R':
      return (
        (absoluteFileDelta === 0 && absoluteRankDelta > 0) ||
        (absoluteRankDelta === 0 && absoluteFileDelta > 0)
      );
    case 'Q':
      return (
        (absoluteFileDelta > 0 && absoluteFileDelta === absoluteRankDelta) ||
        (absoluteFileDelta === 0 && absoluteRankDelta > 0) ||
        (absoluteRankDelta === 0 && absoluteFileDelta > 0)
      );
    case 'K':
      return (
        Math.max(absoluteFileDelta, absoluteRankDelta) === 1 &&
        absoluteFileDelta + absoluteRankDelta > 0
      );
    default:
      return false;
  }
}

function freezeMove(
  before: Readonly<PieceEntry>,
  after: Readonly<PieceEntry>,
  matchedBy: TransitionMatchBasis,
): Readonly<MovePieceTransition> {
  return Object.freeze({
    after: clonePiece(after.piece),
    before: clonePiece(before.piece),
    from: before.square,
    kind: 'move' as const,
    matchedBy,
    to: after.square,
  });
}

function freezeReplacement(
  before: Readonly<PieceEntry>,
  after: Readonly<PieceEntry>,
  matchedBy: 'explicit' | 'piece-id',
): Readonly<ReplacePieceTransition> {
  return Object.freeze({
    after: clonePiece(after.piece),
    before: clonePiece(before.piece),
    from: before.square,
    kind: 'replace' as const,
    matchedBy,
    to: after.square,
  });
}

function byPieceType(
  entries: readonly Readonly<PieceEntry>[],
): ReadonlyMap<string, readonly Readonly<PieceEntry>[]> {
  const mutable = new Map<string, Readonly<PieceEntry>[]>();
  for (const entry of entries) {
    const group = mutable.get(entry.piece.pieceType);
    if (group === undefined) {
      mutable.set(entry.piece.pieceType, [entry]);
    } else {
      group.push(entry);
    }
  }

  const frozen = new Map<string, readonly Readonly<PieceEntry>[]>();
  for (const [pieceType, group] of mutable) {
    frozen.set(pieceType, Object.freeze([...group]));
  }
  return frozen;
}

function matchAnonymousGroup(options: {
  readonly before: readonly Readonly<PieceEntry>[];
  readonly after: readonly Readonly<PieceEntry>[];
  readonly dimensions: ValidatedBoardDimensions;
  readonly consume: (
    before: Readonly<PieceEntry>,
    after: Readonly<PieceEntry>,
    basis: 'geometry' | 'piece-type',
  ) => void;
}): Readonly<{
  ambiguousBefore: readonly SquareId[];
  ambiguousAfter: readonly SquareId[];
}> {
  let before = [...options.before];
  let after = [...options.after];

  while (before.length > 0 && after.length > 0) {
    if (before.length === 1 && after.length === 1) {
      const source = before[0];
      const target = after[0];
      if (source !== undefined && target !== undefined) {
        options.consume(source, target, 'piece-type');
      }
      before = [];
      after = [];
      break;
    }

    const pieceType = before[0]?.piece.pieceType ?? after[0]?.piece.pieceType;
    if (
      pieceType === undefined ||
      !/^([wb])([PNBRQK])$/.test(pieceType) ||
      before.length * after.length > MAX_GEOMETRY_CANDIDATE_PAIRS
    ) {
      break;
    }

    const targetCandidates = new Map<SquareId, Readonly<PieceEntry>[]>();
    const sourceCandidates = new Map<SquareId, Readonly<PieceEntry>[]>();
    for (const source of before) {
      const candidates = after.filter((target) =>
        standardPieceGeometryMatches(
          source.piece.pieceType,
          source.square,
          target.square,
          options.dimensions,
        ),
      );
      sourceCandidates.set(source.square, candidates);
      for (const target of candidates) {
        const sources = targetCandidates.get(target.square);
        if (sources === undefined) {
          targetCandidates.set(target.square, [source]);
        } else {
          sources.push(source);
        }
      }
    }

    const forced: Readonly<{
      source: Readonly<PieceEntry>;
      target: Readonly<PieceEntry>;
    }>[] = [];
    for (const source of before) {
      const candidates = sourceCandidates.get(source.square) ?? [];
      const target = candidates.length === 1 ? candidates[0] : undefined;
      if (
        target !== undefined &&
        (targetCandidates.get(target.square) ?? []).length === 1
      ) {
        forced.push(Object.freeze({ source, target }));
      }
    }
    if (forced.length === 0) {
      break;
    }

    const consumedBefore = new Set<SquareId>();
    const consumedAfter = new Set<SquareId>();
    for (const match of forced) {
      if (
        consumedBefore.has(match.source.square) ||
        consumedAfter.has(match.target.square)
      ) {
        continue;
      }
      options.consume(match.source, match.target, 'geometry');
      consumedBefore.add(match.source.square);
      consumedAfter.add(match.target.square);
    }
    before = before.filter((entry) => !consumedBefore.has(entry.square));
    after = after.filter((entry) => !consumedAfter.has(entry.square));
  }

  if (before.length === 0 || after.length === 0) {
    return Object.freeze({
      ambiguousAfter: Object.freeze([]),
      ambiguousBefore: Object.freeze([]),
    });
  }
  return Object.freeze({
    ambiguousAfter: Object.freeze(after.map((entry) => entry.square)),
    ambiguousBefore: Object.freeze(before.map((entry) => entry.square)),
  });
}

/**
 * Infer a deterministic presentation diff. Identity-bearing pieces never fall
 * back to type matching, and anonymous ties remain unmatched for fade/snap.
 */
export function inferPositionTransition(options: {
  readonly before: PositionObject;
  readonly after: PositionObject;
  readonly dimensions: ValidatedBoardDimensions;
  readonly explicitMatch?: Readonly<ExplicitMatch> | null;
}): Readonly<InferredPositionTransition> {
  const beforeEntries = positionEntries(options.before, options.dimensions);
  const afterEntries = positionEntries(options.after, options.dimensions);
  const beforeBySquare = new Map(
    beforeEntries.map((entry) => [entry.square, entry]),
  );
  const afterBySquare = new Map(
    afterEntries.map((entry) => [entry.square, entry]),
  );
  const consumedBefore = new Set<SquareId>();
  const consumedAfter = new Set<SquareId>();
  const ambiguousBefore = new Set<SquareId>();
  const ambiguousAfter = new Set<SquareId>();
  const moves: Readonly<MovePieceTransition>[] = [];
  const replacements: Readonly<ReplacePieceTransition>[] = [];

  const consume = (
    before: Readonly<PieceEntry>,
    after: Readonly<PieceEntry>,
    matchedBy: TransitionMatchBasis,
  ): void => {
    if (consumedBefore.has(before.square) || consumedAfter.has(after.square)) {
      return;
    }
    consumedBefore.add(before.square);
    consumedAfter.add(after.square);
    if (
      samePiece(before.piece, after.piece) &&
      before.square === after.square
    ) {
      return;
    }
    if (before.piece.pieceType === after.piece.pieceType) {
      moves.push(freezeMove(before, after, matchedBy));
      return;
    }
    replacements.push(
      freezeReplacement(
        before,
        after,
        matchedBy === 'explicit' ? 'explicit' : 'piece-id',
      ),
    );
  };

  const explicitMatch = options.explicitMatch;
  if (explicitMatch !== undefined && explicitMatch !== null) {
    const source = beforeBySquare.get(explicitMatch.from);
    const target = afterBySquare.get(explicitMatch.to);
    if (
      source !== undefined &&
      target !== undefined &&
      identityIsCompatible(source.piece, target.piece) &&
      !endpointContentsAreUnchanged(
        options.before,
        options.after,
        explicitMatch.from,
        explicitMatch.to,
      )
    ) {
      consume(source, target, 'explicit');
    }
  }

  const beforeById = new Map<string, Readonly<PieceEntry>>();
  const afterById = new Map<string, Readonly<PieceEntry>>();
  for (const entry of beforeEntries) {
    if (entry.piece.id !== undefined) {
      beforeById.set(entry.piece.id, entry);
    }
  }
  for (const entry of afterEntries) {
    if (entry.piece.id !== undefined) {
      afterById.set(entry.piece.id, entry);
    }
  }
  const sharedIds = [...beforeById.keys()]
    .filter((id) => afterById.has(id))
    .sort();
  for (const id of sharedIds) {
    const before = beforeById.get(id);
    const after = afterById.get(id);
    if (before !== undefined && after !== undefined) {
      consume(before, after, 'piece-id');
    }
  }

  for (const before of beforeEntries) {
    if (consumedBefore.has(before.square) || before.piece.id !== undefined) {
      continue;
    }
    const after = afterBySquare.get(before.square);
    if (
      after !== undefined &&
      !consumedAfter.has(after.square) &&
      after.piece.id === undefined &&
      before.piece.pieceType === after.piece.pieceType
    ) {
      consume(before, after, 'piece-type');
    }
  }

  const unmatchedBefore = beforeEntries.filter(
    (entry) =>
      !consumedBefore.has(entry.square) && entry.piece.id === undefined,
  );
  const unmatchedAfter = afterEntries.filter(
    (entry) => !consumedAfter.has(entry.square) && entry.piece.id === undefined,
  );
  const beforeGroups = byPieceType(unmatchedBefore);
  const afterGroups = byPieceType(unmatchedAfter);
  const pieceTypes = new Set([...beforeGroups.keys(), ...afterGroups.keys()]);

  for (const pieceType of [...pieceTypes].sort()) {
    const result = matchAnonymousGroup({
      after: afterGroups.get(pieceType) ?? [],
      before: beforeGroups.get(pieceType) ?? [],
      consume: (before, after, basis) => {
        consume(before, after, basis);
      },
      dimensions: options.dimensions,
    });
    for (const square of result.ambiguousBefore) {
      ambiguousBefore.add(square);
    }
    for (const square of result.ambiguousAfter) {
      ambiguousAfter.add(square);
    }
  }

  const occupiedTargets = new Set<SquareId>([
    ...moves.map((move) => move.to),
    ...replacements.map((replacement) => replacement.to),
  ]);
  const exits = beforeEntries
    .filter((entry) => !consumedBefore.has(entry.square))
    .map((entry): Readonly<ExitPieceTransition> =>
      Object.freeze({
        from: entry.square,
        kind: 'exit' as const,
        piece: clonePiece(entry.piece),
        reason: occupiedTargets.has(entry.square)
          ? 'captured'
          : ambiguousBefore.has(entry.square)
            ? 'ambiguous'
            : 'removed',
      }),
    );
  const enters = afterEntries
    .filter((entry) => !consumedAfter.has(entry.square))
    .map((entry): Readonly<EnterPieceTransition> =>
      Object.freeze({
        kind: 'enter' as const,
        piece: clonePiece(entry.piece),
        reason: ambiguousAfter.has(entry.square) ? 'ambiguous' : 'added',
        to: entry.square,
      }),
    );

  moves.sort(
    (left, right) =>
      squareOrder(left.from, right.from, options.dimensions) ||
      squareOrder(left.to, right.to, options.dimensions),
  );
  replacements.sort(
    (left, right) =>
      squareOrder(left.from, right.from, options.dimensions) ||
      squareOrder(left.to, right.to, options.dimensions),
  );
  exits.sort((left, right) =>
    squareOrder(left.from, right.from, options.dimensions),
  );
  enters.sort((left, right) =>
    squareOrder(left.to, right.to, options.dimensions),
  );

  return Object.freeze({
    enters: Object.freeze(enters),
    exits: Object.freeze(exits),
    hasAmbiguity: ambiguousBefore.size > 0 || ambiguousAfter.size > 0,
    moves: Object.freeze(moves),
    replacements: Object.freeze(replacements),
  });
}

export function validatePositionTransitionHint(options: {
  readonly before: TransitionPositionSnapshot;
  readonly after: TransitionPositionSnapshot;
}):
  | Readonly<{ hint: Readonly<BoardTransition>; warning: null }>
  | Readonly<{ hint: null; warning: Readonly<TransitionHintWarning> }> {
  const hint = options.after.transition;
  if (hint === undefined) {
    throw new Error(
      'validatePositionTransitionHint requires a transition hint.',
    );
  }

  if (
    hint.fromRevision !== options.before.revision ||
    hint.toRevision !== options.after.revision
  ) {
    return Object.freeze({
      hint: null,
      warning: createWarning(
        'revision-mismatch',
        `Board transition revisions ${String(hint.fromRevision)} -> ${String(hint.toRevision)} do not match ${String(options.before.revision)} -> ${String(options.after.revision)}.`,
      ),
    });
  }

  const source = options.before.value[hint.from];
  const target = options.after.value[hint.to];
  if (source === undefined || target === undefined) {
    return Object.freeze({
      hint: null,
      warning: createWarning(
        'position-mismatch',
        'Board transition endpoints do not exist in the exact controlled revision pair.',
      ),
    });
  }
  if (!identityIsCompatible(source, target)) {
    return Object.freeze({
      hint: null,
      warning: createWarning(
        'identity-mismatch',
        'Board transition endpoints contradict stable piece identity.',
      ),
    });
  }
  if (
    endpointContentsAreUnchanged(
      options.before.value,
      options.after.value,
      hint.from,
      hint.to,
    )
  ) {
    return Object.freeze({
      hint: null,
      warning: createWarning(
        'position-mismatch',
        'Board transition endpoints are unchanged across the controlled revision pair.',
      ),
    });
  }
  if (
    source.pieceType !== target.pieceType &&
    hint.promotion !== target.pieceType
  ) {
    return Object.freeze({
      hint: null,
      warning: createWarning(
        'position-mismatch',
        'Board transition changes piece type without a matching promotion hint.',
      ),
    });
  }
  if (hint.promotion !== undefined && source.pieceType === target.pieceType) {
    return Object.freeze({
      hint: null,
      warning: createWarning(
        'position-mismatch',
        'Board transition promotion requires the target piece type to change.',
      ),
    });
  }
  if (hint.promotion !== undefined && hint.promotion !== target.pieceType) {
    return Object.freeze({
      hint: null,
      warning: createWarning(
        'position-mismatch',
        'Board transition promotion does not match the target piece type.',
      ),
    });
  }

  if (hint.capturedSquare !== undefined) {
    if (hint.capturedSquare === hint.from) {
      return Object.freeze({
        hint: null,
        warning: createWarning(
          'position-mismatch',
          'Board transition capturedSquare cannot be the moving source square.',
        ),
      });
    }
    const captured = options.before.value[hint.capturedSquare];
    const currentCaptured = options.after.value[hint.capturedSquare];
    if (
      captured === undefined ||
      (currentCaptured !== undefined && samePiece(captured, currentCaptured)) ||
      (captured.id !== undefined &&
        findPieceSquareById(options.after.value, captured.id) !== null)
    ) {
      return Object.freeze({
        hint: null,
        warning: createWarning(
          'position-mismatch',
          'Board transition capturedSquare does not describe a removed or replaced piece.',
        ),
      });
    }
  }

  if (hint.rookMove !== undefined) {
    if (hint.capturedSquare === hint.rookMove.from) {
      return Object.freeze({
        hint: null,
        warning: createWarning(
          'position-mismatch',
          'Board transition capturedSquare cannot also be the rookMove source.',
        ),
      });
    }
    if (hint.rookMove.from === hint.from || hint.rookMove.to === hint.to) {
      return Object.freeze({
        hint: null,
        warning: createWarning(
          'position-mismatch',
          'Board transition rookMove must use a distinct source and target.',
        ),
      });
    }
    const rookSource = options.before.value[hint.rookMove.from];
    const rookTarget = options.after.value[hint.rookMove.to];
    if (
      rookSource === undefined ||
      rookTarget === undefined ||
      !identityIsCompatible(rookSource, rookTarget) ||
      endpointContentsAreUnchanged(
        options.before.value,
        options.after.value,
        hint.rookMove.from,
        hint.rookMove.to,
      ) ||
      rookSource.pieceType !== rookTarget.pieceType
    ) {
      return Object.freeze({
        hint: null,
        warning: createWarning(
          'position-mismatch',
          'Board transition rookMove does not match one continuing piece.',
        ),
      });
    }
  }

  return Object.freeze({ hint: cloneHint(hint), warning: null });
}

function validEpoch(epoch: unknown): epoch is TransitionEpoch {
  return typeof epoch === 'number' && Number.isSafeInteger(epoch) && epoch >= 0;
}

function positionsAreEqual(
  before: PositionObject,
  after: PositionObject,
): boolean {
  const beforeSquares = Object.keys(before).sort();
  const afterSquares = Object.keys(after).sort();
  if (beforeSquares.length !== afterSquares.length) {
    return false;
  }
  for (let index = 0; index < beforeSquares.length; index += 1) {
    const beforeSquare = beforeSquares[index];
    const afterSquare = afterSquares[index];
    if (beforeSquare !== afterSquare) {
      return false;
    }
    if (beforeSquare === undefined) {
      return false;
    }
    const beforePiece = before[beforeSquare];
    const afterPiece = after[beforeSquare];
    if (
      beforePiece === undefined ||
      afterPiece === undefined ||
      !samePiece(beforePiece, afterPiece)
    ) {
      return false;
    }
  }
  return true;
}

/**
 * Plan one exact controlled revision pair. Mounted scheduling and interruption
 * remain a separate runtime concern; this function owns no semantic snapshot.
 */
export function planPositionTransition(options: {
  readonly epoch: TransitionEpoch;
  readonly dimensions: ValidatedBoardDimensions;
  readonly before: TransitionPositionSnapshot | null;
  readonly after: TransitionPositionSnapshot;
}): PositionTransitionPlanningResult {
  if (!validEpoch(options.epoch)) {
    throw new TypeError(
      'Transition epoch must be a non-negative safe integer.',
    );
  }

  const warnings: Readonly<TransitionHintWarning>[] = [];
  if (options.after.transitionWarning !== undefined) {
    warnings.push(cloneWarning(options.after.transitionWarning));
  }
  if (options.before === null) {
    if (options.after.transition !== undefined) {
      warnings.push(
        createWarning(
          'revision-mismatch',
          'Board transition requires a previous controlled position revision.',
        ),
      );
    }
    return Object.freeze({
      plan: null,
      warnings:
        warnings.length === 0 ? EMPTY_WARNINGS : Object.freeze(warnings),
    });
  }

  if (options.after.revision <= options.before.revision) {
    if (
      options.after.revision < options.before.revision ||
      !positionsAreEqual(options.before.value, options.after.value) ||
      options.after.transition !== undefined
    ) {
      warnings.push(
        createWarning(
          'revision-mismatch',
          `Transition planning requires an increasing revision pair, received ${String(options.before.revision)} -> ${String(options.after.revision)}.`,
        ),
      );
    }
    return Object.freeze({
      plan: null,
      warnings:
        warnings.length === 0 ? EMPTY_WARNINGS : Object.freeze(warnings),
    });
  }

  if (positionsAreEqual(options.before.value, options.after.value)) {
    if (options.after.transition !== undefined) {
      warnings.push(
        createWarning(
          'position-mismatch',
          'Board transition cannot describe an unchanged controlled position.',
        ),
      );
    }
    return Object.freeze({
      plan: null,
      warnings:
        warnings.length === 0 ? EMPTY_WARNINGS : Object.freeze(warnings),
    });
  }

  let acceptedHint: Readonly<BoardTransition> | null = null;
  if (options.after.transition !== undefined) {
    const validation = validatePositionTransitionHint({
      after: options.after,
      before: options.before,
    });
    acceptedHint = validation.hint;
    if (validation.warning !== null) {
      warnings.push(validation.warning);
    }
  }

  const inferred = inferPositionTransition({
    after: options.after.value,
    before: options.before.value,
    dimensions: options.dimensions,
    explicitMatch:
      acceptedHint === null
        ? null
        : Object.freeze({ from: acceptedHint.from, to: acceptedHint.to }),
  });
  if (
    inferred.moves.length === 0 &&
    inferred.replacements.length === 0 &&
    inferred.exits.length === 0 &&
    inferred.enters.length === 0
  ) {
    return Object.freeze({
      plan: null,
      warnings:
        warnings.length === 0 ? EMPTY_WARNINGS : Object.freeze(warnings),
    });
  }

  const plan: PositionTransitionPlan = Object.freeze({
    enters: inferred.enters,
    epoch: options.epoch,
    exits: inferred.exits,
    fromRevision: options.before.revision,
    hasAmbiguity: inferred.hasAmbiguity,
    hint: acceptedHint,
    moves: inferred.moves,
    replacements: inferred.replacements,
    toRevision: options.after.revision,
  });
  return Object.freeze({
    plan,
    warnings: warnings.length === 0 ? EMPTY_WARNINGS : Object.freeze(warnings),
  });
}
