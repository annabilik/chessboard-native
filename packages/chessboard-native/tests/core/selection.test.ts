import { STANDARD_BOARD_DIMENSIONS } from '../../src/core/dimensions';
import {
  normalizeSelectionInput,
  SelectionValidationError,
} from '../../src/core/selection';

const dimensions = STANDARD_BOARD_DIMENSIONS;

describe('selection normalization', () => {
  it('canonicalizes optional square arrays as sorted sets', () => {
    const normalized = normalizeSelectionInput(
      {
        destinationSquares: ['h8', 'a1', 'h8'],
        disabledSquares: [],
        selectedSquare: 'e4',
      },
      dimensions,
    );

    expect(normalized).toEqual({
      destinationSquares: ['a1', 'h8'],
      selectedSquare: 'e4',
    });
    expect(Object.isFrozen(normalized)).toBe(true);
    expect(Object.isFrozen(normalized.destinationSquares)).toBe(true);
    expect(
      normalizeSelectionInput(
        { destinationSquares: [], selectedSquare: null },
        dimensions,
      ),
    ).toEqual(normalizeSelectionInput({ selectedSquare: null }, dimensions));
  });

  it('reads square arrays by own index exactly once', () => {
    let reads = 0;
    const squares = ['a1'];
    Object.defineProperty(squares, '0', {
      configurable: true,
      enumerable: true,
      get: () => {
        reads += 1;
        return 'a1';
      },
    });
    Object.defineProperty(squares, Symbol.iterator, {
      value: function* () {
        yield 'h8';
      },
    });

    expect(
      normalizeSelectionInput(
        { destinationSquares: squares, selectedSquare: null },
        dimensions,
      ),
    ).toEqual({ destinationSquares: ['a1'], selectedSquare: null });
    expect(reads).toBe(1);

    expect(() =>
      normalizeSelectionInput(
        { destinationSquares: new Array(1), selectedSquare: null },
        dimensions,
      ),
    ).toThrow(/hole/u);
  });

  it.each([
    [null],
    [{}],
    [{ selectedSquare: 'A1' }],
    [{ destinationSquares: 'a1', selectedSquare: null }],
    [{ disabledSquares: [null], selectedSquare: null }],
  ])('rejects malformed selection snapshots', (selection) => {
    expect(() => normalizeSelectionInput(selection, dimensions)).toThrow(
      SelectionValidationError,
    );
  });
});
