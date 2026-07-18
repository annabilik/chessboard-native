import type {
  AnnotationDraft,
  AnnotationOperation,
  BoardAnnotation,
  ControlledAnnotations,
  Revision,
} from '../public-types';

/** Expected failures when reducing an annotation operation. @public */
export type AnnotationOperationRejectionReason =
  | 'board-mismatch'
  | 'future-base'
  | 'annotation-id-conflict'
  | 'revision-overflow';

/** Inputs to the pure controlled-annotation reducer. @public */
export interface ApplyAnnotationOperationOptions {
  /** Board whose store owns `current`. */
  readonly boardId: string;
  /** Latest consumer-owned revisioned annotation snapshot. */
  readonly current: Readonly<ControlledAnnotations>;
  /** Detached delta emitted by a board. */
  readonly operation: Readonly<AnnotationOperation>;
}

/** Result of reducing one operation without committing it. @public */
export type ApplyAnnotationOperationResult =
  | Readonly<{
      readonly status: 'applied';
      readonly next: Readonly<ControlledAnnotations>;
      /** True when the delta was safely reduced against a newer snapshot. */
      readonly stale: boolean;
    }>
  | Readonly<{
      readonly status: 'unchanged';
      readonly next: Readonly<ControlledAnnotations>;
      /** True when the no-op delta was based on an older snapshot. */
      readonly stale: boolean;
    }>
  | Readonly<{
      readonly status: 'rejected';
      readonly next: Readonly<ControlledAnnotations>;
      readonly reason: AnnotationOperationRejectionReason;
    }>;

function isRevision(value: unknown): value is Revision {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function requireRevision(value: unknown, name: string): Revision {
  if (!isRevision(value)) {
    throw new RangeError(`${name} must be a non-negative safe integer.`);
  }
  return value;
}

function requireNonEmptyString(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`${name} must be a non-empty string.`);
  }
  return value;
}

function requireIdArray(value: unknown, name: string): readonly string[] {
  if (!Array.isArray(value)) {
    throw new TypeError(`${name} must be an array of non-empty strings.`);
  }
  const ids: string[] = [];
  for (const id of value as readonly unknown[]) {
    ids.push(requireNonEmptyString(id, `${name} item`));
  }
  return Object.freeze(ids);
}

function cloneAnnotation(
  annotation: Readonly<BoardAnnotation>,
): Readonly<BoardAnnotation> {
  if (annotation.type === 'arrow') {
    return Object.freeze({
      color: annotation.color,
      from: annotation.from,
      id: annotation.id,
      ...(annotation.layer === undefined ? {} : { layer: annotation.layer }),
      ...(annotation.opacity === undefined
        ? {}
        : { opacity: annotation.opacity }),
      ...(annotation.shape === undefined ? {} : { shape: annotation.shape }),
      to: annotation.to,
      type: annotation.type,
      ...(annotation.width === undefined ? {} : { width: annotation.width }),
    });
  }
  return Object.freeze({
    color: annotation.color,
    id: annotation.id,
    ...(annotation.layer === undefined ? {} : { layer: annotation.layer }),
    ...(annotation.shape === undefined ? {} : { shape: annotation.shape }),
    square: annotation.square,
    type: annotation.type,
  });
}

function persistentAnnotation(
  annotationId: string,
  draft: Readonly<AnnotationDraft>,
): Readonly<BoardAnnotation> {
  if (draft.type === 'arrow') {
    return Object.freeze({
      color: draft.color,
      from: draft.from,
      id: annotationId,
      ...(draft.layer === undefined ? {} : { layer: draft.layer }),
      ...(draft.opacity === undefined ? {} : { opacity: draft.opacity }),
      ...(draft.shape === undefined ? {} : { shape: draft.shape }),
      to: draft.to,
      type: draft.type,
      ...(draft.width === undefined ? {} : { width: draft.width }),
    });
  }
  return Object.freeze({
    color: draft.color,
    id: annotationId,
    ...(draft.layer === undefined ? {} : { layer: draft.layer }),
    ...(draft.shape === undefined ? {} : { shape: draft.shape }),
    square: draft.square,
    type: draft.type,
  });
}

function sameAnnotation(
  current: Readonly<BoardAnnotation>,
  expected: Readonly<BoardAnnotation>,
): boolean {
  if (current.type !== expected.type || current.id !== expected.id) {
    return false;
  }
  if (current.type === 'arrow' && expected.type === 'arrow') {
    return (
      current.color === expected.color &&
      current.from === expected.from &&
      current.layer === expected.layer &&
      current.opacity === expected.opacity &&
      current.shape === expected.shape &&
      current.to === expected.to &&
      current.width === expected.width
    );
  }
  if (current.type === 'square' && expected.type === 'square') {
    return (
      current.color === expected.color &&
      current.layer === expected.layer &&
      current.shape === expected.shape &&
      current.square === expected.square
    );
  }
  return false;
}

/**
 * Return every base annotation with the same toggle geometry as `draft`.
 *
 * Arrow matching uses only type/from/to and square matching uses only
 * type/square. Presentation fields intentionally do not affect toggling.
 *
 * @public
 */
