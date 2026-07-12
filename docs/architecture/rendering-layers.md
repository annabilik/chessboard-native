# ADR: Native rendering layers

Status: accepted

Date: 2026-07-12

## Context

The board needs arbitrary React piece renderers, deterministic annotation
geometry, native gestures, animation, and one coherent accessibility surface.
Skia would make arbitrary React composition and native accessibility harder
before profiling demonstrates a need.

## Decision

The renderer uses React Native Views, Reanimated, React Native Gesture Handler,
and `react-native-svg`. Its fixed back-to-front layer order is:

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

The P1.3 static boundary consists of private `BoardSurface`, `SquareLayer`, and
`NotationLayer` components. `BoardSurface` fills the available parent width and
sets `aspectRatio = columns / rows`, which gives it
`height = width * rows / columns` and square cells. An explicit board width is
therefore a parent-layout constraint; this slice does not add a public sizing
prop that could conflict with the later styling contract. It never reads global
screen dimensions.

The visual layer waits for a positive `onLayout` measurement. Its exact native
width and height become the board-local coordinate system. Every absolute cell
uses cumulative proportional edges on both axes; values are not rounded, so
adjacent cells share an edge and the final row and column end at the exact
measured bounds. A zero layout clears the visual layer. A dimension change with
the same aspect ratio reprojects the existing physical measurement immediately,
because native bounds do not change and another `onLayout` is not guaranteed. A
changed aspect ratio withholds the old measurement until the resulting native
resize is reported. Orientation and notation changes also reproject the current
measurement without manufacturing semantic state.

File labels render only on the visual bottom edge and rank labels only on the
visual left edge. Both reverse with black orientation, while their canonical
square IDs and colors remain unchanged. Typography scales from the measured
cell size and is capped at the upstream default. The built-in P1.3 colors match
the pinned upstream defaults; themes, style overrides, custom renderers, pieces,
Reanimated, gesture handling, and SVG annotation composition remain later
slices.

The outer host is non-interactive and not yet an accessibility control. The
inner surface, every visual square, and every notation label are explicitly
decorative and hidden from assistive technology. P1.5 will promote only the
outer host to the single adjustable control; visual descendants will remain
hidden. Hit testing and annotations will use this same measured coordinate
system.

An invalid position with valid dimensions renders this dimension-correct empty
grid, never an older position. Invalid dimensions or orientation render the
disabled neutral frame with no projected cells. Annotation and selection
fallbacks do not suppress the valid square surface.

Skia remains an optional future experiment gated on profiling. It is not part
of the 1.0 architecture.

## Consequences

The renderer remains composable and accessible at the cost of coordinating
several native primitives. P1.3 tests verify responsive measured geometry,
orientation, notation, decorative descendants, and invalid-domain fallbacks.
Later slices must verify exact full-layer ordering, instance isolation, and
visual-only custom renderer behavior.

This decision owns invariants `CBN-INV-010`, `CBN-INV-013`, `CBN-INV-014`,
and `CBN-INV-018`.
