import type { BoardAnnotation, SquareId } from '../public-types';
import { parseSquareId } from './coordinates';
import type { ValidatedBoardDimensions } from './dimensions';
import { isPlainRecord } from './records';

export type AnnotationValidationCode =
  'INVALID_ANNOTATIONS' | 'DUPLICATE_ANNOTATION_ID';

export class AnnotationValidationError extends TypeError {
  override readonly name = 'AnnotationValidationError';
  readonly code: AnnotationValidationCode;

  constructor(
    message: string,
    code: AnnotationValidationCode,
    cause?: unknown,
  ) {
    super(message);
    if (cause !== undefined) {
      Object.defineProperty(this, 'cause', {
        configurable: true,
        value: cause,
        writable: true,
      });
    }
    this.code = code;
  }
}

function invalidAnnotations(message: string, cause?: unknown): never {
  throw new AnnotationValidationError(message, 'INVALID_ANNOTATIONS', cause);
}

function stringField(
  annotation: Record<string, unknown>,
  key: string,
  index: number,
): string {
  if (!Object.hasOwn(annotation, key)) {
    return invalidAnnotations(
      `Annotation at index ${String(index)} must have a string ${key}.`,
    );
  }
  const value = annotation[key];
  if (typeof value !== 'string') {
    return invalidAnnotations(
      `Annotation at index ${String(index)} must have a string ${key}.`,
    );
  }
  return value;
}

function optionalString<Value extends string>(
  annotation: Record<string, unknown>,
  key: string,
  values: readonly Value[],
  index: number,
): Value | undefined {
  if (!Object.hasOwn(annotation, key)) {
    return undefined;
  }
  const value = annotation[key];
  if (typeof value !== 'string' || !values.includes(value as Value)) {
    return invalidAnnotations(
      `Annotation at index ${String(index)} has an invalid ${key}.`,
    );
  }
  return value as Value;
}

function optionalFiniteNumber(
  annotation: Record<string, unknown>,
  key: string,
  index: number,
  isInRange: (value: number) => boolean,
): number | undefined {
  if (!Object.hasOwn(annotation, key)) {
    return undefined;
  }
  const value = annotation[key];
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    !isInRange(value)
  ) {
    return invalidAnnotations(
      `Annotation at index ${String(index)} has an invalid ${key}.`,
    );
  }
  return value;
}

function squareField(
  annotation: Record<string, unknown>,
  key: string,
  index: number,
  dimensions: ValidatedBoardDimensions,
): SquareId {
  const square = stringField(annotation, key, index);
  try {
    parseSquareId(square, dimensions);
  } catch (error) {
    return invalidAnnotations(
      `Annotation at index ${String(index)} has an invalid ${key} square.`,
      error,
    );
  }
  return square;
}

function normalizeAnnotation(
  value: unknown,
  index: number,
  dimensions: ValidatedBoardDimensions,
): Readonly<BoardAnnotation> {
  if (!isPlainRecord(value)) {
    return invalidAnnotations(
      `Annotation at index ${String(index)} must be a plain object.`,
    );
  }

  const id = stringField(value, 'id', index);
  if (id.length === 0) {
    return invalidAnnotations(
      `Annotation at index ${String(index)} must have a non-empty id.`,
    );
  }
  const type = stringField(value, 'type', index);
  const color = stringField(value, 'color', index);
  const layer = optionalString(
    value,
    'layer',
    ['belowPieces', 'abovePieces'] as const,
    index,
  );

  if (type === 'arrow') {
    const from = squareField(value, 'from', index, dimensions);
    const to = squareField(value, 'to', index, dimensions);
    const width = optionalFiniteNumber(
      value,
      'width',
      index,
      (candidate) => candidate > 0,
    );
    const opacity = optionalFiniteNumber(
      value,
      'opacity',
      index,
      (candidate) => candidate >= 0 && candidate <= 1,
    );
    const shape = optionalString(
      value,
      'shape',
      ['straight', 'knight'] as const,
      index,
    );
    return Object.freeze({
      color,
      from,
      id,
      ...(layer === undefined ? {} : { layer }),
      ...(opacity === undefined ? {} : { opacity }),
      ...(shape === undefined ? {} : { shape }),
      to,
      type,
      ...(width === undefined ? {} : { width }),
    });
  }

  if (type === 'square') {
    const square = squareField(value, 'square', index, dimensions);
    const shape = optionalString(
      value,
      'shape',
      ['fill', 'circle', 'dot', 'border'] as const,
      index,
    );
    return Object.freeze({
      color,
      id,
      ...(layer === undefined ? {} : { layer }),
      ...(shape === undefined ? {} : { shape }),
      square,
      type,
    });
  }

  return invalidAnnotations(
    `Annotation at index ${String(index)} must have type "arrow" or "square".`,
  );
}

export function normalizeAnnotationsInput(
  input: unknown,
  dimensions: ValidatedBoardDimensions,
): readonly Readonly<BoardAnnotation>[] {
  if (!Array.isArray(input)) {
    return invalidAnnotations('Annotations must be an array.');
  }

  const ids = new Set<string>();
  const normalized: Readonly<BoardAnnotation>[] = [];
  const length = input.length;
  for (let index = 0; index < length; index += 1) {
    if (!Object.hasOwn(input, index)) {
      return invalidAnnotations(
        `Annotations must not contain a hole at index ${String(index)}.`,
      );
    }
    const annotation: unknown = input[index];
    const item = normalizeAnnotation(annotation, index, dimensions);
    if (ids.has(item.id)) {
      throw new AnnotationValidationError(
        `Annotation ID "${item.id}" is used more than once.`,
        'DUPLICATE_ANNOTATION_ID',
      );
    }
    ids.add(item.id);
    normalized.push(item);
  }
  return Object.freeze(normalized);
}
