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
