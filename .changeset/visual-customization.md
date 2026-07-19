---
'@vibechess/chessboard-native': minor
---

<!-- markdownlint-disable MD041 -->

Add visual-only custom square rendering plus declarative drop-target,
dragging-piece, and source-ghost theme and instance style slots. Custom
square content receives frozen controlled and transient context inside the
board-owned measured, pointerless, accessibility-hidden paint layer.
Spare drag-overlay renderers now receive the current canonical hover square,
or `null` while off-board; resting spare and source-ghost renderers remain
squareless.
