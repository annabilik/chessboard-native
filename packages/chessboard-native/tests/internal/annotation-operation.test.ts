import {
  createAnnotationOperationEmitter,
  type AnnotationOperationRequest,
} from '../../src/internal/annotation-operation';
import type { AnnotationOperation } from '../../src/public-types';

const CLEAR: Readonly<AnnotationOperationRequest> = Object.freeze({
  annotationIdsAtBase: Object.freeze(['first', 'second']),
  baseAnnotationRevision: 4,
  input: 'policy',
  reason: 'position-change',
  type: 'clear',
});

describe('annotation operation emitter', () => {
  it('allocates distinct board-scoped operation and persistent identities after validation', () => {
    const operations: Readonly<AnnotationOperation>[] = [];
    const emitter = createAnnotationOperationEmitter({
      annotationIdPrefix: 'entity:',
      boardId: 'analysis',
      operationIdPrefix: 'event:',
    });
    const request = {
      annotation: {
        color: '#f00',
        from: 'a1',
        to: 'b2',
        type: 'arrow',
      },
      baseAnnotationRevision: 3,
      input: 'touch',
      type: 'add',
    } as const;

    expect(emitter.emit(request)).toBeNull();
    emitter.setHandler((operation) => operations.push(operation));
    expect(emitter.emit(request)).toBe('event:0');

    expect(operations).toEqual([
      {
        annotation: {
          color: '#f00',
          from: 'a1',
          to: 'b2',
          type: 'arrow',
        },
        annotationId: 'entity:0',
        baseAnnotationRevision: 3,
        boardId: 'analysis',
        input: 'touch',
        operationId: 'event:0',
        type: 'add',
      },
    ]);
    const operation = operations[0];
    if (operation?.type !== 'add') {
      throw new Error('Expected an add operation.');
    }
    expect(Object.isFrozen(operation)).toBe(true);
    expect(Object.isFrozen(operation.annotation)).toBe(true);
    expect(operation.annotation).not.toBe(request.annotation);
  });

  it('copies captured ID sets and ignores callback failures without consuming invalid requests', () => {
    const operations: Readonly<AnnotationOperation>[] = [];
    const emitter = createAnnotationOperationEmitter({
      boardId: 'policy-board',
      nextOperationSequence: 7,
    });
    emitter.setHandler(() => {
      throw new Error('observational failure');
    });
    expect(emitter.emit(CLEAR)).toContain(':7');

    emitter.setHandler((operation) => operations.push(operation));
    expect(
      emitter.emit({
        ...CLEAR,
        baseAnnotationRevision: -1,
      }),
    ).toBeNull();
    expect(emitter.emit(CLEAR)).toContain(':8');

    const operation = operations[0];
    if (operation?.type !== 'clear') {
      throw new Error('Expected a clear operation.');
    }
    expect(operation.annotationIdsAtBase).toEqual(['first', 'second']);
    expect(Object.isFrozen(operation.annotationIdsAtBase)).toBe(true);
    expect(operation.annotationIdsAtBase).not.toBe(CLEAR.annotationIdsAtBase);
  });

  it('snapshots accessor-backed request fields once before validation', () => {
    const operations: Readonly<AnnotationOperation>[] = [];
    const emitter = createAnnotationOperationEmitter({ boardId: 'snapshot' });
    let revisionReads = 0;
    let inputReads = 0;
    const request = {
      annotationIdsAtBase: ['first'],
      get baseAnnotationRevision() {
        revisionReads += 1;
        return revisionReads === 1 ? 6 : -1;
      },
      get input() {
        inputReads += 1;
        return inputReads === 1 ? 'policy' : 'invalid';
      },
      reason: 'position-change',
      type: 'clear',
    } as unknown as AnnotationOperationRequest;
    emitter.setHandler((operation) => operations.push(operation));

    expect(emitter.emit(request)).not.toBeNull();
    expect(revisionReads).toBe(1);
    expect(inputReads).toBe(1);
    expect(operations[0]).toEqual(
      expect.objectContaining({
        baseAnnotationRevision: 6,
        input: 'policy',
      }),
    );
  });

  it('emits the maximum safe sequence once, then remains inert after exhaustion or disposal', () => {
    const operations: Readonly<AnnotationOperation>[] = [];
    const emitter = createAnnotationOperationEmitter({
      boardId: 'bounded',
      nextOperationSequence: Number.MAX_SAFE_INTEGER,
    });
    emitter.setHandler((operation) => operations.push(operation));

    expect(emitter.emit(CLEAR)).toContain(String(Number.MAX_SAFE_INTEGER));
    expect(emitter.emit(CLEAR)).toBeNull();
    expect(operations).toHaveLength(1);

    emitter.dispose();
    emitter.setHandler((operation) => operations.push(operation));
    expect(emitter.emit(CLEAR)).toBeNull();
    expect(operations).toHaveLength(1);
  });

  it('gives independent same-board emitters collision-resistant default identities', () => {
    const first: Readonly<AnnotationOperation>[] = [];
    const second: Readonly<AnnotationOperation>[] = [];
    const firstEmitter = createAnnotationOperationEmitter({
      boardId: 'persisted-board',
    });
    const secondEmitter = createAnnotationOperationEmitter({
      boardId: 'persisted-board',
    });
    const add: Readonly<AnnotationOperationRequest> = Object.freeze({
      annotation: Object.freeze({
        color: '#f00',
        square: 'a1',
        type: 'square' as const,
      }),
      baseAnnotationRevision: 0,
      input: 'touch',
      type: 'add' as const,
    });
    firstEmitter.setHandler((operation) => first.push(operation));
    secondEmitter.setHandler((operation) => second.push(operation));

    expect(firstEmitter.emit(add)).not.toBe(secondEmitter.emit(add));
    const firstOperation = first[0];
    const secondOperation = second[0];
    if (firstOperation?.type !== 'add' || secondOperation?.type !== 'add') {
      throw new Error('Expected two add operations.');
    }
    expect(firstOperation.operationId).not.toBe(secondOperation.operationId);
    expect(firstOperation.annotationId).not.toBe(secondOperation.annotationId);
  });

  it('rejects ambiguous identity prefixes and invalid deterministic options', () => {
    expect(() =>
      createAnnotationOperationEmitter({
        annotationIdPrefix: 'same:',
        boardId: 'invalid',
        operationIdPrefix: 'same:',
      }),
    ).toThrow('must be distinct');
    expect(() =>
      createAnnotationOperationEmitter({
        boardId: '',
      }),
    ).toThrow('boardId');
    expect(() =>
      createAnnotationOperationEmitter({
        boardId: 'invalid',
        nextOperationSequence: -1,
      }),
    ).toThrow('nextOperationSequence');
  });
});
