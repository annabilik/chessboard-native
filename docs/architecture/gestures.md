# ADR: Gesture and provider coordination

Status: accepted

Date: 2026-07-12

## Context

Native piece movement must work within a board, from an external spare palette,
across multiple boards, and inside scrolling layouts without allowing gesture
state to become game state.

## Decision

Boards use board-level coordinate hit testing rather than one gesture handler
per visual square. Pan-frame updates stay on the UI thread in Reanimated shared
values and transforms. Gesture code emits reducer events; a separate effect
executor invokes callbacks, timers, aborts, and announcements only after
checking the active epoch.

`ChessboardProvider` owns one transient gesture coordinator, board layout
registry, drag overlay, and at most one active drag. It owns no position,
annotations, or semantic board selection. Standalone boards create a private
provider.

Every board ID is required, non-empty, unique within its nearest provider, and
stable for the mount lifetime. Duplicate or changed IDs take the typed board
error path and never create a conflicting registration. All provider state is
routed by that ID.

An external spare names exactly one target board. Cached window bounds are
hover hints only. On release the provider remeasures the target synchronously
where supported or enters an epoch-correlated verifying state while
`measureInWindow` resolves. It emits only when the target remains registered,
the measurement epoch and controlled `geometryRevision` remain current, and
the destination revision is read at emission.

Once a drag activates it is exclusive with registered ancestor ScrollViews.
The package does not programmatically auto-scroll an arbitrary ancestor.
Layout changes, geometry invalidation, orientation or dimension changes,
permission changes, unmount, a second valid gesture, a second-finger cancel,
and the accessibility cancel action invalidate the active epoch and all timers
and signals. Late work is inert.

Long-press pan, two-finger pan, and explicit two-activation annotation input all
produce the same revisioned annotation operations. Every drag path also has a
tap, keyboard, or accessibility alternative using the same semantic intent.

## Consequences

Provider coordination enables external sources without sharing game state.
Release-time measurement may briefly delay a drop, but it prevents stale bounds
from emitting an incorrect square. Reducer race tables and native ScrollView,
multi-board, lifecycle, and accessibility tests are mandatory.

This decision owns invariants `CBN-INV-003`, `CBN-INV-004`, `CBN-INV-007`,
`CBN-INV-008`, `CBN-INV-009`, `CBN-INV-012`, `CBN-INV-014`,
`CBN-INV-015`, and `CBN-INV-018`.
