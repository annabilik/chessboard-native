---
'@vibechess/chessboard-native': patch
---

<!-- markdownlint-disable MD041 -->

Prevent interrupted controlled-position animations from updating removed
Fabric hosts by quiescing disappearing piece and pending-handoff hosts through
a two-frame retirement window and avoiding terminal progress writes during
transition teardown.
