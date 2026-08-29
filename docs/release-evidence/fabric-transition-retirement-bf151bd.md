# Android Fabric 200 ms transition-retirement source evidence

- Status: **four focused Galaxy gates passed**
- Physical-test subject: clean repository source
- Physical-test source commit:
  `bf151bdd0ccf91505937ef5a37efc9511b22fb24`
- Source tree: `590a65d066c68bd169cb92c327216fb0ffa56bb2`
- Machine record:
  [`fabric-transition-retirement-bf151bd.json`](./fabric-transition-retirement-bf151bd.json)
- npm artifact tested: **no**
- VibeChess application Gate C tested: **no**

All four Release instrumentation gates passed on the same clean source
snapshot. Each raw result recorded `dirty: false` at start and finish, an empty
status, no untracked files, worktree SHA-256
`4f8741a582239f60d950f06394166f3564c5ea389e5850f8c099f6e2c7bf00ab`,
and `sourceChangedDuringRun: false`.

## Device and results

The physical test device was a Samsung `SM-A075F`, Android 16/API 36,
`arm64-v8a`. Its serial is intentionally omitted from the durable record.

<!-- markdownlint-disable MD013 -->

| Gate                                       | UTC interval                          | Result SHA-256                                                     | Log SHA-256                                                        | Findings |
| ------------------------------------------ | ------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------ | -------: |
| Plain-FEN interruption, 200 ms             | 23:47:52.432–23:49:03.114, 2026-08-28 | `64b8d9c071e258ecde27d3f7b24d34b195b1496c0611de080f3ba61c59cf096a` | `38ee07bedd89e9c0cf6784ad65d0d8bf58c05b001f5f89fa999369a2cf86f2f7` |        0 |
| Plain-FEN interruption, 300 ms regression  | 23:49:29.839–23:50:26.342, 2026-08-28 | `71b15a70fe29621de4b72f241535f5321dfdd6b0d2e9fa5830840ecde71db849` | `c2760365735ec9d4e859f7f4b435c99faf84034be0b724911c1c5247f04ddb40` |        0 |
| Whole provider/board transition unmount    | 23:50:28.747–23:51:23.602, 2026-08-28 | `0d116596bbcb6238f0cb9245be799bdbe9e83e1a0a325af0fc2158b6e7f81282` | `0f06401f512e6f1f54e75153012d950c76201ecff29648d6a9796128eccb7d91` |        0 |
| Transition, drag, and provider replacement | 23:51:25.995–23:52:21.933, 2026-08-28 | `ba413ca17d40a0d64fb859732de7d24d0214c900cbbb6f2663fe6eb449486a97` | `8681fd5659aa585dd49df18a6223a02906dc37677a90ecaec84ea078b4bf7cf5` |        0 |

<!-- markdownlint-enable MD013 -->

Every gate ran `:app:connectedReleaseAndroidTest`, exited with code 0, and had
no Gradle error, performance violation, premature log capture exit, or matching
Fabric/Reanimated failure signature. Exact test classes and complete timestamps
are preserved in the machine record.

## Corrected 200 ms cadence proof

The 200 ms fixture delivered 72 real raw `UiAutomation` DOWN/UP pairs and
required the exact preceding React-committed position-change count before each
subsequent input. Its scheduler allowed the next DOWN only after both 125 ms
from the preceding DOWN and 100 ms from the commit acknowledgement, while
requiring delivery before the preceding DOWN plus 200 ms.

The passing instrumentation assertions therefore establish all 71 native DOWN
gaps in `[125, 200)` ms and all 71 JavaScript `onPress` gaps in `[100, 200)` ms.
The JavaScript summary also asserted zero below-minimum, at-or-above-duration,
or invalid gaps. This proves that every subsequent update interrupted an active
200 ms transition instead of arriving after it had settled. After a 3.5-second
registry-drain window, a separate off-main raw native tap proved canonical host
reuse; the log scanner reported zero findings.

## Lifecycle and regression coverage

The original fixture separately passed its 18 plain-FEN changes at 190 ms
against 300 ms transitions and its reuse check. The whole-subtree lifecycle
gate started 200 ms transitions, removed the complete board/provider subtree
after 50 ms, and exercised both prompt and 3.5-second absence cycles with real
native touches while absent and after remount. It finished with one board and
the latest canonical square and revision. The drag lifecycle gate completed
four controlled-transition/held-drag overlaps with keyed provider replacement,
then proved canonical state and overlay cleanup.

## Artifact identity and scope

The harness consumed workspace source at the commit above. Although the
workspace manifest read `0.1.1-next.2`, this was not a test of that published
npm archive or any other registry artifact. It was also not the VibeChess
application's integration Gate C. The four raw result files and log captures
remain local, noncommitted build reports under
`apps/native-harness/android/app/build/reports`; this record preserves their
hashes without copying machine-specific paths or the device serial. Earlier
failed or cadence-invalid development attempts are intentionally excluded.

This focused run did not newly rerun physical performance, background/resume,
full physical accessibility, visual baselines, or iOS gates. It establishes
only the four repository-source Android behaviors listed above and is not a
universal release or production-readiness claim.
