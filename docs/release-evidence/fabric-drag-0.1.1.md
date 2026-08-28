# Android Fabric drag evidence: 0.1.1 source candidate

- Status: **Android drag RC gate passed**
- Physical-test subject: clean repository source
- Physical-test source commit: `37eb6e60ec8e9c6e670ad0ffcb71c33e4c86ce0e`
- Source tree: `633e29450bb538cb43dc4f4f045635af450e5920`
- Machine record:
  [`fabric-drag-0.1.1.json`](./fabric-drag-0.1.1.json)
- Published prerelease: `@vibechess/chessboard-native@0.1.1-next.0`
- Release source commit: `a3d7a48423659fabe99909f9cbc32b30c8b8c304`
- Registry archive SHA-256:
  `65d0ea2203a35e662d09d75cb2e425cef8d561bcd4207e8735dee18384ed18c7`
- Dry-run workflow:
  [`33153492603`](https://github.com/annabilik/chessboard-native/actions/runs/33153492603)
- Publication and registry-verification workflow:
  [`33153978975`](https://github.com/annabilik/chessboard-native/actions/runs/33153978975)
- Physical retest of registry archive: **not run**

All seven Release instrumentation gates passed on the same clean source
snapshot. Each gate recorded the clean worktree SHA-256
`8d4e13754b8484df12b47931400f2490f5ef941986d8a1d5928b079c033b8087`
at start and finish, and reported no source change during execution.

## Publication and registry verification

The trusted-OIDC workflow published the prerelease under `next` and completed
its separate registry-verification job. The independently downloaded registry
tarball exactly matched the prepared archive, exposed SLSA provenance, and
passed clean Expo type checking, Android and iOS exports, and bare React Native
type checking. Credential-free checks resolved the exact version and `next` to
`0.1.1-next.0`; `latest` remained `0.1.0`. The archive contains 433 files. Its
npm integrity is
`sha512-LC0SWHWaubIZAcAH+DOeN7bcKALvE3g8HMExYCsGYGOwAMix8YXZnFT937107R2hWxLtzRvgyFgzyTWKsaULpw==`.

The release source commit is a descendant of the physical-test commit, with no
diff under `packages/chessboard-native/src`. Later changes were release
metadata, evidence, and packed-consumer tooling. This source relationship does
not mean the registry tarball was installed and rerun through the
physical-device gates.

## Device and runtime

The physical test device was a Samsung `SM-A075F`, Android 16/API 36,
`arm64-v8a`, with a measured 60 Hz display. The serial is intentionally omitted.
The Release harness used Fabric and Hermes with React Native 0.86.0, React
19.2.3, Gesture Handler 2.32.0, Reanimated 4.5.0, Worklets 0.10.0, and
react-native-svg 15.15.4.

## Gate results

<!-- markdownlint-disable MD013 -->

| Gate                                 | UTC interval              | Result | Log findings |
| ------------------------------------ | ------------------------- | ------ | -----------: |
| Accepted controlled drag             | 23:37:34.787–23:39:32.068 | Passed |            0 |
| Provider unmount during drag         | 23:39:45.959–23:41:02.255 | Passed |            0 |
| Transition plus provider replacement | 23:41:10.200–23:42:22.428 | Passed |            0 |
| Background/resume cancellation       | 23:42:31.984–23:43:58.052 | Passed |            0 |
| Sustained performance, batch 1       | 23:44:12.673–23:45:43.302 | Passed |            0 |
| Sustained performance, batch 2       | 23:46:01.815–23:48:52.051 | Passed |            0 |
| Four-test interaction matrix         | 23:52:00.726–23:53:21.466 | Passed |            0 |

<!-- markdownlint-enable MD013 -->

Every gate ran `:app:connectedReleaseAndroidTest`, exited with code 0, and had
no Gradle error, performance violation, premature log capture exit, or matching
Fabric/Reanimated failure signature. The final interaction matrix covered a
rejected board drag, empty-square parent scrolling, spare-piece drag onto the
board, and background/resume recovery. Exact test classes, timestamps, result
hashes, and logcat hashes are preserved in the machine record.

## Performance result

The performance test completed two consecutive five-run batches. Every run
delivered 301 moves over approximately four seconds. All ten runs had zero
invalid metrics, duplicate-payload mismatches, heuristic jank, and dropped
reports. Frame delivery ranged from 97.14% to 98.37%; activation latency ranged
from 55.10 ms to 70.77 ms; the worst sustained vsync gap was 43.11 ms; and the
worst total frame duration was 24.04 ms.

The enforced bounds included 59.5–60.5 Hz refresh, 3,950–4,100 ms input and
measurement spans, 228–270 frames, at least 95% delivery, activation below
83.34 ms, and final-move latency, sustained vsync gap, and total duration each
below 50 ms. Detailed per-run measurements and the complete threshold set are
in the machine record. Android 16 supplied implausible frame-deadline values;
the gate records that condition explicitly and relies on calibrated vsync,
UI-duration, and total-duration measurements instead.

## Artifact identity and scope

The local Release app and instrumentation APKs are identified by SHA-256 in the
machine record. The seven raw `result.json` files and log captures remain local,
noncommitted build reports under
`apps/native-harness/android/app/build/reports`; this durable record stores
their hashes without copying raw logs or machine-specific absolute paths.

This result clears the Android Fabric drag gate for the 0.1.1 repository-source
candidate. The linked prerelease has been packed, published, and automatically
verified from the registry, but the registry tarball itself was not installed
into the physical harness and rerun. The physical result therefore remains
source-bound. This is not a claim of universal production readiness. Broader
Android-device coverage, physical Android accessibility, memory qualification,
package-wide performance, and all iOS gates remain separate release work.
