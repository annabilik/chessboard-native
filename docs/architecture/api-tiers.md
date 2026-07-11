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
or a revisioned envelope. Tiers may be mixed across domains.

The plain tier derives a monotonic internal revision when its normalized value
changes. That counter is correlation metadata only: rendering always reads the
latest prop value directly. The plain tier cannot carry a committed intent ID
or an explicit transition hint.

The envelope tier carries consumer revisions. `ControlledPosition` also carries
optional commit and presentation correlation. A matching
`committedIntentId` confirms a local request; `transition` describes a visual
change. These signals are independent.

Changing one domain between plain and envelope tiers while its board remains
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

## Consequences

Simple diagrams stay simple, while stores can opt into explicit correlation per
domain. Normalization must compare plain values and enforce envelope ordering,
but neither path may use its metadata as a semantic render source.

This decision owns invariants `CBN-INV-001`, `CBN-INV-007`, `CBN-INV-019`,
and `CBN-INV-020`.
