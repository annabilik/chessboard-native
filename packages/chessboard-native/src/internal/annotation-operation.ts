import type {
  AnnotationDraft,
  AnnotationOperation,
  OnAnnotationOperation,
  Revision,
  SquareId,
} from '../public-types';

type AddOperation = Extract<AnnotationOperation, { readonly type: 'add' }>;
type ToggleOperation = Extract<
  AnnotationOperation,
  { readonly type: 'toggle' }
>;
type RemoveOperation = Extract<
  AnnotationOperation,
  { readonly type: 'remove' }
>;
type ClearOperation = Extract<AnnotationOperation, { readonly type: 'clear' }>;

/** Internal operation payload before board-scoped identities are allocated. */
export type AnnotationOperationRequest =
  | Omit<AddOperation, 'annotationId' | 'boardId' | 'operationId'>
  | Omit<ToggleOperation, 'annotationId' | 'boardId' | 'operationId'>
  | Omit<RemoveOperation, 'boardId' | 'operationId'>
  | Omit<ClearOperation, 'boardId' | 'operationId'>;

export interface AnnotationOperationEmitter {
  readonly dispose: () => void;
  readonly emit: (
    request: Readonly<AnnotationOperationRequest>,
  ) => string | null;
  readonly setHandler: (handler: OnAnnotationOperation | undefined) => void;
}

export interface CreateAnnotationOperationEmitterOptions {
  readonly boardId: string;
  /** Internal deterministic entity prefix; normally omitted. */
  readonly annotationIdPrefix?: string;
  /** Internal deterministic operation prefix; normally omitted. */
  readonly operationIdPrefix?: string;
  /** Internal deterministic sequence seed; normally omitted. */
  readonly nextOperationSequence?: number;
}

