import type { AnnotationDraft, Revision } from '../public-types';

/**
 * Presentation-only annotation candidate captured from one exact board state.
 *
 * This value may be retained by a future gesture adapter, but it is never part
 * of the normalized board model or the consumer-owned annotation collection.
 */
export interface CorrelatedAnnotationDraft {
  readonly boardId: string;
  readonly baseAnnotationRevision: Revision;
  readonly basePositionRevision: Revision;
  readonly geometryEpoch: Revision;
  readonly providerGeometryRevision: Revision;
  readonly providerLifecycleRevision: Revision;
  readonly draft: Readonly<AnnotationDraft>;
}

/** Commit-current values that decide whether a transient draft may be painted. */
export interface CurrentAnnotationDraftSnapshot {
  readonly boardId: string | null;
  readonly annotationRevision: Revision | null;
  readonly positionRevision: Revision | null;
  readonly geometryEpoch: Revision | null;
  readonly providerGeometryRevision: Revision;
  readonly providerLifecycleRevision: Revision;
}

/**
 * Fail-closed render projection for one transient annotation draft.
 *
 * The synchronous check prevents a stale draft from appearing for even one
 * committed frame while a mounted controller schedules its later cleanup.
 */
export function projectCurrentAnnotationDraft(
  presentation: Readonly<CorrelatedAnnotationDraft> | null,
  current: Readonly<CurrentAnnotationDraftSnapshot>,
): Readonly<AnnotationDraft> | null {
  if (
    presentation === null ||
    current.boardId === null ||
    current.annotationRevision === null ||
    current.positionRevision === null ||
    current.geometryEpoch === null ||
    presentation.boardId !== current.boardId ||
    presentation.baseAnnotationRevision !== current.annotationRevision ||
    presentation.basePositionRevision !== current.positionRevision ||
    presentation.geometryEpoch !== current.geometryEpoch ||
    presentation.providerGeometryRevision !==
      current.providerGeometryRevision ||
    presentation.providerLifecycleRevision !== current.providerLifecycleRevision
  ) {
    return null;
  }

  return presentation.draft;
}
