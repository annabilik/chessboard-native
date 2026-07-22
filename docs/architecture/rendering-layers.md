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

The nearest `ChessboardProvider` supplies one active overlay lease shared by
every registered board and external source in that provider scope. The active
provider projects that lease once after its children as a transient absolute,
pointerless overlay plane. It measures the overlay host in window coordinates
and subtracts that origin from the active pointer transform. It is not another
semantic board layer: it renders only the active provider epoch's detached
piece visual and pointer transform, remains hidden from accessibility, and
disappears on cancellation or replacement. The provider remains layout-neutral
because it does not wrap or size its children. A standalone board creates a
private provider, so board-local composition works without an explicit wrapper;
a public external source requires an explicit provider shared with its target.

SVG paths do not use document-global marker IDs. Every board owns its visual
and animation state. Orientation changes coordinate projection only; canonical
square IDs and consumer data remain unchanged.

Custom square and piece renderers are visual-only. Their props provide piece,
square, size, resolved style, and interaction flags, but no gesture or
accessibility handlers. Piece props also discriminate a board source from a
provider spare source. A board visual has
`source: { kind: 'board', square }` and a non-null `square`; a spare visual has
`source: { kind: 'spare', spareId }` and a nullable square. The public external
source and its source ghost pass `square: null`; its active provider overlay
passes the current canonical target while over a board and `null` off-board. A
pending spare visual projected inside its target board likewise carries that
canonical target. `renderSquare` receives the current controlled piece or
`null`, canonical square, measured size, resolved frozen style, and frozen
square state. The board always paints its resolved square first, so an omitted
renderer or a `null` result retains the same fallback paint. Renderer content
is contained by a pointerless, accessibility-hidden board- or spare-owned
wrapper and cannot become an alternate event surface.

Static theme and style precedence is fixed as built-in defaults, `theme`,
instance `styles`, then canonical `squareStyles`. Named square-state paint then
applies in the fixed order destination, selected, disabled, and drop target.
Within each state slot, the built-in default is followed by `theme` and instance
`styles` before the next slot starts. Later layers override earlier layers. The
first three states derive from the current normalized selection; drop target is
correlated transient hover presentation and never authorizes a move. Pressed
and pending source/target flags are renderer context, not semantic state or
separate public paint slots. None can replace board-owned square geometry.
Custom piece and square renderers receive the resolved style rather than
performing a second merge.

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
adapts Colin M.L. Burnett's Cburnett artwork from the individual standard
transparent SVG files on Wikimedia Commons. The SVG geometry and paint data are
re-expressed as responsive `react-native-svg` components. The artwork
adaptation is CC BY-SA 3.0 and is isolated from the surrounding MIT-licensed
code through the package-local notice and license. Wikimedia Commons is the
recorded artwork origin; the frozen `react-chessboard` fixture was consulted as
a conversion reference but remains package-excluded. Lichess uses the same
design as its default piece set.

Supplying `pieceRenderers` replaces that lookup as a whole. Consumers that want
one standard override spread `defaultPieceRenderers` explicitly; an absent key
renders no piece artwork. This also supports object positions with open custom
piece types without teaching the board a second vocabulary. Returning `null`
from a selected renderer is intentional and does not fall back to the default
set.

`defaultTheme` supplies board, square, light/dark square, controlled
destination/selected/disabled square, drop target, dragging piece, source
ghost, notation, and piece defaults. `theme` overrides those
defaults, `styles` applies instance-level overrides, and `squareStyles` applies
the final static square override by canonical square ID before the controlled
and transient square-state slots. The built-in state styles use inset shadow or
opacity without altering layout. File/rank notation retains its
measured placement while accepting resolved native text styles. Static board
piece renderers receive their resolved native style, measured size, non-null
square, board source, piece, board ID, and all-false interaction state. The
board-owned piece wrapper applies the resolved `ViewStyle` once; the renderer
receives the same frozen value for inspection or derived non-View artwork and
must not merge it onto the wrapper a second time.

For ordinary piece paint the chain is built-in `piece`, `theme.piece`, then
`styles.piece`. Active drag-overlay paint appends built-in,
`theme.draggingPiece`, and `styles.draggingPiece`; its transform is appended
after pointer translations by the overlay worklet and is omitted under reduced
motion. The active source ghost instead appends the corresponding
`draggingPieceGhost` chain. The named target board's resolved transient styles
apply to both board-origin and spare-origin active drags. A spare's own `style`
remains its resting base paint until the provider lease is active; the target
board then owns overlay and ghost presentation.

When `gesture.allowDragOffBoard` is false, that same overlay worklet clamps its
center to the target board before subtracting the provider host origin and
before appending the lift or consumer transform. Board sources use local
gesture geometry; targeted spares use shared target-window bounds. The raw
pointer, hover hit test, and release point remain untouched, so the rendering
constraint cannot authorize or redirect a move.

