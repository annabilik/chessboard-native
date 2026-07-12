import { ChessboardError } from '../../src/ChessboardError';
import type { Revision } from '../../src/public-types';
import {
  createControlledDomainMetadata,
  normalizeControlledDomain,
  type ClassifiedControlledValue,
  type ControlledDomain,
  type ControlledDomainAdapter,
  type ControlledDomainMetadata,
  type ControlledDomainResult,
} from '../../src/internal/controlled-domain';

function classify(input: unknown): ClassifiedControlledValue {
  if (
    typeof input === 'object' &&
    input !== null &&
    !Array.isArray(input) &&
    Object.hasOwn(input, 'revision')
  ) {
    const envelope = input as Record<string, unknown>;
    return {
      readRevision: () => envelope['revision'],
      readValue: () => envelope['value'],
      tier: 'envelope',
    };
  }
  return { readValue: () => input, tier: 'plain' };
}

function createValueError(
  domain: ControlledDomain,
  error: unknown,
  boardId: string | null,
  revision: Revision,
): ChessboardError {
  const message = error instanceof Error ? error.message : 'Invalid value.';
  switch (domain) {
    case 'position':
      return new ChessboardError(
        message,
        { boardId, code: 'INVALID_POSITION', revision },
        error,
      );
    case 'annotations':
      return new ChessboardError(
        message,
        { boardId, code: 'INVALID_ANNOTATIONS', revision },
        error,
      );
    case 'selection':
      return new ChessboardError(
        message,
        { boardId, code: 'INVALID_SELECTION', revision },
        error,
      );
  }
}

function adapterFor(domain: ControlledDomain): ControlledDomainAdapter<string> {
  return {
    classify,
    comparisonToken: (value) => JSON.stringify(value),
    createValueError: (error, context) =>
      createValueError(domain, error, context.boardId, context.revision),
    normalizeValue: (value) => {
      if (typeof value !== 'string') {
        throw new TypeError('Value must be a string.');
      }
      return value;
    },
  };
}

function normalize(
  domain: ControlledDomain,
  input: unknown,
  previousMetadata: ControlledDomainMetadata,
  development = false,
): ControlledDomainResult<string> {
  return normalizeControlledDomain({
    adapter: adapterFor(domain),
    boardId: 'analysis',
    development,
    domain,
    input,
    previousMetadata,
  });
}

function expectCurrent(
  result: ControlledDomainResult<string>,
): asserts result is Extract<ControlledDomainResult<string>, { ok: true }> {
  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw result.error;
  }
}

function expectFailure(
  result: ControlledDomainResult<string>,
): asserts result is Extract<ControlledDomainResult<string>, { ok: false }> {
  expect(result.ok).toBe(false);
  if (result.ok) {
    throw new Error('Expected controlled-domain normalization to fail.');
  }
}

function captureChessboardError(operation: () => unknown): ChessboardError {
  try {
    operation();
  } catch (error) {
    expect(error).toBeInstanceOf(ChessboardError);
    if (error instanceof ChessboardError) {
      return error;
    }
    throw error;
  }
  throw new Error('Expected a ChessboardError.');
}

