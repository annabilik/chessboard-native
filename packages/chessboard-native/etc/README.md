# API reports

This directory contains the reviewed API Extractor report for the package.
Update it with `pnpm api:update` only after reviewing an intentional public API
change.

API Extractor 7.58.9 embeds TypeScript 5.9.3, so it prints a compatibility
notice while analyzing this repository's TypeScript 6 declarations. The pinned
scripts explicitly supply the workspace TypeScript compiler folder, and the
report is verified against the emitted declarations in CI.
