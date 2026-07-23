import type {
  PieceData,
  PositionObject,
  SquareId,
} from '@vibechess/chessboard-native';
import { Chess, type Color, type Move, type PieceSymbol } from 'chess.js';

export function pieceTypeFromChessJs(color: Color, type: PieceSymbol): string {
  return `${color}${type.toUpperCase()}`;
}

/**
 * Snapshot the current chess.js board as a controlled position object.
 *
 * Each piece ID is derived from the square it occupies at snapshot time, so
 * the snapshot works as the starting point of a stable-ID tracking chain.
 * Later positions must come from {@link applyVerboseMove} to keep those IDs
 * stable while pieces travel.
 */
export function positionFromChess(chess: Chess): PositionObject {
  const position: Record<SquareId, Readonly<PieceData>> = {};
  for (const row of chess.board()) {
    for (const cell of row) {
      if (cell !== null) {
        const pieceType = pieceTypeFromChessJs(cell.color, cell.type);
        position[cell.square] = Object.freeze({
          id: `${pieceType}-${cell.square}`,
          pieceType,
        });
      }
    }
  }
  return Object.freeze(position);
}

/**
 * Apply one verbose chess.js move to a controlled position object while
 * preserving stable piece IDs, so the board can animate the move (including
 * captures, en passant, castling, and promotion) instead of teleporting.
 */
export function applyVerboseMove(
  position: PositionObject,
  move: Move,
): PositionObject {
  const moving = position[move.from];
  if (moving === undefined) {
    throw new Error(`No piece to move on ${move.from} for ${move.san}.`);
  }

  const castleRank = move.from.charAt(1);
  const rookMove = move.isKingsideCastle()
    ? { from: `h${castleRank}`, to: `f${castleRank}` }
    : move.isQueensideCastle()
      ? { from: `a${castleRank}`, to: `d${castleRank}` }
      : null;
  const rook = rookMove === null ? undefined : position[rookMove.from];
  if (rookMove !== null && rook === undefined) {
    throw new Error(`No castling rook on ${rookMove.from} for ${move.san}.`);
  }

  const vacated = new Set<string>([move.from]);
  if (move.isEnPassant()) {
    // The en passant victim does not stand on the destination square.
    vacated.add(`${move.to.charAt(0)}${move.from.charAt(1)}`);
  }
  if (rookMove !== null) {
    vacated.add(rookMove.from);
  }

  const next: Partial<Record<SquareId, Readonly<PieceData>>> = {};
  for (const [square, piece] of Object.entries(position)) {
    if (piece !== undefined && !vacated.has(square)) {
      next[square] = piece;
    }
  }
  next[move.to] =
    move.promotion === undefined
      ? moving
      : Object.freeze({
          ...moving,
          pieceType: pieceTypeFromChessJs(move.color, move.promotion),
        });
  if (rookMove !== null && rook !== undefined) {
    next[rookMove.to] = rook;
  }

  return Object.freeze(next);
}

export interface ReplayedGame {
  /** Verbose chess.js moves, one per ply. */
  readonly moves: readonly Move[];
  /**
   * Stable-ID positions where `positions[ply]` is the position after `ply`
   * half-moves; `positions[0]` is the initial position.
   */
  readonly positions: readonly PositionObject[];
  /** Display labels per ply, e.g. `1. e4` and `1... e5`. */
  readonly sanLabels: readonly string[];
}

/**
 * Replay a SAN move list from the standard starting position into stable-ID
 * controlled positions. chess.js validates every move, so an illegal or
 * misremembered score throws instead of rendering a wrong position.
 */
export function replayGame(sanMoves: readonly string[]): ReplayedGame {
  const chess = new Chess();
  const moves: Move[] = [];
  let current = positionFromChess(chess);
  const positions: PositionObject[] = [current];
  const sanLabels: string[] = [];

  for (const [ply, san] of sanMoves.entries()) {
    const move = chess.move(san);
    moves.push(move);
    current = applyVerboseMove(current, move);
    positions.push(current);
    const moveNumber = Math.floor(ply / 2) + 1;
    sanLabels.push(
      ply % 2 === 0
        ? `${String(moveNumber)}. ${move.san}`
        : `${String(moveNumber)}... ${move.san}`,
    );
  }

  return Object.freeze({
    moves: Object.freeze(moves),
    positions: Object.freeze(positions),
    sanLabels: Object.freeze(sanLabels),
  });
}

export const OPERA_GAME_TITLE =
  'Morphy vs Duke Karl and Count Isouard, Paris 1858';

/** The Opera Game, verified by chess.js on module load. */
export const OPERA_GAME_SAN = Object.freeze([
  'e4',
  'e5',
  'Nf3',
  'd6',
  'd4',
  'Bg4',
  'dxe5',
  'Bxf3',
  'Qxf3',
  'dxe5',
  'Bc4',
  'Nf6',
  'Qb3',
  'Qe7',
  'Nc3',
  'c6',
  'Bg5',
  'b5',
  'Nxb5',
  'cxb5',
  'Bxb5+',
  'Nbd7',
  'O-O-O',
  'Rd8',
  'Rxd7',
  'Rxd7',
  'Rd1',
  'Qe6',
  'Bxd7+',
  'Nxd7',
  'Qb8+',
  'Nxb8',
  'Rd8#',
]);

export const OPERA_GAME: ReplayedGame = replayGame(OPERA_GAME_SAN);

/** Ply index of the position before 16.Qb8+, the start of the mate in two. */
export const OPERA_MATE_IN_TWO_PLY = 30;
