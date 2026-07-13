import { defaultAnnotationStyle } from '../../src/index';
import {
  computeAnnotationGeometry,
  computeArrowPath,
  type ArrowAnnotationGeometry,
  type SquareAnnotationGeometry,
} from '../../src/render/annotation-geometry';

function arrow(
  annotations: readonly Readonly<
    ArrowAnnotationGeometry | SquareAnnotationGeometry
  >[],
  id: string,
): Readonly<ArrowAnnotationGeometry> {
  const match = annotations.find(
    (annotation): annotation is Readonly<ArrowAnnotationGeometry> =>
      annotation.kind === 'arrow' && annotation.annotationId === id,
  );
  if (match === undefined) {
    throw new Error(`Expected arrow geometry for ${id}.`);
  }
  return match;
}

function square(
  annotations: readonly Readonly<
    ArrowAnnotationGeometry | SquareAnnotationGeometry
  >[],
  id: string,
): Readonly<SquareAnnotationGeometry> {
  const match = annotations.find(
    (annotation): annotation is Readonly<SquareAnnotationGeometry> =>
      annotation.kind === 'square' && annotation.annotationId === id,
  );
  if (match === undefined) {
    throw new Error(`Expected square geometry for ${id}.`);
  }
  return match;
}

function expectPointCloseTo(
  actual: Readonly<{ x: number; y: number }>,
  expected: Readonly<{ x: number; y: number }>,
): void {
  expect(actual.x).toBeCloseTo(expected.x, 12);
  expect(actual.y).toBeCloseTo(expected.y, 12);
}

function pointAt(
  points: readonly Readonly<{ x: number; y: number }>[],
  index: number,
): Readonly<{ x: number; y: number }> {
  const result = points[index];
  if (result === undefined) {
    throw new Error(`Expected annotation point at index ${String(index)}.`);
  }
  return result;
}

