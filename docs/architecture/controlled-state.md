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

The public move boundary follows the same rule. `onMoveRequest` receives a
detached intent plus an abort signal and returns an accepted or rejected
decision. Acceptance starts a bounded wait for a controlled update; it never
edits, overlays, or substitutes for `position`. A revisioned update confirms
that request only when it has a newer revision and a matching
`committedIntentId`. A newer update without that correlation is still the
authoritative position, but it cancels the pending request as unrelated.

Plain positions remain valid for simple controlled rendering and can still
replace the board after a request. Their derived revisions cannot carry a
committed intent ID, so they cannot report a correlated committed outcome.
Interactive stores that need deterministic acceptance, timeout, or announcement
semantics use the revisioned position tier.

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

- Invalid board identity, dimensions, orientation, or position produces a
  disabled empty board surface.
- Invalid annotations leaves the valid position visible with no annotations.
- Invalid selection leaves position and annotations visible and ignores the
  selection snapshot.

The controlled model represents those fallbacks as unavailable domains. The
P1.3 square layer and P1.4 piece layer make the position fallback visible: an
invalid position with valid dimensions and orientation renders the current
empty grid with no pieces, while invalid dimensions or orientation render the
neutral disabled frame without projected cells. No fallback retains a prior
position. Invalid annotation or selection input leaves pieces from the valid
current position visible because those domains do not own position rendering.
Invalid position input disables move requests for that render and invalidates
active work; it never revives an older piece or pending-move snapshot.

Development throws `ChessboardError`. Production dispatches a post-commit
`onError` report once per domain and revision, or logs once when no handler
exists.
Deduplication lasts for the mounted lifetime and keys only on `(domain,
revision)`, so Strict Mode replay or a changed handler cannot repeat a report.
Error context contains `boardId`, a code-derived `domain`, and a nullable
`revision`. Identity and dimension failures have no revision; malformed
revision values and incoming plain-tier switches also use `null` because no
valid consumer revision exists. Recovery never renders a partially parsed value
and never falls back to a retained older semantic snapshot. Invalid
presentation-only transition hints are warning-only and do not enter this
recovery path.

## Consequences

Async consumers can validate moves without granting the component ownership of
game state. They must update controlled props after acceptance. The mounted
move-request executor preserves this boundary through cancellation, errors, and
timeouts; every later transition planner and provider must preserve it too.

This decision owns invariants `CBN-INV-001`, `CBN-INV-002`, `CBN-INV-003`,
`CBN-INV-004`, `CBN-INV-005`, `CBN-INV-008`, `CBN-INV-010`,
`CBN-INV-011`, `CBN-INV-012`, `CBN-INV-015`, `CBN-INV-016`,
`CBN-INV-019`, and `CBN-INV-020`.
