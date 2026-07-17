import type {
  MoveSource,
  PieceData,
  Revision,
  SquareId,
} from '../public-types';
import type { BoardSurfaceLayout } from '../render/board-layout';
import type { PendingCommitHandoffDescriptor } from './pending-commit-handoff';
import type { PositionTransitionPlan } from './transition-planner';

export type { PendingCommitHandoffDescriptor } from './pending-commit-handoff';

/** Maximum number of presentation-only actors retained across interruptions. */
export const MAX_TRANSITION_PRESENTATION_RESIDUALS = 64;

/** Residuals below one 8-bit alpha step are no longer visibly useful. */
export const MIN_TRANSITION_PRESENTATION_OPACITY = 1 / 255;

/** Board-local visual point normalized independently on each axis. */
export interface TransitionVisualPoint {
  readonly x: number;
  readonly y: number;
}

/** Exact semantic endpoint used only to correlate adjacent visual epochs. */
export interface TransitionPresentationAnchor {
  readonly piece: Readonly<PieceData>;
  readonly square: SquareId;
}

export type TransitionPresentationActorKind =
  | 'move'
  | 'carry'
  | 'enter'
  | 'exit'
  | 'replace-enter'
  | 'replace-exit'
  | 'pending-handoff'
  | 'residual';

interface TransitionPresentationActorBase {
  /** Presentation identity only. It does not identify canonical state. */
  readonly actorKey: string;
  readonly kind: TransitionPresentationActorKind;
  readonly piece: Readonly<PieceData>;
  /** Square whose measured cell owns the animated host rectangle. */
  readonly rendererSquare: SquareId;
  /** Source exposed to a visual-only custom renderer. */
  readonly rendererSource: Readonly<MoveSource>;
  /** Optional square to reproject as the actor's geometry-only destination. */
  readonly settleSquare: SquareId | null;
  readonly startPoint: Readonly<TransitionVisualPoint>;
  readonly endPoint: Readonly<TransitionVisualPoint>;
  /** Multipliers applied to the resolved piece-host opacity. */
  readonly startOpacity: number;
  readonly endOpacity: number;
  /** Exact before/after anchors; neither is a position snapshot. */
  readonly fromAnchor: Readonly<TransitionPresentationAnchor> | null;
  readonly toAnchor: Readonly<TransitionPresentationAnchor> | null;
}

/** Latest controlled actor. Its artwork still comes from the current position. */
export interface CurrentTransitionPresentationActor extends TransitionPresentationActorBase {
  readonly role: 'current';
  readonly currentSquare: SquareId;
  readonly rendererSource: Readonly<{
    readonly kind: 'board';
    readonly square: SquareId;
  }>;
}

/** Detached old artwork or a bounded fading interruption residual. */
export interface DetachedTransitionPresentationActor extends TransitionPresentationActorBase {
  readonly role: 'detached';
  readonly currentSquare: null;
  readonly rendererSource: Readonly<{
    readonly kind: 'board';
    readonly square: SquareId;
  }>;
}

/** Pending artwork retained above the board during a correlated commit handoff. */
export interface PendingTransitionPresentationActor extends TransitionPresentationActorBase {
  readonly role: 'pending';
  readonly currentSquare: null;
}

export type TransitionPresentationActor =
  | CurrentTransitionPresentationActor
  | DetachedTransitionPresentationActor
  | PendingTransitionPresentationActor;

/** Detached presentation for one exact semantic revision pair. */
export interface TransitionPresentation {
  readonly epoch: number;
  readonly fromRevision: Revision;
  readonly toRevision: Revision;
  readonly current: readonly Readonly<CurrentTransitionPresentationActor>[];
  readonly detached: readonly Readonly<DetachedTransitionPresentationActor>[];
  readonly pending: readonly Readonly<PendingTransitionPresentationActor>[];
  readonly residualCount: number;
}

/** One actor sampled from the shared board progress value. */
export interface SampledTransitionPresentationActor {
  readonly actor: Readonly<TransitionPresentationActor>;
  readonly opacity: number;
  readonly point: Readonly<TransitionVisualPoint>;
}

/** Immutable visual sample. It contains no canonical position collection. */
export interface TransitionPresentationSample {
  readonly epoch: number;
  readonly fromRevision: Revision;
  readonly toRevision: Revision;
  readonly progress: number;
  readonly actors: readonly Readonly<SampledTransitionPresentationActor>[];
}

