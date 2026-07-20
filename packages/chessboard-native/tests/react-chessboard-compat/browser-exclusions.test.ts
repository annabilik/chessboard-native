import * as primaryEntry from '../../src';
import * as piecesEntry from '../../src/pieces';
import * as compatibilityEntry from '../../src/react-chessboard-compat';

const publicEntries = Object.freeze([
  primaryEntry,
  piecesEntry,
  compatibilityEntry,
]);

function assertUseChessboardContextIsNotTyped(): void {
  const compatibility =
    {} as typeof import('../../src/react-chessboard-compat');
  // @ts-expect-error The browser provider context is intentionally private.
  void ({} as typeof import('../../src')).useChessboardContext;
  // @ts-expect-error The compatibility subpath does not recreate that context.
  void compatibility.useChessboardContext;
  // @ts-expect-error The artwork subpath exports only the renderer map.
  void ({} as typeof import('../../src/pieces')).useChessboardContext;
}

function assertTouchEndHelperIsNotTyped(): void {
  const compatibility =
    {} as typeof import('../../src/react-chessboard-compat');
  // @ts-expect-error DOM touch-event hit testing has no native root export.
  void ({} as typeof import('../../src')).isTouchEndWithinSquare;
  // @ts-expect-error The compatibility subpath exposes no DOM helper.
  void compatibility.isTouchEndWithinSquare;
  // @ts-expect-error The artwork subpath exports only the renderer map.
  void ({} as typeof import('../../src/pieces')).isTouchEndWithinSquare;
}

describe('intentional browser-only export exclusions', () => {
  it('[PARITY-EXPORT-USE-CHESSBOARD-CONTEXT] keeps the browser implementation context off every public entry point', () => {
    expect(assertUseChessboardContextIsNotTyped).toEqual(expect.any(Function));
    for (const entry of publicEntries) {
      expect(Object.hasOwn(entry, 'useChessboardContext')).toBe(false);
    }
  });

  it('[PARITY-EXPORT-IS-TOUCH-END-WITHIN-SQUARE] keeps DOM touch-event hit testing off every public entry point', () => {
    expect(assertTouchEndHelperIsNotTyped).toEqual(expect.any(Function));
    for (const entry of publicEntries) {
      expect(Object.hasOwn(entry, 'isTouchEndWithinSquare')).toBe(false);
    }
  });
});
