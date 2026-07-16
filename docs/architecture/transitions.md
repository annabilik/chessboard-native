# ADR: Controlled transitions

Status: accepted

Date: 2026-07-12

## Context

Position diffing is ambiguous when identical pieces can reach the same square,
and an animation can be interrupted by newer controlled state. A transition
must never turn a visual snapshot into a second logical position.

## Decision

A new controlled position commits semantically as soon as the prop arrives.
Animation is presentation only. Every animation plan is correlated to an epoch
and an exact `fromRevision` and `toRevision`; the latest prop always cancels or
replans older work and terminal rendering always equals that prop.

An explicit `BoardTransition` is consumed only when its `toRevision` matches
the enclosing controlled position and its `fromRevision` matches the previous
committed semantic revision. `committedIntentId` remains independent: a local
intent may commit without animation and an external update may animate without
committing a local intent.

Explicit hints may describe promotion, a captured square, and the rook half of
castling. A `MoveIntent` with `targetSquare: null` represents off-board removal;
because `BoardTransition.to` is an on-board square, removals deliberately use
the generic exit/fade or snap path rather than a move hint.

Without a valid hint, piece IDs are the preferred identity. Geometric/type
inference is a compatibility fallback. A tie or otherwise ambiguous diff fades
or snaps instead of choosing an arbitrary object key. Stale or malformed hints
are ignored with a development warning. They never create a `ChessboardError`
or invalidate an otherwise valid controlled position.

The pure planner applies identity in this order:

1. one structurally valid hint correlated to the exact previous and current
   revisions;
2. equal stable piece IDs, including a type-changing replacement reserved for
   later promotion presentation;
3. anonymous pieces that remain unchanged on the same square;
4. one-to-one anonymous type matches;
5. mutually unique standard-piece geometry matches within a bounded candidate
   scan.

An ID-bearing piece never falls back to anonymous or different-ID matching.
Standard geometry is only a conservative visual hint; it does not inspect
blockers, turns, legality, or history. Custom piece types use one-to-one
matching only. Oversized candidate matrices and multiple remaining assignments
make all unresolved old actors exits and all unresolved new actors enters. This
gives the runtime a deterministic fade/snap path without claiming a move that
the consumer did not identify or performing unbounded all-pairs work on large
variant boards.

Every plan contains only detached piece-level operations plus its epoch and
exact revision pair. It never contains either canonical position snapshot.
Initial mount and semantic no-op revisions create no plan. Operation order is
canonical rank/file order and does not depend on object insertion order or
orientation.

P3.1 snapshots `promotion`, `capturedSquare`, and `rookMove` fields and rejects
revision, endpoint, and stable-identity contradictions, but consumes only the
ordinary `from`/`to` actor match. Promotion, en passant association,
coordinated castling, and their animation runtime remain later transition work.
Warning dispatch also remains a mounted post-commit responsibility; the pure
planner returns warning data and never logs during render.

For A to B to C, B is committed even when its animation is interrupted. A B to
C hint is therefore valid and every A to B visual epoch becomes inert. Geometry
or orientation changes replan from current controlled semantics.

`reduceMotion="system"` follows the operating system, `always` settles without
motion, and `never` explicitly permits motion. Changing into reduced motion
mid-animation immediately settles on the latest controlled state. This rule
also covers lift, pending placement, snapback, cancellation, press feedback,
and annotation drafts; timeout durations and semantic callbacks do not change.

## Consequences

Consumers can obtain deterministic special-move animation with hints while
ordinary controlled updates remain safe. Visual fidelity intentionally yields
to correctness when identity is ambiguous or a move leaves the board.

This decision owns invariants `CBN-INV-005`, `CBN-INV-006`, `CBN-INV-007`,
`CBN-INV-013`, and `CBN-INV-017`.
