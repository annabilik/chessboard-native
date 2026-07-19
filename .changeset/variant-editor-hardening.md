---
'@vibechess/chessboard-native': minor
---

<!-- markdownlint-disable MD041 -->

Add selected-spare tap placement on the named board's current controlled move
runtime. The tap path is revision- and selection-correlated, yields to pending
moves and disabled targets, and remains exclusive with annotations and ordinary
piece/square activation.

Harden open custom piece types with prototype-safe default accessibility labels
and snapshot `SparePiece` payload fields exactly once per prop identity.
