import type { PlainSelection, SquareId } from '../public-types';
import { parseSquareId } from './coordinates';
import type { ValidatedBoardDimensions } from './dimensions';
import { isPlainRecord } from './records';

export class SelectionValidationError extends TypeError {
  override readonly name = 'SelectionValidationError';

  constructor(message: string, cause?: unknown) {
    super(message);
    if (cause !== undefined) {
      Object.defineProperty(this, 'cause', {
        configurable: true,
        value: cause,
        writable: true,
      });
    }
  }
}

function invalidSelection(message: string, cause?: unknown): never {
  throw new SelectionValidationError(message, cause);
}

function validateSquare(
  value: unknown,
  field: string,
  dimensions: ValidatedBoardDimensions,
): SquareId {
  if (typeof value !== 'string') {
    return invalidSelection(`${field} must contain square IDs.`);
  }
  try {
    parseSquareId(value, dimensions);
  } catch (error) {
    return invalidSelection(`${field} contains an invalid square ID.`, error);
  }
  return value;
}

function normalizeSquareSet(
  value: unknown,
  field: string,
  dimensions: ValidatedBoardDimensions,
): readonly SquareId[] {
  if (!Array.isArray(value)) {
    return invalidSelection(`${field} must be an array.`);
  }
  const squares = new Set<SquareId>();
  const length = value.length;
  for (let index = 0; index < length; index += 1) {
    if (!Object.hasOwn(value, index)) {
      return invalidSelection(
        `${field} must not contain a hole at index ${String(index)}.`,
      );
    }
    const square: unknown = value[index];
    squares.add(validateSquare(square, field, dimensions));
  }
  return Object.freeze([...squares].sort());
}

export function normalizeSelectionInput(
  input: unknown,
  dimensions: ValidatedBoardDimensions,
): Readonly<PlainSelection> {
  if (!isPlainRecord(input)) {
    return invalidSelection('Selection must be a plain object.');
  }
  if (!Object.hasOwn(input, 'selectedSquare')) {
    return invalidSelection('Selection must have selectedSquare.');
  }

  const rawSelectedSquare = input['selectedSquare'];
  const selectedSquare =
    rawSelectedSquare === null
      ? null
      : validateSquare(rawSelectedSquare, 'selectedSquare', dimensions);
  const destinationSquares = Object.hasOwn(input, 'destinationSquares')
    ? normalizeSquareSet(
        input['destinationSquares'],
        'destinationSquares',
        dimensions,
      )
    : undefined;
  const disabledSquares = Object.hasOwn(input, 'disabledSquares')
    ? normalizeSquareSet(
        input['disabledSquares'],
        'disabledSquares',
        dimensions,
      )
    : undefined;

  return Object.freeze({
    ...(destinationSquares === undefined || destinationSquares.length === 0
      ? {}
      : { destinationSquares }),
    ...(disabledSquares === undefined || disabledSquares.length === 0
      ? {}
      : { disabledSquares }),
    selectedSquare,
  });
}
