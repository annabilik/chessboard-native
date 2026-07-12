import { ChessboardError } from '../../src/ChessboardError';
import { AnnotationValidationError } from '../../src/core/annotations';
import { STANDARD_BOARD_DIMENSIONS } from '../../src/core/dimensions';
import { normalizeAnnotationDomain } from '../../src/internal/annotation-domain';
import { createControlledDomainMetadata } from '../../src/internal/controlled-domain';
import { normalizeSelectionDomain } from '../../src/internal/selection-domain';

const dimensions = STANDARD_BOARD_DIMENSIONS;

describe('controlled annotation domain', () => {
  it('[CBN-CONTRACT-002-ANNOTATIONS-CANONICAL] returns only the current normalized collection', () => {
    const first = normalizeAnnotationDomain({
      boardId: 'analysis',
      development: false,
      dimensions,
      input: [
        { color: '#f00', from: 'a1', id: 'first', to: 'a2', type: 'arrow' },
      ],
      previousMetadata: createControlledDomainMetadata(),
    });
    expect(first.ok).toBe(true);
    if (!first.ok) {
      throw first.error;
    }

    const invalid = normalizeAnnotationDomain({
      boardId: 'analysis',
      development: false,
      dimensions,
      input: [
        { color: '#f00', from: 'a1', id: 'same', to: 'a2', type: 'arrow' },
        { color: '#0f0', id: 'same', square: 'e4', type: 'square' },
      ],
      previousMetadata: first.nextMetadata,
    });
    expect(invalid.ok).toBe(false);
    if (invalid.ok) {
      throw new Error('Expected duplicate annotations to fail.');
    }
    expect(invalid.current).toBeNull();
    expect(invalid.nextMetadata).toBe(first.nextMetadata);
    expect(invalid.nextMetadata).not.toHaveProperty('value');

    const recovery = normalizeAnnotationDomain({
      boardId: 'analysis',
      development: false,
      dimensions,
      input: [{ color: '#0f0', id: 'current', square: 'h8', type: 'square' }],
      previousMetadata: invalid.nextMetadata,
    });
    expect(recovery.ok).toBe(true);
    if (!recovery.ok) {
      throw recovery.error;
    }
    expect(recovery.current.revision).toBe(1);
    expect(recovery.current.value).toEqual([
      { color: '#0f0', id: 'current', square: 'h8', type: 'square' },
    ]);
  });

  it('normalizes plain and envelope values with canonical field order', () => {
    const plain = normalizeAnnotationDomain({
      boardId: 'analysis',
      development: true,
      dimensions,
      input: [
        {
          to: 'a2',
          type: 'arrow',
          id: 'line',
          from: 'a1',
          extra: true,
          color: '#f00',
        },
      ],
      previousMetadata: createControlledDomainMetadata(),
    });
    expect(plain.ok).toBe(true);
    if (!plain.ok) {
      throw plain.error;
    }

    const equal = normalizeAnnotationDomain({
      boardId: 'analysis',
      development: true,
      dimensions,
      input: [
        { color: '#f00', from: 'a1', id: 'line', to: 'a2', type: 'arrow' },
      ],
      previousMetadata: plain.nextMetadata,
    });
    expect(equal.ok).toBe(true);
    if (!equal.ok) {
      throw equal.error;
    }
    expect(equal.current.revision).toBe(0);

    const envelope = normalizeAnnotationDomain({
      boardId: 'analysis',
      development: true,
      dimensions,
      input: {
        revision: 8,
        value: [
          { color: '#f00', from: 'a1', id: 'line', to: 'a2', type: 'arrow' },
        ],
      },
      previousMetadata: createControlledDomainMetadata(),
    });
    expect(envelope.ok).toBe(true);
    if (!envelope.ok) {
      throw envelope.error;
    }
    expect(envelope.current.value).toEqual(equal.current.value);
  });

  it('keeps array order semantic and treats arrays as plain even with a revision property', () => {
    const values = [
      { color: '#f00', id: 'a', square: 'a1', type: 'square' as const },
      { color: '#0f0', id: 'b', square: 'b1', type: 'square' as const },
    ];
    const first = normalizeAnnotationDomain({
      boardId: 'analysis',
      development: true,
      dimensions,
      input: values,
      previousMetadata: createControlledDomainMetadata(),
    });
    expect(first.ok).toBe(true);
    if (!first.ok) {
      throw first.error;
    }
    const reordered = normalizeAnnotationDomain({
      boardId: 'analysis',
      development: true,
      dimensions,
      input: [...values].reverse(),
      previousMetadata: first.nextMetadata,
    });
    expect(reordered.ok).toBe(true);
    if (!reordered.ok) {
      throw reordered.error;
    }
    expect(reordered.current.revision).toBe(1);

    const arrayWithRevision = [...values] as typeof values & {
      revision: number;
    };
    arrayWithRevision.revision = 99;
    const plain = normalizeAnnotationDomain({
      boardId: 'analysis',
      development: true,
      dimensions,
      input: arrayWithRevision,
      previousMetadata: createControlledDomainMetadata(),
    });
    expect(plain.ok).toBe(true);
    if (!plain.ok) {
      throw plain.error;
    }
    expect(plain.current).toEqual(
      expect.objectContaining({ revision: 0, tier: 'plain' }),
    );
  });

  it('validates an envelope revision before reading its value', () => {
    let valueReads = 0;
    const input = Object.defineProperties(
      {},
      {
        revision: { value: -1 },
        value: {
          get: () => {
            valueReads += 1;
            return [];
          },
        },
      },
    );
    const result = normalizeAnnotationDomain({
      boardId: 'analysis',
      development: false,
      dimensions,
      input,
      previousMetadata: createControlledDomainMetadata(),
    });
    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error('Expected invalid annotation revision.');
    }
    expect(result.error.code).toBe('INVALID_ANNOTATION_REVISION');
    expect(valueReads).toBe(0);
  });

  it('reads a consumer-thrown validation code only once', () => {
    let codeReads = 0;
    const cause = new Proxy(
      new AnnotationValidationError(
        'Duplicate annotation ID.',
        'DUPLICATE_ANNOTATION_ID',
      ),
      {
        get: (target, property, receiver) => {
          if (property === 'code') {
            codeReads += 1;
            return codeReads === 1
              ? 'DUPLICATE_ANNOTATION_ID'
              : 'UNTRUSTED_CODE';
          }
          return Reflect.get(target, property, receiver) as unknown;
        },
      },
    );
    const input = Object.defineProperties(
      {},
      {
        revision: { value: 1 },
        value: {
          get: () => {
            throw cause;
          },
        },
      },
    );

    const result = normalizeAnnotationDomain({
      boardId: 'analysis',
      development: false,
      dimensions,
      input,
      previousMetadata: createControlledDomainMetadata(),
    });
    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error('Expected consumer-thrown validation failure.');
    }
    expect(result.error.code).toBe('DUPLICATE_ANNOTATION_ID');
    expect(result.error.domain).toBe('annotations');
    expect(codeReads).toBe(1);
  });
});

