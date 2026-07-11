# Contributing

Thanks for helping build `chessboard-native`.

The project is intentionally controlled and rules-free: consumers own the
position and annotations, while the library owns only transient presentation
and interaction state. Changes that introduce a second canonical board state
or a bundled chess rules engine are out of scope.

## Development setup

Prerequisites:

- Node.js 24.15.0
- pnpm 11.11.0 through Corepack or an equivalent pinned installation

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm check
```

Use the repository's pinned versions. Do not commit dependency changes without
the resulting `pnpm-lock.yaml` update.

## Pull requests

- Keep each pull request focused and explain user-visible behavior.
- Add tests at the lowest authoritative layer when implementation code exists.
- Update documentation with public API or behavior changes.
- Run `pnpm check` before requesting review.
- Do not include proprietary VibeChess code or artwork.
- Do not vendor third-party source or assets without their license and
  attribution.

Run `pnpm changeset` for changes to a published package that require a release
note or semantic-version update. Infrastructure-only and documentation-only
changes normally do not need one.

By contributing, you agree that your contribution is licensed under the MIT
License in this repository.
