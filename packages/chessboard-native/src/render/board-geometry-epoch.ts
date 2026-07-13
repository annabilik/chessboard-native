import type { BoardOrientation } from '../public-types';

/** Primitive identity of one effective measured board coordinate mapping. */
export interface BoardGeometryEpochMapping {
  readonly columns: number;
  readonly height: number;
  readonly orientation: BoardOrientation;
  readonly rows: number;
  readonly width: number;
}

/**
 * Board-local correlation metadata. A null revision is permanently exhausted
 * and prevents a new geometry from reusing the last safe epoch.
 */
export interface BoardGeometryEpochMetadata {
  readonly mapping: Readonly<BoardGeometryEpochMapping> | null;
  readonly observed: boolean;
  readonly revision: number | null;
}

function validateRevision(revision: number): number {
  if (!Number.isSafeInteger(revision) || revision < 0) {
    throw new RangeError(
      'Initial geometry revision must be a non-negative safe integer.',
    );
  }
  return revision;
}

function copyMapping(
  mapping: Readonly<BoardGeometryEpochMapping>,
): Readonly<BoardGeometryEpochMapping> {
  return Object.freeze({
    columns: mapping.columns,
    height: mapping.height,
    orientation: mapping.orientation,
    rows: mapping.rows,
    width: mapping.width,
  });
}

function mappingsAreEqual(
  left: Readonly<BoardGeometryEpochMapping> | null,
  right: Readonly<BoardGeometryEpochMapping> | null,
): boolean {
  if (left === null || right === null) {
    return left === right;
  }
  return (
    left.columns === right.columns &&
    Object.is(left.height, right.height) &&
    left.orientation === right.orientation &&
    left.rows === right.rows &&
    Object.is(left.width, right.width)
  );
}

/** Create unobserved board-local geometry correlation metadata. */
export function createBoardGeometryEpochMetadata(
  initialRevision = 0,
): Readonly<BoardGeometryEpochMetadata> {
  return Object.freeze({
    mapping: null,
    observed: false,
    revision: validateRevision(initialRevision),
  });
}

/**
 * Correlate one effective mapping without treating object identity as geometry.
 *
 * The first positive mapping consumes the initial revision. Every later size,
 * dimension, orientation, or availability change increments it. Exhaustion
 * returns a null revision permanently so newer geometry fails closed.
 */
export function reconcileBoardGeometryEpoch(
  metadata: Readonly<BoardGeometryEpochMetadata>,
  mapping: Readonly<BoardGeometryEpochMapping> | null,
): Readonly<BoardGeometryEpochMetadata> {
  if (!metadata.observed) {
    if (mapping === null) {
      return metadata;
    }
    return Object.freeze({
      mapping: copyMapping(mapping),
      observed: true,
      revision: metadata.revision,
    });
  }
  if (mappingsAreEqual(metadata.mapping, mapping)) {
    return metadata;
  }
  if (metadata.revision === null) {
    return metadata;
  }

  return Object.freeze({
    mapping: mapping === null ? null : copyMapping(mapping),
    observed: true,
    revision:
      metadata.revision === Number.MAX_SAFE_INTEGER
        ? null
        : metadata.revision + 1,
  });
}