export interface CreateTransitionPresentationOptions {
  readonly plan: Readonly<PositionTransitionPlan>;
  /** Geometry that displayed `plan.fromRevision`. */
  readonly previousLayout: Readonly<BoardSurfaceLayout>;
  /** Geometry that displays `plan.toRevision`. */
  readonly currentLayout: Readonly<BoardSurfaceLayout>;
  /** Sample of an active epoch whose target is exactly `plan.fromRevision`. */
  readonly prior?: Readonly<TransitionPresentationSample> | null;
  readonly pendingHandoff?: Readonly<PendingCommitHandoffDescriptor> | null;
  /** Test/internal override, capped by the library-wide residual maximum. */
  readonly residualLimit?: number;
}

export interface RebaseTransitionPresentationOptions {
  readonly presentation: Readonly<TransitionPresentation>;
  readonly progress: number;
  readonly layout: Readonly<BoardSurfaceLayout>;
  /** Fresh mounted epoch used to make the old completion inert. */
  readonly epoch: number;
}

/** Pixel transforms relative to an actor's current renderer square. */
export interface ProjectedTransitionPresentationActor {
  readonly startTranslateX: number;
  readonly startTranslateY: number;
  readonly endTranslateX: number;
  readonly endTranslateY: number;
  readonly startOpacity: number;
  readonly endOpacity: number;
}

function encodeKeyPart(value: string): string {
  return `${String(value.length)}:${value}`;
}

function clonePiece(piece: Readonly<PieceData>): Readonly<PieceData> {
  return Object.freeze({
    ...(piece.id === undefined ? {} : { id: piece.id }),
    pieceType: piece.pieceType,
  });
}

function piecesAreEqual(
  left: Readonly<PieceData>,
  right: Readonly<PieceData>,
): boolean {
  return left.id === right.id && left.pieceType === right.pieceType;
}

function cloneMoveSource(source: Readonly<MoveSource>): Readonly<MoveSource> {
  return source.kind === 'board'
    ? Object.freeze({ kind: 'board' as const, square: source.square })
    : Object.freeze({ kind: 'spare' as const, spareId: source.spareId });
}

function boardSource(square: SquareId): Readonly<{
  readonly kind: 'board';
  readonly square: SquareId;
}> {
  return Object.freeze({ kind: 'board', square });
}

function freezePoint(x: number, y: number): Readonly<TransitionVisualPoint> {
  return Object.freeze({ x, y });
}

function clonePoint(
  point: Readonly<TransitionVisualPoint>,
): Readonly<TransitionVisualPoint> {
  return freezePoint(point.x, point.y);
}

function cloneAnchor(
  anchor: Readonly<TransitionPresentationAnchor> | null,
): Readonly<TransitionPresentationAnchor> | null {
  return anchor === null
    ? null
    : Object.freeze({ piece: clonePiece(anchor.piece), square: anchor.square });
}

function anchor(
  square: SquareId,
  piece: Readonly<PieceData>,
): Readonly<TransitionPresentationAnchor> {
  return Object.freeze({ piece: clonePiece(piece), square });
}

function currentActorKey(square: SquareId, piece: Readonly<PieceData>): string {
  return piece.id === undefined
    ? `square:${encodeKeyPart(square)}`
    : `id:${encodeKeyPart(piece.id)}`;
}

function detachedActorKey(
  epoch: number,
  kind: 'exit' | 'replace-exit',
  from: SquareId,
  piece: Readonly<PieceData>,
  to: SquareId | null,
): string {
  const identity = piece.id ?? piece.pieceType;
  return [
    'transition',
    String(epoch),
    kind,
    encodeKeyPart(from),
    to === null ? 'none' : encodeKeyPart(to),
    encodeKeyPart(identity),
  ].join(':');
}

function layoutPoints(
  layout: Readonly<BoardSurfaceLayout>,
): ReadonlyMap<SquareId, Readonly<TransitionVisualPoint>> {
  const points = new Map<SquareId, Readonly<TransitionVisualPoint>>();
  for (const cell of layout.cells) {
    points.set(
      cell.square,
      freezePoint(
        (cell.rect.left + cell.rect.width / 2) / layout.size.width,
        (cell.rect.top + cell.rect.height / 2) / layout.size.height,
      ),
    );
  }
  return points;
}

function clampUnit(value: number): number {
  if (!Number.isFinite(value)) {
    return 1;
  }
  if (value <= 0) {
    return 0;
  }
  if (value >= 1) {
    return 1;
  }
  return value;
}

