---
'@vibechess/chessboard-native': minor
---

<!-- markdownlint-disable MD041 -->

Add a stale-safe `ChessboardActions.cancelMove` handle and declarative
`gesture.allowDragOffBoard` overlay bounds. Cancellation clears only transient
move work, while visual clamping leaves raw hit testing and nullable off-board
move intents unchanged.
