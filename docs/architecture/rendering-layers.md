# ADR: Native rendering layers

Status: accepted

Date: 2026-07-12

## Context

The board needs arbitrary React piece renderers, deterministic annotation
geometry, native gestures, animation, and one coherent accessibility surface.
Skia would make arbitrary React composition and native accessibility harder
before profiling demonstrates a need.

## Decision

The initial renderer uses React Native Views, Reanimated, React Native Gesture
Handler, and `react-native-svg`. Its fixed back-to-front layer order is:

1. Board and square backgrounds.
2. Below-piece square and arrow annotations.
3. Absolutely positioned animated pieces.
4. Above-piece annotations.
5. Provider-coordinated gesture hit testing.
6. Single-control accessibility semantics.

SVG paths do not use document-global marker IDs. Every board owns its visual
and animation state. Orientation changes coordinate projection only; canonical
square IDs and consumer data remain unchanged.

Custom square and piece renderers are visual-only. Their props provide piece,
square, size, resolved style, and interaction flags, but no gesture or
accessibility handlers. Their roots are decorative to the accessibility tree
and cannot become an alternate event surface.

When theme and style contracts land, precedence is fixed as built-in defaults,
theme, instance styles, per-square styles, then transient interaction styles.
Later layers override earlier layers. Custom renderers receive the resolved
value rather than performing a second merge.

The board measures its parent, fills available width unless an explicit size is
provided, and derives height from rows and columns. It never reads global screen
dimensions. Hit testing and annotations use the same measured coordinate
system.

Skia remains an optional future experiment gated on profiling. It is not part
of the 1.0 architecture.

## Consequences

The renderer remains composable and accessible at the cost of coordinating
several native primitives. Tests must verify exact layer ordering, instance
isolation, visual-only renderer behavior, and responsive geometry.

This decision owns invariants `CBN-INV-010`, `CBN-INV-013`, `CBN-INV-014`,
and `CBN-INV-018`.
