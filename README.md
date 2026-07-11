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
bare React Native 0.86 harness, packed-artifact build gates, and pinned upstream
parity inventory are in place. The controlled public data model, interaction,
pieces, and annotations land in separate reviewable changes.

## Development

The toolchain is pinned to Node.js 24.15.0 and pnpm 11.11.0.

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm verify
```

Root commands:

| Command                | Purpose                                      |
| ---------------------- | -------------------------------------------- |
| `pnpm build`           | Build package ESM and declarations           |
| `pnpm test`            | Run the package Jest suite                   |
| `pnpm api:check`       | Compare built declarations with the API lock |
| `pnpm api:update`      | Update the API lock after review             |
| `pnpm package:check`   | Inspect one archive with Publint and ATTW    |
| `pnpm parity:check`    | Validate the upstream inventory and ledger   |
| `pnpm parity:update`   | Regenerate the rendered parity document      |
| `pnpm parity:complete` | Run the eventual 1.0 parity-closure gate     |
| `pnpm format`          | Format supported repository files            |
| `pnpm format:check`    | Verify formatting without writing            |
| `pnpm lint`            | Run code and Markdown linting                |
| `pnpm typecheck`       | Run strict source and test type checks       |
| `pnpm check`           | Run static checks and tests                  |
| `pnpm verify`          | Run the complete pull-request gate locally   |
| `pnpm changeset`       | Create a package release note                |
| `pnpm example:start`   | Start the Expo gallery                       |
| `pnpm example:export`  | Export Android and iOS gallery bundles       |
| `pnpm native:start`    | Start Metro for the bare native harness      |
| `pnpm native:android`  | Run the native Android harness               |
| `pnpm native:ios`      | Run the native iOS harness                   |

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

## Upstream parity

The compatibility target is frozen to `react-chessboard@5.10.0`, commit
`b74704af988396d3da32a8c1627d95341e1e0061`. Its byte-identical 16-file,
2,753-line source tree and complete licensing are kept under
[`fixtures/parity/upstream-b74704a`](./fixtures/parity/upstream-b74704a/PROVENANCE.md)
for offline, line-addressable review. The fixture is reference-only and the
package inspection gate rejects any source or Cburnett artwork leaking into the
npm archive.

The [machine-readable ledger](./fixtures/parity/react-chessboard-5.10.json) is
the source of truth; its [rendered view](./docs/parity/react-chessboard-5.10.md)
tracks all 39 root exports, 42 options, and 50 reviewed observable behaviors.
The checker derives exports, defaults, callback/style facets, and nested default
members directly from the vendored TypeScript AST. It also verifies fixture
hashes, unique dispositions and contract IDs, forward-only status transitions,
source references, and generated documentation.

Rows begin as `planned`. Future implementation PRs move them through
`in-progress` to `implemented` and supply normalized, executed contract-result
shards matching
[`results.schema.json`](./fixtures/parity/results.schema.json). The checker
never searches source text for a test ID. CI generates each shard from raw Jest
runner output, binds it to the checked-out commit and evidence hash, and rejects
tracked or hand-edited normalization. Normal CI permits reserved IDs for
unfinished work but requires every implemented row to resolve to exactly one
passing execution when its disposition is `keep` or `adapt`;
`pnpm parity:complete --results <path>` additionally requires every keep/adapt
row to be implemented and all 131 contract IDs to be passing.

See [CONTRIBUTING.md](./CONTRIBUTING.md) before opening a pull request. Report
security issues according to [SECURITY.md](./SECURITY.md).

## License

New project code is available under the [MIT License](./LICENSE). Third-party
material must retain its own license and attribution; see
[NOTICE.md](./NOTICE.md) and [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md).
