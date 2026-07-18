import {
  projectCurrentAnnotationDraft,
  type CorrelatedAnnotationDraft,
  type CurrentAnnotationDraftSnapshot,
} from '../../src/internal/annotation-draft-presentation';

const draft = Object.freeze({
  color: '#0f0',
  from: 'a1',
  to: 'b2',
  type: 'arrow' as const,
});

const presentation: Readonly<CorrelatedAnnotationDraft> = Object.freeze({
  baseAnnotationRevision: 5,
  basePositionRevision: 7,
  boardId: 'analysis',
  draft,
  geometryEpoch: 11,
  providerGeometryRevision: 13,
  providerLifecycleRevision: 17,
});

const current: Readonly<CurrentAnnotationDraftSnapshot> = Object.freeze({
  annotationRevision: 5,
  boardId: 'analysis',
  geometryEpoch: 11,
  positionRevision: 7,
  providerGeometryRevision: 13,
  providerLifecycleRevision: 17,
});

describe('transient annotation draft projection', () => {
  it('returns the exact draft only while every correlation field is current', () => {
    expect(projectCurrentAnnotationDraft(presentation, current)).toBe(draft);
    expect(projectCurrentAnnotationDraft(null, current)).toBeNull();
  });

  it.each([
    ['board identity', { boardId: 'other' }],
    ['missing board identity', { boardId: null }],
    ['annotation revision', { annotationRevision: 6 }],
    ['missing annotation revision', { annotationRevision: null }],
    ['position revision', { positionRevision: 8 }],
    ['missing position revision', { positionRevision: null }],
    ['local geometry epoch', { geometryEpoch: 12 }],
    ['missing local geometry epoch', { geometryEpoch: null }],
    ['provider geometry revision', { providerGeometryRevision: 14 }],
    ['provider lifecycle revision', { providerLifecycleRevision: 18 }],
  ] as const)('fails closed after a %s mismatch', (_label, mismatch) => {
    expect(
      projectCurrentAnnotationDraft(presentation, {
        ...current,
        ...mismatch,
      }),
    ).toBeNull();
  });

  it('cancels on an annotation no-op revision increase', () => {
    expect(
      projectCurrentAnnotationDraft(presentation, {
        ...current,
        annotationRevision: 6,
      }),
    ).toBeNull();
  });
});
