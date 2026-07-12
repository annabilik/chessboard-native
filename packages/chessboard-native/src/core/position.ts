import type {
  BoardDimensions,
  PieceData,
  PositionObject,
  SquareId,
} from '../public-types';
import { parseSquareId } from './coordinates';
import {
  STANDARD_BOARD_DIMENSIONS,
  validateBoardDimensions,
} from './dimensions';
import { parseFenPosition } from './fen';

export type PositionValidationCode =
  'INVALID_POSITION' | 'INVALID_POSITION_SQUARE' | 'DUPLICATE_PIECE_ID';

export class PositionValidationError extends TypeError {
  override readonly name = 'PositionValidationError';
  readonly code: PositionValidationCode;

  constructor(message: string, code: PositionValidationCode, cause?: unknown) {
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

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value) as unknown;
  return prototype === Object.prototype || prototype === null;
}

function invalidPosition(message: string, cause?: unknown): never {
  throw new PositionValidationError(message, 'INVALID_POSITION', cause);
}

function invalidPositionSquare(square: string, cause: unknown): never {
  throw new PositionValidationError(
    `Position contains an invalid square ID "${square}".`,
    'INVALID_POSITION_SQUARE',
    cause,
  );
}

function duplicatePieceId(id: string): never {
  throw new PositionValidationError(
    `Piece ID "${id}" is used more than once in the position.`,
    'DUPLICATE_PIECE_ID',
  );
}

function normalizePiece(value: unknown, square: SquareId): Readonly<PieceData> {
  if (!isPlainRecord(value)) {
    return invalidPosition(`Piece data at ${square} must be a plain object.`);
  }

  if (!Object.hasOwn(value, 'pieceType')) {
    return invalidPosition(
      `Piece data at ${square} must have a string pieceType.`,
    );
  }

  const pieceType = value['pieceType'];
  if (typeof pieceType !== 'string') {
    return invalidPosition(
      `Piece data at ${square} must have a string pieceType.`,
    );
  }

  if (!Object.hasOwn(value, 'id')) {
    return Object.freeze({ pieceType });
  }

  const id = value['id'];
  if (typeof id !== 'string') {
    return invalidPosition(
      `Piece data at ${square} must have a string id when present.`,
    );
  }

  return Object.freeze({ id, pieceType });
}

export function normalizePositionObject(
  position: unknown,
  dimensions: BoardDimensions = STANDARD_BOARD_DIMENSIONS,
): PositionObject {
  const validDimensions = validateBoardDimensions(dimensions);
  if (!isPlainRecord(position)) {
    return invalidPosition('Position must be a plain object.');
  }

  const normalized: Record<SquareId, Readonly<PieceData>> = {};
  const pieceIds = new Set<string>();

  for (const square of Object.keys(position)) {
    try {
      parseSquareId(square, validDimensions);
    } catch (error) {
      return invalidPositionSquare(square, error);
    }

    const value = position[square];
    if (value === undefined) {
      continue;
    }

    const piece = normalizePiece(value, square);
    if (piece.id !== undefined) {
      if (pieceIds.has(piece.id)) {
        return duplicatePieceId(piece.id);
      }
      pieceIds.add(piece.id);
    }
    normalized[square] = piece;
  }

  return Object.freeze(normalized);
}

export function normalizePositionInput(
  position: unknown,
  dimensions: BoardDimensions = STANDARD_BOARD_DIMENSIONS,
): PositionObject {
  return typeof position === 'string'
    ? parseFenPosition(position, dimensions)
    : normalizePositionObject(position, dimensions);
}