function interpolate(start: number, end: number, progress: number): number {
  return start + (end - start) * progress;
}

function sampleActor(
  actor: Readonly<TransitionPresentationActor>,
  progress: number,
): Readonly<SampledTransitionPresentationActor> {
  return Object.freeze({
    actor,
    opacity: clampUnit(
      interpolate(actor.startOpacity, actor.endOpacity, progress),
    ),
    point: freezePoint(
      interpolate(actor.startPoint.x, actor.endPoint.x, progress),
      interpolate(actor.startPoint.y, actor.endPoint.y, progress),
    ),
  });
}

/** Sample one mounted actor graph without retaining a semantic position. */
export function sampleTransitionPresentation(
  presentation: Readonly<TransitionPresentation>,
  progress: number,
): Readonly<TransitionPresentationSample> {
  const amount = clampUnit(progress);
  const actors = [
    ...presentation.detached,
    ...presentation.current,
    ...presentation.pending,
  ].map((actor) => sampleActor(actor, amount));
  return Object.freeze({
    actors: Object.freeze(actors),
    epoch: presentation.epoch,
    fromRevision: presentation.fromRevision,
    progress: amount,
    toRevision: presentation.toRevision,
  });
}

function matchingPriorCurrentActors(
  prior: Readonly<TransitionPresentationSample> | null,
  fromRevision: Revision,
): ReadonlyMap<SquareId, Readonly<SampledTransitionPresentationActor>> {
  const matches = new Map<
    SquareId,
    Readonly<SampledTransitionPresentationActor>
  >();
  if (prior?.toRevision !== fromRevision) {
    return matches;
  }
  for (const sample of prior.actors) {
    const toAnchor = sample.actor.toAnchor;
    if (sample.actor.role === 'current' && toAnchor !== null) {
      matches.set(toAnchor.square, sample);
    }
  }
  return matches;
}

function priorAtAnchor(
  priorBySquare: ReadonlyMap<
    SquareId,
    Readonly<SampledTransitionPresentationActor>
  >,
  fromAnchor: Readonly<TransitionPresentationAnchor>,
): Readonly<SampledTransitionPresentationActor> | null {
  const candidate = priorBySquare.get(fromAnchor.square);
  const candidateAnchor = candidate?.actor.toAnchor;
  if (candidateAnchor === null || candidateAnchor === undefined) {
    return null;
  }
  return piecesAreEqual(candidateAnchor.piece, fromAnchor.piece)
    ? (candidate ?? null)
    : null;
}

function copyCurrentActor(
  actor: Readonly<CurrentTransitionPresentationActor>,
  overrides: Partial<CurrentTransitionPresentationActor> = {},
): Readonly<CurrentTransitionPresentationActor> {
  return Object.freeze({
    ...actor,
    ...overrides,
    currentSquare: overrides.currentSquare ?? actor.currentSquare,
    endPoint: clonePoint(overrides.endPoint ?? actor.endPoint),
    fromAnchor: cloneAnchor(overrides.fromAnchor ?? actor.fromAnchor),
    piece: clonePiece(overrides.piece ?? actor.piece),
    rendererSource: boardSource(
      (overrides.rendererSource ?? actor.rendererSource).square,
    ),
    startPoint: clonePoint(overrides.startPoint ?? actor.startPoint),
    toAnchor: cloneAnchor(overrides.toAnchor ?? actor.toAnchor),
  });
}

function copyDetachedActor(
  actor: Readonly<DetachedTransitionPresentationActor>,
  overrides: Partial<DetachedTransitionPresentationActor> = {},
): Readonly<DetachedTransitionPresentationActor> {
  return Object.freeze({
    ...actor,
    ...overrides,
    currentSquare: null,
    endPoint: clonePoint(overrides.endPoint ?? actor.endPoint),
    fromAnchor: cloneAnchor(overrides.fromAnchor ?? actor.fromAnchor),
    piece: clonePiece(overrides.piece ?? actor.piece),
    rendererSource: boardSource(
      (overrides.rendererSource ?? actor.rendererSource).square,
    ),
    startPoint: clonePoint(overrides.startPoint ?? actor.startPoint),
    toAnchor: cloneAnchor(overrides.toAnchor ?? actor.toAnchor),
  });
}

