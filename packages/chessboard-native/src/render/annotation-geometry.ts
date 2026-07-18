import { defaultAnnotationStyle } from '../annotation-style';
import { parseSquareId } from '../core/coordinates';
import type {
  AnnotationDraft,
  AnnotationStyle,
  BoardAnnotation,
  BoardDimensions,
  BoardOrientation,
} from '../public-types';
import { createBoardSurfaceLayout, type BoardCellRect } from './board-layout';

export const ANNOTATION_VIEW_BOX_WIDTH = 2048;

const EPSILON = 1e-9;
const EMPTY_ANNOTATIONS: readonly never[] = Object.freeze([]);

export type AnnotationLayerName = 'belowPieces' | 'abovePieces';
export type ArrowPathShape = 'straight' | 'knight';

export interface AnnotationPoint {
  readonly x: number;
  readonly y: number;
}

export interface ArrowPathGeometry {
  readonly head: readonly [
    Readonly<AnnotationPoint>,
    Readonly<AnnotationPoint>,
    Readonly<AnnotationPoint>,
  ];
  readonly opacity: number;
  readonly points: readonly Readonly<AnnotationPoint>[];
  readonly shape: ArrowPathShape;
  readonly strokeWidth: number;
}

export interface ArrowAnnotationGeometry extends ArrowPathGeometry {
  readonly annotationId: string | null;
  readonly color: string;
  readonly isDraft: boolean;
  readonly kind: 'arrow';
  readonly layer: AnnotationLayerName;
  readonly renderKey: string;
}

export interface SquareAnnotationGeometry {
  readonly annotationId: string | null;
  readonly center: Readonly<AnnotationPoint>;
  readonly color: string;
  readonly isDraft: boolean;
  readonly kind: 'square';
  readonly layer: AnnotationLayerName;
  readonly opacity: number;
  readonly radius: number;
  readonly rect: Readonly<BoardCellRect>;
  readonly renderKey: string;
  readonly shape: 'fill' | 'circle' | 'dot' | 'border';
  readonly strokeWidth: number;
}

export type RenderedAnnotationGeometry =
  ArrowAnnotationGeometry | SquareAnnotationGeometry;

export interface ComputedAnnotationGeometry {
  readonly abovePieces: readonly Readonly<RenderedAnnotationGeometry>[];
  readonly belowPieces: readonly Readonly<RenderedAnnotationGeometry>[];
  readonly height: number;
  readonly width: number;
}

type RenderableAnnotation = BoardAnnotation | AnnotationDraft;
type RenderableArrowAnnotation = Extract<
  RenderableAnnotation,
  { readonly type: 'arrow' }
>;
type RenderableSquareAnnotation = Extract<
  RenderableAnnotation,
  { readonly type: 'square' }
>;

type AnnotationGeometryEntry =
  | {
      readonly annotation: Readonly<BoardAnnotation>;
      readonly annotationId: string;
      readonly isDraft: false;
      readonly renderKey: string;
    }
  | {
      readonly annotation: Readonly<AnnotationDraft>;
      readonly annotationId: null;
      readonly isDraft: true;
      readonly renderKey: 'draft';
    };

interface ComputeArrowPathOptions {
  readonly active?: boolean;
  readonly from: Readonly<AnnotationPoint>;
  readonly opacity?: number;
  readonly sameTarget?: boolean;
  readonly shape: ArrowPathShape;
  readonly squareSize: number;
  readonly style: Readonly<AnnotationStyle>;
  readonly to: Readonly<AnnotationPoint>;
  readonly width?: number;
}

function point(x: number, y: number): Readonly<AnnotationPoint> {
  return Object.freeze({ x, y });
}

function distance(
  from: Readonly<AnnotationPoint>,
  to: Readonly<AnnotationPoint>,
): number {
  return Math.hypot(to.x - from.x, to.y - from.y);
}

