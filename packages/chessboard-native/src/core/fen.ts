import type {
  BoardDimensions,
  FenPieceCode,
  PieceData,
  PositionObject,
  SquareId,
} from '../public-types';
import {
  STANDARD_BOARD_DIMENSIONS,
  validateBoardDimensions,
} from './dimensions';
import { formatSquareIdUnchecked } from './coordinates';

const FEN_PIECE_PATTERN = /^[prnbqkPRNBQK]$/;
const FEN_EMPTY_PATTERN = /^[1-8]$/;

function invalidFen(reason: string): never {
  throw new SyntaxError(`Invalid FEN piece placement: ${reason}`);
}

function pieceDataFromFenCode(code: FenPieceCode): Readonly<PieceData> {
  const color = code === code.toUpperCase() ? 'w' : 'b';
  return Object.freeze({ pieceType: `${color}${code.toUpperCase()}` });
}

/**
 * Parse the piece-placement field of a bare or complete FEN string.
 *
 * Only 8x8 boards accept FEN. The parser is strict and atomic, ignores fields
 * after piece placement, and does not apply chess-legality rules.
 *
 * @public
 */
export function parseFenPosition(
  fen: string,
  dimensions: BoardDimensions = STANDARD_BOARD_DIMENSIONS,
): PositionObject {
  const validDimensions = validateBoardDimensions(dimensions);

  if (validDimensions.rows !== 8 || validDimensions.columns !== 8) {
    throw new RangeError(
      `FEN piece placement requires an 8x8 board; received ${String(validDimensions.columns)}x${String(validDimensions.rows)}.`,
    );
  }

  if (typeof fen !== 'string') {
    throw new TypeError('FEN must be a string.');
  }

  const trimmedFen = fen.trim();
  if (trimmedFen.length === 0) {
    return invalidFen('the piece-placement field is empty.');
  }

  const whitespaceIndex = trimmedFen.search(/\s/);
  const placement =
    whitespaceIndex === -1 ? trimmedFen : trimmedFen.slice(0, whitespaceIndex);
  const ranks = placement.split('/');
  if (ranks.length !== 8) {
    return invalidFen('exactly eight ranks are required.');
  }

  const position: Record<SquareId, Readonly<PieceData>> = {};

  for (const [rankIndex, rankText] of ranks.entries()) {
    const rank = 8 - rankIndex;
    if (rankText.length === 0) {
      return invalidFen(`rank ${String(rank)} is empty.`);
    }

    let fileIndex = 0;
    let previousWasEmptyRun = false;

    for (const token of rankText) {
      if (FEN_EMPTY_PATTERN.test(token)) {
        if (previousWasEmptyRun) {
          return invalidFen(
            `rank ${String(rank)} contains adjacent empty-square digits.`,
          );
        }

        fileIndex += Number(token);
        previousWasEmptyRun = true;
      } else if (FEN_PIECE_PATTERN.test(token)) {
        if (fileIndex >= 8) {
          return invalidFen(`rank ${String(rank)} exceeds eight squares.`);
        }

        const square = formatSquareIdUnchecked(fileIndex, rank);
        position[square] = pieceDataFromFenCode(token as FenPieceCode);
        fileIndex += 1;
        previousWasEmptyRun = false;
      } else {
        return invalidFen(
          `rank ${String(rank)} contains an unsupported token "${token}".`,
        );
      }

      if (fileIndex > 8) {
        return invalidFen(`rank ${String(rank)} exceeds eight squares.`);
      }
    }

    if (fileIndex !== 8) {
      return invalidFen(
        `rank ${String(rank)} expands to ${String(fileIndex)} squares instead of eight.`,
      );
    }
  }

  return Object.freeze(position);
}
