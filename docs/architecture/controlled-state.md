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
provider may additionally retain tokenized board registrations, cached window
bounds, one active cross-component drag, its shared visual overlay, a transient
drop-verification epoch, and one selected spare source. None of these values is
a semantic render source.

A provider registration contains only routing and measurement capability. It
does not copy a board position, annotations, or semantic selection into provider
state. A drop resolver reads the destination board's current committed runtime
only after a fresh release measurement succeeds. Cached bounds can influence a
hover hint, never a move intent or controlled render. Provider
`geometryRevision` changes invalidate transient coordination without becoming a
board semantic revision.

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

`onSquareActivate` follows the same controlled boundary. It is a synchronous
notification carrying one detached immutable `SquareActivationIntent` with the
current base position and selection revisions. The callback result is ignored;
the board never turns it into a selected square or a position update. An
explicit accessible `clear-selection` action is likewise a request for the
consumer to publish a new selection prop, not an internal clear.

Ordinary controlled-selection activation uses one exclusive router evaluated
against the current normalized props. For touch, when `onMoveRequest` exists,
the target is an enabled declared destination, the selected source is enabled,
and that source still contains a controlled piece, the board sends only a
`MoveIntent` to `onMoveRequest`. Accessibility uses that move route only while
its move permission is enabled. Otherwise, when `onSquareActivate` exists, the
board sends only a `SquareActivationIntent`. It never invokes both callbacks
for one activation, never infers destinations, and never retains the captured
piece or selection as a render source. Disabled or stale activation fails
closed.

Every annotation callback emits a delta correlated to
`baseAnnotationRevision`. Toggle and clear operations include only IDs observed
at that base, so reducing an operation against current consumer state cannot
silently remove a concurrently added annotation.

P4.1 makes that boundary executable without moving ownership into the board.
`onAnnotationOperation` is synchronous and its return value is ignored. Add and
toggle operations carry a stable consumer-usable `annotationId`; toggle also
records the matching IDs observed at its base. Clear operations record every ID
they observed and one reason. Independent board-press and position-change
policies may request clear operations, but neither policy edits the rendered
collection or gates the other.

The public pure `applyAnnotationOperation` helper reduces one delta against the
consumer's latest revisioned envelope. It rejects a different board, a base from
the future, a conflicting add identity, or revision overflow. A stale operation
is otherwise safe: remove targets one stable ID, while toggle and clear can
remove only IDs named at their base. A concurrently added annotation therefore
survives even when an older operation is applied after it. The helper returns an
explicit applied, unchanged, or rejected result and never mutates either input.
The returned envelope is still only a candidate for the consumer to publish;
the board does not render it until it arrives through `annotations`.

P4.3 similarly permits at most one presentation-only draft correlated to the
current board, annotation revision, position revision, board geometry, provider
geometry, and provider lifecycle. A correlation change suppresses it
synchronously. The draft has no persistent ID, never enters the normalized
annotation domain, and cannot outlive or replace the controlled collection.

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
game state. They must update controlled position after move acceptance, and any
selection change resulting from activation or clearing must arrive through the
controlled selection prop. The mounted move-request executor and
square-activation router and provider registry preserve this boundary through
cancellation, errors, timeouts, abandoned renders, stale selection correlation,
duplicate identity, and late native measurements. Every later transition
planner and external source must preserve it too.

This decision owns invariants `CBN-INV-001`, `CBN-INV-002`, `CBN-INV-003`,
`CBN-INV-004`, `CBN-INV-005`, `CBN-INV-008`, `CBN-INV-010`,
`CBN-INV-011`, `CBN-INV-012`, `CBN-INV-015`, `CBN-INV-016`,
`CBN-INV-019`, and `CBN-INV-020`.
