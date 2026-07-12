import type { ChessboardTheme } from './public-types';

const board = Object.freeze({
  backgroundColor: '#e7e0d2',
  overflow: 'hidden' as const,
});
const square = Object.freeze({
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
  overflow: 'hidden' as const,
});
const lightSquare = Object.freeze({ backgroundColor: '#F0D9B5' });
const darkSquare = Object.freeze({ backgroundColor: '#B58863' });
const lightSquareNotation = Object.freeze({ color: '#B58863' });
const darkSquareNotation = Object.freeze({ color: '#F0D9B5' });
const fileNotation = Object.freeze({
  bottom: 1,
  fontSize: 13,
  fontWeight: '700' as const,
  includeFontPadding: false,
  position: 'absolute' as const,
  right: 3,
});
const rankNotation = Object.freeze({
  fontSize: 13,
  fontWeight: '700' as const,
  includeFontPadding: false,
  left: 2,
  position: 'absolute' as const,
  top: 2,
});
const piece = Object.freeze({
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
});

/** Built-in native visual defaults. @public */
export const defaultTheme: Readonly<Required<ChessboardTheme>> = Object.freeze({
  board,
  darkSquare,
  darkSquareNotation,
  fileNotation,
  lightSquare,
  lightSquareNotation,
  piece,
  rankNotation,
  square,
});
