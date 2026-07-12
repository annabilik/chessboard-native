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
accessibility handlers. P1.4 activates this contract for piece renderers only;
custom square rendering remains deferred. Renderer content is contained by a
pointerless, accessibility-hidden board-owned wrapper and cannot become an
alternate event surface.

Static theme and style precedence is fixed as built-in defaults, `theme`,
instance `styles`, then canonical `squareStyles`. Later layers override earlier
layers. Future transient interaction styles will be last, but P1.4 does not
manufacture pressed, selected, drop-target, pending, dragging, ghost, or
transition state. Custom piece renderers receive the resolved piece value rather
than performing a second merge.

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
the pinned upstream defaults.

P1.4 adds a private piece layer over the square layer. It iterates only the
latest normalized controlled position and places each piece in the measured
rectangle for its canonical square. Orientation changes projection, never the
position value, piece ID, or renderer key. Plain and revisioned positions with
the same value therefore produce the same output, and no durable rendered
position exists beside the current prop.

`defaultPieceRenderers` contains the twelve standard `wP` through `bK` keys and
uses original geometric artwork authored for this project under its MIT
license. It does not copy or adapt the fixture-only Cburnett SVG set. The
interim geometry is sufficient for engineering and static examples; polished
permissive artwork and its final provenance audit remain a pre-1.0 gate.

Supplying `pieceRenderers` replaces that lookup as a whole. Consumers that want
one standard override spread `defaultPieceRenderers` explicitly; an absent key
renders no piece artwork. This also supports object positions with open custom
piece types without teaching the board a second vocabulary. Returning `null`
from a selected renderer is intentional and does not fall back to the default
set.

`defaultTheme` supplies board, square, light/dark square, notation, and piece
defaults. `theme` overrides those defaults, `styles` applies instance-level
overrides, and `squareStyles` applies the final static square override by
canonical square ID. File/rank notation retains its measured placement while
accepting resolved native text styles. Piece renderers receive their resolved
native style, measured size, square, piece, board ID, and all-false static
interaction state. The board-owned piece wrapper applies the resolved
`ViewStyle` once; the renderer receives the same frozen value for inspection or
derived non-View artwork and must not merge it onto the wrapper a second time.
Board-local measurement and absolute cell geometry remain owned by the renderer
rather than custom content. Host layout fields such as display, width, height,
aspect ratio, flex sizing, margins, insets, and padding are removed from resolved
board paint; board transforms, box sizing, and border widths are removed for the
same reason. Consumers size, transform, or border a parent wrapper instead. Cell
and piece top, left, width, and height are applied by board-owned wrappers after
visual styles; inner square paint and the piece host also neutralize insets,
min/max sizes, physical/logical margins, and pointer-event overrides. Consumer
square or piece transforms may alter paint presentation, and piece geometry-like
fields remain in the frozen value exposed to a renderer for derivation, but none
of them changes the shared measured coordinate system or hit-test semantics.

Custom square rendering, interaction-state styling, Reanimated transitions,
gesture handling, and SVG annotation composition remain later slices.

The outer host is non-interactive and not yet an accessibility control. The
inner surface, every visual square, piece wrapper, renderer subtree, and
notation label are explicitly decorative and hidden from assistive technology.
P1.5 will promote only the outer host to the single adjustable control; visual
descendants will remain hidden. Hit testing and annotations will use this same
measured coordinate system.

An invalid position with valid dimensions renders this dimension-correct empty
grid with no pieces, never an older position. Invalid dimensions or orientation
render the disabled neutral frame with no projected cells. Annotation and
selection fallbacks do not suppress squares or pieces from the valid current
position.

Skia remains an optional future experiment gated on profiling. It is not part
of the 1.0 architecture.

## Consequences

The renderer remains composable and accessible at the cost of coordinating
several native primitives. P1.3 tests verify responsive measured geometry,
orientation, notation, decorative descendants, and invalid-domain fallbacks.
P1.4 tests add current-prop piece rendering, default and whole-map custom
renderers, static style precedence, instance isolation, square-before-piece
ordering, and board-owned visual-only wrappers. Later slices must verify the
complete annotation/interaction layer order and custom square renderer behavior.

This decision owns invariants `CBN-INV-010`, `CBN-INV-013`, `CBN-INV-014`,
and `CBN-INV-018`.