describe('controlled-domain normalization', () => {
  it('derives revisions only when a plain semantic value changes', () => {
    const first = normalize(
      'position',
      'alpha',
      createControlledDomainMetadata(),
    );
    expectCurrent(first);
    expect(first.current).toEqual({
      revision: 0,
      tier: 'plain',
      value: 'alpha',
    });

    const equal = normalize('position', 'alpha', first.nextMetadata);
    expectCurrent(equal);
    expect(equal.current.revision).toBe(0);

    const changed = normalize('position', 'beta', equal.nextMetadata);
    expectCurrent(changed);
    expect(changed.current).toEqual({
      revision: 1,
      tier: 'plain',
      value: 'beta',
    });
  });

  it('does not consume a derived revision for an invalid plain attempt', () => {
    const first = normalize(
      'position',
      'alpha',
      createControlledDomainMetadata(),
    );
    expectCurrent(first);

    const invalid = normalize('position', 42, first.nextMetadata);
    expectFailure(invalid);
    expect(invalid.current).toBeNull();
    expect(invalid.error.code).toBe('INVALID_POSITION');
    expect(invalid.error.revision).toBe(1);
    expect(invalid.nextMetadata).toBe(first.nextMetadata);

    const equalRecovery = normalize('position', 'alpha', invalid.nextMetadata);
    expectCurrent(equalRecovery);
    expect(equalRecovery.current.revision).toBe(0);

    const changedRecovery = normalize('position', 'beta', invalid.nextMetadata);
    expectCurrent(changedRecovery);
    expect(changedRecovery.current.revision).toBe(1);
  });

  it('accepts monotonic envelopes and explicit no-op invalidations', () => {
    const first = normalize(
      'position',
      { revision: 7, value: 'alpha' },
      createControlledDomainMetadata(),
      true,
    );
    expectCurrent(first);
    expect(first.current.revision).toBe(7);

    const same = normalize(
      'position',
      { revision: 7, value: 'alpha' },
      first.nextMetadata,
      true,
    );
    expectCurrent(same);

    const invalidation = normalize(
      'position',
      { revision: 8, value: 'alpha' },
      same.nextMetadata,
      true,
    );
    expectCurrent(invalidation);
    expect(invalidation.current.revision).toBe(8);

    const changed = normalize(
      'position',
      { revision: 9, value: 'beta' },
      invalidation.nextMetadata,
      true,
    );
    expectCurrent(changed);
    expect(changed.current.value).toBe('beta');
  });

  it('rejects lower revisions in both runtimes', () => {
    const first = normalize(
      'annotations',
      { revision: 5, value: 'alpha' },
      createControlledDomainMetadata(),
    );
    expectCurrent(first);

    const production = normalize(
      'annotations',
      { revision: 4, value: 'alpha' },
      first.nextMetadata,
    );
    expectFailure(production);
    expect(production.error.code).toBe('INVALID_ANNOTATION_REVISION');
    expect(production.error.revision).toBe(4);
    expect(production.nextMetadata).toBe(first.nextMetadata);

    expect(() =>
      normalize(
        'annotations',
        { revision: 4, value: 'alpha' },
        first.nextMetadata,
        true,
      ),
    ).toThrow(ChessboardError);
  });

  it('detects same-revision mutation only in development', () => {
    const first = normalize(
      'position',
      { revision: 3, value: 'alpha' },
      createControlledDomainMetadata(),
      true,
    );
    expectCurrent(first);

    const error = captureChessboardError(() =>
      normalize(
        'position',
        { revision: 3, value: 'beta' },
        first.nextMetadata,
        true,
      ),
    );
    expect(error.code).toBe('INVALID_POSITION_REVISION');
    expect(error.revision).toBe(3);

    const production = normalize(
      'position',
      { revision: 3, value: 'beta' },
      first.nextMetadata,
    );
    expectCurrent(production);
    expect(production.current.value).toBe('beta');
    expect(production.nextMetadata).toBe(first.nextMetadata);
  });

  it('skips prior-value comparison for same-revision production envelopes', () => {
    let comparisonCalls = 0;
    const adapter = adapterFor('position');
    const countingAdapter: ControlledDomainAdapter<string> = {
      ...adapter,
      comparisonToken: (value) => {
        comparisonCalls += 1;
        return JSON.stringify(value);
      },
    };
    const first = normalizeControlledDomain({
      adapter: countingAdapter,
      boardId: 'analysis',
      development: false,
      domain: 'position',
      input: { revision: 3, value: 'alpha' },
      previousMetadata: createControlledDomainMetadata(),
    });
    expectCurrent(first);
    expect(comparisonCalls).toBe(1);

    const sameRevision = normalizeControlledDomain({
      adapter: countingAdapter,
      boardId: 'analysis',
      development: false,
      domain: 'position',
      input: { revision: 3, value: 'beta' },
      previousMetadata: first.nextMetadata,
    });
    expectCurrent(sameRevision);
    expect(sameRevision.current.value).toBe('beta');
    expect(comparisonCalls).toBe(1);
  });

  it.each([undefined, null, -1, 1.5, Number.POSITIVE_INFINITY, 2 ** 53])(
    'rejects malformed envelope revision %p without inventing metadata',
    (revision) => {
      const result = normalize(
        'selection',
        { revision, value: 'alpha' },
        createControlledDomainMetadata(),
      );
      expectFailure(result);
      expect(result.error.code).toBe('INVALID_SELECTION_REVISION');
      expect(result.error.revision).toBeNull();
      expect(result.nextMetadata).toEqual({
        acceptedRevision: null,
        comparisonToken: null,
        tier: 'envelope',
      });
    },
  );

  it('allows correction at the same higher revision after invalid input', () => {
    const first = normalize(
      'position',
      { revision: 2, value: 'alpha' },
      createControlledDomainMetadata(),
    );
    expectCurrent(first);

    const invalid = normalize(
      'position',
      { revision: 3, value: 42 },
      first.nextMetadata,
    );
    expectFailure(invalid);
    expect(invalid.error.revision).toBe(3);
    expect(invalid.nextMetadata).toBe(first.nextMetadata);

    const corrected = normalize(
      'position',
      { revision: 3, value: 'beta' },
      invalid.nextMetadata,
    );
    expectCurrent(corrected);
    expect(corrected.current).toEqual({
      revision: 3,
      tier: 'envelope',
      value: 'beta',
    });
  });

  it.each([
    ['position', 'POSITION_CONTROL_TIER_CHANGED'],
    ['annotations', 'ANNOTATION_CONTROL_TIER_CHANGED'],
    ['selection', 'SELECTION_CONTROL_TIER_CHANGED'],
  ] as const)(
    'locks the mounted %s tier without affecting other domain histories',
    (domain, expectedCode) => {
      const plain = normalize(
        domain,
        'alpha',
        createControlledDomainMetadata(),
      );
      expectCurrent(plain);
      const switched = normalize(
        domain,
        { revision: 4, value: 'alpha' },
        plain.nextMetadata,
      );
      expectFailure(switched);
      expect(switched.error.code).toBe(expectedCode);
      expect(switched.error.revision).toBe(4);
      expect(switched.nextMetadata).toBe(plain.nextMetadata);

      const independentEnvelope = normalize(
        domain === 'position' ? 'annotations' : 'position',
        { revision: 4, value: 'alpha' },
        createControlledDomainMetadata(),
      );
      expectCurrent(independentEnvelope);
      expect(independentEnvelope.current.tier).toBe('envelope');
    },
  );

  it('uses null revision when an envelope switches to the plain tier', () => {
    const envelope = normalize(
      'position',
      { revision: 2, value: 'alpha' },
      createControlledDomainMetadata(),
    );
    expectCurrent(envelope);
    const switched = normalize('position', 'alpha', envelope.nextMetadata);
    expectFailure(switched);
    expect(switched.error).toEqual(
      expect.objectContaining({
        code: 'POSITION_CONTROL_TIER_CHANGED',
        revision: null,
      }),
    );
  });

  it('establishes a structurally identifiable tier after an invalid production render', () => {
    const invalid = normalize('position', 42, createControlledDomainMetadata());
    expectFailure(invalid);
    expect(invalid.nextMetadata.tier).toBe('plain');

    const switched = normalize(
      'position',
      { revision: 1, value: 'alpha' },
      invalid.nextMetadata,
    );
    expectFailure(switched);
    expect(switched.error.code).toBe('POSITION_CONTROL_TIER_CHANGED');
  });

  it('rejects derived revision overflow without emitting an unsafe number', () => {
    const exhausted: ControlledDomainMetadata = Object.freeze({
      acceptedRevision: Number.MAX_SAFE_INTEGER,
      comparisonToken: JSON.stringify('alpha'),
      tier: 'plain',
    });
    const equal = normalize('position', 'alpha', exhausted);
    expectCurrent(equal);
    expect(equal.current.revision).toBe(Number.MAX_SAFE_INTEGER);

    const changed = normalize('position', 'beta', exhausted);
    expectFailure(changed);
    expect(changed.error.code).toBe('INVALID_POSITION_REVISION');
    expect(changed.error.revision).toBeNull();
    expect(changed.nextMetadata).toBe(exhausted);
  });

  it.each([
    ['position', 'INVALID_POSITION_REVISION'],
    ['annotations', 'INVALID_ANNOTATION_REVISION'],
    ['selection', 'INVALID_SELECTION_REVISION'],
  ] as const)(
    'maps hostile %s tier classification to a typed revision error',
    (domain, code) => {
      const { proxy, revoke } = Proxy.revocable({}, {});
      revoke();
      const result = normalize(domain, proxy, createControlledDomainMetadata());
      expectFailure(result);
      expect(result.error.code).toBe(code);
      expect(result.error.revision).toBeNull();
      expect(result.error.cause).toBeInstanceOf(TypeError);
      expect(result.nextMetadata).toEqual(createControlledDomainMetadata());
    },
  );
});
