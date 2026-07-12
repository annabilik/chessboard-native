import fc from 'fast-check';

import { hitTestBoardPoint } from '../../src/core/hit-test';
import { createBoardSurfaceLayout } from '../../src/render/board-layout';
import type {
  BoardDimensions,
  BoardOrientation,
  BoardSize,
} from '../../src/public-types';

const orientationArbitrary = fc.constantFrom<BoardOrientation>(
  'white',
  'black',
);

const layoutCaseArbitrary = fc
  .record({
    dimensions: fc.record({
      columns: fc.integer({ max: 12, min: 1 }),
      rows: fc.integer({ max: 12, min: 1 }),
    }),
    orientation: orientationArbitrary,
    width: fc.double({ max: 2048, min: 1, noNaN: true }),
  })
  .map(({ dimensions, orientation, width }) => ({
    dimensions,
    orientation,
    size: {
      height: (width / dimensions.columns) * dimensions.rows,
      width,
    },
  }));

function labels(
  layout: ReturnType<typeof createBoardSurfaceLayout>,
  key: 'fileLabel' | 'rankLabel',
): string[] {
  return layout.cells.flatMap((cell) => {
    const value = cell[key];
    return value === null ? [] : [value];
  });
}

describe('measured board surface layout', () => {
  it('[PARITY-OPTION-BOARD-ORIENTATION] projects square and notation order without changing canonical IDs', () => {
    const dimensions = { columns: 3, rows: 2 };
    const size = { height: 200, width: 300 };
    const white = createBoardSurfaceLayout(size, dimensions, 'white');
    const black = createBoardSurfaceLayout(size, dimensions, 'black');

    expect(white.cells.map(({ square }) => square)).toEqual([
      'a2',
      'b2',
      'c2',
      'a1',
      'b1',
      'c1',
    ]);
    expect(black.cells.map(({ square }) => square)).toEqual([
      'c1',
      'b1',
      'a1',
      'c2',
      'b2',
      'a2',
    ]);
    expect(labels(white, 'fileLabel')).toEqual(['a', 'b', 'c']);
    expect(labels(black, 'fileLabel')).toEqual(['c', 'b', 'a']);
    expect(labels(white, 'rankLabel')).toEqual(['2', '1']);
    expect(labels(black, 'rankLabel')).toEqual(['1', '2']);
    expect(
      new Map(white.cells.map(({ isLight, square }) => [square, isLight])),
    ).toEqual(
      new Map(black.cells.map(({ isLight, square }) => [square, isLight])),
    );
  });

  it('uses cumulative fractional edges without gaps or rounded overflow', () => {
    fc.assert(
      fc.property(layoutCaseArbitrary, ({ dimensions, orientation, size }) => {
        const layout = createBoardSurfaceLayout(size, dimensions, orientation);

        for (let row = 0; row < dimensions.rows; row += 1) {
          const cells = layout.cells.slice(
            row * dimensions.columns,
            (row + 1) * dimensions.columns,
          );
          expect(cells[0]?.rect.left).toBe(0);
          for (let column = 1; column < cells.length; column += 1) {
            const previous = cells[column - 1];
            const current = cells[column];
            expect(previous).toBeDefined();
            expect(current).toBeDefined();
            expect(
              (previous?.rect.left ?? 0) + (previous?.rect.width ?? 0),
            ).toBeCloseTo(current?.rect.left ?? 0, 12);
          }
          const final = cells.at(-1);
          expect(
            (final?.rect.left ?? 0) + (final?.rect.width ?? 0),
          ).toBeCloseTo(size.width, 12);
        }

        for (let column = 0; column < dimensions.columns; column += 1) {
          const cells = layout.cells.filter((cell) => cell.column === column);
          expect(cells[0]?.rect.top).toBe(0);
          for (let row = 1; row < cells.length; row += 1) {
            const previous = cells[row - 1];
            const current = cells[row];
            expect(
              (previous?.rect.top ?? 0) + (previous?.rect.height ?? 0),
            ).toBeCloseTo(current?.rect.top ?? 0, 12);
          }
          const final = cells.at(-1);
          expect(
            (final?.rect.top ?? 0) + (final?.rect.height ?? 0),
          ).toBeCloseTo(size.height, 12);
        }
      }),
      { numRuns: 200 },
    );
  });

  it('maps every measured cell center back to its canonical square', () => {
    fc.assert(
      fc.property(layoutCaseArbitrary, ({ dimensions, orientation, size }) => {
        const layout = createBoardSurfaceLayout(size, dimensions, orientation);

        for (const cell of layout.cells) {
          expect(
            hitTestBoardPoint(
              {
                x: cell.rect.left + cell.rect.width / 2,
                y: cell.rect.top + cell.rect.height / 2,
              },
              size,
              dimensions,
              orientation,
            ),
          ).toBe(cell.square);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('supports the 1x1 and maximum bounded variant layouts', () => {
    const one = createBoardSurfaceLayout(
      { height: 17.5, width: 17.5 },
      { columns: 1, rows: 1 },
      'white',
    );
    expect(one.cells).toEqual([
      expect.objectContaining({
        fileLabel: 'a',
        rankLabel: '1',
        rect: { height: 17.5, left: 0, top: 0, width: 17.5 },
        square: 'a1',
      }),
    ]);

    const maximum = createBoardSurfaceLayout(
      { height: 990, width: 260 },
      { columns: 26, rows: 99 },
      'black',
    );
    expect(maximum.cells).toHaveLength(26 * 99);
    expect(maximum.cells[0]?.square).toBe('z1');
    expect(maximum.cells.at(-1)?.square).toBe('a99');
    expect(maximum.cells.at(-1)?.rect).toEqual({
      height: 10,
      left: 250,
      top: 980,
      width: 10,
    });
  });

  it.each([
    [null, TypeError],
    [{ height: 100, width: 0 }, RangeError],
    [{ height: Number.NaN, width: 100 }, TypeError],
    [{ height: Number.POSITIVE_INFINITY, width: 100 }, TypeError],
  ])('rejects malformed measured size %p', (size, errorType) => {
    expect(() =>
      createBoardSurfaceLayout(
        size as BoardSize,
        { columns: 8, rows: 8 },
        'white',
      ),
    ).toThrow(errorType);
  });

  it('returns detached immutable layout records', () => {
    const dimensions = { columns: 2, rows: 3 } satisfies BoardDimensions;
    const size = { height: 90, width: 60 } satisfies BoardSize;
    const layout = createBoardSurfaceLayout(size, dimensions, 'white');

    expect(Object.isFrozen(layout)).toBe(true);
    expect(Object.isFrozen(layout.size)).toBe(true);
    expect(Object.isFrozen(layout.dimensions)).toBe(true);
    expect(Object.isFrozen(layout.cells)).toBe(true);
    expect(layout.cells.every(Object.isFrozen)).toBe(true);
    expect(layout.cells.every(({ rect }) => Object.isFrozen(rect))).toBe(true);
    expect(layout.size).not.toBe(size);
    expect(layout.dimensions).not.toBe(dimensions);
  });
});