Each measured square gets one frozen `SquareRendererProps` value. Selection
flags come from current controlled selection, pressed/drop-target flags from
the current correlated gesture, and pending source/target flags from the current
move lifecycle. Square-boundary changes, rather than per-frame pointer samples,
cross to React for transient square projection. Stale gesture, geometry,
provider, or mount correlation clears or ignores that presentation. The
renderer receives no handlers; the board applies the resolved style once to its
paint wrapper before mounting the renderer as content.

Board-local measurement and absolute cell geometry remain owned by the board
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

P4.3 composes at most one draft through those same planes without placing it in
the normalized annotation collection. The draft is correlated to the current
board identity, annotation and position revisions, board geometry epoch,
provider geometry revision, and provider lifecycle revision. Any mismatch
suppresses it synchronously, so a committed frame cannot paint a draft captured
from stale props or coordinates. Active arrows use the configured active width
multiplier and opacity and remain exempt from shared-target shortening. The
draft is pointerless, accessibility-hidden, and has no persistent consumer ID.

Notation now occupies its own decorative plane above both annotation planes.
P4.4 touch gestures and P4.5 accessibility actions feed the same correlated
draft slot and operation boundary; neither adds a visual or semantic layer.
P5.1 adds visual-only square content and the public drop-target,
dragging-piece, and source-ghost paint slots without changing layer ownership.

P3.2 promotes the piece plane to stable `Animated.View` hosts. The latest
controlled position still creates every current host; a detached transition
plan may only add pointerless, accessibility-hidden exit hosts and animated
style data. One shared progress value per board translates current move targets,
fades current enter actors, and fades removed/captured/ambiguous exits below
current pieces. Current and exit renderers receive
`PieceVisualState.isTransitioning = true` only while that exact epoch remains
active. Completion restores the same current hosts to static state and removes
exit artwork.

P3.3 projects an accepted `rookMove` as a second ordinary move on that shared
progress value and an accepted `capturedSquare` as one reserved stationary
exit. For a type-changing replacement, detached before artwork translates from
source to target while fading out; the canonical current target artwork uses
the same path while fading in. At every progress value they are visually
co-located. Captured exits paint first, replacement-before artwork next, and
current target artwork last. This supports castling, off-target en passant
capture, promotion, and stable-ID custom transformations without a fake
position or second clock.

P3.4 inserts a private `TransitionPresentation` actor graph between the exact
semantic plan and the piece layers. A rapid A-B-C update still renders C from an
exact B-to-C plan, but an identity-safe current host begins at its sampled
A-to-B normalized point and opacity and gives the new B-to-C segment the
configured full duration. Detached and pending actors that remain visibly
useful can finish as bounded fading residuals. Geometry or orientation changes
instead rebase the active graph into the new measured projection under a fresh
presentation epoch while preserving the original segment's deadline and using
only its remaining time. The graph has no position snapshot, and reduced motion
or unusable measurement clears it and renders only the latest controlled target
without later replay.

When a newer revision exactly correlates an active non-null pending target, the
handoff's revision pair and source, piece, and target must also match one current
plan actor. The pending layer and canonical target host then share that point
while the former fades out and the latter fades in. The source-to-target move is
not replayed; secondary operations still use their adjacent transition plan.
Unrelated commits, actor mismatches, and off-board removals use the ordinary
transition layers and never manufacture a pending target.

P2.2 adds the layer-six board gesture plane. When enabled by the public
interaction boundaries, it is one absolute, accessibility-hidden native view
rather than one handler per square. `onMoveRequest` enables single-pointer pan
for drag, while `onSquareActivate` enables recognized same-square tap for any
valid square, including an empty one. The plane composes one tap and one pan
recognizer and disables either recognizer when its callback gate is closed. With
neither callback, the controller renders no native plane and constructs no
recognizer, preserving both the read-only and single-control accessibility
contracts. Pan activation and terminal events cross to the board-scoped
adapter; tap crosses only after same-square recognition. Per-frame pointer
movement and oriented target hit testing remain in shared values.

The same internal presentation state projects drag lift, a source ghost, and
decision or controlled-commit pending flags without retaining a semantic
position. The board publishes the active drag visual and shared pointer values
to its nearest provider. The provider-level overlay sibling uses a direct
animated transform, so frame updates do not rerender custom artwork or commit
React state. Exactly one overlay can be active in a provider even when multiple
boards and spare sources are present; source ghost and pending projection remain
routed to the owning board ID and mount token. P5.1 resolves public drag-overlay
and source-ghost styles after the static piece chain. Board and spare drag
target-square changes update the public drop-target paint and square-renderer
state only when the canonical hover square changes. Pending and pressed remain
renderer state; transition-specific public styling remains future work.

P2.6 adds a `SparePiece` source host with one visual-only piece renderer, one
accessible button, and one board-external pan recognizer. Its visual root fixes
its structural size from the `size` prop. P2.7 moves the active overlay out of
that source host and into the provider-level sibling, so a palette child may
use `overflow: 'hidden'` without cropping artwork that travels to a board
elsewhere in the same provider. The provider overlay is not a native window
portal; clipping an ancestor of the full provider scope can still crop it. The
overlay stays mounted during asynchronous release measurement and is removed
on every terminal verified, rejected, cancelled, replaced, or stale path.

