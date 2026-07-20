# API reports

This directory contains the reviewed API Extractor reports for the package root,
the `pieces` subpath, and the `react-chessboard-compat` subpath. Update them with
`pnpm api:update` only after reviewing an intentional public API change. All
three reports are checked against their emitted declaration entry points in CI.

The `pieces` subpath intentionally exports only `defaultPieceRenderers`.
Its report includes the referenced renderer type closure as forgotten exports,
and the documentation checker locks that exact diagnostic-symbol allowlist.
This keeps the value-only entry point self-contained for review without adding
type exports to the subpath.

API Extractor 7.58.9 embeds TypeScript 5.9.3, so it prints a compatibility
notice while analyzing this repository's TypeScript 6 declarations. The pinned
scripts explicitly supply the workspace TypeScript compiler folder, and the
report is verified against the emitted declarations in CI.
