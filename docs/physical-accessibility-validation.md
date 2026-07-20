# Physical accessibility validation

This is the operator runbook for the release-blocking TalkBack and VoiceOver
pass. It tests the immutable npm archive inside an isolated copy of the Expo
gallery. It does not accept workspace links, simulators, automated
accessibility audits, or an unrecorded verbal result as physical evidence.

The current record targets `@vibechess/chessboard-native@0.1.0-next.2` and is
still pending. See the
[`0.1.0-next.2` evidence summary](./release-evidence/accessibility-0.1.0-next.2.md)
and its
[machine-checked result record](./release-evidence/accessibility-0.1.0-next.2.json).

## Required equipment

Run two independent sessions:

- a physical Android device with TalkBack enabled; and
- a physical iPhone or iPad with VoiceOver enabled.

Record `kind` as `physical`, plus the tester, observation time, device
manufacturer and model, OS version, architecture, assistive-technology version,
locale, Expo Go version, React Native version, and review-artifact locations.
Do not put account identifiers, notifications, or other private device content
in screen recordings.

The operator must be able to hear the device. Automated Espresso and XCUITest
audits remain useful but cannot establish speech, pronunciation, rotor/action
discovery, announcement delivery, or live focus retention.

## Prepare the exact gallery

Start from a clean checkout of this repository. These commands download the
immutable public archive, verify its independently recorded digest, copy the
current gallery outside the workspace, and replace the workspace dependency
with that archive:

```sh
set -eu
repository_root="$(pwd)"
test -f "$repository_root/scripts/smoke-packed.mjs"
test -z "$(git -C "$repository_root" status --porcelain --untracked-files=all)"
gallery_commit="$(git -C "$repository_root" rev-parse HEAD)"

work_root="$(mktemp -d)"
trap 'rm -rf "$work_root"' EXIT
npm pack \
  @vibechess/chessboard-native@0.1.0-next.2 \
  --ignore-scripts \
  --pack-destination "$work_root"

archive="$work_root/vibechess-chessboard-native-0.1.0-next.2.tgz"
expected_sha256="69546ea3fd9fc2a89ac4053be21a1d57e537c0ecbe27c5ea7bac02df07412916"
printf '%s  %s\n' "$expected_sha256" "$archive" | shasum -a 256 --check

node "$repository_root/scripts/smoke-packed.mjs" \
  --consumer expo \
  --archive "$archive" \
  --destination "$work_root/gallery"

printf 'Gallery commit: %s\n' "$gallery_commit"
cd "$work_root/gallery"
npm start
```

The digest check must print the archive name followed by `OK`. Its expected
SHA-256 is:

```text
69546ea3fd9fc2a89ac4053be21a1d57e537c0ecbe27c5ea7bac02df07412916
```

Stop if the digest differs or if the prepared consumer resolves the package
through a link. Record the repository commit printed above as `galleryCommit`;
it identifies the clean gallery fixtures separately from the package's
immutable source commit. The strict checker later requires that commit to exist,
be an ancestor of the evidence commit, and still match every validation fixture
path. Open the development server from Expo Go on each physical device. Use
Expo's tunnel mode only when normal LAN discovery is unavailable.

## Run each platform session

Use the 26 stable IDs in the
[manual checklist](./accessibility.md#manual-talkback-and-voiceover-pass). The
canonical ID-to-route mapping lives in
[`manual-checks.json`](../fixtures/accessibility/manual-checks.json):

| Route                    | Check IDs       |
| ------------------------ | --------------- |
| Accessibility            | A11Y-01–A11Y-10 |
| Controlled selection     | A11Y-11–A11Y-13 |
| Controlled move requests | A11Y-14–A11Y-15 |
| Provider coordination    | A11Y-16         |
| Spare pieces             | A11Y-17–A11Y-18 |
| Controlled annotations   | A11Y-19–A11Y-22 |
| Interaction hardening    | A11Y-23–A11Y-24 |
| Piece callbacks          | A11Y-25         |
| Square press callbacks   | A11Y-26         |

For TalkBack, use the device's configured Actions control or menu to discover
and invoke named custom actions. Record any non-default gesture configuration.
For VoiceOver, use the Actions rotor to discover named actions and the standard
adjustable gestures for increment and decrement.

For A11Y-15, select **Hold next request for cancellation** before submitting the
move. The request remains pending until the board's **Cancel move** action or
the route's cancel button aborts it, so the check has no timed discovery race.

For A11Y-24, temporarily disable assistive technology only for the native-drag
lifecycle portion; native pan intentionally adds no accessibility action.
Start the drag, background and resume the app, then re-enable TalkBack or
VoiceOver before verifying focus and the next accessible placement.

Set every observed result to one of:

- `passed` after the complete behavior is observed;
- `failed` when behavior disagrees with the contract;
- `blocked` when the required behavior cannot be exercised; or
- `not-run` while it remains pending.

Every `failed` or `blocked` result requires notes. A complete release gate
allows only `passed`.

## Record and validate results

Update
[`accessibility-0.1.0-next.2.json`](./release-evidence/accessibility-0.1.0-next.2.json)
after each session. Reference at least one durable HTTPS recording or reviewed
artifact for each platform. The normal repository check validates the pending
record's schema, exact package and publication identity, route mapping, complete
ordered ID set, and documentation status. Once any observation is recorded, it
also requires full session metadata, an artifact, and a clean commit-bound
gallery:

```sh
pnpm accessibility:evidence:check
```

After both physical sessions, update the evidence summary with the exact gallery
commit, device descriptions, HTTPS artifact links, and passed rows. Change the
corresponding support-matrix rows to complete wording, then run the strict gate:

```sh
expected_version="0.1.0-next.2"
expected_source_commit="addc0cb8a7e4d6f4302e25e21c124766279ca82b"
expected_archive_sha256="69546ea3fd9fc2a89ac4053be21a1d57e537c0ec"\
"be27c5ea7bac02df07412916"
expected_publication_run="https://github.com/annabilik/chessboard-native"
expected_publication_run="$expected_publication_run/actions/runs/29760766252"

pnpm accessibility:evidence:complete \
  --expected-version "$expected_version" \
  --expected-source-commit "$expected_source_commit" \
  --expected-archive-sha256 "$expected_archive_sha256" \
  --expected-publication-run "$expected_publication_run"
```

The strict command fails when either platform, any metadata field, an evidence
reference, the gallery commit, or any one of the 52 platform results is
missing or not passed.

## Failure and rerun policy

Do not weaken a check or relabel a failure as unsupported. File the defect,
add a deterministic regression at the lowest observable layer, publish a new
immutable prerelease when package code changes, and rerun every affected
physical check against that new exact archive. Commit failed evidence before a
rerun; preserve that commit or linked issue in Git history, then record the new
attempt instead of erasing the earlier result without a durable reference.

The physical screen-reader gate closes only after both complete sessions pass.
Release-candidate accessibility validation remains partial until this record
and fresh native accessibility audits are both part of the candidate evidence.
