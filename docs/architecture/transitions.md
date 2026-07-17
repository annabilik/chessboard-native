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
   revisions, including its optional second actor and captured square;
2. equal stable piece IDs, including type-changing replacements;
3. anonymous pieces that remain unchanged on the same square;
4. one globally unambiguous standard promotion or replay reversal whose source
   and target have no remaining same-type identity alternative;
5. one-to-one anonymous type matches;
6. mutually unique standard-piece geometry matches within a bounded candidate
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

P3.1 introduced detached validation for `promotion`, `capturedSquare`, and
`rookMove`. P3.3 consumes an accepted hint atomically. The primary actor and
optional `rookMove` actor become independent operations on the same plan and
clock. The captured before-square is reserved from every other matcher and
becomes exactly one captured exit, including when it differs from the primary
target as in en passant. Crossing primary and secondary paths remain valid for
rules-free variants. The planner never fabricates a castling intermediate
position.

An explicit `promotion` only names the target piece type. It deliberately does
not impose pawn roles, colors, ranks, or legal chess movement on the open piece
vocabulary. Without a hint or stable identity, the compatibility fallback is
conservative: it recognizes only one unambiguous same-color standard
`P`-to-`Q/R/B/N` promotion or replay reversal on the appropriate edge rank,
within one file and only when neither endpoint has an ordinary same-type actor
alternative. Multiple candidates, custom piece types, competing identities,
and oversized candidate scans fall back to ordinary matching, exits, and
enters rather than inventing identity.

P3.2 adds the ordinary mounted runtime. A layout effect compares only committed
semantic snapshots, installs one detached plan for the exact target revision,
and drives all actors from one board-local Reanimated progress value. Current
move targets translate from their measured source cells, current enter actors
fade in, and detached removed/captured/ambiguous actors fade out underneath the
current piece plane. Current renderers always receive the target square; exit
renderers receive the old square and detached old piece.

P3.3 presents every identity-safe type-changing replacement with two detached
views on that same clock. The old artwork begins at the source, travels to the
target, and fades out. The current authoritative artwork begins hidden at the
same visual point, travels along the same path, and fades in. Thus promotion
and custom stable-ID transformations never require a shadow position. Generic
capture exits paint below the replacement-before actor, which paints below the
current target actor. Every transient remains pointerless and hidden from
accessibility.

The animation callback captures only the plan epoch, target comparison token,
and geometry epoch. A newer prop makes every old callback inert; a late
completion can clear only the still-matching epoch. Planner warnings are
dispatched only after commit in development and deduplicated across effect
replay.

P3.4 keeps semantic planning and visual continuity separate through a private
`TransitionPresentation` actor graph between the pure plan and render layers.
The graph carries the exact revision pair, current, detached, and pending
actors, normalized endpoints, opacity, and actor anchors, but no canonical
position collection. For A to B to C, B commits even when its animation is
interrupted and the next pure plan compares exactly B with C. The mounted
runtime may sample an identity-safe actor's active A-to-B presentation and
start its B-to-C presentation from that sampled point and opacity for the
configured full duration. That sample can influence visual origins only; it
never becomes A, B, C, or another semantic source. Unmatched or ambiguous
actors retain their deterministic fade or snap path. Visible detached and
pending artwork from the interrupted graph may finish as bounded fading
residuals; at most 64 are retained and opacity below one 8-bit alpha step is
dropped. Every prior epoch becomes inert.

An active geometry or orientation change follows the same presentation-only
rule. With a usable new measurement, the runtime samples each actor's current
normalized visual point and opacity, rebases them into the new projection, and
continues to the current controlled target until the original segment's
deadline, using only its remaining time. Canonical square IDs, the exact
semantic revision pair, and the controlled position never change. Missing or
invalid measurement settles directly to the latest controlled state. A logical
row or column count change also snaps because the adjacent snapshots no longer
share one square domain; it is not treated as a measured-size rebase.

A matching `committedIntentId` may hand one pending on-board or spare target to
the current controlled actor only when the lifecycle and presentation share the
exact from/to revisions and the intent's source, piece, and target correlate to
one current plan actor. The pending host crossfades out while the canonical
target host crossfades in at the same point, so the primary actor does not
replay its source-to-target move; other operations in the exact adjacent plan
remain independent. A newer unrelated position, a nonmatching actor, and a null
off-board target use ordinary controlled-transition behavior; an actual
controlled removal takes the generic exit path. None creates a pending handoff
or grants the interaction lifecycle authority over position.

`reduceMotion="system"` follows the operating system, `always` settles without
motion, and `never` explicitly permits motion. Changing into reduced motion
mid-animation immediately settles on the latest controlled state and discards
any sampled continuation or handoff. Re-enabling motion does not replay that
settled revision. Initial mount, no-op revisions, invalid current state, zero
duration, and unavailable measurement also snap. The reduced-motion rule covers
lift, pending placement, snapback, cancellation, press feedback, and annotation
drafts; timeout durations and semantic callbacks do not change.

## Consequences

Consumers can obtain deterministic special-move animation with hints, smooth
identity-safe interruption and geometry rebase, and correlated pending-target
handoff while ordinary controlled updates remain safe. Visual fidelity
intentionally yields to correctness when identity is ambiguous or a move leaves
the board.

This decision owns invariants `CBN-INV-005`, `CBN-INV-006`, `CBN-INV-007`,
`CBN-INV-013`, and `CBN-INV-017`.
