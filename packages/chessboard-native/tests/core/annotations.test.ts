import {
  AnnotationValidationError,
  normalizeAnnotationsInput,
} from '../../src/core/annotations';
import { STANDARD_BOARD_DIMENSIONS } from '../../src/core/dimensions';

const dimensions = STANDARD_BOARD_DIMENSIONS;

function captureValidationError(operation: () => unknown) {
  try {
    operation();
  } catch (error) {
    expect(error).toBeInstanceOf(AnnotationValidationError);
    if (error instanceof AnnotationValidationError) {
      return error;
    }
    throw error;
  }
  throw new Error('Expected annotation validation to fail.');
}

describe('annotation normalization', () => {
  it('creates detached, deeply frozen snapshots and discards extra fields', () => {
    const source = [
      {
        color: '#f00',
        extra: 'discarded',
        from: 'a1',
        id: 'attack',
        layer: 'abovePieces',
        opacity: 0.5,
        shape: 'knight',
        to: 'b3',
        type: 'arrow',
        width: 4,
      },
      {
        color: '#0f0',
        id: 'focus',
        shape: 'border',
        square: 'e4',
        type: 'square',
      },
    ];

    const normalized = normalizeAnnotationsInput(source, dimensions);

    expect(normalized).toEqual([
      {
        color: '#f00',
        from: 'a1',
        id: 'attack',
        layer: 'abovePieces',
        opacity: 0.5,
        shape: 'knight',
        to: 'b3',
        type: 'arrow',
        width: 4,
      },
      {
        color: '#0f0',
        id: 'focus',
        shape: 'border',
        square: 'e4',
        type: 'square',
      },
    ]);
    expect(normalized).not.toBe(source);
    expect(Object.isFrozen(normalized)).toBe(true);
    expect(normalized.every(Object.isFrozen)).toBe(true);
    const firstSource = source[0];
    if (firstSource === undefined) {
      throw new Error('Expected source annotation.');
    }
    firstSource.color = '#00f';
    expect(normalized[0]?.color).toBe('#f00');
  });

  it('requires exact, non-empty, case-sensitive unique IDs', () => {
    const empty = captureValidationError(() =>
      normalizeAnnotationsInput(
        [{ color: '#f00', from: 'a1', id: '', to: 'a2', type: 'arrow' }],
        dimensions,
      ),
    );
    expect(empty.code).toBe('INVALID_ANNOTATIONS');

    const duplicate = captureValidationError(() =>
      normalizeAnnotationsInput(
        [
          { color: '#f00', id: 'mark', square: 'a1', type: 'square' },
          { color: '#0f0', id: 'mark', square: 'a2', type: 'square' },
        ],
        dimensions,
      ),
    );
    expect(duplicate.code).toBe('DUPLICATE_ANNOTATION_ID');

    expect(() =>
      normalizeAnnotationsInput(
        [
          { color: '#f00', id: 'mark', square: 'a1', type: 'square' },
          { color: '#0f0', id: 'Mark', square: 'a2', type: 'square' },
        ],
        dimensions,
      ),
    ).not.toThrow();
  });

  it.each([
    [{ color: '#f00', from: 'A1', id: 'x', to: 'a2', type: 'arrow' }],
    [
      {
        color: '#f00',
        from: 'a1',
        id: 'x',
        opacity: 1.1,
        to: 'a2',
        type: 'arrow',
      },
    ],
    [{ color: '#f00', from: 'a1', id: 'x', to: 'a2', type: 'arrow', width: 0 }],
    [{ color: '#f00', id: 'x', square: 'a1', type: 'circle' }],
  ])('rejects malformed annotation fields atomically', (annotation) => {
    expect(() => normalizeAnnotationsInput(annotation, dimensions)).toThrow(
      AnnotationValidationError,
    );
  });

  it('reads indexed array snapshots instead of consumer-overridable iterators', () => {
    const annotation = {
      color: '#f00',
      id: 'indexed',
      square: 'a1',
      type: 'square',
    };
    const source = [annotation];
    Object.defineProperty(source, 'entries', {
      value: () => [][Symbol.iterator](),
    });

    expect(normalizeAnnotationsInput(source, dimensions)).toEqual([annotation]);

    const sparse = new Array(1);
    Object.setPrototypeOf(sparse, { 0: annotation });
    expect(() => normalizeAnnotationsInput(sparse, dimensions)).toThrow(
      /hole/u,
    );
  });
});
