# ADR: Plain and revisioned API tiers

Status: accepted

Date: 2026-07-12

## Context

A static diagram should not need revision counters, while an interactive board
needs deterministic correlation among asynchronous validation, controlled
commits, and transitions. One options object would also become a competing
source beside direct React props.

## Decision

`position`, `annotations`, and `selection` each accept a plain controlled value
or a revisioned form. Position and annotations use `{ value, revision }`
envelopes. Selection keeps its presentation fields at the top level and adds an
inline `revision`; its plain form forbids that field. Tiers may be mixed across
domains.

The plain tier derives a monotonic internal revision when its normalized value
changes. That counter is correlation metadata only: rendering always reads the
latest prop value directly. The plain tier cannot carry a committed intent ID
or an explicit transition hint.

The revisioned tier carries consumer revisions. `ControlledPosition` also
carries optional commit and presentation correlation. A matching
`committedIntentId` confirms a local request; `transition` describes a visual
change. These signals are independent.

Changing one domain between plain and revisioned tiers while its board remains
mounted uses that domain's `*_CONTROL_TIER_CHANGED` error code. It does not
activate a second render source. Unmounting and mounting may choose a different
tier.

The primary package API uses direct props. A future exact upstream options
object, if shipped, belongs only to the `react-chessboard-compat` subpath and
reduces to the same native contracts. It may derive revisions but may not keep
a shadow position or annotation list.

FEN input represents only the piece-placement field of an 8x8 board. Variant
dimensions use the sparse `PositionObject`; absent keys are empty squares.
Square IDs remain canonical lowercase file and rank names independent of
orientation.

## Pure transition boundary

The internal controlled-domain transition is pure. It receives the last
committed metadata and the current prop, then returns either a value normalized
from that current prop or an unavailable domain plus a typed error. Its metadata
contains only the established tier, accepted revision, and a comparison token;
it never contains a renderable position, annotation collection, or selection.
React integration adopts candidate metadata through a same-component render
restart, so the candidate becomes committed only with that render. A suspended
or otherwise abandoned concurrent render cannot advance correlation metadata.

The first valid plain value receives derived revision `0`. An equal normalized
value keeps its revision and a changed value increments it. Invalid input uses
the next candidate revision for diagnostics but does not consume it. Recovery
with the last accepted semantic value keeps the old revision; recovery with a
changed value receives the candidate revision. Derived revision overflow fails
instead of emitting an unsafe integer.

The first revisioned value accepts any non-negative safe-integer revision. Greater
revisions accept either semantic changes or explicit no-op invalidations. Lower
revisions always fail. Reusing a revision with changed semantics fails in
development; production still normalizes and returns the current value but
skips comparison with prior metadata, leaving mutation under a reused revision
undefined as documented. Invalid input never advances accepted metadata, so a
corrected value may reuse the rejected revision.

A structurally identifiable tier is established by a committed render even if
its value is invalid in production. Later switching that mounted domain fails
without adopting the incoming tier. Different domains retain independent tier
and revision metadata. Omitting optional annotations or selection does not
establish a tier and makes that current domain unavailable. Omission does not
erase a tier already established earlier in the same mounted lifetime.

Board identity, dimensions, and orientation are validated before any controlled
value. Invalid orientation uses the revisionless `dimensions` recovery domain.
Concrete adapters then create detached, deeply frozen current snapshots for all
three domains. Position key order and annotation object field order are not
semantic; annotation collection order remains semantic because it defines
same-layer paint order. Selection destination and disabled square arrays are
canonical sorted sets, so order, duplicates, omission, and an explicit empty
array do not manufacture revisions. Annotation IDs must be non-empty and unique;
arrow width must be positive and opacity must be between zero and one.

## Consequences

Simple diagrams stay simple, while stores can opt into explicit correlation per
domain. Normalization must compare plain values and enforce revision ordering,
but neither path may use its metadata as a semantic render source.

This decision owns invariants `CBN-INV-001`, `CBN-INV-007`, `CBN-INV-019`,
and `CBN-INV-020`.
