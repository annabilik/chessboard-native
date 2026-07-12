import { ChessboardError } from '../ChessboardError';
import { normalizeSelectionInput } from '../core/selection';
import type { ValidatedBoardDimensions } from '../core/dimensions';
import type { PlainSelection, Revision } from '../public-types';
import {
  normalizeControlledDomain,
  type ClassifiedControlledValue,
  type ControlledDomainAdapter,
  type ControlledDomainMetadata,
  type ControlledDomainResult,
} from './controlled-domain';
import { safeErrorMessage } from './safe-error';

function classifySelectionProp(input: unknown): ClassifiedControlledValue {
  if (
    typeof input === 'object' &&
    input !== null &&
    !Array.isArray(input) &&
    Object.hasOwn(input, 'revision')
  ) {
    const envelope = input as Record<string, unknown>;
    return Object.freeze({
      readRevision: () => envelope['revision'],
      readValue: () => input,
      tier: 'envelope',
    });
  }
  return Object.freeze({ readValue: () => input, tier: 'plain' });
}

function selectionValueError(
  error: unknown,
  boardId: string | null,
  revision: Revision,
): ChessboardError {
  return new ChessboardError(
    safeErrorMessage(error, 'Invalid selection.'),
    { boardId, code: 'INVALID_SELECTION', revision },
    error,
  );
}

function selectionAdapter(
  dimensions: ValidatedBoardDimensions,
): ControlledDomainAdapter<Readonly<PlainSelection>> {
  const adapter: ControlledDomainAdapter<Readonly<PlainSelection>> = {
    classify: classifySelectionProp,
    comparisonToken: (value) => JSON.stringify(value),
    createValueError: (error, context) =>
      selectionValueError(error, context.boardId, context.revision),
    normalizeValue: (value) => normalizeSelectionInput(value, dimensions),
  };
  return Object.freeze(adapter);
}

export interface NormalizeSelectionDomainOptions {
  readonly input: unknown;
  readonly previousMetadata: ControlledDomainMetadata;
  readonly boardId: string | null;
  /** Must come from `validateBoardDimensions`. */
  readonly dimensions: ValidatedBoardDimensions;
  readonly development: boolean;
}

export function normalizeSelectionDomain(
  options: NormalizeSelectionDomainOptions,
): ControlledDomainResult<Readonly<PlainSelection>> {
  return normalizeControlledDomain({
    adapter: selectionAdapter(options.dimensions),
    boardId: options.boardId,
    development: options.development,
    domain: 'selection',
    input: options.input,
    previousMetadata: options.previousMetadata,
  });
}
