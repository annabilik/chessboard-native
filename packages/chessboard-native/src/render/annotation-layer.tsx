import { Fragment, memo, type ReactElement } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Path, Polygon, Rect } from 'react-native-svg';

import type {
  AnnotationLayerName,
  AnnotationPoint,
  ComputedAnnotationGeometry,
  RenderedAnnotationGeometry,
  SquareAnnotationGeometry,
} from './annotation-geometry';

interface AnnotationLayerProps {
  readonly geometry: Readonly<ComputedAnnotationGeometry>;
  readonly layer: AnnotationLayerName;
}

function pathData(points: readonly Readonly<AnnotationPoint>[]): string {
  return points
    .map(
      (current, index) =>
        `${index === 0 ? 'M' : 'L'}${String(current.x)} ${String(current.y)}`,
    )
    .join(' ');
}

function polygonPoints(points: readonly Readonly<AnnotationPoint>[]): string {
  return points
    .map((current) => `${String(current.x)},${String(current.y)}`)
    .join(' ');
}

function annotationTestId(
  annotation: Readonly<RenderedAnnotationGeometry>,
  suffix: string,
): string {
  return annotation.isDraft
    ? `annotation-draft:${suffix}`
    : `annotation:${String(annotation.annotationId)}:${suffix}`;
}

function renderSquare(
  annotation: Readonly<SquareAnnotationGeometry>,
): ReactElement {
  const testID = annotationTestId(annotation, annotation.shape);
  if (annotation.shape === 'circle' || annotation.shape === 'dot') {
    return (
      <Circle
        cx={annotation.center.x}
        cy={annotation.center.y}
        fill={annotation.color}
        key={annotation.renderKey}
        opacity={annotation.opacity}
        r={annotation.radius}
        testID={testID}
      />
    );
  }
  if (annotation.shape === 'border') {
    const inset = annotation.strokeWidth / 2;
    return (
      <Rect
        fill="none"
        height={Math.max(0, annotation.rect.height - annotation.strokeWidth)}
        key={annotation.renderKey}
        opacity={annotation.opacity}
        stroke={annotation.color}
        strokeWidth={annotation.strokeWidth}
        testID={testID}
        transform={`translate(${String(annotation.rect.left + inset)} ${String(annotation.rect.top + inset)})`}
        width={Math.max(0, annotation.rect.width - annotation.strokeWidth)}
      />
    );
  }
  return (
    <Rect
      fill={annotation.color}
      height={annotation.rect.height}
      key={annotation.renderKey}
      opacity={annotation.opacity}
      testID={testID}
      transform={`translate(${String(annotation.rect.left)} ${String(annotation.rect.top)})`}
      width={annotation.rect.width}
    />
  );
}

function renderAnnotation(
  annotation: Readonly<RenderedAnnotationGeometry>,
): ReactElement {
  if (annotation.kind === 'square') {
    return renderSquare(annotation);
  }
  return (
    <Fragment key={annotation.renderKey}>
      <Path
        d={pathData(annotation.points)}
        fill="none"
        opacity={annotation.opacity}
        stroke={annotation.color}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={annotation.strokeWidth}
        testID={annotationTestId(annotation, 'shaft')}
      />
      <Polygon
        fill={annotation.color}
        opacity={annotation.opacity}
        points={polygonPoints(annotation.head)}
        testID={annotationTestId(annotation, 'head')}
      />
    </Fragment>
  );
}

/** Pointerless, accessibility-hidden persistent and transient annotation plane. */
export const AnnotationLayer = memo(function AnnotationLayer({
  geometry,
  layer,
}: AnnotationLayerProps): ReactElement | null {
  const annotations =
    layer === 'belowPieces' ? geometry.belowPieces : geometry.abovePieces;
  if (annotations.length === 0) {
    return null;
  }

  return (
    <View
      accessibilityElementsHidden
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={[
        styles.layer,
        layer === 'belowPieces' ? styles.belowPieces : styles.abovePieces,
      ]}
    >
      <Svg
        accessibilityElementsHidden
        accessible={false}
        height="100%"
        importantForAccessibility="no-hide-descendants"
        pointerEvents="none"
        preserveAspectRatio="none"
        viewBox={`0 0 ${String(geometry.width)} ${String(geometry.height)}`}
        width="100%"
      >
        {annotations.map(renderAnnotation)}
      </Svg>
    </View>
  );
});

const styles = StyleSheet.create({
  abovePieces: {
    zIndex: 30,
  },
  belowPieces: {
    zIndex: 10,
  },
  layer: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
});
