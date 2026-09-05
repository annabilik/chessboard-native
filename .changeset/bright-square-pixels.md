---
'@vibechess/chessboard-native': patch
---

<!-- markdownlint-disable MD041 -->

Align square paint edges to the native pixel grid to prevent thin background
seams when a board has fractional cell sizes or a fractional parent origin.
Keep gesture geometry, piece positions, and custom renderer sizes unchanged.
