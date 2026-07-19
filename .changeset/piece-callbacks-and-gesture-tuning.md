---
'@vibechess/chessboard-native': minor
---

<!-- markdownlint-disable MD041 -->

Add non-committing `onPiecePress` and `onPieceDragStart` observations for board
pieces and targeted spares. Their frozen contexts come from the named board's
current controlled position revision, callback exceptions cannot break input,
and an occupied piece press never also bubbles into square activation.

Add `gesture.activationDistance` as a validated, finite non-negative native
point threshold shared by a board and spares targeting that board. It defaults
to four points and changes gesture recognition only, never controlled state.
