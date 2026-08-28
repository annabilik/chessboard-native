# Android Fabric transition-retirement source evidence

- Status: **four focused Galaxy gates passed**
- Physical-test subject: clean repository source
- Physical-test source commit:
  `9f6698a1cb2ea3eaa69a5e645e09146a6b89024e`
- Source tree: `cea39a3f3ffe2c99cb82f982519e1fc096861f33`
- Machine record:
  [`fabric-transition-retirement-9f6698a.json`](./fabric-transition-retirement-9f6698a.json)
- npm artifact tested: **no**

All four Release instrumentation gates passed on the same clean source
snapshot. Each raw result recorded `dirty: false` at start and finish, an empty
status, no untracked files, worktree SHA-256
`5f6bdd5614134164614738efe3b27a0efc3026684a780123093f6c26f88aee59`,
and `sourceChangedDuringRun: false`.

## Device and result

The physical test device was a Samsung `SM-A075F`, Android 16/API 36,
`arm64-v8a`. Its serial is intentionally omitted from the durable record.

<!-- markdownlint-disable MD013 -->

| Gate                                 | UTC interval                          | Result SHA-256                                                     | Log SHA-256                                                        | Findings |
| ------------------------------------ | ------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------ | -------: |
| Plain-FEN transition interruption    | 10:27:08.908–10:28:27.433, 2026-08-28 | `f4cfb1d59a33b762bd1b325bf06914731ebb421670fca4b8b1b8609c3a8c3894` | `e0808bd718576c6d50786411667906e30783d4672f39f8a433603d5e76805bb9` |        0 |
| Transition plus provider replacement | 10:29:02.712–10:30:46.249, 2026-08-28 | `b9daea4ca7188ea722df11270020314bf38d5748852001148c95488f2eb9b0f0` | `a46cf3be070e1bc874bf230b81ca233cdc364383ab35069cfa7a715562378865` |        0 |
| Accepted controlled drag             | 10:30:53.191–10:32:07.808, 2026-08-28 | `e5cacc0cb43f87f63bf2291d1243bb2434a835bc6e1fa30e60f49bfbc847557c` | `e2a0ef0be9a670903770e2a24dbbb775dd338687d9d1b7184edc962b40560969` |        0 |
| Provider unmount during drag         | 10:32:16.329–10:33:42.615, 2026-08-28 | `8baeece8ddea86049b439c4b4905f6e5eefd4840b6a1708ad3c6469b94f5ed67` | `a2f4ec1ab84e0b91f0265199948cc6190c11e5239ddb4f6047ecb4ceb625c580` |        0 |

<!-- markdownlint-enable MD013 -->

Every gate ran `:app:connectedReleaseAndroidTest`, exited with code 0, and had
no Gradle error, performance violation, premature log capture exit, or matching
Fabric/Reanimated failure signature. Exact test classes and complete timestamps
are preserved in the machine record.

The plain-FEN fixture interrupted 300 ms controlled transitions with 18 actual
plain-FEN changes at 190 ms intervals, then changed the position once more to
prove the retired native host remained reusable. The other three gates checked
transition/provider replacement, accepted controlled drag commits, and provider
unmount during an active drag.

## Artifact identity and scope

The harness consumed workspace source at the commit above. Although the
workspace manifest read `0.1.1-next.0`, this was not a test of the published
`0.1.1-next.0` archive or any other npm archive. The raw result files and logs
remain local, noncommitted build reports under
`apps/native-harness/android/app/build/reports`; this record preserves their
hashes without copying machine-specific paths or the device serial.

This focused run did not newly rerun physical performance, background/resume,
full physical accessibility, or iOS gates. It therefore establishes only the
four source-bound Android behaviors listed above and is not a universal release
or production-readiness claim.
