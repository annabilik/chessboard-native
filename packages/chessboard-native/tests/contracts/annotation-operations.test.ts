import { applyAnnotationOperation } from '../../src/core/annotation-operations';
import type {
  AnnotationOperation,
  ControlledAnnotations,
} from '../../src/public-types';

describe('controlled annotation operation contracts', () => {
  it('[CBN-CONTRACT-011-OPERATION-NONREPLACING] preserves every ID created after a stale operation base', () => {
    const current = {
      revision: 8,
      value: [
        {
          color: '#f00',
          from: 'a1',
          id: 'observed-at-base',
          to: 'a2',
          type: 'arrow',
        },
        {
          color: '#0f0',
          from: 'a1',
          id: 'concurrent-same-geometry',
          to: 'a2',
          type: 'arrow',
        },
        {
          color: '#00f',
          id: 'concurrent-other',
          square: 'e4',
          type: 'square',
        },
      ],
    } as const satisfies ControlledAnnotations;
    const toggle = {
      annotation: { color: '#fff', from: 'a1', to: 'a2', type: 'arrow' },
      annotationId: 'unused-add-id',
      baseAnnotationRevision: 5,
      boardId: 'analysis',
      input: 'touch',
      matchingIdsAtBase: ['observed-at-base'],
      operationId: 'toggle-at-5',
      type: 'toggle',
    } satisfies AnnotationOperation;

    const result = applyAnnotationOperation({
      boardId: 'analysis',
      current,
      operation: toggle,
    });

    expect(result.status).toBe('applied');
    expect(result.next.value.map((annotation) => annotation.id)).toEqual([
      'concurrent-same-geometry',
      'concurrent-other',
    ]);
  });

  it('[CBN-CONTRACT-002-ANNOTATIONS-CANONICAL] returns a candidate without changing the controlled snapshot', () => {
    const current = {
      revision: 2,
      value: [{ color: '#f00', id: 'canonical', square: 'a1', type: 'square' }],
    } as const satisfies ControlledAnnotations;
    const operation = {
      annotation: { color: '#0f0', square: 'b2', type: 'square' },
      annotationId: 'candidate',
      baseAnnotationRevision: 2,
      boardId: 'analysis',
      input: 'accessibility',
      operationId: 'candidate-operation',
      type: 'add',
    } satisfies AnnotationOperation;

    const result = applyAnnotationOperation({
      boardId: 'analysis',
      current,
      operation,
    });

    expect(current).toEqual({
      revision: 2,
      value: [{ color: '#f00', id: 'canonical', square: 'a1', type: 'square' }],
    });
    expect(result.next).not.toBe(current);
    expect(result.next.value.map((annotation) => annotation.id)).toEqual([
      'canonical',
      'candidate',
    ]);
  });
});
