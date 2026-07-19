# Architecture invariant registry

These are the non-negotiable constraints for `chessboard-native`. The
machine-readable source is
[`fixtures/contracts/architecture-invariants.json`](../../fixtures/contracts/architecture-invariants.json).

Each ID has a reserved contract-test namespace. A reservation is not evidence
that behavior exists: the owning implementation PR must replace it with an
executed contract at the lowest authoritative test layer. PR #7 validates the
registry, uniqueness, order, and ADR links only.

<!-- markdownlint-disable MD013 -->

| Invariant     | Reserved contract                            | Requirement                                                                                                                                                                                                                |
| ------------- | -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CBN-INV-001` | `CBN-CONTRACT-001-POSITION-CANONICAL`        | `position` is the only canonical logical position.                                                                                                                                                                         |
| `CBN-INV-002` | `CBN-CONTRACT-002-ANNOTATIONS-CANONICAL`     | `annotations` is the only persistent annotation collection.                                                                                                                                                                |
| `CBN-INV-003` | `CBN-CONTRACT-003-GESTURE-NONCOMMITTING`     | A gesture cannot commit semantic state.                                                                                                                                                                                    |
| `CBN-INV-004` | `CBN-CONTRACT-004-CALLBACK-NONCOMMITTING`    | A callback result cannot substitute for a new controlled prop.                                                                                                                                                             |
| `CBN-INV-005` | `CBN-CONTRACT-005-VISUAL-NONCANONICAL`       | A transient visual snapshot cannot become canonical state.                                                                                                                                                                 |
| `CBN-INV-006` | `CBN-CONTRACT-006-LATEST-PROP-WINS`          | The latest prop update always wins over an active animation.                                                                                                                                                               |
| `CBN-INV-007` | `CBN-CONTRACT-007-REVISION-EPOCH`            | Revisions are monotonic, and every async result is correlated to its epoch and base revision.                                                                                                                              |
| `CBN-INV-008` | `CBN-CONTRACT-008-RESTORE-CONTROLLED`        | Rejection and cancellation restore the current controlled position.                                                                                                                                                        |
| `CBN-INV-009` | `CBN-CONTRACT-009-UPDATE-CANCELS-GESTURE`    | Position changes during a gesture cancel the gesture and every associated timer/signal; late results are inert.                                                                                                            |
| `CBN-INV-010` | `CBN-CONTRACT-010-DRAFT-NONPERSISTENT`       | Annotation drafts are visually distinguishable and never persisted.                                                                                                                                                        |
| `CBN-INV-011` | `CBN-CONTRACT-011-OPERATION-NONREPLACING`    | Annotation operations never replace a collection and cannot silently remove IDs created after their base revision.                                                                                                         |
| `CBN-INV-012` | `CBN-CONTRACT-012-SELECTION-CONSUMER-OWNED`  | Semantic board selection and destinations are consumer-owned; the provider may own only transient spare-source selection for non-drag placement.                                                                           |
| `CBN-INV-013` | `CBN-CONTRACT-013-ORIENTATION-PRESERVES-IDS` | Orientation changes coordinates, not canonical square names.                                                                                                                                                               |
| `CBN-INV-014` | `CBN-CONTRACT-014-MULTIBOARD-ISOLATION`      | Multiple board instances share no semantic, SVG, animation, or annotation state. Provider gesture infrastructure is shared transiently and must route all active state by stable `boardId` without leaking between boards. |
| `CBN-INV-015` | `CBN-CONTRACT-015-PROVIDER-NONSEMANTIC`      | A provider owns transient cross-component dragging but no semantic board state.                                                                                                                                            |
| `CBN-INV-016` | `CBN-CONTRACT-016-RULES-FREE`                | The core package does not enforce chess rules.                                                                                                                                                                             |
| `CBN-INV-017` | `CBN-CONTRACT-017-REDUCED-MOTION`            | Reduced motion is honored by every transition path.                                                                                                                                                                        |
| `CBN-INV-018` | `CBN-CONTRACT-018-NONDRAG-ALTERNATIVE`       | Every drag-only action has a non-drag accessible alternative.                                                                                                                                                              |
| `CBN-INV-019` | `CBN-CONTRACT-019-MALFORMED-INPUT-LOUD`      | Malformed controlled input fails predictably and loudly in development.                                                                                                                                                    |
| `CBN-INV-020` | `CBN-CONTRACT-020-FEN-EIGHT-BY-EIGHT`        | FEN is valid only for an 8x8 board; variants use object positions.                                                                                                                                                         |

<!-- markdownlint-enable MD013 -->

The governing decisions are:

- [Controlled semantic state](./controlled-state.md)
- [Plain and revisioned API tiers](./api-tiers.md)
- [Native rendering layers](./rendering-layers.md)
- [Gesture and provider coordination](./gestures.md)
- [Controlled transitions](./transitions.md)
