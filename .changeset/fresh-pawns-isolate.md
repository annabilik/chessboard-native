---
'@vibechess/chessboard-native': patch
---

<!-- markdownlint-disable MD041 -->

Isolate every controlled-position transition epoch on its own Reanimated
progress clock so rapid 200 ms transitions cannot write through retained
descriptors from an interrupted epoch, while keeping retirement shells as
non-collapsible native hosts until their guarded removal.

Keep pending-target visual handoff drag-only so correlated tap, keyboard, and
accessibility commits retain their ordinary configured transition.
