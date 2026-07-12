import { ChessboardError } from '../ChessboardError';
import type { Revision } from '../public-types';

export type ControlTier = 'plain' | 'envelope';
export type ControlledDomain = 'position' | 'annotations' | 'selection';

/** Commit metadata only. It must never contain a renderable semantic value. */
export interface ControlledDomainMetadata {
  readonly tier: ControlTier | null;
  readonly acceptedRevision: Revision | null;
  readonly comparisonToken: string | null;
}

export type ClassifiedControlledValue =
  | {
      readonly tier: 'plain';
      readonly readValue: () => unknown;
    }
  | {
      readonly tier: 'envelope';
      readonly readRevision: () => unknown;
      readonly readValue: () => unknown;
    };

export interface ControlledDomainAdapter<Value> {
  readonly classify: (input: unknown) => ClassifiedControlledValue;
  readonly normalizeValue: (value: unknown) => Value;
  readonly comparisonToken: (value: Value) => string;
  readonly createValueError: (
    error: unknown,
    context: {
      readonly boardId: string | null;
      readonly revision: Revision;
      readonly value: unknown;
    },
  ) => ChessboardError;
}

export interface NormalizedControlledValue<Value> {
  readonly value: Value;
  readonly revision: Revision;
  readonly tier: ControlTier;
}

export type ControlledDomainResult<Value> =
  | {
      readonly ok: true;
      readonly current: NormalizedControlledValue<Value>;
      readonly error: null;
      readonly nextMetadata: ControlledDomainMetadata;
    }
  | {
      readonly ok: false;
      readonly current: null;
      readonly error: ChessboardError;
      readonly nextMetadata: ControlledDomainMetadata;
    };

export interface NormalizeControlledDomainOptions<Value> {
  readonly input: unknown;
  readonly previousMetadata: ControlledDomainMetadata;
  readonly boardId: string | null;
  readonly domain: ControlledDomain;
  readonly development: boolean;
  readonly adapter: ControlledDomainAdapter<Value>;
}

export function createControlledDomainMetadata(): ControlledDomainMetadata {
  return Object.freeze({
    acceptedRevision: null,
    comparisonToken: null,
    tier: null,
  });
}