function copyPendingActor(
  actor: Readonly<PendingTransitionPresentationActor>,
  overrides: Partial<PendingTransitionPresentationActor> = {},
): Readonly<PendingTransitionPresentationActor> {
  return Object.freeze({
    ...actor,
    ...overrides,
    currentSquare: null,
    endPoint: clonePoint(overrides.endPoint ?? actor.endPoint),
    fromAnchor: cloneAnchor(overrides.fromAnchor ?? actor.fromAnchor),
    piece: clonePiece(overrides.piece ?? actor.piece),
    rendererSource: cloneMoveSource(
      overrides.rendererSource ?? actor.rendererSource,
    ),
    startPoint: clonePoint(overrides.startPoint ?? actor.startPoint),
    toAnchor: cloneAnchor(overrides.toAnchor ?? actor.toAnchor),
  });
}

function normalizeResidualLimit(value: number | undefined): number {
  if (value === undefined) {
    return MAX_TRANSITION_PRESENTATION_RESIDUALS;
  }
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(
      'Transition presentation residualLimit must be a non-negative safe integer.',
    );
  }
  return Math.min(value, MAX_TRANSITION_PRESENTATION_RESIDUALS);
}

function retainedResidualSamples(
  prior: Readonly<TransitionPresentationSample> | null,
  fromRevision: Revision,
  currentPoints: ReadonlyMap<SquareId, Readonly<TransitionVisualPoint>>,
  limit: number,
): readonly Readonly<SampledTransitionPresentationActor>[] {
  if (prior?.toRevision !== fromRevision || limit === 0) {
    return Object.freeze([]);
  }
  const candidates = prior.actors
    .map((sample, order) => ({ order, sample }))
    .filter(
      ({ sample }) =>
        sample.actor.role !== 'current' &&
        sample.opacity >= MIN_TRANSITION_PRESENTATION_OPACITY &&
        currentPoints.has(sample.actor.rendererSquare),
    );
  candidates.sort(
    (left, right) =>
      right.sample.opacity - left.sample.opacity ||
      left.sample.actor.actorKey.localeCompare(right.sample.actor.actorKey) ||
      left.order - right.order,
  );
  const retainedOrders = new Set(
    candidates.slice(0, limit).map(({ order }) => order),
  );
  return Object.freeze(
    candidates
      .filter(({ order }) => retainedOrders.has(order))
      .sort((left, right) => left.order - right.order)
      .map(({ sample }) => sample),
  );
}

function residualActors(
  prior: Readonly<TransitionPresentationSample> | null,
  fromRevision: Revision,
  currentPoints: ReadonlyMap<SquareId, Readonly<TransitionVisualPoint>>,
  epoch: number,
  limit: number,
): Readonly<{
  detached: readonly Readonly<DetachedTransitionPresentationActor>[];
  pending: readonly Readonly<PendingTransitionPresentationActor>[];
}> {
  const detached: Readonly<DetachedTransitionPresentationActor>[] = [];
  const pending: Readonly<PendingTransitionPresentationActor>[] = [];
  for (const sample of retainedResidualSamples(
    prior,
    fromRevision,
    currentPoints,
    limit,
  )) {
    const shared = {
      actorKey: `residual:${String(epoch)}:${encodeKeyPart(sample.actor.actorKey)}`,
      currentSquare: null,
      endOpacity: 0,
      endPoint: clonePoint(sample.point),
      fromAnchor: null,
      kind: 'residual' as const,
      piece: clonePiece(sample.actor.piece),
      rendererSquare: sample.actor.rendererSquare,
      rendererSource: cloneMoveSource(sample.actor.rendererSource),
      settleSquare: null,
      startOpacity: sample.opacity,
      startPoint: clonePoint(sample.point),
      toAnchor: null,
    };
    if (sample.actor.role === 'pending') {
      pending.push(Object.freeze({ ...shared, role: 'pending' as const }));
    } else {
      const source = sample.actor.rendererSource;
      detached.push(
        Object.freeze({
          ...shared,
          rendererSource: boardSource(source.square),
          role: 'detached' as const,
        }),
      );
    }
  }
  return Object.freeze({
    detached: Object.freeze(detached),
    pending: Object.freeze(pending),
  });
}

