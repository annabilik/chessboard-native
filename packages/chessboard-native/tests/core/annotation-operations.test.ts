import {
  applyAnnotationOperation,
  findMatchingAnnotationIds,
} from '../../src/core/annotation-operations';
import type {
  AnnotationDraft,
  AnnotationOperation,
  BoardAnnotation,
  ControlledAnnotations,
} from '../../src/public-types';

const boardId = 'analysis';

function snapshot(
  revision: number,
  value: readonly BoardAnnotation[],
): ControlledAnnotations {
  return { revision, value };
}

function operationBase(baseAnnotationRevision: number) {
  return {
    baseAnnotationRevision,
    boardId,
    input: 'touch' as const,
    operationId: `operation-${String(baseAnnotationRevision)}`,
  };
}

function requireApplied(
  result: ReturnType<typeof applyAnnotationOperation>,
): Extract<typeof result, { readonly status: 'applied' }> {
  expect(result.status).toBe('applied');
  if (result.status !== 'applied') {
    throw new Error(`Expected applied result, received ${result.status}.`);
  }
  return result;
}

describe('controlled annotation operations', () => {
  it('finds every deterministic geometry match in base collection order', () => {
    const annotations = [
      {
        color: '#f00',
        from: 'a1',
        id: 'first-arrow',
        layer: 'belowPieces',
        opacity: 0.2,
        shape: 'straight',
        to: 'b2',
        type: 'arrow',
        width: 12,
      },
      {
        color: '#0f0',
        from: 'a1',
        id: 'second-arrow',
        shape: 'knight',
        to: 'b2',
        type: 'arrow',
      },
      {
        color: '#00f',
        from: 'b2',
        id: 'reverse-arrow',
        to: 'a1',
        type: 'arrow',
      },
      {
        color: '#ff0',
        id: 'first-square',
        shape: 'dot',
        square: 'e4',
        type: 'square',
      },
      {
        color: '#fff',
        id: 'second-square',
        shape: 'border',
        square: 'e4',
        type: 'square',
      },
    ] as const satisfies readonly BoardAnnotation[];

    const arrowMatches = findMatchingAnnotationIds(annotations, {
      color: '#different',
      from: 'a1',
      layer: 'abovePieces',
      to: 'b2',
      type: 'arrow',
    });
    const squareMatches = findMatchingAnnotationIds(annotations, {
      color: '#different',
      shape: 'fill',
      square: 'e4',
      type: 'square',
    });

    expect(arrowMatches).toEqual(['first-arrow', 'second-arrow']);
    expect(squareMatches).toEqual(['first-square', 'second-square']);
    expect(Object.isFrozen(arrowMatches)).toBe(true);
    expect(Object.isFrozen(squareMatches)).toBe(true);
  });

  it('appends a detached annotation and increments only the latest revision', () => {
    const retained = {
      color: '#f00',
      id: 'retained',
      square: 'a1',
      type: 'square' as const,
    };
    const current = snapshot(7, [retained]);
    const draft = {
      color: '#0f0',
      from: 'b1',
      opacity: 0.4,
      to: 'c3',
      type: 'arrow' as const,
      width: 16,
    } satisfies AnnotationDraft;
    const operation = {
      ...operationBase(7),
      annotation: draft,
      annotationId: 'generated-arrow',
      type: 'add',
    } satisfies AnnotationOperation;

    const result = requireApplied(
      applyAnnotationOperation({ boardId, current, operation }),
    );

    expect(result.stale).toBe(false);
    expect(result.next).toEqual({
      revision: 8,
      value: [
        retained,
        {
          color: '#0f0',
          from: 'b1',
          id: 'generated-arrow',
          opacity: 0.4,
          to: 'c3',
          type: 'arrow',
          width: 16,
        },
      ],
    });
    expect(result.next).not.toBe(current);
    expect(result.next.value[0]).not.toBe(retained);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.next)).toBe(true);
    expect(Object.isFrozen(result.next.value)).toBe(true);
    expect(result.next.value.every(Object.isFrozen)).toBe(true);
    retained.color = '#changed';
    draft.color = '#changed';
    expect(result.next.value.map((item) => item.color)).toEqual([
      '#f00',
      '#0f0',
    ]);
  });

  it('makes add and toggle-add replay idempotent and rejects ID conflicts', () => {
    const current = snapshot(3, [
      {
        color: '#f00',
        from: 'a1',
        id: 'generated',
        to: 'a2',
        type: 'arrow',
      },
    ]);
    const add = {
      ...operationBase(2),
      annotation: {
        color: '#f00',
        from: 'a1',
        to: 'a2',
        type: 'arrow',
      },
      annotationId: 'generated',
      type: 'add',
    } satisfies AnnotationOperation;
    const toggleAdd = {
      ...add,
      matchingIdsAtBase: [],
      operationId: 'toggle-replay',
      type: 'toggle',
    } satisfies AnnotationOperation;

    for (const operation of [add, toggleAdd]) {
      const replay = applyAnnotationOperation({ boardId, current, operation });
      expect(replay).toEqual({
        next: current,
        stale: true,
        status: 'unchanged',
      });
      expect(replay.next).toBe(current);
    }

    const conflict = applyAnnotationOperation({
      boardId,
      current,
      operation: {
        ...add,
        annotation: { ...add.annotation, color: '#0f0' },
        operationId: 'conflicting-add',
      },
    });
    expect(conflict).toEqual({
      next: current,
      reason: 'annotation-id-conflict',
      status: 'rejected',
    });
    expect(conflict.next).toBe(current);
  });

  it('[PARITY-BEHAVIOR-B37] applies stale toggle removal only to IDs captured at its base', () => {
    const current = snapshot(9, [
      { color: '#111', id: 'base-survivor', square: 'a1', type: 'square' },
      {
        color: '#222',
        from: 'a1',
        id: 'base-match-still-present',
        to: 'a2',
        type: 'arrow',
      },
      {
        color: '#333',
        from: 'a1',
        id: 'concurrent-geometric-match',
        to: 'a2',
        type: 'arrow',
      },
      { color: '#444', id: 'concurrent-other', square: 'h8', type: 'square' },
    ]);
    const operation = {
      ...operationBase(6),
      annotation: { color: '#f00', from: 'a1', to: 'a2', type: 'arrow' },
      annotationId: 'unused-toggle-add-id',
      matchingIdsAtBase: [
        'base-match-already-gone',
        'base-match-still-present',
      ],
      type: 'toggle',
    } satisfies AnnotationOperation;

    const result = requireApplied(
      applyAnnotationOperation({ boardId, current, operation }),
    );

    expect(result.stale).toBe(true);
    expect(result.next.revision).toBe(10);
    expect(result.next.value.map((annotation) => annotation.id)).toEqual([
      'base-survivor',
      'concurrent-geometric-match',
      'concurrent-other',
    ]);
  });

  it('never converts a stale toggle-remove into an add after all base IDs disappear', () => {
    const current = snapshot(5, [
      { color: '#0f0', id: 'concurrent', square: 'e4', type: 'square' },
    ]);
    const operation = {
      ...operationBase(3),
      annotation: { color: '#f00', square: 'e4', type: 'square' },
      annotationId: 'must-not-be-added',
      matchingIdsAtBase: ['base-id-now-gone'],
      type: 'toggle',
    } satisfies AnnotationOperation;

    const result = applyAnnotationOperation({ boardId, current, operation });

    expect(result).toEqual({ next: current, stale: true, status: 'unchanged' });
    expect(result.next).toBe(current);
  });

  it('keeps a concurrent geometry match when a stale toggle was an add at base', () => {
    const current = snapshot(5, [
      {
        color: '#0f0',
        from: 'a1',
        id: 'concurrent',
        to: 'a2',
        type: 'arrow',
      },
    ]);
    const operation = {
      ...operationBase(3),
      annotation: { color: '#f00', from: 'a1', to: 'a2', type: 'arrow' },
      annotationId: 'base-toggle-add',
      matchingIdsAtBase: [],
      type: 'toggle',
    } satisfies AnnotationOperation;

    const result = requireApplied(
      applyAnnotationOperation({ boardId, current, operation }),
    );

    expect(result.stale).toBe(true);
    expect(result.next.value.map((annotation) => annotation.id)).toEqual([
      'concurrent',
      'base-toggle-add',
    ]);
  });

  it('applies stale clear and remove operations as exact ID filters', () => {
    const current = snapshot(12, [
      { color: '#100', id: 'base-clear', square: 'a1', type: 'square' },
      { color: '#200', id: 'base-remove', square: 'b1', type: 'square' },
      { color: '#300', id: 'concurrent', square: 'c1', type: 'square' },
    ]);
    const clear = {
      ...operationBase(10),
      annotationIdsAtBase: ['base-clear', 'already-gone'],
      input: 'policy',
      reason: 'position-change',
      type: 'clear',
    } satisfies AnnotationOperation;
    const afterClear = requireApplied(
      applyAnnotationOperation({ boardId, current, operation: clear }),
    );
    expect(afterClear.next.value.map((annotation) => annotation.id)).toEqual([
      'base-remove',
      'concurrent',
    ]);

    const remove = {
      ...operationBase(13),
      annotationId: 'base-remove',
      operationId: 'remove-operation',
      type: 'remove',
    } satisfies AnnotationOperation;
    const afterRemove = requireApplied(
      applyAnnotationOperation({
        boardId,
        current: afterClear.next,
        operation: remove,
      }),
    );
    expect(afterRemove.next.value.map((annotation) => annotation.id)).toEqual([
      'concurrent',
    ]);
  });

  it('rejects wrong-board and future-base operations without changing current', () => {
    const current = snapshot(4, []);
    const operation = {
      ...operationBase(4),
      annotation: { color: '#f00', square: 'a1', type: 'square' },
      annotationId: 'new-square',
      type: 'add',
    } satisfies AnnotationOperation;

    const wrongBoard = applyAnnotationOperation({
      boardId: 'other-board',
      current,
      operation,
    });
    const future = applyAnnotationOperation({
      boardId,
      current,
      operation: { ...operation, baseAnnotationRevision: 5 },
    });

    expect(wrongBoard).toEqual({
      next: current,
      reason: 'board-mismatch',
      status: 'rejected',
    });
    expect(future).toEqual({
      next: current,
      reason: 'future-base',
      status: 'rejected',
    });
    expect(wrongBoard.next).toBe(current);
    expect(future.next).toBe(current);
  });

  it('rejects revision overflow only when an operation would mutate state', () => {
    const current = snapshot(Number.MAX_SAFE_INTEGER, [
      { color: '#f00', id: 'existing', square: 'a1', type: 'square' },
    ]);
    const removal = {
      ...operationBase(Number.MAX_SAFE_INTEGER),
      annotationId: 'existing',
      type: 'remove',
    } satisfies AnnotationOperation;
    const noOp = {
      ...removal,
      annotationId: 'missing',
    } satisfies AnnotationOperation;

    expect(
      applyAnnotationOperation({ boardId, current, operation: removal }),
    ).toEqual({
      next: current,
      reason: 'revision-overflow',
      status: 'rejected',
    });
    expect(
      applyAnnotationOperation({ boardId, current, operation: noOp }),
    ).toEqual({
      next: current,
      stale: false,
      status: 'unchanged',
    });
  });

  it('snapshots accessor-backed IDs and current state before reducing', () => {
    let annotationIdReads = 0;
    const toggle = {
      ...operationBase(0),
      annotation: { color: '#f00', square: 'a1', type: 'square' as const },
      get annotationId(): string {
        annotationIdReads += 1;
        return annotationIdReads === 1 ? 'candidate' : '';
      },
      matchingIdsAtBase: [],
      type: 'toggle' as const,
    } satisfies AnnotationOperation;
    const toggled = requireApplied(
      applyAnnotationOperation({
        boardId,
        current: snapshot(0, []),
        operation: toggle,
      }),
    );

    expect(annotationIdReads).toBe(1);
    expect(toggled.next.value).toEqual([
      { color: '#f00', id: 'candidate', square: 'a1', type: 'square' },
    ]);

    let revisionReads = 0;
    let valueReads = 0;
    const changingCurrent = {
      get revision(): number {
        revisionReads += 1;
        return revisionReads < 3
          ? Number.MAX_SAFE_INTEGER - 1
          : Number.MAX_SAFE_INTEGER;
      },
      get value(): readonly BoardAnnotation[] {
        valueReads += 1;
        return [];
      },
    } satisfies ControlledAnnotations;
    const added = requireApplied(
      applyAnnotationOperation({
        boardId,
        current: changingCurrent,
        operation: {
          ...operationBase(Number.MAX_SAFE_INTEGER - 1),
          annotation: { color: '#0f0', square: 'b2', type: 'square' },
          annotationId: 'maximum-revision',
          type: 'add',
        },
      }),
    );

    expect(revisionReads).toBe(1);
    expect(valueReads).toBe(1);
    expect(added.next.revision).toBe(Number.MAX_SAFE_INTEGER);
  });

  it('rejects malformed correlation values before reducing typed deltas', () => {
    const current = snapshot(1, []);
    const operation = {
      ...operationBase(1),
      annotation: { color: '#f00', square: 'a1', type: 'square' },
      annotationId: 'new-square',
      type: 'add',
    } satisfies AnnotationOperation;

    expect(() =>
      applyAnnotationOperation({
        boardId,
        current: { ...current, revision: -1 },
        operation,
      }),
    ).toThrow(/current\.revision/u);
    expect(() =>
      applyAnnotationOperation({
        boardId,
        current,
        operation: { ...operation, operationId: '' },
      }),
    ).toThrow(/operation\.operationId/u);
    expect(() =>
      applyAnnotationOperation({
        boardId,
        current,
        operation: { ...operation, annotationId: '' },
      }),
    ).toThrow(/operation\.annotationId/u);
  });

  it('rejects malformed destructive ID lists and unknown runtime discriminants', () => {
    const current = snapshot(1, []);
    const toggle = {
      ...operationBase(1),
      annotation: { color: '#f00', square: 'a1', type: 'square' },
      annotationId: 'new-square',
      matchingIdsAtBase: [''],
      type: 'toggle',
    } satisfies AnnotationOperation;

    expect(() =>
      applyAnnotationOperation({ boardId, current, operation: toggle }),
    ).toThrow(/matchingIdsAtBase/u);
    expect(() =>
      applyAnnotationOperation({
        boardId,
        current,
        operation: {
          ...operationBase(1),
          annotationIdsAtBase: [''],
          input: 'policy',
          reason: 'consumer-action',
          type: 'clear',
        },
      }),
    ).toThrow(/annotationIdsAtBase/u);
    expect(() =>
      applyAnnotationOperation({
        boardId,
        current,
        operation: {
          ...toggle,
          matchingIdsAtBase: null,
        } as unknown as AnnotationOperation,
      }),
    ).toThrow(/matchingIdsAtBase/u);
    expect(() =>
      applyAnnotationOperation({
        boardId,
        current,
        operation: {
          ...toggle,
          matchingIdsAtBase: [],
          type: 'unknown',
        } as unknown as AnnotationOperation,
      }),
    ).toThrow(/operation\.type/u);
    expect(() =>
      findMatchingAnnotationIds([], {
        type: 'unknown',
      } as unknown as AnnotationDraft),
    ).toThrow(/draft\.type/u);
  });
});
