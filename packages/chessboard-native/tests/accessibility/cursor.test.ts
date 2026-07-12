import fc from 'fast-check';

import {
  accessibilityCursorIndex,
  canMoveAccessibilityCursor,
  createInitialAccessibilityCursor,
  moveAccessibilityCursor,
  reconcileAccessibilityCursor,
  type AccessibilityCursorAction,
} from '../../src/accessibility/cursor';
import {
  coordinateToSquare,
  generateBoardGeometry,
} from '../../src/core/coordinates';
import {
  validateBoardDimensions,
  type ValidatedBoardDimensions,
} from '../../src/core/dimensions';
import type { BoardOrientation } from '../../src/public-types';

const orientations = fc.constantFrom<BoardOrientation>('white', 'black');
const cursorCases = fc
  .record({
    columns: fc.integer({ max: 26, min: 1 }),
    rows: fc.integer({ max: 99, min: 1 }),
  })
  .chain((dimensions) =>
    fc.record({
      column: fc.integer({ max: dimensions.columns - 1, min: 0 }),
      dimensions: fc.constant(dimensions),
      orientation: orientations,
      row: fc.integer({ max: dimensions.rows - 1, min: 0 }),
    }),
  );

function dimensions(rows: number, columns: number): ValidatedBoardDimensions {
  return validateBoardDimensions({ columns, rows });
}

describe('accessibility virtual cursor', () => {
  it('starts at a valid controlled selection or the visual top-left square', () => {
    const board = dimensions(8, 8);

    expect(createInitialAccessibilityCursor(board, 'white')).toBe('a8');
    expect(createInitialAccessibilityCursor(board, 'black')).toBe('h1');
    expect(createInitialAccessibilityCursor(board, 'black', 'e4')).toBe('e4');
    expect(createInitialAccessibilityCursor(board, 'white', 'z99')).toBe('a8');
  });

  it('uses orientation-aware row-major order for increment and decrement', () => {
    const board = dimensions(2, 3);

    expect(moveAccessibilityCursor('a2', 'increment', board, 'white')).toBe(
      'b2',
    );
    expect(moveAccessibilityCursor('c2', 'increment', board, 'white')).toBe(
      'a1',
    );
    expect(moveAccessibilityCursor('a1', 'decrement', board, 'white')).toBe(
      'c2',
    );
    expect(moveAccessibilityCursor('c1', 'increment', board, 'black')).toBe(
      'b1',
    );
    expect(moveAccessibilityCursor('a1', 'increment', board, 'black')).toBe(
      'c2',
    );
  });

  it('moves directional actions in visual coordinates for both orientations', () => {
    const board = dimensions(8, 8);

    expect(
      moveAccessibilityCursor('e4', 'move-cursor-left', board, 'white'),
    ).toBe('d4');
    expect(
      moveAccessibilityCursor('e4', 'move-cursor-up', board, 'white'),
    ).toBe('e5');
    expect(
      moveAccessibilityCursor('e4', 'move-cursor-left', board, 'black'),
    ).toBe('f4');
    expect(
      moveAccessibilityCursor('e4', 'move-cursor-up', board, 'black'),
    ).toBe('e3');
  });

  it('clamps every movement at visual boundaries without wrapping', () => {
    const board = dimensions(2, 2);
    const cases = [
      ['a2', 'decrement', 'white'],
      ['a2', 'move-cursor-left', 'white'],
      ['a2', 'move-cursor-up', 'white'],
      ['b1', 'increment', 'white'],
      ['b1', 'move-cursor-right', 'white'],
      ['b1', 'move-cursor-down', 'white'],
      ['b1', 'decrement', 'black'],
      ['b1', 'move-cursor-left', 'black'],
      ['b1', 'move-cursor-up', 'black'],
      ['a2', 'increment', 'black'],
      ['a2', 'move-cursor-right', 'black'],
      ['a2', 'move-cursor-down', 'black'],
    ] as const satisfies readonly (readonly [
      string,
      AccessibilityCursorAction,
      BoardOrientation,
    ])[];

    for (const [square, action, orientation] of cases) {
      expect(moveAccessibilityCursor(square, action, board, orientation)).toBe(
        square,
      );
      expect(
        canMoveAccessibilityCursor(square, action, board, orientation),
      ).toBe(false);
    }
  });

  it('makes every action inert on a one-square board', () => {
    const board = dimensions(1, 1);
    const actions = [
      'increment',
      'decrement',
      'move-cursor-left',
      'move-cursor-right',
      'move-cursor-up',
      'move-cursor-down',
    ] as const satisfies readonly AccessibilityCursorAction[];

    for (const orientation of ['white', 'black'] as const) {
      for (const action of actions) {
        expect(moveAccessibilityCursor('a1', action, board, orientation)).toBe(
          'a1',
        );
        expect(
          canMoveAccessibilityCursor('a1', action, board, orientation),
        ).toBe(false);
      }
    }
  });

  it('keeps the canonical square across orientation and resets only if dimensions exclude it', () => {
    const standard = dimensions(8, 8);
    const variant = dimensions(3, 3);

    expect(reconcileAccessibilityCursor('e4', standard, 'black', 'a1')).toBe(
      'e4',
    );
    expect(reconcileAccessibilityCursor('e4', variant, 'white', 'b2')).toBe(
      'b2',
    );
    expect(reconcileAccessibilityCursor('e4', variant, 'black')).toBe('c1');
  });

  it('indexes every supported cursor in visual reading order', () => {
    fc.assert(
      fc.property(
        cursorCases,
        ({ column, dimensions: raw, orientation, row }) => {
          const board = validateBoardDimensions(raw);
          const square = coordinateToSquare(
            { column, row },
            board,
            orientation,
          );
          const index = accessibilityCursorIndex(square, board, orientation);

          expect(index).toBe(row * board.columns + column);
          expect(index).toBeGreaterThanOrEqual(0);
          expect(index).toBeLessThan(board.rows * board.columns);
        },
      ),
      { numRuns: 500 },
    );
  });

  it('increment visits the maximum board exactly in generated visual order', () => {
    const board = dimensions(99, 26);

    for (const orientation of ['white', 'black'] as const) {
      const expected = generateBoardGeometry(board, orientation)
        .flat()
        .map(({ square }) => square);
      const visited: string[] = [];
      let square = createInitialAccessibilityCursor(board, orientation);

      for (const expectedSquare of expected) {
        expect(square).toBe(expectedSquare);
        visited.push(square);
        square = moveAccessibilityCursor(
          square,
          'increment',
          board,
          orientation,
        );
      }

      expect(visited).toEqual(expected);
      expect(new Set(visited).size).toBe(26 * 99);
      expect(square).toBe(expected.at(-1));
    }
  });

  it('makes non-edge increment and decrement exact inverses', () => {
    fc.assert(
      fc.property(
        cursorCases.filter(
          ({ column, dimensions: board, row }) =>
            row * board.columns + column < board.rows * board.columns - 1,
        ),
        ({ column, dimensions: raw, orientation, row }) => {
          const board = validateBoardDimensions(raw);
          const square = coordinateToSquare(
            { column, row },
            board,
            orientation,
          );
          const incremented = moveAccessibilityCursor(
            square,
            'increment',
            board,
            orientation,
          );

          expect(
            moveAccessibilityCursor(
              incremented,
              'decrement',
              board,
              orientation,
            ),
          ).toBe(square);
        },
      ),
      { numRuns: 500 },
    );
  });
});