function createMoveActor(options: {
  readonly from: SquareId;
  readonly to: SquareId;
  readonly before: Readonly<PieceData>;
  readonly after: Readonly<PieceData>;
  readonly startPoint: Readonly<TransitionVisualPoint>;
  readonly endPoint: Readonly<TransitionVisualPoint>;
  readonly prior: Readonly<SampledTransitionPresentationActor> | null;
}): Readonly<CurrentTransitionPresentationActor> {
  const from = anchor(options.from, options.before);
  const prior = options.prior;
  return Object.freeze({
    actorKey:
      prior?.actor.role === 'current'
        ? prior.actor.actorKey
        : currentActorKey(options.to, options.after),
    currentSquare: options.to,
    endOpacity: 1,
    endPoint: clonePoint(options.endPoint),
    fromAnchor: from,
    kind: 'move',
    piece: clonePiece(options.after),
    rendererSource: boardSource(options.to),
    rendererSquare: options.to,
    role: 'current',
    settleSquare: options.to,
    startOpacity: prior?.opacity ?? 1,
    startPoint: clonePoint(prior?.point ?? options.startPoint),
    toAnchor: anchor(options.to, options.after),
  });
}

function createEnterActor(
  to: SquareId,
  piece: Readonly<PieceData>,
  point: Readonly<TransitionVisualPoint>,
): Readonly<CurrentTransitionPresentationActor> {
  return Object.freeze({
    actorKey: currentActorKey(to, piece),
    currentSquare: to,
    endOpacity: 1,
    endPoint: clonePoint(point),
    fromAnchor: null,
    kind: 'enter',
    piece: clonePiece(piece),
    rendererSource: boardSource(to),
    rendererSquare: to,
    role: 'current',
    settleSquare: to,
    startOpacity: 0,
    startPoint: clonePoint(point),
    toAnchor: anchor(to, piece),
  });
}

function createCarriedCurrentActor(
  sample: Readonly<SampledTransitionPresentationActor>,
  point: Readonly<TransitionVisualPoint>,
): Readonly<CurrentTransitionPresentationActor> | null {
  const actor = sample.actor;
  const currentAnchor = actor.toAnchor;
  if (actor.role !== 'current' || currentAnchor === null) {
    return null;
  }
  return Object.freeze({
    actorKey: actor.actorKey,
    currentSquare: currentAnchor.square,
    endOpacity: 1,
    endPoint: clonePoint(point),
    fromAnchor: cloneAnchor(currentAnchor),
    kind: 'carry',
    piece: clonePiece(currentAnchor.piece),
    rendererSource: boardSource(currentAnchor.square),
    rendererSquare: currentAnchor.square,
    role: 'current',
    settleSquare: currentAnchor.square,
    startOpacity: sample.opacity,
    startPoint: clonePoint(sample.point),
    toAnchor: cloneAnchor(currentAnchor),
  });
}

function createExitActor(options: {
  readonly epoch: number;
  readonly from: SquareId;
  readonly piece: Readonly<PieceData>;
  readonly point: Readonly<TransitionVisualPoint>;
  readonly prior: Readonly<SampledTransitionPresentationActor> | null;
}): Readonly<DetachedTransitionPresentationActor> {
  const prior = options.prior;
  return Object.freeze({
    actorKey:
      prior?.actor.role === 'current'
        ? prior.actor.actorKey
        : detachedActorKey(
            options.epoch,
            'exit',
            options.from,
            options.piece,
            null,
          ),
    currentSquare: null,
    endOpacity: 0,
    endPoint: clonePoint(prior?.point ?? options.point),
    fromAnchor: anchor(options.from, options.piece),
    kind: 'exit',
    piece: clonePiece(options.piece),
    rendererSource: boardSource(options.from),
    rendererSquare: options.from,
    role: 'detached',
    settleSquare: options.from,
    startOpacity: prior?.opacity ?? 1,
    startPoint: clonePoint(prior?.point ?? options.point),
    toAnchor: null,
  });
}

