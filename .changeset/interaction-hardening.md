---
'@vibechess/chessboard-native': minor
---

<!-- markdownlint-disable MD041 -->

Harden native board and spare-piece interaction inside ancestor ScrollViews,
cancel transient work on AppState and geometry changes, and move the shared
pointerless drag overlay to the provider level so clipped source palettes do not
crop it.

Add deterministic render/callback and provider-overlay coverage plus packed
Android and iOS interaction scenarios for board/ScrollView arbitration,
lifecycle cancellation, and reuse.
