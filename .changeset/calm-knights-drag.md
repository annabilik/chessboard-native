---
'@vibechess/chessboard-native': patch
---

<!-- markdownlint-disable MD041 -->

Make Android drag-overlay release and provider teardown safe under Fabric while
preserving exactly-once controlled move commits, custom piece-renderer
continuity, reduced-motion behavior, and iOS drag presentation.