describe('annotation geometry', () => {
  it('[PARITY-EXPORT-DEFAULT-ARROW-OPTIONS] retains the complete frozen annotation defaults', () => {
    expect(defaultAnnotationStyle).toEqual({
      activeArrowWidthMultiplier: 0.9,
      activeOpacity: 0.5,
      arrowLengthReducerDenominator: 8,
      arrowStartOffset: 0,
      arrowWidthDenominator: 5,
      color: '#ffaa00',
      opacity: 0.65,
      sameTargetArrowLengthReducerDenominator: 4,
      secondaryColor: '#4caf50',
      tertiaryColor: '#f44336',
    });
    expect(Object.isFrozen(defaultAnnotationStyle)).toBe(true);
  });

  it('[PARITY-BEHAVIOR-B41] projects rectangular annotations through both orientations', () => {
    const annotations = [
      { color: '#f00', id: 'a1', square: 'a1', type: 'square' },
      { color: '#0f0', id: 'c2', square: 'c2', type: 'square' },
      {
        color: '#00f',
        from: 'a1',
        id: 'rect-arrow',
        shape: 'straight',
        to: 'c2',
        type: 'arrow',
      },
    ] as const;
    const white = computeAnnotationGeometry({
      annotations,
      dimensions: { columns: 3, rows: 2 },
      orientation: 'white',
      style: defaultAnnotationStyle,
    });
    const black = computeAnnotationGeometry({
      annotations,
      dimensions: { columns: 3, rows: 2 },
      orientation: 'black',
      style: defaultAnnotationStyle,
    });

    expect(white.width).toBe(2048);
    expect(white.height).toBeCloseTo((2048 * 2) / 3, 12);
    expect(square(white.belowPieces, 'a1').center.x).toBeCloseTo(2048 / 6, 12);
    expect(square(white.belowPieces, 'a1').center.y).toBe(1024);
    expect(square(white.belowPieces, 'c2').center.x).toBeCloseTo(
      (2048 * 5) / 6,
      12,
    );
    expect(square(white.belowPieces, 'c2').center.y).toBeCloseTo(2048 / 6, 12);
    expect(square(black.belowPieces, 'a1').center.x).toBeCloseTo(
      (2048 * 5) / 6,
      12,
    );
    expect(square(black.belowPieces, 'a1').center.y).toBeCloseTo(2048 / 6, 12);
    expect(square(black.belowPieces, 'c2').center.x).toBeCloseTo(2048 / 6, 12);
    expect(square(black.belowPieces, 'c2').center.y).toBe(1024);

    const squareSize = 2048 / 3;
    const reduction = squareSize / 8;
    const whiteFrom = { x: squareSize / 2, y: squareSize * 1.5 };
    const whiteTo = { x: squareSize * 2.5, y: squareSize / 2 };
    const whiteUnit = { x: 2 / Math.sqrt(5), y: -1 / Math.sqrt(5) };
    const blackFrom = whiteTo;
    const blackTo = whiteFrom;
    const blackUnit = { x: -whiteUnit.x, y: -whiteUnit.y };
    const whiteArrow = arrow(white.abovePieces, 'rect-arrow');
    const blackArrow = arrow(black.abovePieces, 'rect-arrow');

    expectPointCloseTo(pointAt(whiteArrow.points, 0), whiteFrom);
    expectPointCloseTo(whiteArrow.head[0], {
      x: whiteTo.x - whiteUnit.x * reduction,
      y: whiteTo.y - whiteUnit.y * reduction,
    });
    expectPointCloseTo(pointAt(blackArrow.points, 0), blackFrom);
    expectPointCloseTo(blackArrow.head[0], {
      x: blackTo.x - blackUnit.x * reduction,
      y: blackTo.y - blackUnit.y * reduction,
    });
  });

  it('[PARITY-BEHAVIOR-B42] selects integer knight geometry and honors explicit shapes', () => {
    const knightTargets = [
      'b3',
      'b5',
      'c2',
      'c6',
      'e2',
      'e6',
      'f3',
      'f5',
    ] as const;
    const geometry = computeAnnotationGeometry({
      annotations: [
        ...knightTargets.map((to, index) => ({
          color: '#f00',
          from: 'd4',
          id: `knight-${String(index)}`,
          to,
          type: 'arrow' as const,
        })),
        {
          color: '#0f0',
          from: 'd4',
          id: 'near-knight',
          to: 'f6',
          type: 'arrow',
        },
        {
          color: '#00f',
          from: 'd4',
          id: 'forced-straight',
          shape: 'straight',
          to: 'f5',
          type: 'arrow',
        },
        {
          color: '#ff0',
          from: 'd4',
          id: 'forced-knight',
          shape: 'knight',
          to: 'f6',
          type: 'arrow',
        },
      ],
      dimensions: { columns: 8, rows: 8 },
      orientation: 'white',
      style: defaultAnnotationStyle,
    });

    for (let index = 0; index < knightTargets.length; index += 1) {
      const current = arrow(geometry.abovePieces, `knight-${String(index)}`);
      expect(current.shape).toBe('knight');
      expect(current.points).toHaveLength(3);
    }
    expect(arrow(geometry.abovePieces, 'near-knight').shape).toBe('straight');
    expect(arrow(geometry.abovePieces, 'forced-straight').points).toHaveLength(
      2,
    );
    expect(arrow(geometry.abovePieces, 'forced-knight').points).toHaveLength(3);

    expectPointCloseTo(
      pointAt(arrow(geometry.abovePieces, 'knight-7').points, 1),
      {
        x: 1408,
        y: 1152,
      },
    );
    expectPointCloseTo(
      pointAt(arrow(geometry.abovePieces, 'knight-5').points, 1),
      {
        x: 896,
        y: 640,
      },
    );

    const black = computeAnnotationGeometry({
      annotations: [
        {
          color: '#f00',
          from: 'd4',
          id: 'horizontal-long',
          to: 'f5',
          type: 'arrow',
        },
        {
          color: '#0f0',
          from: 'd4',
          id: 'vertical-long',
          to: 'e6',
          type: 'arrow',
        },
      ],
      dimensions: { columns: 8, rows: 8 },
      orientation: 'black',
      style: defaultAnnotationStyle,
    });
    expectPointCloseTo(
      pointAt(arrow(black.abovePieces, 'horizontal-long').points, 1),
      {
        x: 640,
        y: 896,
      },
    );
    expectPointCloseTo(
      pointAt(arrow(black.abovePieces, 'vertical-long').points, 1),
      {
        x: 1152,
        y: 1408,
      },
    );

    const incompatible = computeArrowPath({
      from: { x: 0, y: 0 },
      shape: 'knight',
      squareSize: 100,
      style: defaultAnnotationStyle,
      to: { x: 200, y: 0 },
    });
    expect(incompatible?.shape).toBe('straight');
    expect(incompatible?.points).toHaveLength(2);
  });

  it('[PARITY-BEHAVIOR-B43] shortens shared targets but exempts an active draft', () => {
    const ordinary = computeAnnotationGeometry({
      annotations: [
        { color: '#f00', from: 'e2', id: 'main', to: 'e4', type: 'arrow' },
      ],
      dimensions: { columns: 8, rows: 8 },
      orientation: 'white',
      style: defaultAnnotationStyle,
    });
    const collision = computeAnnotationGeometry({
      annotations: [
        { color: '#f00', from: 'e2', id: 'main', to: 'e4', type: 'arrow' },
        { color: '#0f0', from: 'd2', id: 'other', to: 'e4', type: 'arrow' },
      ],
      dimensions: { columns: 8, rows: 8 },
      orientation: 'white',
      style: defaultAnnotationStyle,
    });
    const duplicate = computeAnnotationGeometry({
      annotations: [
        { color: '#f00', from: 'e2', id: 'main', to: 'e4', type: 'arrow' },
        { color: '#0f0', from: 'e2', id: 'copy', to: 'e4', type: 'arrow' },
      ],
      dimensions: { columns: 8, rows: 8 },
      orientation: 'white',
      style: defaultAnnotationStyle,
    });

    expect(arrow(ordinary.abovePieces, 'main').head[0].y).toBe(1184);
    expect(arrow(collision.abovePieces, 'main').head[0].y).toBe(1216);
    expect(arrow(duplicate.abovePieces, 'main').head[0].y).toBe(1184);

    const active = computeArrowPath({
      active: true,
      from: { x: 0, y: 0 },
      sameTarget: true,
      shape: 'straight',
      squareSize: 100,
      style: defaultAnnotationStyle,
      to: { x: 100, y: 0 },
    });
    expect(active?.head[0].x).toBe(87.5);
    expect(active?.strokeWidth).toBe(18);
    expect(active?.opacity).toBe(0.5);
  });

  it('projects all square shapes, default layers, and finite degenerate behavior', () => {
    const geometry = computeAnnotationGeometry({
      annotations: [
        { color: '#100', id: 'fill', square: 'a1', type: 'square' },
        {
          color: '#200',
          id: 'circle',
          shape: 'circle',
          square: 'b1',
          type: 'square',
        },
        {
          color: '#300',
          id: 'dot',
          layer: 'abovePieces',
          shape: 'dot',
          square: 'c1',
          type: 'square',
        },
        {
          color: '#400',
          id: 'border',
          shape: 'border',
          square: 'd1',
          type: 'square',
        },
        { color: '#500', from: 'e1', id: 'same', to: 'e1', type: 'arrow' },
        {
          color: '#600',
          from: 'a1',
          id: 'visible-arrow',
          to: 'h8',
          type: 'arrow',
        },
      ],
      dimensions: { columns: 8, rows: 8 },
      orientation: 'white',
      style: defaultAnnotationStyle,
    });

    expect(geometry.belowPieces.map((item) => item.annotationId)).toEqual([
      'fill',
      'circle',
      'border',
    ]);
    expect(geometry.abovePieces.map((item) => item.annotationId)).toEqual([
      'dot',
      'visible-arrow',
    ]);
    expect(square(geometry.belowPieces, 'fill').shape).toBe('fill');
    expect(square(geometry.belowPieces, 'circle').radius).toBe(89.6);
    expect(square(geometry.abovePieces, 'dot').radius).toBe(35.84);
    expect(square(geometry.belowPieces, 'border').strokeWidth).toBe(20.48);

    const fill = square(geometry.belowPieces, 'fill');
    const visibleArrow = arrow(geometry.abovePieces, 'visible-arrow');
    expect(Object.isFrozen(geometry)).toBe(true);
    expect(Object.isFrozen(geometry.abovePieces)).toBe(true);
    expect(Object.isFrozen(geometry.belowPieces)).toBe(true);
    expect(Object.isFrozen(fill)).toBe(true);
    expect(Object.isFrozen(fill.rect)).toBe(true);
    expect(Object.isFrozen(fill.center)).toBe(true);
    expect(Object.isFrozen(visibleArrow)).toBe(true);
    expect(Object.isFrozen(visibleArrow.points)).toBe(true);
    expect(visibleArrow.points.every((item) => Object.isFrozen(item))).toBe(
      true,
    );
    expect(Object.isFrozen(visibleArrow.head)).toBe(true);
    expect(visibleArrow.head.every((item) => Object.isFrozen(item))).toBe(true);
  });

  it('keeps explicit widths dimension-independent and derives omitted widths per square', () => {
    const annotations = [
      {
        color: '#f00',
        from: 'a1',
        id: 'explicit',
        to: 'a4',
        type: 'arrow',
        width: 17,
      },
      {
        color: '#0f0',
        from: 'a1',
        id: 'derived',
        to: 'a4',
        type: 'arrow',
      },
    ] as const;
    const standard = computeAnnotationGeometry({
      annotations,
      dimensions: { columns: 8, rows: 8 },
      orientation: 'white',
      style: defaultAnnotationStyle,
    });
    const compactBlack = computeAnnotationGeometry({
      annotations,
      dimensions: { columns: 4, rows: 4 },
      orientation: 'black',
      style: defaultAnnotationStyle,
    });

    expect(arrow(standard.abovePieces, 'explicit').strokeWidth).toBe(17);
    expect(arrow(compactBlack.abovePieces, 'explicit').strokeWidth).toBe(17);
    expect(arrow(standard.abovePieces, 'derived').strokeWidth).toBeCloseTo(
      51.2,
      12,
    );
    expect(arrow(compactBlack.abovePieces, 'derived').strokeWidth).toBeCloseTo(
      102.4,
      12,
    );
  });

  it('suppresses reversed hostile geometry and clamps opacity', () => {
    expect(
      computeArrowPath({
        from: { x: 0, y: 0 },
        shape: 'straight',
        squareSize: 100,
        style: { ...defaultAnnotationStyle, arrowStartOffset: 2 },
        to: { x: 100, y: 0 },
      }),
    ).toBeNull();
    expect(
      computeArrowPath({
        from: { x: 0, y: 0 },
        shape: 'straight',
        squareSize: 100,
        style: {
          ...defaultAnnotationStyle,
          arrowLengthReducerDenominator: 0.1,
        },
        to: { x: 100, y: 0 },
      }),
    ).toBeNull();
    expect(
      computeArrowPath({
        from: { x: 0, y: 0 },
        shape: 'knight',
        squareSize: 100,
        style: { ...defaultAnnotationStyle, arrowStartOffset: 2.1 },
        to: { x: 100, y: 200 },
      }),
    ).toBeNull();

    const transparent = computeArrowPath({
      from: { x: 0, y: 0 },
      opacity: -2,
      shape: 'straight',
      squareSize: 100,
      style: defaultAnnotationStyle,
      to: { x: 200, y: 0 },
    });
    const opaque = computeArrowPath({
      from: { x: 0, y: 0 },
      opacity: 2,
      shape: 'straight',
      squareSize: 100,
      style: defaultAnnotationStyle,
      to: { x: 200, y: 0 },
    });
    expect(transparent?.opacity).toBe(0);
    expect(opaque?.opacity).toBe(1);
  });
});
