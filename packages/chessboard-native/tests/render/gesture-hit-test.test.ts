import { hitTestBoardPoint } from '../../src/core/hit-test';
import { createBoardSurfaceLayout } from '../../src/render/board-layout';
import { hitTestGesturePoint } from '../../src/render/gesture-hit-test';
import type {
  BoardDimensions,
  BoardOrientation,
  BoardPoint,
  BoardSize,
  SquareId,
} from '../../src/public-types';

function visualSquares(
  size: BoardSize,
  dimensions: BoardDimensions,
  orientation: BoardOrientation,
): readonly SquareId[] {
  return createBoardSurfaceLayout(size, dimensions, orientation).cells.map(
    ({ square }) => square,
  );
}

function gestureHitTest(
  point: BoardPoint,
  size: BoardSize,
  dimensions: BoardDimensions,
  orientation: BoardOrientation,
): SquareId | null {
  return hitTestGesturePoint(
    point.x,
    point.y,
    size.width,
    size.height,
    dimensions.columns,
    dimensions.rows,
    visualSquares(size, dimensions, orientation),
  );
}

describe('worklet-safe gesture hit testing', () => {
  const dimensions = Object.freeze({ columns: 3, rows: 2 });
  const size = Object.freeze({ height: 160, width: 300 });

  it.each([
    {
      expected: ['a2', 'c2', 'a1', 'c1'],
      orientation: 'white' as const,
    },
    {
      expected: ['c1', 'a1', 'c2', 'a2'],
      orientation: 'black' as const,
    },
  ])(
    'maps rectangular $orientation geometry through visual cell order',
    ({ expected, orientation }) => {
      const points = [
        { x: 0, y: 0 },
        { x: 299.999, y: 0 },
        { x: 0, y: 159.999 },
        { x: 299.999, y: 159.999 },
      ];

      expect(
        points.map((point) =>
          gestureHitTest(point, size, dimensions, orientation),
        ),
      ).toEqual(expected);
    },
  );

  it('assigns exact internal boundaries to the next visual cell', () => {
    const squares = visualSquares(size, dimensions, 'white');
    const hit = (x: number, y: number) =>
      hitTestGesturePoint(x, y, 300, 160, 3, 2, squares);

    expect(hit(99.999, 79.999)).toBe('a2');
    expect(hit(100, 79.999)).toBe('b2');
    expect(hit(99.999, 80)).toBe('a1');
    expect(hit(100, 80)).toBe('b1');
    expect(hit(200, 80)).toBe('c1');
  });

  it('includes the top and left edges but rejects every outer or non-finite point', () => {
    const squares = visualSquares(size, dimensions, 'white');
    const hit = (x: number, y: number) =>
      hitTestGesturePoint(x, y, 300, 160, 3, 2, squares);

    expect(hit(0, 0)).toBe('a2');
    expect(hit(-Number.EPSILON, 0)).toBeNull();
    expect(hit(0, -Number.EPSILON)).toBeNull();
    expect(hit(300, 0)).toBeNull();
    expect(hit(0, 160)).toBeNull();
    expect(hit(Number.NaN, 0)).toBeNull();
    expect(hit(0, Number.POSITIVE_INFINITY)).toBeNull();
  });

  it('fails closed for invalid measured geometry or visual maps', () => {
    const squares = visualSquares(size, dimensions, 'white');

    expect(hitTestGesturePoint(0, 0, 0, 160, 3, 2, squares)).toBeNull();
    expect(hitTestGesturePoint(0, 0, 300, -1, 3, 2, squares)).toBeNull();
    expect(hitTestGesturePoint(0, 0, 300, 160, 1.5, 2, squares)).toBeNull();
    expect(hitTestGesturePoint(0, 0, 300, 160, 3, 0, squares)).toBeNull();
    expect(
      hitTestGesturePoint(0, 0, 300, 160, 3, 2, squares.slice(0, -1)),
    ).toBeNull();
    expect(hitTestGesturePoint(0, 0, 300, 160, 1, 1, [''])).toBeNull();
  });

  it('[PARITY-BEHAVIOR-B20] matches the validated core hit test at cells, boundaries, and off-board points in both orientations', () => {
    const parityDimensions = Object.freeze({ columns: 5, rows: 3 });
    const paritySize = Object.freeze({ height: 210.5, width: 403.25 });
    const points: readonly BoardPoint[] = Object.freeze([
      { x: 0, y: 0 },
      { x: paritySize.width / 5, y: 0 },
      { x: (paritySize.width * 4) / 5, y: paritySize.height / 3 },
      { x: paritySize.width / 2, y: paritySize.height / 2 },
      { x: paritySize.width - 0.001, y: paritySize.height - 0.001 },
      { x: -0.001, y: 20 },
      { x: paritySize.width, y: 20 },
      { x: 20, y: paritySize.height },
    ]);

    for (const orientation of ['white', 'black'] as const) {
      for (const point of points) {
        expect(
          gestureHitTest(point, paritySize, parityDimensions, orientation),
        ).toBe(
          hitTestBoardPoint(point, paritySize, parityDimensions, orientation),
        );
      }
    }
  });
});