function positiveFiniteOr(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function opacityOr(value: number, fallback: number): number {
  return Math.min(1, Math.max(0, finiteOr(value, fallback)));
}

function signedProgress(
  from: Readonly<AnnotationPoint>,
  to: Readonly<AnnotationPoint>,
  direction: Readonly<AnnotationPoint>,
): number {
  return (to.x - from.x) * direction.x + (to.y - from.y) * direction.y;
}

function unitVector(
  from: Readonly<AnnotationPoint>,
  to: Readonly<AnnotationPoint>,
): Readonly<AnnotationPoint> | null {
  const length = distance(from, to);
  if (!Number.isFinite(length) || length <= EPSILON) {
    return null;
  }
  return point((to.x - from.x) / length, (to.y - from.y) / length);
}

function offsetPoint(
  origin: Readonly<AnnotationPoint>,
  direction: Readonly<AnnotationPoint>,
  amount: number,
): Readonly<AnnotationPoint> {
  return point(
    origin.x + direction.x * amount,
    origin.y + direction.y * amount,
  );
}

function createArrowHead(
  pointsToTip: readonly Readonly<AnnotationPoint>[],
  strokeWidth: number,
): Readonly<{
  head: ArrowPathGeometry['head'];
  shaft: readonly Readonly<AnnotationPoint>[];
}> | null {
  const tip = pointsToTip.at(-1);
  const finalSegmentStart = pointsToTip.at(-2);
  if (tip === undefined || finalSegmentStart === undefined) {
    return null;
  }

  const direction = unitVector(finalSegmentStart, tip);
  if (direction === null) {
    return null;
  }

  const finalSegmentLength = distance(finalSegmentStart, tip);
  const headLength = Math.min(strokeWidth * 2.5, finalSegmentLength * 0.8);
  if (!Number.isFinite(headLength) || headLength <= EPSILON) {
    return null;
  }

  const halfWidth = Math.min(strokeWidth * 1.25, headLength);
  const baseCenter = offsetPoint(tip, direction, -headLength);
  const normal = point(-direction.y, direction.x);
  const head: ArrowPathGeometry['head'] = Object.freeze([
    tip,
    offsetPoint(baseCenter, normal, halfWidth),
    offsetPoint(baseCenter, normal, -halfWidth),
  ]);
  const shaft = Object.freeze([...pointsToTip.slice(0, -1), baseCenter]);

  return Object.freeze({ head, shaft });
}

function createStraightPoints(
  from: Readonly<AnnotationPoint>,
  to: Readonly<AnnotationPoint>,
  startOffset: number,
  targetReduction: number,
): readonly Readonly<AnnotationPoint>[] | null {
  const direction = unitVector(from, to);
  if (direction === null) {
    return null;
  }

  const start = offsetPoint(from, direction, startOffset);
  const tip = offsetPoint(to, direction, -targetReduction);
  return signedProgress(start, tip, direction) <= EPSILON
    ? null
    : Object.freeze([start, tip]);
}

function createKnightPoints(
  from: Readonly<AnnotationPoint>,
  to: Readonly<AnnotationPoint>,
  startOffset: number,
  targetReduction: number,
): readonly Readonly<AnnotationPoint>[] | null {
  const deltaX = to.x - from.x;
  const deltaY = to.y - from.y;
  const verticalFirst = Math.abs(deltaX) < Math.abs(deltaY);
  const corner = verticalFirst ? point(from.x, to.y) : point(to.x, from.y);
  const firstDirection = unitVector(from, corner);
  const finalDirection = unitVector(corner, to);
  if (firstDirection === null || finalDirection === null) {
    return null;
  }

  const start = offsetPoint(from, firstDirection, startOffset);
  const tip = offsetPoint(to, finalDirection, -targetReduction);
  return signedProgress(start, corner, firstDirection) <= EPSILON ||
    signedProgress(corner, tip, finalDirection) <= EPSILON
    ? null
    : Object.freeze([start, corner, tip]);
}

/** Pure marker-free shaft and arrowhead geometry. */
export function computeArrowPath(
  options: ComputeArrowPathOptions,
): Readonly<ArrowPathGeometry> | null {
  const active = options.active ?? false;
  const sameTarget = options.sameTarget ?? false;
  const style = options.style;
  const defaultWidth =
    options.squareSize /
    positiveFiniteOr(
      style.arrowWidthDenominator,
      defaultAnnotationStyle.arrowWidthDenominator,
    );
  const baseWidth =
    options.width === undefined
      ? defaultWidth
      : positiveFiniteOr(options.width, defaultWidth);
  const strokeWidth =
    baseWidth *
    (active
      ? positiveFiniteOr(
          style.activeArrowWidthMultiplier,
          defaultAnnotationStyle.activeArrowWidthMultiplier,
        )
      : 1);
  const defaultOpacity = active
    ? defaultAnnotationStyle.activeOpacity
    : defaultAnnotationStyle.opacity;
  const opacity = opacityOr(
    options.opacity ?? (active ? style.activeOpacity : style.opacity),
    defaultOpacity,
  );
  const reducerDenominator =
    sameTarget && !active
      ? positiveFiniteOr(
          style.sameTargetArrowLengthReducerDenominator,
          defaultAnnotationStyle.sameTargetArrowLengthReducerDenominator,
        )
      : positiveFiniteOr(
          style.arrowLengthReducerDenominator,
          defaultAnnotationStyle.arrowLengthReducerDenominator,
        );
  const targetReduction = options.squareSize / reducerDenominator;
  const startOffset =
    options.squareSize *
    finiteOr(style.arrowStartOffset, defaultAnnotationStyle.arrowStartOffset);

  const straight = (): readonly Readonly<AnnotationPoint>[] | null =>
    createStraightPoints(
      options.from,
      options.to,
      startOffset,
      targetReduction,
    );
  const structurallyKnight =
    options.shape === 'knight' &&
    Math.abs(options.to.x - options.from.x) > EPSILON &&
    Math.abs(options.to.y - options.from.y) > EPSILON;
  const pointsToTip = structurallyKnight
    ? createKnightPoints(options.from, options.to, startOffset, targetReduction)
    : straight();
  const shape = structurallyKnight ? 'knight' : 'straight';
  if (pointsToTip === null) {
    return null;
  }

  const head = createArrowHead(pointsToTip, strokeWidth);
  if (head === null) {
    return null;
  }

  return Object.freeze({
    head: head.head,
    opacity,
    points: head.shaft,
    shape,
    strokeWidth,
  });
}

function resolveArrowShape(
  annotation: Readonly<RenderableArrowAnnotation>,
  dimensions: Readonly<BoardDimensions>,
): ArrowPathShape {
  if (annotation.shape !== undefined) {
    return annotation.shape;
  }
  const from = parseSquareId(annotation.from, dimensions);
  const to = parseSquareId(annotation.to, dimensions);
  const deltas = [
    Math.abs(from.fileIndex - to.fileIndex),
    Math.abs(from.rank - to.rank),
  ].sort((left, right) => left - right);
  return deltas[0] === 1 && deltas[1] === 2 ? 'knight' : 'straight';
}

function defaultLayer(
  annotation: Readonly<RenderableAnnotation>,
): AnnotationLayerName {
  return (
    annotation.layer ??
    (annotation.type === 'arrow' ? 'abovePieces' : 'belowPieces')
  );
}

function squareGeometry(
  annotation: Readonly<RenderableSquareAnnotation>,
  rect: Readonly<BoardCellRect>,
  squareSize: number,
  identity: Readonly<
    Pick<AnnotationGeometryEntry, 'annotationId' | 'isDraft' | 'renderKey'>
  >,
  opacity: number,
): Readonly<SquareAnnotationGeometry> {
  const shape = annotation.shape ?? 'fill';
  const center = point(rect.left + rect.width / 2, rect.top + rect.height / 2);
  const radius =
    shape === 'circle'
      ? squareSize * 0.35
      : shape === 'dot'
        ? squareSize * 0.14
        : 0;

  return Object.freeze({
    annotationId: identity.annotationId,
    center,
    color: annotation.color,
    isDraft: identity.isDraft,
    kind: 'square',
    layer: defaultLayer(annotation),
    opacity,
    radius,
    rect,
    renderKey: identity.renderKey,
    shape,
    strokeWidth: shape === 'border' ? squareSize * 0.08 : 0,
  });
}

/**
 * Project the current controlled annotation collection plus at most one
 * presentation-only draft into one logical SVG coordinate space.
 *
 * Controlled collection order remains stable within each layer. A current
 * draft is appended last in its resolved layer and never gains a persistent
 * consumer annotation ID.
 */
export function computeAnnotationGeometry(options: {
  readonly annotations: readonly Readonly<BoardAnnotation>[];
  readonly draft?: Readonly<AnnotationDraft> | null;
  readonly dimensions: Readonly<BoardDimensions>;
  readonly orientation: BoardOrientation;
  readonly style: Readonly<AnnotationStyle>;
}): Readonly<ComputedAnnotationGeometry> {
  const height =
    (ANNOTATION_VIEW_BOX_WIDTH * options.dimensions.rows) /
    options.dimensions.columns;
  const layout = createBoardSurfaceLayout(
    { height, width: ANNOTATION_VIEW_BOX_WIDTH },
    options.dimensions,
    options.orientation,
  );
  const cells = new Map(layout.cells.map((cell) => [cell.square, cell]));
  const entries: readonly Readonly<AnnotationGeometryEntry>[] = Object.freeze([
    ...options.annotations.map((annotation) =>
      Object.freeze({
        annotation,
        annotationId: annotation.id,
        isDraft: false as const,
        renderKey: `controlled:${annotation.id}`,
      }),
    ),
    ...(options.draft === undefined || options.draft === null
      ? []
      : [
          Object.freeze({
            annotation: options.draft,
            annotationId: null,
            isDraft: true as const,
            renderKey: 'draft' as const,
          }),
        ]),
  ]);
  const belowPieces: Readonly<RenderedAnnotationGeometry>[] = [];
  const abovePieces: Readonly<RenderedAnnotationGeometry>[] = [];

  for (const entry of entries) {
    const annotation = entry.annotation;
    const layer = defaultLayer(annotation);
    const target = layer === 'belowPieces' ? belowPieces : abovePieces;
    if (annotation.type === 'square') {
      const cell = cells.get(annotation.square);
      if (cell !== undefined) {
        target.push(
          squareGeometry(
            annotation,
            cell.rect,
            layout.cellWidth,
            entry,
            entry.isDraft
              ? opacityOr(
                  options.style.activeOpacity,
                  defaultAnnotationStyle.activeOpacity,
                )
              : 1,
          ),
        );
      }
      continue;
    }

    const fromCell = cells.get(annotation.from);
    const toCell = cells.get(annotation.to);
    if (fromCell === undefined || toCell === undefined) {
      continue;
    }
    const from = point(
      fromCell.rect.left + fromCell.rect.width / 2,
      fromCell.rect.top + fromCell.rect.height / 2,
    );
    const to = point(
      toCell.rect.left + toCell.rect.width / 2,
      toCell.rect.top + toCell.rect.height / 2,
    );
    const sameTarget = entries.some(
      (other) =>
        other !== entry &&
        other.annotation.type === 'arrow' &&
        other.annotation.from !== other.annotation.to &&
        other.annotation.to === annotation.to &&
        other.annotation.from !== annotation.from,
    );
    const path = computeArrowPath({
      active: entry.isDraft,
      from,
      ...(annotation.opacity === undefined
        ? {}
        : { opacity: annotation.opacity }),
      sameTarget,
      shape: resolveArrowShape(annotation, options.dimensions),
      squareSize: layout.cellWidth,
      style: options.style,
      to,
      ...(annotation.width === undefined ? {} : { width: annotation.width }),
    });
    if (path !== null) {
      target.push(
        Object.freeze({
          annotationId: entry.annotationId,
          color: annotation.color,
          isDraft: entry.isDraft,
          kind: 'arrow',
          layer,
          renderKey: entry.renderKey,
          ...path,
        }),
      );
    }
  }

  return Object.freeze({
    abovePieces:
      abovePieces.length === 0 ? EMPTY_ANNOTATIONS : Object.freeze(abovePieces),
    belowPieces:
      belowPieces.length === 0 ? EMPTY_ANNOTATIONS : Object.freeze(belowPieces),
    height,
    width: ANNOTATION_VIEW_BOX_WIDTH,
  });
}
