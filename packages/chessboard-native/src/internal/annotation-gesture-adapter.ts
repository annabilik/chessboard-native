import type {
  AnnotationDraft,
  AnnotationOperation,
  AnnotationTool,
  Revision,
  SquareId,
} from '../public-types';
import type { CorrelatedAnnotationDraft } from './annotation-draft-presentation';

export type AnnotationGesturePath = 'explicit' | 'long-press' | 'two-finger';

export type AnnotationGestureInput = Extract<
  AnnotationOperation['input'],
  'touch' | 'keyboard' | 'accessibility'
>;

export interface AnnotationGestureSnapshot {
  readonly annotationRevision: Revision;
  readonly boardId: string;
  readonly geometryEpoch: Revision;
  readonly positionRevision: Revision;
  readonly providerGeometryRevision: Revision;
  readonly providerLifecycleRevision: Revision;
  readonly tool: Readonly<Exclude<AnnotationTool, null>>;
}

export interface AnnotationGestureCorrelation {
  readonly annotationRevision: Revision;
  readonly boardId: string;
  readonly geometryEpoch: Revision;
  readonly positionRevision: Revision;
  readonly providerGeometryRevision: Revision;
  readonly providerLifecycleRevision: Revision;
  readonly token: number;
}

export interface AnnotationGestureCandidate {
  readonly annotation: Readonly<AnnotationDraft>;
  readonly baseAnnotationRevision: Revision;
  readonly basePositionRevision: Revision;
  readonly boardId: string;
  readonly geometryEpoch: Revision;
  readonly input: AnnotationGestureInput;
  readonly path: AnnotationGesturePath;
  readonly providerGeometryRevision: Revision;
  readonly providerLifecycleRevision: Revision;
  readonly token: number;
}

interface ArmedArrowInteraction {
  readonly correlation: Readonly<AnnotationGestureCorrelation>;
  readonly kind: 'armed-arrow';
  readonly sourceSquare: SquareId;
  readonly tool: Readonly<Extract<AnnotationTool, { readonly type: 'arrow' }>>;
}

interface DrawingInteraction {
  readonly correlation: Readonly<AnnotationGestureCorrelation>;
  readonly input: AnnotationGestureInput;
  readonly kind: 'drawing';
  readonly path: Exclude<AnnotationGesturePath, 'explicit'>;
  readonly sourceSquare: SquareId;
  readonly targetSquare: SquareId | null;
  readonly tool: Readonly<Exclude<AnnotationTool, null>>;
}

type AnnotationGestureInteraction = ArmedArrowInteraction | DrawingInteraction;

export interface AnnotationGestureAdapterState {
  readonly boardId: string;
  readonly interaction: Readonly<AnnotationGestureInteraction> | null;
  readonly presentation: Readonly<CorrelatedAnnotationDraft> | null;
}

export type AnnotationGestureInteractionMode =
  'idle' | 'armed-arrow' | 'drawing';

export interface AnnotationGestureInteractionStatus {
  readonly mode: AnnotationGestureInteractionMode;
  readonly sourceSquare: SquareId | null;
}

export type AnnotationGestureAdapterEvent =
  | {
      readonly snapshot: Readonly<AnnotationGestureSnapshot> | null;
      readonly type: 'synchronize';
    }
  | {
      readonly correlation: Readonly<AnnotationGestureCorrelation>;
      readonly input: AnnotationGestureInput;
      readonly path: Exclude<AnnotationGesturePath, 'explicit'>;
      readonly snapshot: Readonly<AnnotationGestureSnapshot>;
      readonly sourceSquare: SquareId;
      readonly targetSquare: SquareId | null;
      readonly type: 'start';
    }
  | {
      readonly correlation: Readonly<AnnotationGestureCorrelation>;
      readonly targetSquare: SquareId | null;
      readonly type: 'update';
    }
  | {
      readonly correlation: Readonly<AnnotationGestureCorrelation>;
      readonly snapshot: Readonly<AnnotationGestureSnapshot>;
      readonly targetSquare: SquareId | null;
      readonly type: 'finalize';
    }
  | {
      readonly correlation: Readonly<AnnotationGestureCorrelation>;
      readonly input: AnnotationGestureInput;
      readonly snapshot: Readonly<AnnotationGestureSnapshot>;
      readonly square: SquareId;
      readonly type: 'activate';
    }
  | {
      readonly correlation?: Readonly<AnnotationGestureCorrelation>;
      readonly type: 'cancel';
    };

