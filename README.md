# chessboard-native

A controlled, rules-free React Native chessboard component.

> [!NOTE]
> This repository is at its baseline scaffold. No npm package or functional
> board component has been published yet.

## Direction

`chessboard-native` will provide the useful native behavior of
`react-chessboard` without copying its browser implementation or creating a
second source of truth.

The central contract is:

- Consumers own position, annotations, and optional selection state.
- The component may own transient gesture, measurement, focus, and animation
  state.
- The package does not contain chess rules, legal-move validation, application
  state, or VibeChess protocol code.

The initial compatibility target is `react-chessboard@5.10.0`, commit
`b74704a`. Android and iOS are the first-class platforms; React Native Web is
post-1.0 work.

## Repository status

The first implementation phase establishes the repository and contract
foundation. Package code, the Expo gallery, and native consumers land in
separate, reviewable changes.

## Development

The toolchain is pinned to Node.js 24.15.0 and pnpm 11.11.0.

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm check
```

Root commands:

| Command             | Purpose                                 |
| ------------------- | --------------------------------------- |
| `pnpm format`       | Format supported repository files       |
| `pnpm format:check` | Verify formatting without writing       |
| `pnpm lint`         | Run code and Markdown linting           |
| `pnpm typecheck`    | Run the strict TypeScript project check |
| `pnpm check`        | Run every baseline pull-request check   |
| `pnpm changeset`    | Create a package release note           |

See [CONTRIBUTING.md](./CONTRIBUTING.md) before opening a pull request. Report
security issues according to [SECURITY.md](./SECURITY.md).

## License

New project code is available under the [MIT License](./LICENSE). Third-party
material must retain its own license and attribution; see
[NOTICE.md](./NOTICE.md) and [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md).
