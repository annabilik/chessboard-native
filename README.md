# chessboard-native

A controlled, rules-free React Native chessboard component.

> [!NOTE]
> This repository is in its native-harness phase. The package is not published,
> and its public component currently renders only a disabled board frame.

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

The repository baseline, JavaScript package shell, browserless test foundation,
bare React Native 0.86 harness, and packed-artifact build gates are in place.
The controlled public data model, interaction, pieces, and annotations land in
separate reviewable changes.

## Development

The toolchain is pinned to Node.js 24.15.0 and pnpm 11.11.0.

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm verify
```

Root commands:

| Command               | Purpose                                      |
| --------------------- | -------------------------------------------- |
| `pnpm build`          | Build package ESM and declarations           |
| `pnpm test`           | Run the package Jest suite                   |
| `pnpm api:check`      | Compare built declarations with the API lock |
| `pnpm api:update`     | Update the API lock after review             |
| `pnpm package:check`  | Inspect one archive with Publint and ATTW    |
| `pnpm format`         | Format supported repository files            |
| `pnpm format:check`   | Verify formatting without writing            |
| `pnpm lint`           | Run code and Markdown linting                |
| `pnpm typecheck`      | Run strict source and test type checks       |
| `pnpm check`          | Run static checks and tests                  |
| `pnpm verify`         | Run the complete pull-request gate locally   |
| `pnpm changeset`      | Create a package release note                |
| `pnpm example:start`  | Start the Expo gallery                       |
| `pnpm example:export` | Export Android and iOS gallery bundles       |
| `pnpm native:start`   | Start Metro for the bare native harness      |
| `pnpm native:android` | Run the native Android harness               |
| `pnpm native:ios`     | Run the native iOS harness                   |

Native release gates are platform-specific:

```sh
pnpm native:android:release
pnpm native:ios:gems
pnpm native:ios:pods
pnpm native:ios:release
```

The iOS commands require macOS with Xcode, Ruby, Bundler, and CocoaPods.
`pnpm verify` remains portable and does not invoke either native toolchain; CI
runs Android and iOS Release builds as independent required jobs.

## Packed artifact gate

CI builds and inspects one npm archive, then installs those exact bytes into
fresh Expo and bare React Native consumers outside the checkout. The smoke
runner rejects workspace dependencies, source-repository resolution, package
symlinks, and missing declared peers before any build starts. CI then runs both
Expo production exports, an Expo Android Release assembly, and bare Android and
iOS Release builds after a clean CocoaPods install.

To prepare either isolated consumer locally:

```sh
smoke_root="$(mktemp -d)"
pnpm build
node scripts/inspect-package.mjs \
  --output "$smoke_root/chessboard-native.tgz"
node scripts/smoke-packed.mjs \
  --consumer expo \
  --archive "$smoke_root/chessboard-native.tgz" \
  --destination "$smoke_root/expo"
```

Use `--consumer native` with a different fresh destination for the bare
harness. The workspace-linked commands remain useful for development, but do
not replace the packed package gate.

`pnpm api:check` expects a fresh `pnpm build`. Use `pnpm api:update` only when
an intentional public declaration change has been reviewed.

See [CONTRIBUTING.md](./CONTRIBUTING.md) before opening a pull request. Report
security issues according to [SECURITY.md](./SECURITY.md).

## License

New project code is available under the [MIT License](./LICENSE). Third-party
material must retain its own license and attribution; see
[NOTICE.md](./NOTICE.md) and [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md).
