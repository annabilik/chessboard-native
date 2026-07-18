import {
  applyAnnotationOperation,
  findMatchingAnnotationIds,
  type AnnotationOperation,
  type AnnotationPolicies,
  type ApplyAnnotationOperationOptions,
  type ApplyAnnotationOperationResult,
  type ChessboardProps,
  type ControlledAnnotations,
  type OnAnnotationOperation,
} from '../../src/index';

describe('public annotation operation contracts', () => {
  it('exports policy, callback, matching, and controlled reducer types', () => {
    const policies = {
      clearOnBoardPress: true,
      clearOnPositionChange: false,
    } satisfies AnnotationPolicies;
    const current = {
      revision: 4,
      value: [{ color: '#f00', id: 'focus', square: 'e4', type: 'square' }],
    } as const satisfies ControlledAnnotations;
    const operation = {
      annotation: { color: '#0f0', square: 'd4', type: 'square' },
      annotationId: 'generated-focus',
      baseAnnotationRevision: 4,
      boardId: 'analysis',
      input: 'keyboard',
      matchingIdsAtBase: [],
      operationId: 'annotation-operation-1',
      type: 'toggle',
    } satisfies AnnotationOperation;
    const callback: OnAnnotationOperation = (candidate) => {
      expect(candidate).toBe(operation);
    };
    const options = {
      boardId: 'analysis',
      current,
      operation,
    } satisfies ApplyAnnotationOperationOptions;
    const props = {
      annotationPolicies: policies,
      boardId: 'analysis',
      onAnnotationOperation: callback,
      position: {},
    } satisfies ChessboardProps;
    const result: ApplyAnnotationOperationResult =
      applyAnnotationOperation(options);

    callback(operation);
    expect(policies.clearOnBoardPress).toBe(true);
    expect(props.onAnnotationOperation).toBe(callback);
    expect(
      findMatchingAnnotationIds(current.value, operation.annotation),
    ).toEqual([]);
    expect(result.status).toBe('applied');
  });

  it('requires persistent identity for annotation-producing operations', () => {
    const invalidContracts = (): void => {
      // @ts-expect-error Add operations require an explicit persistent annotation ID.
      const missingAddId: AnnotationOperation = {
        annotation: { color: '#f00', square: 'a1', type: 'square' },
        baseAnnotationRevision: 0,
        boardId: 'analysis',
        input: 'touch',
        operationId: 'add-without-id',
        type: 'add',
      };
      const plainCurrent: ApplyAnnotationOperationOptions = {
        boardId: 'analysis',
        // @ts-expect-error Deterministic application requires a revisioned snapshot.
        current: [],
        operation: missingAddId,
      };
      const publicDraftProp: ChessboardProps = {
        // @ts-expect-error Transient drafts are a private mounted presentation seam.
        annotationDraft: {
          color: '#f00',
          square: 'a1',
          type: 'square',
        },
        boardId: 'analysis',
        position: {},
      };
      void plainCurrent;
      void publicDraftProp;
    };

    expect(invalidContracts).toEqual(expect.any(Function));
  });
});
