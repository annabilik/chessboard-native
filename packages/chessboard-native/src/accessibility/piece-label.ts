const STANDARD_PIECE_LABELS: Readonly<Record<string, string>> = Object.freeze({
  bB: 'black bishop',
  bK: 'black king',
  bN: 'black knight',
  bP: 'black pawn',
  bQ: 'black queen',
  bR: 'black rook',
  wB: 'white bishop',
  wK: 'white king',
  wN: 'white knight',
  wP: 'white pawn',
  wQ: 'white queen',
  wR: 'white rook',
});

/** Exact-key label lookup for the open piece vocabulary. */
export function formatPieceAccessibilityLabel(pieceType: string): string {
  if (Object.hasOwn(STANDARD_PIECE_LABELS, pieceType)) {
    return STANDARD_PIECE_LABELS[pieceType] ?? `${pieceType} piece`;
  }
  return `${pieceType} piece`;
}