P1.5 promotes only the stable outer host to one adjustable accessibility
control. It uses `pointerEvents="box-none"` so ordinary touch remains available
to ancestors while the native host can receive assistive-technology actions.
The inner surface, every visual square, piece wrapper, renderer subtree, and
notation label remain explicitly decorative and hidden. The host owns only a
transient canonical virtual cursor. Reading-order and directional navigation
project that cursor through current dimensions and orientation without using
measurement or updating consumer-owned selection. Position and selection
changes refresh its value; orientation retains the canonical square and host
identity. Static annotations and board-local gesture hit testing use the same
orientation-aware measured projection. Provider release verification translates
fresh window bounds into that local projection and rejects stale registration,
board-geometry, provider-geometry, or interaction epochs.

`ChessboardProvider` itself adds no accessibility target. Its transient overlay
sibling is pointerless and uses `no-hide-descendants`; this hides only overlay
artwork, not the provider's board children. Two registered boards therefore
remain two independent adjustable controls, and a private provider does not
change the single-board accessibility tree.

The interaction-enabled accessibility surface retains navigation and adds
source activation, target activation, off-board removal, cancellation, and
controlled selection clearing. With `onSquareActivate`, activation uses the
same exclusive current-snapshot router as touch: a declared destination can
emit one move request while accessible move input is permitted, while other
squares emit one immutable activation. Clear selection is an explicit
activation request and never edits the controlled prop.
Without that callback, `onMoveRequest` retains its transient accessible
source-target fallback. A provider-selected spare takes precedence over the
ordinary activation action set only on its named target board. That board
exposes place when its current move/accessibility gates permit it and always
exposes cancel while the selection matches. The spare source remains a separate
accessible button; its renderer descendants and drag overlay are decorative.
Board-press and position-change annotation policies now emit controlled
operations without changing this accessibility tree or the rendered collection.
When the measured annotation tool/collection/handler gate is complete, the same
host exposes arrow start/finish/cancel or immediate square-toggle actions while
keeping cursor navigation. Those actions are exclusive with ordinary move and
square activation; provider-selected spare and pending-move cancellation keep
precedence. The annotation draft remains decorative and only consumer feedback
can change the persistent planes.
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
ordering, and multi-board isolation. P4.1/P4.3 tests add controlled-operation
emission, stale-base application, independent policy clearing, single-draft
composition, active styling, exact correlation invalidation, and persistent
collection isolation. P4.4/P4.5 add shared touch/accessibility session,
exclusive action routing, current-callback, native-action, and controlled
feedback coverage. P5.1 tests add frozen square-renderer context, fallback
paint, board-owned pointer/accessibility containment, transient state clearing,
drop-target precedence, and drag/ghost style projection. P2.2 tests add
rectangular worklet hit
testing, tap/pan boundary correlation, zero per-frame JS signals,
disabled-by-default mounting, reducer adapter stale-event guards, and transient
piece presentation. P2.3 tests add public permission gates, drag overlay
mounting, accessible source/target/removal/cancel actions, current-snapshot
request correlation, and decision/commit timeout races while preserving one
accessible board control. The controlled-selection activation slice adds style
precedence, immutable activation payload, exclusive destination routing,
accessible clear-selection, commit-only callback lookup, and stale-selection
correlation tests. P2.5 tests add private-versus-explicit provider composition,
provider-scoped identity enforcement, token-safe registration cleanup,
multi-board isolation, one shared overlay, and fresh release-measurement race
coverage. P2.6 tests add source-discriminated custom renderers, public spare
composition, fresh target-board payloads, transient tap/accessibility placement
selection, and place/cancel routing without a semantic position copy. P2.7
tests add
parent-ScrollView arbitration, AppState and geometry invalidation,
provider-level clipping remediation, long-pan render/callback counters,
cancellation reuse, and packed Android/iOS board-scroll/lifecycle scenarios.
P3.2 tests add measured white/black and rectangular move transforms, ordinary
capture ordering, enter/exit/ambiguity fades, current-square
renderer context, latest-prop cancellation, reduced-motion and zero-duration
settling, post-commit warning deduplication, and simultaneous-board animation
isolation. P3.3 tests add deterministic promotion/reversal inference,
capture-square reservation, coordinated and crossing two-actor plans,
replacement path co-location and paint order, mounted special-move completion,
and rules-free explicit custom promotion. P3.4 tests add sampled A-B-C
continuity with a full new-segment duration, exact adjacent-plan correlation,
geometry/orientation rebasing over the original remaining time, reduced-motion
settle-without-replay, correlated pending target crossfade, and ordinary
unrelated/off-board commit behavior.

This decision owns invariants `CBN-INV-010`, `CBN-INV-013`, `CBN-INV-014`,
and `CBN-INV-018`.
