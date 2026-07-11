# ADR: Controlled semantic state

Status: accepted

Date: 2026-07-12

## Context

The upstream web component mirrors position and annotations in mutable internal
state. That makes callback timing, animation state, and incoming props compete
as render sources. A store-driven native component needs one answer at every
render, including while validation or animation is in flight.

## Decision

The consumer is the sole owner of semantic position, annotations, and optional
selection. A gesture emits an intent. A callback decision controls pending or
snapback presentation only. Neither can commit a position, annotation, or
selection change; only a new controlled prop can do so.

The board may retain measured geometry, finger coordinates, a drag offset,
pressed state, one visibly distinct annotation draft, one pending move epoch,
visual transition snapshots, focus, and a virtual accessibility cursor. A
provider may additionally retain one active cross-component drag and one
selected spare source. None of these values is a semantic render source.

The core is rules-free. It does not create a chess engine, calculate legal
moves, decide promotions, track turns, or derive game results. It validates
only its data and lifecycle contracts.

Every annotation callback emits a delta correlated to
`baseAnnotationRevision`. Toggle and clear operations include only IDs observed
at that base, so reducing an operation against current consumer state cannot
silently remove a concurrently added annotation.

## Revisions and invalid input

Envelope revisions are non-negative safe integers and monotonic per domain. A
semantic change must increase its revision. An explicit no-op invalidation may
also increase it. Reusing a revision with changed data is detected in
development; production trusts the revision to avoid deep comparisons.

Invalid updates fail atomically within one of five recovery domains:
`board`, `dimensions`, `position`, `annotations`, or `selection`.
`ChessboardError.code` identifies the violation while `domain` identifies the
fallback:

- Invalid board identity, dimensions, or position produces a disabled empty
  board frame.
- Invalid annotations leaves the valid position visible with no annotations.
- Invalid selection leaves position and annotations visible and ignores the
  selection snapshot.

Development throws `ChessboardError`. Production invokes `onError` once per
offending domain and revision, or logs once when no handler exists. Error
context contains `boardId`, a code-derived `domain`, and a nullable `revision`;
identity and dimension failures have no revision. Recovery never renders a
partially parsed value and never falls back to a retained older semantic
snapshot. Invalid presentation-only transition hints are warning-only and do
not enter this recovery path.

## Consequences

Async consumers can validate moves without granting the component ownership of
game state. They must update controlled props after acceptance. Every reducer,
gesture executor, transition planner, and provider must preserve this boundary.

This decision owns invariants `CBN-INV-001`, `CBN-INV-002`, `CBN-INV-003`,
`CBN-INV-004`, `CBN-INV-005`, `CBN-INV-008`, `CBN-INV-010`,
`CBN-INV-011`, `CBN-INV-012`, `CBN-INV-015`, `CBN-INV-016`,
`CBN-INV-019`, and `CBN-INV-020`.
