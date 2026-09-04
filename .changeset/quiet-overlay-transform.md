---
'@vibechess/chessboard-native': patch
---

<!-- markdownlint-disable MD041 -->

Stop the Android drag overlay from emitting an explicit `transform: undefined`
style entry once it is quiescent. React Native's Fabric prop diff rewrites an
explicit `undefined` to `null` and passes it to the transform processor, whose
development-only validator then throws `Cannot read property 'forEach' of
null` on the first commit after every drop. Release builds skip that
validator, so the crash only affected development builds. The overlay now
omits the key instead, so the diff emits its removal sentinel without running
the processor.