function isRevision(value: unknown): value is Revision {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isCanonicalSquare(value: unknown): value is SquareId {
  return typeof value === 'string' && /^[a-z][1-9][0-9]?$/.test(value);
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isInput(value: unknown): value is AnnotationOperation['input'] {
  return (
    value === 'touch' ||
    value === 'keyboard' ||
    value === 'accessibility' ||
    value === 'policy'
  );
}

function optionalLayer(
  value: unknown,
): AnnotationDraft['layer'] | undefined | null {
  return value === undefined ||
    value === 'belowPieces' ||
    value === 'abovePieces'
    ? value
    : null;
}

function copyDraft(value: unknown): Readonly<AnnotationDraft> | null {
  try {
    if (!isRecord(value) || Object.hasOwn(value, 'id')) {
      return null;
    }
    const color = value['color'];
    const type = value['type'];
    const layer = optionalLayer(value['layer']);
    if (typeof color !== 'string' || layer === null) {
      return null;
    }
    if (type === 'arrow') {
      const from = value['from'];
      const to = value['to'];
      const width = value['width'];
      const opacity = value['opacity'];
      const shape = value['shape'];
      if (
        !isCanonicalSquare(from) ||
        !isCanonicalSquare(to) ||
        (width !== undefined &&
          (typeof width !== 'number' ||
            !Number.isFinite(width) ||
            width <= 0)) ||
        (opacity !== undefined &&
          (typeof opacity !== 'number' ||
            !Number.isFinite(opacity) ||
            opacity < 0 ||
            opacity > 1)) ||
        (shape !== undefined && shape !== 'straight' && shape !== 'knight')
      ) {
        return null;
      }
      return Object.freeze({
        color,
        from,
        ...(layer === undefined ? {} : { layer }),
        ...(opacity === undefined ? {} : { opacity }),
        ...(shape === undefined ? {} : { shape }),
        to,
        type: 'arrow' as const,
        ...(width === undefined ? {} : { width }),
      });
    }
    if (type === 'square') {
      const square = value['square'];
      const shape = value['shape'];
      if (
        !isCanonicalSquare(square) ||
        (shape !== undefined &&
          shape !== 'fill' &&
          shape !== 'circle' &&
          shape !== 'dot' &&
          shape !== 'border')
      ) {
        return null;
      }
      return Object.freeze({
        color,
        ...(layer === undefined ? {} : { layer }),
        ...(shape === undefined ? {} : { shape }),
        square,
        type: 'square' as const,
      });
    }
  } catch {
    return null;
  }
  return null;
}

function copyIds(value: unknown): readonly string[] | null {
  try {
    if (!Array.isArray(value)) {
      return null;
    }
    const copy: string[] = [];
    for (const id of value as readonly unknown[]) {
      if (typeof id !== 'string' || id.length === 0) {
        return null;
      }
      copy.push(id);
    }
    return Object.freeze(copy);
  } catch {
    return null;
  }
}

function copyRequest(
  value: unknown,
): Readonly<AnnotationOperationRequest> | null {
  try {
    if (!isRecord(value)) {
      return null;
    }
    const baseAnnotationRevision = value['baseAnnotationRevision'];
    const input = value['input'];
    const type = value['type'];
    if (!isRevision(baseAnnotationRevision) || !isInput(input)) {
      return null;
    }
    const base = Object.freeze({
      baseAnnotationRevision,
      input,
    });
    switch (type) {
      case 'add': {
        const annotation = copyDraft(value['annotation']);
        return annotation === null
          ? null
          : Object.freeze({ ...base, annotation, type: 'add' as const });
      }
      case 'toggle': {
        const annotation = copyDraft(value['annotation']);
        const matchingIdsAtBase = copyIds(value['matchingIdsAtBase']);
        return annotation === null || matchingIdsAtBase === null
          ? null
          : Object.freeze({
              ...base,
              annotation,
              matchingIdsAtBase,
              type: 'toggle' as const,
            });
      }
      case 'remove': {
        const annotationId = value['annotationId'];
        return typeof annotationId !== 'string' || annotationId.length === 0
          ? null
          : Object.freeze({
              ...base,
              annotationId,
              type: 'remove' as const,
            });
      }
      case 'clear': {
        const annotationIdsAtBase = copyIds(value['annotationIdsAtBase']);
        const reason = value['reason'];
        return annotationIdsAtBase === null ||
          (reason !== 'board-press' &&
            reason !== 'position-change' &&
            reason !== 'consumer-action')
          ? null
          : Object.freeze({
              ...base,
              annotationIdsAtBase,
              reason,
              type: 'clear' as const,
            });
      }
      default:
        return null;
    }
  } catch {
    return null;
  }
}

function validateBoardId(boardId: string): string {
  if (boardId.trim().length === 0) {
    throw new RangeError('boardId must be non-empty.');
  }
  return boardId;
}

function validatePrefix(prefix: string, label: string): string {
  if (prefix.length === 0) {
    throw new RangeError(`${label} must be non-empty.`);
  }
  return prefix;
}

function validateSequence(sequence: number): number {
  if (!Number.isSafeInteger(sequence) || sequence < 0) {
    throw new RangeError(
      'nextOperationSequence must be a non-negative safe integer.',
    );
  }
  return sequence;
}

let nextDefaultEmitterInstance = 0;

function allocateDefaultEmitterNonce(): string {
  if (!Number.isSafeInteger(nextDefaultEmitterInstance)) {
    throw new RangeError('Annotation operation emitter identity exhausted.');
  }
  const sequence = nextDefaultEmitterInstance;
  nextDefaultEmitterInstance = sequence + 1;
  const randomSegment = (): string =>
    Math.floor(Math.random() * Number.MAX_SAFE_INTEGER)
      .toString(36)
      .padStart(11, '0');
  return `${Date.now().toString(36)}:${randomSegment()}:${randomSegment()}:${String(sequence)}`;
}

function boardPrefix(
  kind: 'annotation' | 'operation',
  boardId: string,
  emitterNonce: string,
): string {
  return `${kind}:${String(boardId.length)}:${boardId}:${emitterNonce}:`;
}

/** Allocate and emit detached, board-scoped annotation operations. */
export function createAnnotationOperationEmitter(
  options: Readonly<CreateAnnotationOperationEmitterOptions>,
): AnnotationOperationEmitter {
  const boardId = validateBoardId(options.boardId);
  const defaultEmitterNonce =
    options.annotationIdPrefix === undefined ||
    options.operationIdPrefix === undefined
      ? allocateDefaultEmitterNonce()
      : null;
  const annotationIdPrefix = validatePrefix(
    options.annotationIdPrefix ??
      boardPrefix('annotation', boardId, defaultEmitterNonce ?? ''),
    'annotationIdPrefix',
  );
  const operationIdPrefix = validatePrefix(
    options.operationIdPrefix ??
      boardPrefix('operation', boardId, defaultEmitterNonce ?? ''),
    'operationIdPrefix',
  );
  if (annotationIdPrefix === operationIdPrefix) {
    throw new RangeError(
      'annotationIdPrefix and operationIdPrefix must be distinct.',
    );
  }
  let nextSequence: number | null = validateSequence(
    options.nextOperationSequence ?? 0,
  );
  let handler: OnAnnotationOperation | undefined;
  let disposed = false;

  return {
    dispose: (): void => {
      disposed = true;
      handler = undefined;
    },
    emit: (request): string | null => {
      if (disposed || handler === undefined) {
        return null;
      }
      const detached = copyRequest(request);
      const sequence = nextSequence;
      if (detached === null || sequence === null) {
        return null;
      }
      nextSequence = sequence === Number.MAX_SAFE_INTEGER ? null : sequence + 1;
      const operationId = `${operationIdPrefix}${String(sequence)}`;
      const operation: Readonly<AnnotationOperation> = Object.freeze(
        detached.type === 'add' || detached.type === 'toggle'
          ? {
              ...detached,
              annotationId: `${annotationIdPrefix}${String(sequence)}`,
              boardId,
              operationId,
            }
          : { ...detached, boardId, operationId },
      );
      try {
        handler(operation);
      } catch {
        // Observational callbacks cannot mutate or break board input.
      }
      return operationId;
    },
    setHandler: (nextHandler): void => {
      if (!disposed) {
        handler = typeof nextHandler === 'function' ? nextHandler : undefined;
      }
    },
  };
}
