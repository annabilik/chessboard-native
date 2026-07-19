---
'@vibechess/chessboard-native': minor
---

<!-- markdownlint-disable MD041 -->

Add observational `onSquarePressIn` and `onSquarePressOut` callbacks with a
detached, frozen `SquarePressContext` captured from the current controlled
position. Press callbacks can run on an otherwise read-only board without
enabling activation, pair release and mounted cancellation exactly once, and
remain isolated from semantic state and callback exceptions.
