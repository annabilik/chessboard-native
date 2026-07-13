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
5. Decorative edge notation.
6. Provider-coordinated gesture hit testing.
7. Single-control accessibility semantics.

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
min/max sizes, physical/logical margins, transforms, and pointer-event
overrides. Consumer square transforms may alter paint presentation. Piece
transforms and other geometry-like fields remain in the frozen value exposed to
a renderer for derivation, but the board-owned piece host contains them so none
changes the shared measured coordinate system or hit-test semantics.

P1.6 adds two pointerless, accessibility-hidden SVG annotation planes around the
piece plane. Rendering consumes only the current normalized controlled
annotation collection and preserves collection order within each layer. There
is no persistent internal arrow list, and a prop replacement removes the prior
collection immediately. Invalid current annotations render no annotation plane
without hiding a valid current position.

Annotation geometry uses a fixed logical view box 2048 units wide and
`2048 * rows / columns` units high. Every logical square is therefore square,
including on rectangular boards, and canonical square centers project through
orientation using the same row/column mapping as the measured View layers.
Square annotations default below pieces and to a full-cell fill; circle, dot,
and inset border shapes are deterministic alternatives. Arrows default above
pieces. Omitted arrow shape uses integer canonical file/rank deltas to select a
knight path only for a one-by-two move. An explicit straight shape always wins;
an explicit knight shape selects an L path when both axes change and otherwise
falls back to a straight path.

Arrow endpoints are shortened before the target center. Arrows with different
sources and the same target use the stronger collision reduction, while the
same source-target pair does not. `ArrowAnnotation.width` is an explicit stroke
width in the fixed logical view box; omitted width derives from the square size
and `annotationStyle.arrowWidthDenominator`. Per-arrow opacity likewise wins
over the style default. `annotationStyle` is a complete whole-value
configuration, and `defaultAnnotationStyle` retains the pinned ten geometry,
opacity, and future-tool color defaults. Arrowheads are explicit SVG polygons,
not marker references or document-global IDs, so simultaneous boards and
duplicate consumer annotation IDs across boards cannot collide.

Notation now occupies its own decorative plane above both annotation planes.
Custom square rendering, public interaction-state styling, Reanimated
transitions, and annotation drafts/drawing remain later slices.

P2.2 adds the private layer-six board gesture plane. It is one absolute,
accessibility-hidden native view rather than one handler per square. While the
public move-request boundary is absent, the plane is pointerless and does not
mount a `GestureDetector`, preserving the read-only board contract. Internal
tests can explicitly enable the plane to compose exclusive tap and pan
recognizers; the pan accepts exactly one pointer. Pan activation and terminal
events cross to the board-scoped adapter; per-frame pointer movement and
oriented target hit testing remain in shared values.

The same internal presentation state projects drag lift, a source ghost, and
decision or controlled-commit pending flags without retaining a semantic
position. A pointerless drag-overlay primitive consumes board-local shared
pointer coordinates with a direct animated transform, so frame updates do not
rerender custom artwork or commit React state. These are foundations only: the
public board does not yet mount a live overlay or pending flow, and there are no
public transient style options in this slice.

P1.5 promotes only the stable outer host to one adjustable accessibility
control. It uses `pointerEvents="box-none"` so ordinary touch remains available
to ancestors while the native host can receive assistive-technology actions.
The inner surface, every visual square, piece wrapper, renderer subtree, and
notation label remain explicitly decorative and hidden. The host owns only a
transient canonical virtual cursor. Reading-order and directional navigation
project that cursor through current dimensions and orientation without using
measurement or updating consumer-owned selection. Position and selection
changes refresh its value; orientation retains the canonical square and host
identity. Static annotations use the same orientation projection; gesture hit
testing will use the measured coordinate system in a later slice.

The accessibility action surface in P1.5 contains navigation only. Semantic
activation, controlled selection clearing, move/removal intents, spare
placement, and annotation operations remain with the later interaction slices.
Consumer announcements are correlated by ID and deduplicated per mounted board.
The centralized reduced-motion provider follows `system`, `always`, or `never`
without remounting this host or its cursor.

React Native 0.86 suppresses Android's adjustable `TYPE_VIEW_SELECTED` feedback
when `accessibilityValue.text` is present, and directional custom actions do not
take that standard scroll-action path. After a successful Android cursor action
commits, the board therefore announces the current formatted value explicitly.
It never announces from a state updater or for a boundary no-op. Consumer
announcements use non-empty IDs and queued iOS delivery independently of cursor
feedback.

Android lists unlabeled increment/decrement actions for TalkBack. iOS receives
those events from the adjustable trait without listing them, because Fabric
otherwise duplicates every listed standard action in the custom rotor using its
non-localized action name. Directional custom labels are trimmed and repaired
to remain non-empty and unique before they reach that label-based dispatch map.

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
ordering, and board-owned visual-only wrappers. P1.5 tests add virtual-cursor
projection, single-host semantics, formatter contexts, announcement lifetimes,
reduced-motion races, and mounted-board isolation. P1.6 tests add controlled
collection replacement, rectangular/oriented geometry, straight and knight
paths, target shortening, explicit marker-free heads, below/piece/above/notation
ordering, and multi-board isolation. Later slices must verify annotation drafts
and custom square renderer behavior. P2.2 tests add rectangular worklet hit
testing, tap/pan boundary correlation, zero per-frame JS signals,
disabled-by-default mounting, reducer adapter stale-event guards, and transient
piece presentation. Native ScrollView arbitration and frame-performance proof
remain mandatory later evidence.

This decision owns invariants `CBN-INV-010`, `CBN-INV-013`, `CBN-INV-014`,
and `CBN-INV-018`.