describe('controlled selection domain', () => {
  it('treats square arrays as sets for plain derived revisions', () => {
    const first = normalizeSelectionDomain({
      boardId: 'analysis',
      development: true,
      dimensions,
      input: {
        destinationSquares: ['h8', 'a1', 'h8'],
        disabledSquares: [],
        selectedSquare: null,
      },
      previousMetadata: createControlledDomainMetadata(),
    });
    expect(first.ok).toBe(true);
    if (!first.ok) {
      throw first.error;
    }

    const equal = normalizeSelectionDomain({
      boardId: 'analysis',
      development: true,
      dimensions,
      input: {
        destinationSquares: ['a1', 'h8'],
        selectedSquare: null,
      },
      previousMetadata: first.nextMetadata,
    });
    expect(equal.ok).toBe(true);
    if (!equal.ok) {
      throw equal.error;
    }
    expect(equal.current.revision).toBe(0);
    expect(equal.current.value).toEqual({
      destinationSquares: ['a1', 'h8'],
      selectedSquare: null,
    });
  });

  it('uses the own inline revision as the revisioned-tier discriminator', () => {
    const controlled = normalizeSelectionDomain({
      boardId: 'analysis',
      development: true,
      dimensions,
      input: {
        destinationSquares: ['e4'],
        revision: 6,
        selectedSquare: 'e2',
      },
      previousMetadata: createControlledDomainMetadata(),
    });
    expect(controlled.ok).toBe(true);
    if (!controlled.ok) {
      throw controlled.error;
    }
    expect(controlled.current).toEqual({
      revision: 6,
      tier: 'envelope',
      value: { destinationSquares: ['e4'], selectedSquare: 'e2' },
    });

    const nestedEnvelope = normalizeSelectionDomain({
      boardId: 'analysis',
      development: false,
      dimensions,
      input: { revision: 7, value: { selectedSquare: null } },
      previousMetadata: controlled.nextMetadata,
    });
    expect(nestedEnvelope.ok).toBe(false);
    if (nestedEnvelope.ok) {
      throw new Error('Expected nested selection envelope to fail.');
    }
    expect(nestedEnvelope.error.code).toBe('INVALID_SELECTION');
  });

  it('validates revision first and preserves selected-field accessor causes', () => {
    let selectedReads = 0;
    const invalidRevision = Object.defineProperties(
      {},
      {
        revision: { value: -1 },
        selectedSquare: {
          get: () => {
            selectedReads += 1;
            return null;
          },
        },
      },
    );
    const revisionResult = normalizeSelectionDomain({
      boardId: 'analysis',
      development: false,
      dimensions,
      input: invalidRevision,
      previousMetadata: createControlledDomainMetadata(),
    });
    expect(revisionResult.ok).toBe(false);
    if (revisionResult.ok) {
      throw new Error('Expected invalid selection revision.');
    }
    expect(revisionResult.error.code).toBe('INVALID_SELECTION_REVISION');
    expect(selectedReads).toBe(0);

    const cause = new Error('selectedSquare failed');
    const invalidValue = Object.defineProperties(
      {},
      {
        revision: { value: 1 },
        selectedSquare: {
          get: () => {
            throw cause;
          },
        },
      },
    );
    const valueResult = normalizeSelectionDomain({
      boardId: 'analysis',
      development: false,
      dimensions,
      input: invalidValue,
      previousMetadata: createControlledDomainMetadata(),
    });
    expect(valueResult.ok).toBe(false);
    if (valueResult.ok) {
      throw new Error('Expected invalid selection value.');
    }
    expect(valueResult.error.code).toBe('INVALID_SELECTION');
    expect(valueResult.error.cause).toBe(cause);
  });

  it('maps hostile tier classification to a typed error', () => {
    const { proxy, revoke } = Proxy.revocable({}, {});
    revoke();
    const result = normalizeSelectionDomain({
      boardId: 'analysis',
      development: false,
      dimensions,
      input: proxy,
      previousMetadata: createControlledDomainMetadata(),
    });
    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error('Expected hostile input to fail.');
    }
    expect(result.error).toBeInstanceOf(ChessboardError);
    expect(result.error.code).toBe('INVALID_SELECTION_REVISION');
    expect(result.error.cause).toBeInstanceOf(TypeError);
  });
});
