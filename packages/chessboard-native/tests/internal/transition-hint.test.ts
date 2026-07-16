import { STANDARD_BOARD_DIMENSIONS } from '../../src/core/dimensions';
import { snapshotTransitionHint } from '../../src/internal/transition-hint';

const dimensions = STANDARD_BOARD_DIMENSIONS;

describe('controlled transition hint snapshots', () => {
  it('returns one shared empty result when no hint is supplied', () => {
    const first = snapshotTransitionHint(undefined, dimensions);
    const second = snapshotTransitionHint(undefined, dimensions);

    expect(first).toBe(second);
    expect(first).toEqual({ hint: null, warning: null });
    expect(Object.isFrozen(first)).toBe(true);
  });

  it('reads every public field once and returns detached deeply frozen data', () => {
    const reads = new Map<string, number>();
    const read = <T>(name: string, value: T): T => {
      reads.set(name, (reads.get(name) ?? 0) + 1);
      return value;
    };
    const rookMove = Object.defineProperties(
      {},
      {
        from: {
          enumerable: true,
          get: () => read('rookMove.from', 'h1'),
        },
        to: {
          enumerable: true,
          get: () => read('rookMove.to', 'f1'),
        },
      },
    );
    const input = Object.defineProperties(
      {},
      {
        capturedSquare: {
          enumerable: true,
          get: () => read('capturedSquare', 'd5'),
        },
        from: {
          enumerable: true,
          get: () => read('from', 'e5'),
        },
        fromRevision: {
          enumerable: true,
          get: () => read('fromRevision', 4),
        },
        promotion: {
          enumerable: true,
          get: () => {
            read('promotion', undefined);
            return undefined;
          },
        },
        rookMove: {
          enumerable: true,
          get: () => read('rookMove', rookMove),
        },
        to: {
          enumerable: true,
          get: () => read('to', 'd6'),
        },
        toRevision: {
          enumerable: true,
          get: () => read('toRevision', 5),
        },
      },
    );

    const result = snapshotTransitionHint(input, dimensions);

    expect([...reads.entries()].sort()).toEqual([
      ['capturedSquare', 1],
      ['from', 1],
      ['fromRevision', 1],
      ['promotion', 1],
      ['rookMove', 1],
      ['rookMove.from', 1],
      ['rookMove.to', 1],
      ['to', 1],
      ['toRevision', 1],
    ]);
    expect(result.warning).toBeNull();
    expect(result.hint).toEqual({
      capturedSquare: 'd5',
      from: 'e5',
      fromRevision: 4,
      rookMove: { from: 'h1', to: 'f1' },
      to: 'd6',
      toRevision: 5,
    });
    expect(result.hint).not.toBe(input);
    expect(result.hint?.rookMove).not.toBe(rookMove);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.hint)).toBe(true);
    expect(Object.isFrozen(result.hint?.rookMove)).toBe(true);
  });

  const malformedCases: readonly (readonly [unknown, string])[] = [
    ['a non-object hint', 'transition'],
    [
      {
        from: 'A1',
        fromRevision: 1,
        to: 'a2',
        toRevision: 2,
      },
      'Square',
    ],
    [
      {
        from: 'a1',
        fromRevision: 1,
        rookMove: { from: 'h1', to: 'h1' },
        to: 'a2',
        toRevision: 2,
      },
      'rookMove',
    ],
  ];

  it.each(malformedCases)(
    'degrades malformed input %# to a warning',
    (input, messagePart) => {
      const result = snapshotTransitionHint(input, dimensions);

      expect(result.hint).toBeNull();
      expect(result.warning?.code).toBe('malformed');
      expect(result.warning?.message).toContain(messagePart);
      expect(Object.isFrozen(result.warning)).toBe(true);
    },
  );

  it('contains hostile accessors without rethrowing their error values', () => {
    const input = Object.defineProperties(
      {},
      {
        from: {
          enumerable: true,
          get: () => {
            throw Object.create(null);
          },
        },
        fromRevision: { enumerable: true, value: 1 },
        to: { enumerable: true, value: 'a2' },
        toRevision: { enumerable: true, value: 2 },
      },
    );

    expect(snapshotTransitionHint(input, dimensions)).toEqual({
      hint: null,
      warning: {
        code: 'malformed',
        message: 'Board transition could not be read.',
      },
    });
  });
});