function createReplacementActors(options: {
  readonly epoch: number;
  readonly from: SquareId;
  readonly to: SquareId;
  readonly before: Readonly<PieceData>;
  readonly after: Readonly<PieceData>;
  readonly startPoint: Readonly<TransitionVisualPoint>;
  readonly endPoint: Readonly<TransitionVisualPoint>;
  readonly prior: Readonly<SampledTransitionPresentationActor> | null;
}): Readonly<{
  current: Readonly<CurrentTransitionPresentationActor>;
  detached: Readonly<DetachedTransitionPresentationActor>;
}> {
  const from = anchor(options.from, options.before);
  const visualStart = options.prior?.point ?? options.startPoint;
  const current: Readonly<CurrentTransitionPresentationActor> = Object.freeze({
    actorKey:
      options.prior?.actor.role === 'current'
        ? options.prior.actor.actorKey
        : currentActorKey(options.to, options.after),
    currentSquare: options.to,
    endOpacity: 1,
    endPoint: clonePoint(options.endPoint),
    fromAnchor: from,
    kind: 'replace-enter',
    piece: clonePiece(options.after),
    rendererSource: boardSource(options.to),
    rendererSquare: options.to,
    role: 'current',
    settleSquare: options.to,
    startOpacity: 0,
    startPoint: clonePoint(visualStart),
    toAnchor: anchor(options.to, options.after),
  });
  const detached: Readonly<DetachedTransitionPresentationActor> = Object.freeze(
    {
      actorKey: detachedActorKey(
        options.epoch,
        'replace-exit',
        options.from,
        options.before,
        options.to,
      ),
      currentSquare: null,
      endOpacity: 0,
      endPoint: clonePoint(options.endPoint),
      fromAnchor: from,
      kind: 'replace-exit',
      piece: clonePiece(options.before),
      rendererSource: boardSource(options.from),
      rendererSquare: options.from,
      role: 'detached',
      settleSquare: options.to,
      startOpacity: options.prior?.opacity ?? 1,
      startPoint: clonePoint(visualStart),
      toAnchor: null,
    },
  );
  return Object.freeze({ current, detached });
}

function handoffMatchesCurrentActor(
  actor: Readonly<CurrentTransitionPresentationActor>,
  handoff: Readonly<PendingCommitHandoffDescriptor>,
): boolean {
  if (
    handoff.targetSquare === null ||
    actor.toAnchor?.square !== handoff.targetSquare
  ) {
    return false;
  }
  if (handoff.source.kind === 'spare') {
    return actor.kind === 'enter' && piecesAreEqual(actor.piece, handoff.piece);
  }
  return (
    (actor.kind === 'move' || actor.kind === 'replace-enter') &&
    actor.fromAnchor?.square === handoff.source.square &&
    piecesAreEqual(actor.fromAnchor.piece, handoff.piece)
  );
}

function applyPendingHandoff(options: {
  readonly current: readonly Readonly<CurrentTransitionPresentationActor>[];
  readonly detached: readonly Readonly<DetachedTransitionPresentationActor>[];
  readonly pending: readonly Readonly<PendingTransitionPresentationActor>[];
  readonly plan: Readonly<PositionTransitionPlan>;
  readonly handoff: Readonly<PendingCommitHandoffDescriptor> | null;
  readonly currentPoints: ReadonlyMap<
    SquareId,
    Readonly<TransitionVisualPoint>
  >;
}): Readonly<{
  current: readonly Readonly<CurrentTransitionPresentationActor>[];
  detached: readonly Readonly<DetachedTransitionPresentationActor>[];
  pending: readonly Readonly<PendingTransitionPresentationActor>[];
}> {
  const { handoff } = options;
  if (handoff === null) {
    return Object.freeze({
      current: options.current,
      detached: options.detached,
      pending: options.pending,
    });
  }
  if (
    handoff.targetSquare === null ||
    handoff.fromRevision !== options.plan.fromRevision ||
    handoff.toRevision !== options.plan.toRevision
  ) {
    return Object.freeze({
      current: options.current,
      detached: options.detached,
      pending: options.pending,
    });
  }
  const point = options.currentPoints.get(handoff.targetSquare);
  if (point === undefined) {
    return Object.freeze({
      current: options.current,
      detached: options.detached,
      pending: options.pending,
    });
  }
  const currentIndex = options.current.findIndex((actor) =>
    handoffMatchesCurrentActor(actor, handoff),
  );
  const matched = options.current[currentIndex];
  if (matched === undefined) {
    return Object.freeze({
      current: options.current,
      detached: options.detached,
      pending: options.pending,
    });
  }

  const current = [...options.current];
  current[currentIndex] = copyCurrentActor(matched, {
    endPoint: point,
    startOpacity: 0,
    startPoint: point,
  });
  const detached =
    matched.kind !== 'replace-enter' || matched.fromAnchor === null
      ? [...options.detached]
      : options.detached.filter(
          (actor) =>
            !(
              actor.kind === 'replace-exit' &&
              actor.fromAnchor?.square === matched.fromAnchor?.square &&
              actor.settleSquare === handoff.targetSquare &&
              actor.fromAnchor !== null &&
              piecesAreEqual(actor.fromAnchor.piece, handoff.piece)
            ),
        );
  const pendingActor: Readonly<PendingTransitionPresentationActor> =
    Object.freeze({
      actorKey: `pending-handoff:${String(options.plan.epoch)}:${encodeKeyPart(handoff.intentId)}`,
      currentSquare: null,
      endOpacity: 0,
      endPoint: clonePoint(point),
      fromAnchor: null,
      kind: 'pending-handoff',
      piece: clonePiece(handoff.piece),
      rendererSource: cloneMoveSource(handoff.source),
      rendererSquare: handoff.targetSquare,
      role: 'pending',
      settleSquare: handoff.targetSquare,
      startOpacity: 1,
      startPoint: clonePoint(point),
      toAnchor: null,
    });
  return Object.freeze({
    current: Object.freeze(current),
    detached: Object.freeze(detached),
    pending: Object.freeze([...options.pending, pendingActor]),
  });
}