export interface AnnotationGestureAdapterReduction {
  readonly candidate: Readonly<AnnotationGestureCandidate> | null;
  readonly state: Readonly<AnnotationGestureAdapterState>;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isRevision(value: unknown): value is Revision {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isSquare(value: unknown): value is SquareId {
  return typeof value === 'string' && /^[a-z][1-9][0-9]?$/.test(value);
}

/** Detach and validate the selected presentation tool. */
export function normalizeAnnotationTool(
  input: unknown,
): Readonly<Exclude<AnnotationTool, null>> | null {
  try {
    if (!isRecord(input) || typeof input['color'] !== 'string') {
      return null;
    }
    if (input['type'] === 'arrow') {
      const opacity = input['opacity'];
      const width = input['width'];
      if (
        (opacity !== undefined &&
          (typeof opacity !== 'number' ||
            !Number.isFinite(opacity) ||
            opacity < 0 ||
            opacity > 1)) ||
        (width !== undefined &&
          (typeof width !== 'number' || !Number.isFinite(width) || width <= 0))
      ) {
        return null;
      }
      return Object.freeze({
        color: input['color'],
        ...(opacity === undefined ? {} : { opacity }),
        type: 'arrow' as const,
        ...(width === undefined ? {} : { width }),
      });
    }
    if (input['type'] === 'square') {
      const shape = input['shape'];
      if (
        shape !== undefined &&
        shape !== 'fill' &&
        shape !== 'circle' &&
        shape !== 'dot' &&
        shape !== 'border'
      ) {
        return null;
      }
      return Object.freeze({
        color: input['color'],
        ...(shape === undefined ? {} : { shape }),
        type: 'square' as const,
      });
    }
  } catch {
    return null;
  }
  return null;
}

export function annotationToolsEqual(
  left: Readonly<Exclude<AnnotationTool, null>>,
  right: Readonly<Exclude<AnnotationTool, null>>,
): boolean {
  if (left.type !== right.type || left.color !== right.color) {
    return false;
  }
  if (left.type === 'arrow' && right.type === 'arrow') {
    return left.opacity === right.opacity && left.width === right.width;
  }
  return (
    left.type === 'square' &&
    right.type === 'square' &&
    left.shape === right.shape
  );
}

function freezeCorrelation(
  correlation: Readonly<AnnotationGestureCorrelation>,
): Readonly<AnnotationGestureCorrelation> {
  return Object.freeze({
    annotationRevision: correlation.annotationRevision,
    boardId: correlation.boardId,
    geometryEpoch: correlation.geometryEpoch,
    positionRevision: correlation.positionRevision,
    providerGeometryRevision: correlation.providerGeometryRevision,
    providerLifecycleRevision: correlation.providerLifecycleRevision,
    token: correlation.token,
  });
}

function freezeState(
  boardId: string,
  interaction: Readonly<AnnotationGestureInteraction> | null,
  presentation: Readonly<CorrelatedAnnotationDraft> | null,
): Readonly<AnnotationGestureAdapterState> {
  return Object.freeze({ boardId, interaction, presentation });
}

function result(
  state: Readonly<AnnotationGestureAdapterState>,
  candidate: Readonly<AnnotationGestureCandidate> | null = null,
): Readonly<AnnotationGestureAdapterReduction> {
  return Object.freeze({ candidate, state });
}

export function createAnnotationGestureAdapterState(options: {
  readonly boardId: string;
}): Readonly<AnnotationGestureAdapterState> {
  if (options.boardId.trim().length === 0) {
    throw new RangeError('boardId must be non-empty.');
  }
  return freezeState(options.boardId, null, null);
}

const IDLE_INTERACTION_STATUS: Readonly<AnnotationGestureInteractionStatus> =
  Object.freeze({ mode: 'idle', sourceSquare: null });

/** Project the transient interaction without exposing reducer internals. */
export function annotationGestureInteractionStatus(
  state: Readonly<AnnotationGestureAdapterState>,
): Readonly<AnnotationGestureInteractionStatus> {
  const interaction = state.interaction;
  return interaction === null
    ? IDLE_INTERACTION_STATUS
    : Object.freeze({
        mode: interaction.kind,
        sourceSquare: interaction.sourceSquare,
      });
}

function metadataIsValid(
  value: Readonly<AnnotationGestureCorrelation | AnnotationGestureSnapshot>,
): boolean {
  return (
    value.boardId.length > 0 &&
    isRevision(value.annotationRevision) &&
    isRevision(value.geometryEpoch) &&
    isRevision(value.positionRevision) &&
    isRevision(value.providerGeometryRevision) &&
    isRevision(value.providerLifecycleRevision) &&
    (!Object.hasOwn(value, 'token') ||
      isRevision((value as Readonly<AnnotationGestureCorrelation>).token))
  );
}

function correlationMatchesSnapshot(
  correlation: Readonly<AnnotationGestureCorrelation>,
  snapshot: Readonly<AnnotationGestureSnapshot>,
): boolean {
  return (
    metadataIsValid(correlation) &&
    metadataIsValid(snapshot) &&
    correlation.annotationRevision === snapshot.annotationRevision &&
    correlation.boardId === snapshot.boardId &&
    correlation.geometryEpoch === snapshot.geometryEpoch &&
    correlation.positionRevision === snapshot.positionRevision &&
    correlation.providerGeometryRevision ===
      snapshot.providerGeometryRevision &&
    correlation.providerLifecycleRevision === snapshot.providerLifecycleRevision
  );
}

function correlationsEqual(
  left: Readonly<AnnotationGestureCorrelation>,
  right: Readonly<AnnotationGestureCorrelation>,
): boolean {
  return (
    left.token === right.token &&
    left.annotationRevision === right.annotationRevision &&
    left.boardId === right.boardId &&
    left.geometryEpoch === right.geometryEpoch &&
    left.positionRevision === right.positionRevision &&
    left.providerGeometryRevision === right.providerGeometryRevision &&
    left.providerLifecycleRevision === right.providerLifecycleRevision
  );
}

function interactionMatchesSnapshot(
  interaction: Readonly<AnnotationGestureInteraction>,
  snapshot: Readonly<AnnotationGestureSnapshot>,
): boolean {
  return (
    correlationMatchesSnapshot(interaction.correlation, snapshot) &&
    annotationToolsEqual(interaction.tool, snapshot.tool)
  );
}

function correlatedPresentation(
  correlation: Readonly<AnnotationGestureCorrelation>,
  draft: Readonly<AnnotationDraft> | null,
): Readonly<CorrelatedAnnotationDraft> | null {
  if (draft === null) {
    return null;
  }
  return Object.freeze({
    baseAnnotationRevision: correlation.annotationRevision,
    basePositionRevision: correlation.positionRevision,
    boardId: correlation.boardId,
    draft,
    geometryEpoch: correlation.geometryEpoch,
    providerGeometryRevision: correlation.providerGeometryRevision,
    providerLifecycleRevision: correlation.providerLifecycleRevision,
  });
}

function presentationDraft(
  tool: Readonly<Exclude<AnnotationTool, null>>,
  sourceSquare: SquareId,
  targetSquare: SquareId | null,
): Readonly<AnnotationDraft> | null {
  if (targetSquare === null) {
    return null;
  }
  if (tool.type === 'square') {
    return Object.freeze({
      color: tool.color,
      ...(tool.shape === undefined ? {} : { shape: tool.shape }),
      square: targetSquare,
      type: 'square' as const,
    });
  }
  if (targetSquare === sourceSquare) {
    return Object.freeze({
      color: tool.color,
      shape: 'border' as const,
      square: sourceSquare,
      type: 'square' as const,
    });
  }
  return Object.freeze({
    color: tool.color,
    from: sourceSquare,
    ...(tool.opacity === undefined ? {} : { opacity: tool.opacity }),
    to: targetSquare,
    type: 'arrow' as const,
    ...(tool.width === undefined ? {} : { width: tool.width }),
  });
}

function terminalDraft(
  tool: Readonly<Exclude<AnnotationTool, null>>,
  sourceSquare: SquareId,
  targetSquare: SquareId | null,
): Readonly<AnnotationDraft> | null {
  if (targetSquare === null) {
    return null;
  }
  if (tool.type === 'square') {
    return presentationDraft(tool, sourceSquare, targetSquare);
  }
  if (targetSquare === sourceSquare) {
    return null;
  }
  return presentationDraft(tool, sourceSquare, targetSquare);
}

function createCandidate(
  correlation: Readonly<AnnotationGestureCorrelation>,
  annotation: Readonly<AnnotationDraft>,
  input: AnnotationGestureInput,
  path: AnnotationGesturePath,
): Readonly<AnnotationGestureCandidate> {
  return Object.freeze({
    annotation,
    baseAnnotationRevision: correlation.annotationRevision,
    basePositionRevision: correlation.positionRevision,
    boardId: correlation.boardId,
    geometryEpoch: correlation.geometryEpoch,
    input,
    path,
    providerGeometryRevision: correlation.providerGeometryRevision,
    providerLifecycleRevision: correlation.providerLifecycleRevision,
    token: correlation.token,
  });
}

function synchronize(
  state: Readonly<AnnotationGestureAdapterState>,
  snapshot: Readonly<AnnotationGestureSnapshot> | null,
): Readonly<AnnotationGestureAdapterReduction> {
  const interaction = state.interaction;
  if (interaction === null) {
    return result(state);
  }
  return snapshot !== null &&
    snapshot.boardId === state.boardId &&
    interactionMatchesSnapshot(interaction, snapshot)
    ? result(state)
    : result(freezeState(state.boardId, null, null));
}

function startDrawing(
  state: Readonly<AnnotationGestureAdapterState>,
  event: Extract<AnnotationGestureAdapterEvent, { readonly type: 'start' }>,
): Readonly<AnnotationGestureAdapterReduction> {
  if (
    event.snapshot.boardId !== state.boardId ||
    !correlationMatchesSnapshot(event.correlation, event.snapshot) ||
    !isSquare(event.sourceSquare) ||
    (event.targetSquare !== null && !isSquare(event.targetSquare))
  ) {
    return result(state);
  }
  const tool = normalizeAnnotationTool(event.snapshot.tool);
  if (tool === null) {
    return result(state);
  }
  const correlation = freezeCorrelation(event.correlation);
  const interaction: Readonly<DrawingInteraction> = Object.freeze({
    correlation,
    input: event.input,
    kind: 'drawing',
    path: event.path,
    sourceSquare: event.sourceSquare,
    targetSquare: event.targetSquare,
    tool,
  });
  return result(
    freezeState(
      state.boardId,
      interaction,
      correlatedPresentation(
        correlation,
        presentationDraft(tool, event.sourceSquare, event.targetSquare),
      ),
    ),
  );
}

function updateDrawing(
  state: Readonly<AnnotationGestureAdapterState>,
  event: Extract<AnnotationGestureAdapterEvent, { readonly type: 'update' }>,
): Readonly<AnnotationGestureAdapterReduction> {
  const interaction = state.interaction;
  if (
    interaction?.kind !== 'drawing' ||
    !correlationsEqual(interaction.correlation, event.correlation) ||
    (event.targetSquare !== null && !isSquare(event.targetSquare)) ||
    interaction.targetSquare === event.targetSquare
  ) {
    return result(state);
  }
  const next: Readonly<DrawingInteraction> = Object.freeze({
    ...interaction,
    targetSquare: event.targetSquare,
  });
  return result(
    freezeState(
      state.boardId,
      next,
      correlatedPresentation(
        interaction.correlation,
        presentationDraft(
          interaction.tool,
          interaction.sourceSquare,
          event.targetSquare,
        ),
      ),
    ),
  );
}

function finalizeDrawing(
  state: Readonly<AnnotationGestureAdapterState>,
  event: Extract<AnnotationGestureAdapterEvent, { readonly type: 'finalize' }>,
): Readonly<AnnotationGestureAdapterReduction> {
  const interaction = state.interaction;
  if (
    interaction?.kind !== 'drawing' ||
    !correlationsEqual(interaction.correlation, event.correlation) ||
    event.snapshot.boardId !== state.boardId ||
    !interactionMatchesSnapshot(interaction, event.snapshot) ||
    (event.targetSquare !== null && !isSquare(event.targetSquare))
  ) {
    return result(state);
  }
  const idle = freezeState(state.boardId, null, null);
  const draft = terminalDraft(
    interaction.tool,
    interaction.sourceSquare,
    event.targetSquare,
  );
  return result(
    idle,
    draft === null
      ? null
      : createCandidate(
          interaction.correlation,
          draft,
          interaction.input,
          interaction.path,
        ),
  );
}

function activate(
  state: Readonly<AnnotationGestureAdapterState>,
  event: Extract<AnnotationGestureAdapterEvent, { readonly type: 'activate' }>,
): Readonly<AnnotationGestureAdapterReduction> {
  if (
    event.snapshot.boardId !== state.boardId ||
    !correlationMatchesSnapshot(event.correlation, event.snapshot) ||
    !isSquare(event.square)
  ) {
    return result(state);
  }
  const tool = normalizeAnnotationTool(event.snapshot.tool);
  if (tool === null) {
    return result(state);
  }
  const correlation = freezeCorrelation(event.correlation);
  if (tool.type === 'square') {
    const draft = terminalDraft(tool, event.square, event.square);
    return result(
      freezeState(state.boardId, null, null),
      draft === null
        ? null
        : createCandidate(correlation, draft, event.input, 'explicit'),
    );
  }
  const current = state.interaction;
  if (
    current?.kind === 'armed-arrow' &&
    interactionMatchesSnapshot(current, event.snapshot)
  ) {
    const draft = terminalDraft(tool, current.sourceSquare, event.square);
    return result(
      freezeState(state.boardId, null, null),
      draft === null
        ? null
        : createCandidate(correlation, draft, event.input, 'explicit'),
    );
  }
  const armed: Readonly<ArmedArrowInteraction> = Object.freeze({
    correlation,
    kind: 'armed-arrow',
    sourceSquare: event.square,
    tool,
  });
  return result(
    freezeState(
      state.boardId,
      armed,
      correlatedPresentation(
        correlation,
        presentationDraft(tool, event.square, event.square),
      ),
    ),
  );
}

function cancel(
  state: Readonly<AnnotationGestureAdapterState>,
  event: Extract<AnnotationGestureAdapterEvent, { readonly type: 'cancel' }>,
): Readonly<AnnotationGestureAdapterReduction> {
  if (
    state.interaction === null ||
    (event.correlation !== undefined &&
      !correlationsEqual(state.interaction.correlation, event.correlation))
  ) {
    return result(state);
  }
  return result(freezeState(state.boardId, null, null));
}

export function reduceAnnotationGestureAdapter(
  state: Readonly<AnnotationGestureAdapterState>,
  event: Readonly<AnnotationGestureAdapterEvent>,
): Readonly<AnnotationGestureAdapterReduction> {
  switch (event.type) {
    case 'synchronize':
      return synchronize(state, event.snapshot);
    case 'start':
      return startDrawing(state, event);
    case 'update':
      return updateDrawing(state, event);
    case 'finalize':
      return finalizeDrawing(state, event);
    case 'activate':
      return activate(state, event);
    case 'cancel':
      return cancel(state, event);
  }
}
