import { formatPieceAccessibilityLabel } from '../../src/accessibility/piece-label';

describe('piece accessibility labels', () => {
  it('labels the standard vocabulary with human-readable names', () => {
    expect(formatPieceAccessibilityLabel('wN')).toBe('white knight');
    expect(formatPieceAccessibilityLabel('bQ')).toBe('black queen');
  });

  it.each(['constructor', 'toString', '__proto__', '🐉 dragon ', ''])(
    'uses an exact own-key-safe fallback for the open piece type %p',
    (pieceType) => {
      expect(formatPieceAccessibilityLabel(pieceType)).toBe(
        `${pieceType} piece`,
      );
    },
  );
});