function freezePresentation(options: {
  readonly epoch: number;
  readonly fromRevision: Revision;
  readonly toRevision: Revision;
  readonly current: readonly Readonly<CurrentTransitionPresentationActor>[];
  readonly detached: readonly Readonly<DetachedTransitionPresentationActor>[];
  readonly pending: readonly Readonly<PendingTransitionPresentationActor>[];
}): Readonly<TransitionPresentation> {
  return Object.freeze({
    current: Object.freeze([...options.current]),
    detached: Object.freeze([...options.detached]),
    epoch: options.epoch,
    fromRevision: options.fromRevision,
    pending: Object.freeze([...options.pending]),
    residualCount:
      options.detached.filter(({ kind }) => kind === 'residual').length +
      options.pending.filter(({ kind }) => kind === 'residual').length,
    toRevision: options.toRevision,
  });
}

/**
 * Build presentation actors for one exact plan.
 *
 * A prior sample may adjust visual origins only when its target revision is the
 * new plan's exact source revision. It never changes B-to-C semantic matching.
 */
export function createTransitionPresentation({
  currentLayout,
  pendingHandoff = null,
  plan,
  previousLayout,
  prior = null,
  residualLimit,
}: CreateTransitionPresentationOptions): Readonly<TransitionPresentation> {
  const previousPoints = layoutPoints(previousLayout);
  const currentPoints = layoutPoints(currentLayout);
  const exactPrior = prior?.toRevision === plan.fromRevision ? prior : null;
  const priorBySquare = matchingPriorCurrentActors(
    exactPrior,
    plan.fromRevision,
  );
  const residual = residualActors(
    exactPrior,
    plan.fromRevision,
    currentPoints,
    plan.epoch,
    normalizeResidualLimit(residualLimit),
  );
  const current: Readonly<CurrentTransitionPresentationActor>[] = [];
  const detached: Readonly<DetachedTransitionPresentationActor>[] = [
    ...residual.detached,
  ];
  const consumedPrior = new Set<Readonly<SampledTransitionPresentationActor>>();

  for (const exit of plan.exits) {
    const from = anchor(exit.from, exit.piece);
    const priorSample = priorAtAnchor(priorBySquare, from);
    if (priorSample !== null) {
      consumedPrior.add(priorSample);
    }
    const point = previousPoints.get(exit.from);
    if (point === undefined || !currentPoints.has(exit.from)) {
      continue;
    }
    detached.push(
      createExitActor({
        epoch: plan.epoch,
        from: exit.from,
        piece: exit.piece,
        point,
        prior: priorSample,
      }),
    );
  }

  for (const replacement of plan.replacements) {
    const from = anchor(replacement.from, replacement.before);
    const priorSample = priorAtAnchor(priorBySquare, from);
    if (priorSample !== null) {
      consumedPrior.add(priorSample);
    }
    const startPoint = previousPoints.get(replacement.from);
    const endPoint = currentPoints.get(replacement.to);
    if (startPoint === undefined || endPoint === undefined) {
      continue;
    }
    const actors = createReplacementActors({
      after: replacement.after,
      before: replacement.before,
      endPoint,
      epoch: plan.epoch,
      from: replacement.from,
      prior: priorSample,
      startPoint,
      to: replacement.to,
    });
    detached.push(actors.detached);
    current.push(actors.current);
  }

  for (const move of plan.moves) {
    const from = anchor(move.from, move.before);
    const priorSample = priorAtAnchor(priorBySquare, from);
    if (priorSample !== null) {
      consumedPrior.add(priorSample);
    }
    const startPoint = previousPoints.get(move.from);
    const endPoint = currentPoints.get(move.to);
    if (startPoint === undefined || endPoint === undefined) {
      continue;
    }
    current.push(
      createMoveActor({
        after: move.after,
        before: move.before,
        endPoint,
        from: move.from,
        prior: priorSample,
        startPoint,
        to: move.to,
      }),
    );
  }

  for (const enter of plan.enters) {
    const point = currentPoints.get(enter.to);
    if (point !== undefined) {
      current.push(createEnterActor(enter.to, enter.piece, point));
    }
  }

  for (const priorSample of priorBySquare.values()) {
    if (consumedPrior.has(priorSample)) {
      continue;
    }
    const currentAnchor = priorSample.actor.toAnchor;
    if (currentAnchor === null) {
      continue;
    }
    const point = currentPoints.get(currentAnchor.square);
    if (point === undefined) {
      continue;
    }
    const carried = createCarriedCurrentActor(priorSample, point);
    if (carried !== null) {
      current.push(carried);
    }
  }

  const handedOff = applyPendingHandoff({
    current,
    currentPoints,
    detached,
    handoff: pendingHandoff,
    pending: residual.pending,
    plan,
  });
  return freezePresentation({
    current: handedOff.current,
    detached: handedOff.detached,
    epoch: plan.epoch,
    fromRevision: plan.fromRevision,
    pending: handedOff.pending,
    toRevision: plan.toRevision,
  });
}