export function findMatchingAnnotationIds(
  annotations: readonly Readonly<BoardAnnotation>[],
  draft: Readonly<AnnotationDraft>,
): readonly string[] {
  const draftType: unknown = draft.type;
  if (draftType !== 'arrow' && draftType !== 'square') {
    throw new TypeError('draft.type must be "arrow" or "square".');
  }
  const matchingIds: string[] = [];
  if (draftType === 'arrow') {
    const { from, to } = draft as Extract<
      AnnotationDraft,
      { readonly type: 'arrow' }
    >;
    for (const annotation of annotations) {
      if (
        annotation.type === 'arrow' &&
        annotation.from === from &&
        annotation.to === to
      ) {
        matchingIds.push(annotation.id);
      }
    }
  } else {
    const { square } = draft as Extract<
      AnnotationDraft,
      { readonly type: 'square' }
    >;
    for (const annotation of annotations) {
      if (annotation.type === 'square' && annotation.square === square) {
        matchingIds.push(annotation.id);
      }
    }
  }
  return Object.freeze(matchingIds);
}

function unchanged(
  current: Readonly<ControlledAnnotations>,
  stale: boolean,
): ApplyAnnotationOperationResult {
  return Object.freeze({ next: current, stale, status: 'unchanged' });
}

function rejected(
  current: Readonly<ControlledAnnotations>,
  reason: AnnotationOperationRejectionReason,
): ApplyAnnotationOperationResult {
  return Object.freeze({ next: current, reason, status: 'rejected' });
}

function applied(
  current: Readonly<ControlledAnnotations>,
  value: readonly Readonly<BoardAnnotation>[],
  stale: boolean,
): ApplyAnnotationOperationResult {
  if (current.revision === Number.MAX_SAFE_INTEGER) {
    return rejected(current, 'revision-overflow');
  }
  const next: Readonly<ControlledAnnotations> = Object.freeze({
    revision: current.revision + 1,
    value: Object.freeze(value.map(cloneAnnotation)),
  });
  return Object.freeze({ next, stale, status: 'applied' });
}

function addAnnotation(
  current: Readonly<ControlledAnnotations>,
  annotationId: string,
  draft: Readonly<AnnotationDraft>,
  stale: boolean,
): ApplyAnnotationOperationResult {
  const expected = persistentAnnotation(annotationId, draft);
  const existing = current.value.find(
    (annotation) => annotation.id === annotationId,
  );
  if (existing !== undefined) {
    return sameAnnotation(existing, expected)
      ? unchanged(current, stale)
      : rejected(current, 'annotation-id-conflict');
  }
  return applied(current, [...current.value, expected], stale);
}

function removeIds(
  current: Readonly<ControlledAnnotations>,
  ids: readonly string[],
  stale: boolean,
): ApplyAnnotationOperationResult {
  if (ids.length === 0) {
    return unchanged(current, stale);
  }
  const removedIds = new Set(ids);
  const next = current.value.filter(
    (annotation) => !removedIds.has(annotation.id),
  );
  return next.length === current.value.length
    ? unchanged(current, stale)
    : applied(current, next, stale);
}

/**
 * Reduce one board-emitted delta against the latest consumer-owned snapshot.
 *
 * Older-base operations remain applicable because destructive variants name
 * only IDs observed at their base. The function is pure and never commits the
 * returned snapshot; the consumer must publish `result.next` explicitly.
 *
 * @public
 */
export function applyAnnotationOperation(
  options: Readonly<ApplyAnnotationOperationOptions>,
): ApplyAnnotationOperationResult {
  const boardId = requireNonEmptyString(options.boardId, 'boardId');
  const currentRevision = requireRevision(
    options.current.revision,
    'current.revision',
  );
  if (!Array.isArray(options.current.value)) {
    throw new TypeError('current.value must be an annotation array.');
  }
  const operation = options.operation;
  requireNonEmptyString(operation.operationId, 'operation.operationId');
  const baseRevision = requireRevision(
    operation.baseAnnotationRevision,
    'operation.baseAnnotationRevision',
  );
  if (operation.boardId !== boardId) {
    return rejected(options.current, 'board-mismatch');
  }
  if (baseRevision > currentRevision) {
    return rejected(options.current, 'future-base');
  }
  const stale = baseRevision < currentRevision;

  switch (operation.type) {
    case 'add':
      return addAnnotation(
        options.current,
        requireNonEmptyString(operation.annotationId, 'operation.annotationId'),
        operation.annotation,
        stale,
      );
    case 'toggle': {
      requireNonEmptyString(operation.annotationId, 'operation.annotationId');
      const matchingIdsAtBase = requireIdArray(
        operation.matchingIdsAtBase,
        'operation.matchingIdsAtBase',
      );
      if (matchingIdsAtBase.length > 0) {
        return removeIds(options.current, matchingIdsAtBase, stale);
      }
      return addAnnotation(
        options.current,
        operation.annotationId,
        operation.annotation,
        stale,
      );
    }
    case 'remove':
      return removeIds(
        options.current,
        [
          requireNonEmptyString(
            operation.annotationId,
            'operation.annotationId',
          ),
        ],
        stale,
      );
    case 'clear':
      return removeIds(
        options.current,
        requireIdArray(
          operation.annotationIdsAtBase,
          'operation.annotationIdsAtBase',
        ),
        stale,
      );
    default:
      throw new TypeError(
        'operation.type must be a supported annotation delta.',
      );
  }
}
