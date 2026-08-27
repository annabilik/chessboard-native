---
'@vibechess/chessboard-native': patch
---

<!-- markdownlint-disable MD041 -->

Make Android drag-overlay release and provider teardown safe under Fabric while
removing the first-paint JS origin-measurement round trip and preserving
exactly-once controlled move commits, custom piece-renderer continuity,
reduced-motion behavior, and iOS drag presentation.