/** Rebase sampled visual points toward the same controlled target geometry. */
export function rebaseTransitionPresentation({
  epoch,
  layout,
  presentation,
  progress,
}: RebaseTransitionPresentationOptions): Readonly<TransitionPresentation> {
  if (!Number.isSafeInteger(epoch) || epoch < 0) {
    throw new RangeError(
      'Rebased transition presentation epoch must be a non-negative safe integer.',
    );
  }
  const points = layoutPoints(layout);
  const sample = sampleTransitionPresentation(presentation, progress);
  const current: Readonly<CurrentTransitionPresentationActor>[] = [];
  const detached: Readonly<DetachedTransitionPresentationActor>[] = [];
  const pending: Readonly<PendingTransitionPresentationActor>[] = [];

  for (const sampled of sample.actors) {
    const actor = sampled.actor;
    if (!points.has(actor.rendererSquare)) {
      continue;
    }
    const endPoint =
      actor.settleSquare === null
        ? sampled.point
        : (points.get(actor.settleSquare) ?? sampled.point);
    switch (actor.role) {
      case 'current': {
        const target =
          actor.toAnchor === null
            ? points.get(actor.currentSquare)
            : points.get(actor.toAnchor.square);
        if (target === undefined) {
          break;
        }
        current.push(
          copyCurrentActor(actor, {
            endOpacity: 1,
            endPoint: target,
            startOpacity: sampled.opacity,
            startPoint: sampled.point,
          }),
        );
        break;
      }
      case 'detached':
        detached.push(
          copyDetachedActor(actor, {
            endOpacity: 0,
            endPoint,
            startOpacity: sampled.opacity,
            startPoint: sampled.point,
          }),
        );
        break;
      case 'pending':
        pending.push(
          copyPendingActor(actor, {
            endOpacity: 0,
            endPoint,
            startOpacity: sampled.opacity,
            startPoint: sampled.point,
          }),
        );
        break;
    }
  }

  return freezePresentation({
    current,
    detached,
    epoch,
    fromRevision: presentation.fromRevision,
    pending,
    toRevision: presentation.toRevision,
  });
}

/** Convert normalized actor endpoints into renderer-host relative transforms. */
export function projectTransitionPresentationActor(
  actor: Readonly<TransitionPresentationActor>,
  layout: Readonly<BoardSurfaceLayout>,
): Readonly<ProjectedTransitionPresentationActor> | null {
  const cell = layout.cells.find(
    ({ square }) => square === actor.rendererSquare,
  );
  if (cell === undefined) {
    return null;
  }
  const centerX = cell.rect.left + cell.rect.width / 2;
  const centerY = cell.rect.top + cell.rect.height / 2;
  return Object.freeze({
    endOpacity: actor.endOpacity,
    endTranslateX: actor.endPoint.x * layout.size.width - centerX,
    endTranslateY: actor.endPoint.y * layout.size.height - centerY,
    startOpacity: actor.startOpacity,
    startTranslateX: actor.startPoint.x * layout.size.width - centerX,
    startTranslateY: actor.startPoint.y * layout.size.height - centerY,
  });
}
