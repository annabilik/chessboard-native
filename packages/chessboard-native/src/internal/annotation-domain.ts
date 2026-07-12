import { ChessboardError } from '../ChessboardError';
import {
  AnnotationValidationError,
  normalizeAnnotationsInput,
} from '../core/annotations';
import type { ValidatedBoardDimensions } from '../core/dimensions';
import type { BoardAnnotation, Revision } from '../public-types';
import {
  normalizeControlledDomain,
  type ClassifiedControlledValue,
  type ControlledDomainAdapter,
  type ControlledDomainMetadata,
  type ControlledDomainResult,
} from './controlled-domain';
import { safeErrorMessage } from './safe-error';

function classifyAnnotationsProp(input: unknown): ClassifiedControlledValue {
  if (Array.isArray(input)) {
    const value: unknown = input;
    return Object.freeze({ readValue: () => value, tier: 'plain' });
  }
  const envelope = input as Record<string, unknown> | null;
  return Object.freeze({
    readRevision: () => envelope?.['revision'],
    readValue: () => envelope?.['value'],
    tier: 'envelope',
  });
}

function annotationValueError(
  error: unknown,
  boardId: string | null,
  revision: Revision,
): ChessboardError {
  let code: AnnotationValidationError['code'] = 'INVALID_ANNOTATIONS';
  try {
    if (error instanceof AnnotationValidationError) {
      const candidateCode: unknown = error.code;
      if (
        candidateCode === 'INVALID_ANNOTATIONS' ||
        candidateCode === 'DUPLICATE_ANNOTATION_ID'
      ) {
        code = candidateCode;
      }
    }
  } catch {
    code = 'INVALID_ANNOTATIONS';
  }
  return new ChessboardError(
    safeErrorMessage(error, 'Invalid annotations.'),
    { boardId, code, revision },
    error,
  );
}

function annotationAdapter(
  dimensions: ValidatedBoardDimensions,
): ControlledDomainAdapter<readonly Readonly<BoardAnnotation>[]> {
  const adapter: ControlledDomainAdapter<readonly Readonly<BoardAnnotation>[]> =
    {
      classify: classifyAnnotationsProp,
      comparisonToken: (value) => JSON.stringify(value),
      createValueError: (error, context) =>
        annotationValueError(error, context.boardId, context.revision),
      normalizeValue: (value) => normalizeAnnotationsInput(value, dimensions),
    };
  return Object.freeze(adapter);
}

export interface NormalizeAnnotationDomainOptions {
  readonly input: unknown;
  readonly previousMetadata: ControlledDomainMetadata;
  readonly boardId: string | null;
  /** Must come from `validateBoardDimensions`. */
  readonly dimensions: ValidatedBoardDimensions;
  readonly development: boolean;
}

export function normalizeAnnotationDomain(
  options: NormalizeAnnotationDomainOptions,
): ControlledDomainResult<readonly Readonly<BoardAnnotation>[]> {
  return normalizeControlledDomain({
    adapter: annotationAdapter(options.dimensions),
    boardId: options.boardId,
    development: options.development,
    domain: 'annotations',
    input: options.input,
    previousMetadata: options.previousMetadata,
  });
}
