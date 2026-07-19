import type { Revision, SquareId } from '../public-types';

/** Canonical identity for one installed native board recognizer graph. */
export function createBoardGestureDetectorKey(options: {
  readonly activationDistance: number;
  readonly annotationEnabled: boolean;
  readonly boardId: string;
  readonly dragEnabled: boolean;
  readonly draggableSquares: readonly SquareId[];
  readonly geometryRevision: Revision;
  readonly positionRevision: Revision;
  readonly resetKey: string;
  readonly selectionRevision: Revision | null;
  readonly tapEnabled: boolean;
  readonly trackDragTarget: boolean;
  readonly trackPress: boolean;
}): string {
  return JSON.stringify([
    options.activationDistance,
    options.annotationEnabled,
    options.boardId,
    options.dragEnabled,
    options.draggableSquares,
    options.geometryRevision,
    options.positionRevision,
    options.resetKey,
    options.selectionRevision,
    options.tapEnabled,
    options.trackDragTarget,
    options.trackPress,
  ]);
}