function isRevision(value: unknown): value is Revision {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function nextDerivedRevision(
  acceptedRevision: Revision | null,
): Revision | null {
  if (acceptedRevision === null) {
    return 0;
  }
  return acceptedRevision === Number.MAX_SAFE_INTEGER
    ? null
    : acceptedRevision + 1;
}

function withEstablishedTier(
  metadata: ControlledDomainMetadata,
  tier: ControlTier,
): ControlledDomainMetadata {
  return metadata.tier === null
    ? Object.freeze({ ...metadata, tier })
    : metadata;
}

function domainLabel(domain: ControlledDomain): string {
  return `${domain.charAt(0).toUpperCase()}${domain.slice(1)}`;
}

function createRevisionError(
  domain: ControlledDomain,
  boardId: string | null,
  revision: Revision | null,
  message: string,
  cause?: unknown,
): ChessboardError {
  switch (domain) {
    case 'position':
      return new ChessboardError(
        message,
        { boardId, code: 'INVALID_POSITION_REVISION', revision },
        cause,
      );
    case 'annotations':
      return new ChessboardError(
        message,
        { boardId, code: 'INVALID_ANNOTATION_REVISION', revision },
        cause,
      );
    case 'selection':
      return new ChessboardError(
        message,
        { boardId, code: 'INVALID_SELECTION_REVISION', revision },
        cause,
      );
  }
}

function createTierError(
  domain: ControlledDomain,
  boardId: string | null,
  revision: Revision | null,
  previousTier: ControlTier,
  incomingTier: ControlTier,
): ChessboardError {
  const message = `${domainLabel(domain)} control tier changed from ${previousTier} to ${incomingTier} while mounted.`;
  switch (domain) {
    case 'position':
      return new ChessboardError(message, {
        boardId,
        code: 'POSITION_CONTROL_TIER_CHANGED',
        revision,
      });
    case 'annotations':
      return new ChessboardError(message, {
        boardId,
        code: 'ANNOTATION_CONTROL_TIER_CHANGED',
        revision,
      });
    case 'selection':
      return new ChessboardError(message, {
        boardId,
        code: 'SELECTION_CONTROL_TIER_CHANGED',
        revision,
      });
  }
}

function fail<Value>(
  error: ChessboardError,
  nextMetadata: ControlledDomainMetadata,
  development: boolean,
): ControlledDomainResult<Value> {
  if (development) {
    throw error;
  }
  return Object.freeze({
    current: null,
    error,
    nextMetadata,
    ok: false,
  });
}

function succeed<Value>(
  value: Value,
  revision: Revision,
  tier: ControlTier,
  nextMetadata: ControlledDomainMetadata,
): ControlledDomainResult<Value> {
  return Object.freeze({
    current: Object.freeze({ revision, tier, value }),
    error: null,
    nextMetadata,
    ok: true,
  });
}

/**
 * Prepare one controlled-domain render without mutating committed metadata.
 * Callers commit `nextMetadata` only after the corresponding render commits.
 */
export function normalizeControlledDomain<Value>(
  options: NormalizeControlledDomainOptions<Value>,
): ControlledDomainResult<Value> {
  const { adapter, boardId, development, domain, input, previousMetadata } =
    options;
  let classified: ClassifiedControlledValue;
  try {
    classified = adapter.classify(input);
  } catch (error) {
    return fail(
      createRevisionError(
        domain,
        boardId,
        null,
        `${domainLabel(domain)} control tier could not be determined.`,
        error,
      ),
      previousMetadata,
      development,
    );
  }
  const metadataWithTier = withEstablishedTier(
    previousMetadata,
    classified.tier,
  );

  if (
    previousMetadata.tier !== null &&
    previousMetadata.tier !== classified.tier
  ) {
    let incomingRevision: Revision | null = null;
    if (classified.tier === 'envelope') {
      try {
        const revision = classified.readRevision();
        incomingRevision = isRevision(revision) ? revision : null;
      } catch {
        incomingRevision = null;
      }
    }
    return fail(
      createTierError(
        domain,
        boardId,
        incomingRevision,
        previousMetadata.tier,
        classified.tier,
      ),
      previousMetadata,
      development,
    );
  }

  if (classified.tier === 'envelope') {
    let rawRevision: unknown;
    try {
      rawRevision = classified.readRevision();
    } catch (error) {
      return fail(
        createRevisionError(
          domain,
          boardId,
          null,
          `${domainLabel(domain)} revision must be a non-negative safe integer.`,
          error,
        ),
        metadataWithTier,
        development,
      );
    }
    if (!isRevision(rawRevision)) {
      return fail(
        createRevisionError(
          domain,
          boardId,
          null,
          `${domainLabel(domain)} revision must be a non-negative safe integer.`,
        ),
        metadataWithTier,
        development,
      );
    }

    const revision = rawRevision;
    if (
      previousMetadata.acceptedRevision !== null &&
      revision < previousMetadata.acceptedRevision
    ) {
      return fail(
        createRevisionError(
          domain,
          boardId,
          revision,
          `${domainLabel(domain)} revision ${String(revision)} is lower than accepted revision ${String(previousMetadata.acceptedRevision)}.`,
        ),
        metadataWithTier,
        development,
      );
    }

    let value: Value;
    let rawValue: unknown;
    try {
      rawValue = classified.readValue();
      value = adapter.normalizeValue(rawValue);
    } catch (error) {
      return fail(
        adapter.createValueError(error, {
          boardId,
          revision,
          value: rawValue,
        }),
        metadataWithTier,
        development,
      );
    }

    if (
      previousMetadata.acceptedRevision !== null &&
      revision === previousMetadata.acceptedRevision
    ) {
      if (development) {
        const token = adapter.comparisonToken(value);
        if (token !== previousMetadata.comparisonToken) {
          return fail(
            createRevisionError(
              domain,
              boardId,
              revision,
              `${domainLabel(domain)} changed without increasing revision ${String(revision)}.`,
            ),
            metadataWithTier,
            development,
          );
        }
      }
      return succeed(value, revision, 'envelope', metadataWithTier);
    }

    const token = adapter.comparisonToken(value);
    const nextMetadata = Object.freeze({
      acceptedRevision: revision,
      comparisonToken: token,
      tier: 'envelope' as const,
    });
    return succeed(value, revision, 'envelope', nextMetadata);
  }

  const candidateRevision = nextDerivedRevision(
    previousMetadata.acceptedRevision,
  );
  let value: Value;
  let rawValue: unknown;
  try {
    rawValue = classified.readValue();
    value = adapter.normalizeValue(rawValue);
  } catch (error) {
    if (candidateRevision === null) {
      return fail(
        createRevisionError(
          domain,
          boardId,
          null,
          `Plain ${domain} revision cannot advance beyond Number.MAX_SAFE_INTEGER.`,
          error,
        ),
        metadataWithTier,
        development,
      );
    }
    return fail(
      adapter.createValueError(error, {
        boardId,
        revision: candidateRevision,
        value: rawValue,
      }),
      metadataWithTier,
      development,
    );
  }

  const token = adapter.comparisonToken(value);
  if (
    previousMetadata.acceptedRevision !== null &&
    token === previousMetadata.comparisonToken
  ) {
    return succeed(
      value,
      previousMetadata.acceptedRevision,
      'plain',
      metadataWithTier,
    );
  }
  if (candidateRevision === null) {
    return fail(
      createRevisionError(
        domain,
        boardId,
        null,
        `Plain ${domain} revision cannot advance beyond Number.MAX_SAFE_INTEGER.`,
      ),
      metadataWithTier,
      development,
    );
  }

  const nextMetadata = Object.freeze({
    acceptedRevision: candidateRevision,
    comparisonToken: token,
    tier: 'plain' as const,
  });
  return succeed(value, candidateRevision, 'plain', nextMetadata);
}
