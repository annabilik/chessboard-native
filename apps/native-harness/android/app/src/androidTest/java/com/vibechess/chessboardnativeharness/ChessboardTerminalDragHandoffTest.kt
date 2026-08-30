package com.vibechess.chessboardnativeharness

import android.app.UiAutomation
import android.content.Context
import android.content.Intent
import android.graphics.Rect
import android.os.Process
import android.os.SystemClock
import android.util.Log
import android.view.Choreographer
import android.view.InputDevice
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import android.view.ViewTreeObserver
import androidx.test.core.app.ApplicationProvider
import androidx.test.espresso.Espresso.onView
import androidx.test.espresso.UiController
import androidx.test.espresso.ViewAction
import androidx.test.espresso.action.ViewActions.click
import androidx.test.espresso.matcher.ViewMatchers.isRoot
import androidx.test.espresso.matcher.ViewMatchers.withContentDescription
import androidx.test.ext.junit.rules.ActivityScenarioRule
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.filters.LargeTest
import androidx.test.platform.app.InstrumentationRegistry
import com.facebook.react.R
import org.hamcrest.Description
import org.hamcrest.Matcher
import org.hamcrest.TypeSafeMatcher
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference
import kotlin.math.abs
import kotlin.math.hypot
import kotlin.math.max

@RunWith(AndroidJUnit4::class)
@LargeTest
class ChessboardTerminalDragHandoffTest {
    private val launchIntent =
        Intent(
            ApplicationProvider.getApplicationContext<Context>(),
            MainActivity::class.java,
        ).putExtra(MainActivity.EXTRA_FIXTURE, "interaction-terminal-handoff")

    @get:Rule
    val activityRule = ActivityScenarioRule<MainActivity>(launchIntent)

    @Test
    fun terminalHandoffIsPaintContinuousAndAllOutcomesRemainReusable() {
        val startPid = Process.myPid()
        awaitState(
            abortCount = 0,
            callbackCount = 0,
            commitCorrelation = "none",
            commitCount = 0,
            decision = "none",
            dragStartCount = 0,
            lastSource = "none",
            lastTarget = "none",
            pendingTarget = "none",
            pieceSquare = "d4",
            positionRevision = INITIAL_POSITION_REVISION,
        )
        onView(isRoot()).perform(waitForAtLeast(DRAG_READY_SETTLE_MS))

        val geometry = captureBoardGeometry()
        val uiAutomation = InstrumentationRegistry.getInstrumentation().uiAutomation
        lateinit var drawProbe: TerminalHandoffDrawProbe
        activityRule.scenario.onActivity { activity ->
            drawProbe =
                TerminalHandoffDrawProbe(activity.window.decorView).also {
                    it.attach()
                }
        }

        val reports = mutableListOf<HandoffSessionReport>()
        var blockedJsQueueReleaseConfirmed = false
        var activeTouch: InjectedTouchStream? = null
        try {
            // Accepted d4 -> d5. Hold the RN JS queue after the active overlay
            // is painted so ACTION_UP exercises the UI-thread terminal frame
            // independently from the queued move-request callback.
            drawProbe.beginSession(
                outcome = TerminalOutcome.ACCEPTED,
                source = geometry.squareCenter(file = 3, rank = 4),
                target = geometry.squareCenter(file = 3, rank = 5),
            )
            activeTouch =
                beginHeldDrag(
                    uiAutomation = uiAutomation,
                    source = geometry.squareCenter(file = 3, rank = 4),
                    target = geometry.squareCenter(file = 3, rank = 5),
                )
            drawProbe.awaitActiveOverlayAtTarget()
            val jsQueueBlocker = blockJsQueue()
            try {
                drawProbe.armTerminalWindow(jsQueueBlocked = true)
                finishTouch(uiAutomation, activeTouch, MotionEvent.ACTION_UP)
                drawProbe.markTerminalInjectionComplete()
                activeTouch = null
                drawProbe.awaitBlockedTerminalCoverage(
                    minimumFrames = MINIMUM_BLOCKED_TERMINAL_FRAMES,
                    minimumSpanMs = MINIMUM_BLOCKED_TERMINAL_SPAN_MS,
                )
            } finally {
                drawProbe.endBlockedCoverage()
                blockedJsQueueReleaseConfirmed = jsQueueBlocker.releaseAndAwaitExit()
            }
            awaitState(
                abortCount = 0,
                callbackCount = 1,
                commitCorrelation = "pending",
                commitCount = 0,
                decision = "accepted-awaiting-commit",
                dragStartCount = 1,
                lastSource = "board:d4",
                lastTarget = "d5",
                pendingTarget = "d5",
                pieceSquare = "d4",
                positionRevision = INITIAL_POSITION_REVISION,
            )
            drawProbe.awaitVisibleRole(ActorRole.PENDING_TARGET)
            commitPendingMove()
            awaitState(
                abortCount = 0,
                callbackCount = 1,
                commitCorrelation = "matched",
                commitCount = 1,
                decision = "committed",
                dragStartCount = 1,
                lastSource = "board:d4",
                lastTarget = "d5",
                pendingTarget = "none",
                pieceSquare = "d5",
                positionRevision = INITIAL_POSITION_REVISION + 1,
            )
            onView(isRoot()).perform(waitForAtLeast(TRANSITION_SETTLE_MS))
            drawProbe.awaitSettledCanonicalAtTarget()
            reports += drawProbe.finishSession()

            // Synchronous rejection restores d5 without changing the
            // consumer-owned position.
            drawProbe.beginSession(
                outcome = TerminalOutcome.REJECTED,
                source = geometry.squareCenter(file = 3, rank = 5),
                target = geometry.squareCenter(file = 3, rank = 4),
            )
            activeTouch =
                beginHeldDrag(
                    uiAutomation = uiAutomation,
                    source = geometry.squareCenter(file = 3, rank = 5),
                    target = geometry.squareCenter(file = 3, rank = 4),
                )
            drawProbe.awaitActiveOverlayAtTarget()
            drawProbe.armTerminalWindow(jsQueueBlocked = false)
            finishTouch(uiAutomation, activeTouch, MotionEvent.ACTION_UP)
            drawProbe.markTerminalInjectionComplete()
            activeTouch = null
            awaitState(
                abortCount = 0,
                callbackCount = 2,
                commitCorrelation = "matched",
                commitCount = 1,
                decision = "rejected",
                dragStartCount = 2,
                lastSource = "board:d5",
                lastTarget = "d4",
                pendingTarget = "none",
                pieceSquare = "d5",
                positionRevision = INITIAL_POSITION_REVISION + 1,
            )
            drawProbe.awaitSettledCanonicalAtSource()
            reports += drawProbe.finishSession()

            // Preserve a raw out-of-bounds pointer through the same callback.
            val offBoardTarget = geometry.aboveBoard(file = 3)
            assertTrue(
                "off-board terminal release must use a point outside the measured board",
                !geometry.contains(offBoardTarget),
            )
            drawProbe.beginSession(
                outcome = TerminalOutcome.OFF_BOARD,
                source = geometry.squareCenter(file = 3, rank = 5),
                target = offBoardTarget,
            )
            activeTouch =
                beginHeldDrag(
                    uiAutomation = uiAutomation,
                    source = geometry.squareCenter(file = 3, rank = 5),
                    target = offBoardTarget,
                )
            drawProbe.awaitActiveOverlayAtTarget()
            drawProbe.armTerminalWindow(jsQueueBlocked = false)
            finishTouch(uiAutomation, activeTouch, MotionEvent.ACTION_UP)
            drawProbe.markTerminalInjectionComplete()
            activeTouch = null
            awaitState(
                abortCount = 0,
                callbackCount = 3,
                commitCorrelation = "matched",
                commitCount = 1,
                decision = "rejected-off-board",
                dragStartCount = 3,
                lastSource = "board:d5",
                lastTarget = "none",
                pendingTarget = "none",
                pieceSquare = "d5",
                positionRevision = INITIAL_POSITION_REVISION + 1,
            )
            drawProbe.awaitSettledCanonicalAtSource()
            reports += drawProbe.finishSession()

            // Native cancellation must emit no move request and must leave the
            // same surface reusable.
            drawProbe.beginSession(
                outcome = TerminalOutcome.CANCELLED,
                source = geometry.squareCenter(file = 3, rank = 5),
                target = geometry.squareCenter(file = 3, rank = 4),
            )
            activeTouch =
                beginHeldDrag(
                    uiAutomation = uiAutomation,
                    source = geometry.squareCenter(file = 3, rank = 5),
                    target = geometry.squareCenter(file = 3, rank = 4),
                )
            drawProbe.awaitActiveOverlayAtTarget()
            drawProbe.armTerminalWindow(jsQueueBlocked = false)
            finishTouch(uiAutomation, activeTouch, MotionEvent.ACTION_CANCEL)
            drawProbe.markTerminalInjectionComplete()
            activeTouch = null
            awaitState(
                abortCount = 0,
                callbackCount = 3,
                commitCorrelation = "matched",
                commitCount = 1,
                decision = "rejected-off-board",
                dragStartCount = 4,
                lastSource = "board:d5",
                lastTarget = "none",
                pendingTarget = "none",
                pieceSquare = "d5",
                positionRevision = INITIAL_POSITION_REVISION + 1,
            )
            drawProbe.awaitSettledCanonicalAtSource()
            reports += drawProbe.finishSession()

            // A second accepted drag after rejection, off-board release, and
            // cancellation proves terminal state and provider ownership reuse.
            drawProbe.beginSession(
                outcome = TerminalOutcome.ACCEPTED,
                source = geometry.squareCenter(file = 3, rank = 5),
                target = geometry.squareCenter(file = 3, rank = 4),
            )
            activeTouch =
                beginHeldDrag(
                    uiAutomation = uiAutomation,
                    source = geometry.squareCenter(file = 3, rank = 5),
                    target = geometry.squareCenter(file = 3, rank = 4),
                )
            drawProbe.awaitActiveOverlayAtTarget()
            drawProbe.armTerminalWindow(jsQueueBlocked = false)
            finishTouch(uiAutomation, activeTouch, MotionEvent.ACTION_UP)
            drawProbe.markTerminalInjectionComplete()
            activeTouch = null
            awaitState(
                abortCount = 0,
                callbackCount = 4,
                commitCorrelation = "pending",
                commitCount = 1,
                decision = "accepted-awaiting-commit",
                dragStartCount = 5,
                lastSource = "board:d5",
                lastTarget = "d4",
                pendingTarget = "d4",
                pieceSquare = "d5",
                positionRevision = INITIAL_POSITION_REVISION + 1,
            )
            drawProbe.awaitVisibleRole(ActorRole.PENDING_TARGET)
            commitPendingMove()
            awaitState(
                abortCount = 0,
                callbackCount = 4,
                commitCorrelation = "matched",
                commitCount = 2,
                decision = "committed",
                dragStartCount = 5,
                lastSource = "board:d5",
                lastTarget = "d4",
                pendingTarget = "none",
                pieceSquare = "d4",
                positionRevision = INITIAL_POSITION_REVISION + 2,
            )
            onView(isRoot()).perform(waitForAtLeast(TRANSITION_SETTLE_MS))
            drawProbe.awaitSettledCanonicalAtTarget()
            reports += drawProbe.finishSession()
        } finally {
            activeTouch?.let { touch ->
                bestEffortFinishTouch(uiAutomation, touch, MotionEvent.ACTION_CANCEL)
            }
            activityRule.scenario.onActivity { drawProbe.detach() }
        }

        val endPid = Process.myPid()
        assertEquals("the Release harness process must remain unchanged", startPid, endPid)
        assertEquals("all five gesture outcomes must report evidence", 5, reports.size)
        logHandoffEvidence(
            blockedJsQueueReleaseConfirmed = blockedJsQueueReleaseConfirmed,
            endPid = endPid,
            reports = reports,
            startPid = startPid,
        )
        // Emit the complete session telemetry before enforcing its visual
        // invariants. This keeps an expected negative-control failure
        // machine-readable while the positive gate remains fail-closed.
        assertBlockedAcceptedReport(reports[0])
        assertRecoveredSourceReport(reports[1])
        assertRecoveredSourceReport(reports[2])
        assertRecoveredSourceReport(reports[3])
        assertAcceptedReport(reports[4])
    }

    private fun blockJsQueue(): JsQueueBlocker {
        check(JS_QUEUE_BLOCKER_FAILSAFE_MS > PROBE_TIMEOUT_MS) {
            "the JS-queue safety timeout must remain beyond the draw-probe timeout"
        }
        val application =
            InstrumentationRegistry
                .getInstrumentation()
                .targetContext
                .applicationContext as MainApplication
        val reactContext =
            application.reactHost.currentReactContext
                ?: throw AssertionError("terminal handoff gate requires an initialized React context")
        val entered = CountDownLatch(1)
        val release = CountDownLatch(1)
        val exited = CountDownLatch(1)
        val exitReason = AtomicReference<JsQueueBlockerExitReason?>(null)
        assertTrue(
            "React JS queue must accept the terminal-handoff blocker",
            reactContext.runOnJSQueueThread {
                try {
                    entered.countDown()
                    exitReason.set(
                        if (release.await(JS_QUEUE_BLOCKER_FAILSAFE_MS, TimeUnit.MILLISECONDS)) {
                            JsQueueBlockerExitReason.EXPLICIT_RELEASE
                        } else {
                            JsQueueBlockerExitReason.SAFETY_TIMEOUT
                        },
                    )
                } catch (_: InterruptedException) {
                    Thread.currentThread().interrupt()
                    exitReason.set(JsQueueBlockerExitReason.INTERRUPTED)
                } finally {
                    exited.countDown()
                }
            },
        )
        if (!entered.await(JS_QUEUE_ENTRY_TIMEOUT_MS, TimeUnit.MILLISECONDS)) {
            release.countDown()
            assertTrue(
                "terminal-handoff blocker must exit after its entry wait times out",
                exited.await(JS_QUEUE_EXIT_TIMEOUT_MS, TimeUnit.MILLISECONDS),
            )
            throw AssertionError("terminal-handoff blocker did not enter the React JS queue")
        }
        return JsQueueBlocker(
            exitedLatch = exited,
            exitReason = exitReason,
            releaseLatch = release,
        )
    }

    private fun captureBoardGeometry(): BoardGeometry {
        var captured: BoardGeometry? = null
        activityRule.scenario.onActivity { activity ->
            val board =
                boardViews(activity.window.decorView).singleOrNull()
                    ?: throw AssertionError("terminal handoff gate requires exactly one board")
            check(board.width > 0 && board.height > 0) {
                "terminal handoff board must have non-zero geometry"
            }
            val location = IntArray(2).also(board::getLocationOnScreen)
            captured =
                BoardGeometry(
                    height = board.height.toFloat(),
                    left = location[0].toFloat(),
                    top = location[1].toFloat(),
                    width = board.width.toFloat(),
                )
        }
        return checkNotNull(captured) { "terminal handoff geometry was not captured" }
    }

    private fun beginHeldDrag(
        uiAutomation: UiAutomation,
        source: Point,
        target: Point,
    ): InjectedTouchStream {
        clearLingeringTouch(uiAutomation, source)
        val downTime = SystemClock.uptimeMillis()
        val stream = InjectedTouchStream(downTime = downTime, last = source)
        injectRequiredTouch(uiAutomation, stream, MotionEvent.ACTION_DOWN, source, "ACTION_DOWN")
        SystemClock.sleep(TOUCH_STEP_MS)
        val middle =
            Point(
                x = (source.x + target.x) / 2f,
                y = (source.y + target.y) / 2f,
            )
        injectRequiredTouch(uiAutomation, stream, MotionEvent.ACTION_MOVE, middle, "first ACTION_MOVE")
        SystemClock.sleep(TOUCH_STEP_MS)
        injectRequiredTouch(uiAutomation, stream, MotionEvent.ACTION_MOVE, target, "terminal ACTION_MOVE")
        return stream
    }

    private fun finishTouch(
        uiAutomation: UiAutomation,
        stream: InjectedTouchStream,
        action: Int,
    ) {
        injectRequiredTouch(
            uiAutomation,
            stream,
            action,
            stream.last,
            if (action == MotionEvent.ACTION_UP) "ACTION_UP" else "ACTION_CANCEL",
        )
    }

    private fun bestEffortFinishTouch(
        uiAutomation: UiAutomation,
        stream: InjectedTouchStream,
        action: Int,
    ) {
        val eventTime = SystemClock.uptimeMillis()
        val event = touchEvent(stream.downTime, eventTime, action, stream.last)
        try {
            uiAutomation.injectInputEvent(event, true)
        } catch (failure: RuntimeException) {
            Log.w(LOG_TAG, "best-effort touch cleanup failed", failure)
        } finally {
            event.recycle()
        }
    }

    private fun clearLingeringTouch(uiAutomation: UiAutomation, point: Point) {
        val time = SystemClock.uptimeMillis()
        val event = touchEvent(time, time, MotionEvent.ACTION_CANCEL, point)
        try {
            uiAutomation.injectInputEvent(event, true)
        } catch (failure: RuntimeException) {
            Log.w(LOG_TAG, "best-effort precondition CANCEL failed", failure)
        } finally {
            event.recycle()
        }
        SystemClock.sleep(INPUT_PRECONDITION_SETTLE_MS)
    }

    private fun injectRequiredTouch(
        uiAutomation: UiAutomation,
        stream: InjectedTouchStream,
        action: Int,
        point: Point,
        description: String,
    ) {
        val eventTime = SystemClock.uptimeMillis()
        val event = touchEvent(stream.downTime, eventTime, action, point)
        try {
            assertTrue(
                "terminal handoff $description injection must succeed",
                uiAutomation.injectInputEvent(event, true),
            )
            stream.last = point
        } finally {
            event.recycle()
        }
    }

    private fun touchEvent(
        downTime: Long,
        eventTime: Long,
        action: Int,
        point: Point,
    ): MotionEvent =
        MotionEvent.obtain(
            downTime,
            eventTime,
            action,
            point.x,
            point.y,
            0,
        ).apply {
            source = InputDevice.SOURCE_TOUCHSCREEN
        }

    private fun commitPendingMove() {
        onView(withContentDescription(COMMIT_ACTION_LABEL)).perform(click())
    }

    private fun awaitState(
        abortCount: Int,
        callbackCount: Int,
        commitCorrelation: String,
        commitCount: Int,
        decision: String,
        dragStartCount: Int,
        lastSource: String,
        lastTarget: String,
        pendingTarget: String,
        pieceSquare: String,
        positionRevision: Int,
    ) {
        val expected =
            setOf(
                "Abort count: $abortCount",
                "Callback count: $callbackCount",
                "Commit correlation: $commitCorrelation",
                "Commit count: $commitCount",
                "Decision: $decision",
                "Drag start count: $dragStartCount",
                "Last source: $lastSource",
                "Last target: $lastTarget",
                "Pending target: $pendingTarget",
                "Piece square: $pieceSquare",
                "Position revision: $positionRevision",
            )
        onView(isRoot()).perform(waitForState(expected))
    }

    private fun waitForState(expected: Set<String>): ViewAction =
        object : ViewAction {
            override fun getConstraints(): Matcher<View> = isRoot()

            override fun getDescription(): String =
                "wait for terminal-handoff state ${expected.sorted()}"

            override fun perform(uiController: UiController, root: View) {
                val deadline = SystemClock.uptimeMillis() + INTERACTION_TIMEOUT_MS
                do {
                    val board = boardViews(root).singleOrNull()
                    if (
                        board != null &&
                        board.width > 0 &&
                        board.height > 0 &&
                        expected.all { description ->
                            containsContentDescription(root, description)
                        }
                    ) {
                        return
                    }
                    uiController.loopMainThreadForAtLeast(POLL_INTERVAL_MS)
                } while (SystemClock.uptimeMillis() < deadline)

                val missing =
                    expected.filterNot { description ->
                        containsContentDescription(root, description)
                    }
                throw AssertionError("Timed out waiting for terminal-handoff state; missing=$missing")
            }
        }

    private fun waitForAtLeast(durationMs: Long): ViewAction =
        object : ViewAction {
            override fun getConstraints(): Matcher<View> = isRoot()

            override fun getDescription(): String = "wait for at least $durationMs ms"

            override fun perform(uiController: UiController, view: View) {
                uiController.loopMainThreadForAtLeast(durationMs)
            }
        }

    private fun assertTerminalReport(report: HandoffSessionReport) {
        assertTrue("every gesture must paint an active overlay", report.activeOverlayFrames > 0)
        assertEquals(
            "the canonical source must stay hidden while its overlay is active",
            0,
            report.sourceVisibleWithOverlayFrames,
        )
        assertTrue("every terminal outcome must record post-terminal draws", report.postTerminalFrames > 0)
        assertEquals("terminal handoff must never paint zero primary actors", 0, report.zeroPrimaryFrames)
        assertEquals("terminal handoff must never under-paint its moving actor", 0, report.underOpacityFrames)
        assertEquals("terminal handoff must never overdraw its moving actor", 0, report.overOpacityFrames)
        assertEquals("terminal handoff must never paint a spatial duplicate", 0, report.spatialDuplicateFrames)
        assertEquals(
            "terminal handoff must use only one full actor or the allowed pending/canonical crossfade",
            0,
            report.invalidPrimaryCompositionFrames,
        )
        assertEquals(
            "valid primary compositions must classify every terminal frame",
            report.postTerminalFrames,
            report.singlePrimaryFrames + report.pendingCanonicalCrossfadeFrames,
        )
        assertEquals("terminal handoff must retire active overlay hosts", 0, report.finalActiveOverlayHosts)
        assertEquals("terminal handoff must retire quiescent overlay hosts", 0, report.finalRetiringOverlayHosts)
    }

    private fun assertAcceptedReport(report: HandoffSessionReport) {
        assertTerminalReport(report)
        assertEquals("accepted report must retain its outcome", TerminalOutcome.ACCEPTED, report.outcome)
        assertTrue("accepted handoff must paint a pending target", report.pendingTargetFrames > 0)
        assertTrue(
            "accepted handoff must paint the correlated controlled transition",
            report.canonicalTransitionFrames > 0,
        )
        assertTrue("accepted handoff must settle one canonical target", report.canonicalFrames > 0)
        assertEquals("accepted handoff must never replay the canonical source", 0, report.sourceSnapbackFrames)
        assertEquals("accepted primary actors must stay at the terminal target", 0, report.offTargetFrames)
        assertTrue("accepted handoff must finish with a canonical target", report.finalCanonicalAtTarget)
    }

    private fun assertRecoveredSourceReport(report: HandoffSessionReport) {
        assertTerminalReport(report)
        assertTrue(
            "rejected, off-board, and cancelled reports must retain their outcome",
            report.outcome != TerminalOutcome.ACCEPTED,
        )
        assertTrue("a recovered outcome must paint its canonical source", report.canonicalFrames > 0)
        assertTrue("a recovered outcome must record a primary actor at its source", report.sourceLocationFrames > 0)
        assertEquals(
            "a recovered outcome must keep every primary actor at the terminal pointer or source",
            0,
            report.unexpectedLocationFrames,
        )
        assertEquals(
            "terminal-pointer and source witnesses must cover the complete recovery window",
            report.postTerminalFrames,
            report.targetLocationFrames + report.sourceLocationFrames,
        )
        assertTrue("a recovered outcome must finish with a canonical source", report.finalCanonicalAtSource)
    }

    private fun assertBlockedAcceptedReport(report: HandoffSessionReport) {
        assertAcceptedReport(report)
        assertTrue("blocked accepted UP must retain a terminal overlay", report.terminalOverlayFrames > 0)
        assertEquals(
            "every blocked post-UP frame must retain its terminal overlay",
            report.blockedTerminalFrames,
            report.blockedTerminalOverlayFrames,
        )
        assertTrue(
            "the blocked RN handoff must retain at least $MINIMUM_BLOCKED_TERMINAL_FRAMES terminal frames",
            report.blockedTerminalFrames >= MINIMUM_BLOCKED_TERMINAL_FRAMES,
        )
        assertTrue(
            "the blocked RN handoff must span at least $MINIMUM_BLOCKED_TERMINAL_SPAN_MS ms",
            report.blockedTerminalSpanMs >= MINIMUM_BLOCKED_TERMINAL_SPAN_MS,
        )
    }

    private fun logHandoffEvidence(
        blockedJsQueueReleaseConfirmed: Boolean,
        startPid: Int,
        endPid: Int,
        reports: List<HandoffSessionReport>,
    ) {
        val firstAccepted = reports.first()
        val acceptedReports = reports.filter { it.outcome == TerminalOutcome.ACCEPTED }
        val recoveredReports = reports.filter { it.outcome != TerminalOutcome.ACCEPTED }
        val json =
            JSONObject()
                .put("schemaVersion", 3)
                .put("startPid", startPid)
                .put("endPid", endPid)
                .put("processStable", startPid == endPid)
                .put("blockedJsQueueReleaseConfirmed", blockedJsQueueReleaseConfirmed)
                .put("gestureCount", reports.size)
                .put("activeOverlayFrames", reports.sumOf { it.activeOverlayFrames })
                .put(
                    "sourceVisibleWithOverlayFrames",
                    reports.sumOf { it.sourceVisibleWithOverlayFrames },
                )
                .put("blockedTerminalFrames", firstAccepted.blockedTerminalFrames)
                .put(
                    "blockedTerminalOverlayFrames",
                    firstAccepted.blockedTerminalOverlayFrames,
                )
                .put("blockedTerminalSpanMs", firstAccepted.blockedTerminalSpanMs)
                .put(
                    "terminalOverlayFrames",
                    reports.sumOf { it.terminalOverlayFrames },
                )
                .put(
                    "pendingSourceGhostFrames",
                    acceptedReports.sumOf { it.pendingSourceGhostFrames },
                )
                .put(
                    "pendingTargetFrames",
                    acceptedReports.sumOf { it.pendingTargetFrames },
                )
                .put(
                    "canonicalTransitionFrames",
                    acceptedReports.sumOf { it.canonicalTransitionFrames },
                )
                .put(
                    "canonicalFrames",
                    reports.sumOf { it.canonicalFrames },
                )
                .put(
                    "postTerminalFrames",
                    reports.sumOf { it.postTerminalFrames },
                )
                .put(
                    "singlePrimaryFrames",
                    reports.sumOf { it.singlePrimaryFrames },
                )
                .put(
                    "pendingCanonicalCrossfadeFrames",
                    acceptedReports.sumOf { it.pendingCanonicalCrossfadeFrames },
                )
                .put(
                    "invalidPrimaryCompositionFrames",
                    reports.sumOf { it.invalidPrimaryCompositionFrames },
                )
                .put(
                    "terminalOutcomeWitnessCount",
                    reports.count { it.postTerminalFrames > 0 },
                )
                .put(
                    "recoveryPostTerminalFrames",
                    recoveredReports.sumOf { it.postTerminalFrames },
                )
                .put(
                    "zeroPrimaryFrames",
                    reports.sumOf { it.zeroPrimaryFrames },
                )
                .put(
                    "underOpacityFrames",
                    reports.sumOf { it.underOpacityFrames },
                )
                .put(
                    "overOpacityFrames",
                    reports.sumOf { it.overOpacityFrames },
                )
                .put(
                    "spatialDuplicateFrames",
                    reports.sumOf { it.spatialDuplicateFrames },
                )
                .put(
                    "acceptedSourceSnapbackFrames",
                    acceptedReports.sumOf { it.sourceSnapbackFrames },
                )
                .put(
                    "acceptedOffTargetFrames",
                    acceptedReports.sumOf { it.offTargetFrames },
                )
                .put(
                    "recoveryTerminalLocationFrames",
                    recoveredReports.sumOf { it.targetLocationFrames },
                )
                .put(
                    "recoverySourceLocationFrames",
                    recoveredReports.sumOf { it.sourceLocationFrames },
                )
                .put(
                    "recoveryUnexpectedLocationFrames",
                    recoveredReports.sumOf { it.unexpectedLocationFrames },
                )
                .put(
                    "recoveryFinalCanonicalSourceCount",
                    recoveredReports.count { it.finalCanonicalAtSource },
                )
                .put(
                    "acceptedFinalCanonicalTargetCount",
                    acceptedReports.count { it.finalCanonicalAtTarget },
                )
                .put(
                    "finalActiveOverlayHosts",
                    reports.sumOf { it.finalActiveOverlayHosts },
                )
                .put(
                    "finalRetiringOverlayHosts",
                    reports.sumOf { it.finalRetiringOverlayHosts },
                )
                .put("acceptedCount", acceptedReports.size)
                .put("rejectedCount", reports.count { it.outcome == TerminalOutcome.REJECTED })
                .put("offBoardCount", reports.count { it.outcome == TerminalOutcome.OFF_BOARD })
                .put("cancelCount", reports.count { it.outcome == TerminalOutcome.CANCELLED })
                .put("reusePassed", true)
        Log.i(LOG_TAG, "$HANDOFF_LOG_PREFIX${json}")
    }

    private class JsQueueBlocker(
        private val exitedLatch: CountDownLatch,
        private val exitReason: AtomicReference<JsQueueBlockerExitReason?>,
        private val releaseLatch: CountDownLatch,
    ) {
        fun releaseAndAwaitExit(): Boolean {
            releaseLatch.countDown()
            assertTrue(
                "terminal-handoff blocker did not exit the React JS queue after explicit release",
                exitedLatch.await(JS_QUEUE_EXIT_TIMEOUT_MS, TimeUnit.MILLISECONDS),
            )
            assertEquals(
                "terminal-handoff blocker must exit because of explicit release, not timeout or interruption",
                JsQueueBlockerExitReason.EXPLICIT_RELEASE,
                exitReason.get(),
            )
            return true
        }
    }

    private enum class JsQueueBlockerExitReason {
        EXPLICIT_RELEASE,
        INTERRUPTED,
        SAFETY_TIMEOUT,
    }

    private data class Point(
        val x: Float,
        val y: Float,
    )

    private data class BoardGeometry(
        val height: Float,
        val left: Float,
        val top: Float,
        val width: Float,
    ) {
        fun squareCenter(file: Int, rank: Int): Point {
            val squareWidth = width / BOARD_DIMENSION
            val squareHeight = height / BOARD_DIMENSION
            val visualRow = BOARD_DIMENSION.toInt() - rank
            return Point(
                x = left + (file + 0.5f) * squareWidth,
                y = top + (visualRow + 0.5f) * squareHeight,
            )
        }

        fun aboveBoard(file: Int): Point =
            Point(
                x = left + (file + 0.5f) * width / BOARD_DIMENSION,
                y = top - height / BOARD_DIMENSION,
            )

        fun contains(point: Point): Boolean =
            point.x >= left &&
                point.x <= left + width &&
                point.y >= top &&
                point.y <= top + height
    }

    private data class InjectedTouchStream(
        val downTime: Long,
        var last: Point,
    )

    private enum class TerminalOutcome {
        ACCEPTED,
        CANCELLED,
        OFF_BOARD,
        REJECTED,
    }

    private enum class ActorRole(
        val wireValue: String,
    ) {
        CANONICAL("canonical"),
        CANONICAL_TRANSITION("canonical-transition"),
        OVERLAY("overlay"),
        PENDING_SOURCE("pending-source"),
        PENDING_TARGET("pending-target"),
        SOURCE_GHOST("source-ghost"),
        ;

        val primary: Boolean
            get() =
                this == CANONICAL ||
                    this == CANONICAL_TRANSITION ||
                    this == OVERLAY ||
                    this == PENDING_TARGET

        companion object {
            fun fromWireValue(value: String): ActorRole? =
                entries.find { role -> role.wireValue == value }
        }
    }

    private data class ActorObservation(
        val alpha: Float,
        val center: Point,
        val role: ActorRole,
        val visible: Boolean,
    )

    private data class DrawSnapshot(
        val activeOverlayHosts: Int,
        val actors: List<ActorObservation>,
        val frameTimeNs: Long,
        val retiringOverlayHosts: Int,
    )

    private data class HandoffSessionReport(
        val activeOverlayFrames: Int,
        val blockedTerminalFrames: Int,
        val blockedTerminalOverlayFrames: Int,
        val blockedTerminalSpanMs: Double,
        val canonicalFrames: Int,
        val canonicalTransitionFrames: Int,
        val finalActiveOverlayHosts: Int,
        val finalCanonicalAtSource: Boolean,
        val finalCanonicalAtTarget: Boolean,
        val finalRetiringOverlayHosts: Int,
        val invalidPrimaryCompositionFrames: Int,
        val offTargetFrames: Int,
        val outcome: TerminalOutcome,
        val overOpacityFrames: Int,
        val pendingSourceGhostFrames: Int,
        val pendingTargetFrames: Int,
        val pendingCanonicalCrossfadeFrames: Int,
        val postTerminalFrames: Int,
        val singlePrimaryFrames: Int,
        val sourceLocationFrames: Int,
        val sourceSnapbackFrames: Int,
        val sourceVisibleWithOverlayFrames: Int,
        val spatialDuplicateFrames: Int,
        val targetLocationFrames: Int,
        val terminalOverlayFrames: Int,
        val underOpacityFrames: Int,
        val unexpectedLocationFrames: Int,
        val zeroPrimaryFrames: Int,
    )

    private class MutableSession(
        val outcome: TerminalOutcome,
        val source: Point,
        val target: Point,
    ) {
        val acceptedContinuity: Boolean
            get() = outcome == TerminalOutcome.ACCEPTED

        var activeOverlayFrames = 0
        val blockedFrameTimesNs = mutableListOf<Long>()
        var blockedTerminalOverlayFrames = 0
        var canonicalFrames = 0
        var canonicalTransitionFrames = 0
        var invalidPrimaryCompositionFrames = 0
        var jsQueueBlocked = false
        var lastFrameTimeNs = -1L
        var offTargetFrames = 0
        var overOpacityFrames = 0
        var pendingSourceGhostFrames = 0
        var pendingTargetFrames = 0
        var pendingCanonicalCrossfadeFrames = 0
        var postInjection = false
        var postInjectionFrameTimeNs = -1L
        var postTerminalFrames = 0
        var singlePrimaryFrames = 0
        var sourceLocationFrames = 0
        var sourceSnapbackFrames = 0
        var sourceVisibleWithOverlayFrames = 0
        var spatialDuplicateFrames = 0
        var targetLocationFrames = 0
        var terminalArmed = false
        var terminalArmFrameTimeNs = -1L
        var terminalOverlayFrames = 0
        var underOpacityFrames = 0
        var unexpectedLocationFrames = 0
        var zeroPrimaryFrames = 0
    }

    private class TerminalHandoffDrawProbe(
        private val root: View,
    ) : Choreographer.FrameCallback,
        ViewTreeObserver.OnDrawListener {
        private val choreographer = Choreographer.getInstance()
        private val lock = Any()
        private var attached = false
        private var currentFrameTimeNs = -1L
        private var latestSnapshot: DrawSnapshot? = null
        private var session: MutableSession? = null

        fun attach() {
            check(root.viewTreeObserver.isAlive) { "terminal-handoff draw observer is not alive" }
            attached = true
            root.viewTreeObserver.addOnDrawListener(this)
            choreographer.postFrameCallback(this)
        }

        fun detach() {
            synchronized(lock) {
                attached = false
                session = null
            }
            choreographer.removeFrameCallback(this)
            if (root.viewTreeObserver.isAlive) {
                root.viewTreeObserver.removeOnDrawListener(this)
            }
        }

        fun beginSession(
            outcome: TerminalOutcome,
            source: Point,
            target: Point,
        ) {
            synchronized(lock) {
                check(session === null) { "another terminal-handoff draw session is active" }
                session = MutableSession(outcome, source, target)
                latestSnapshot = null
            }
            root.postInvalidateOnAnimation()
        }

        fun armTerminalWindow(jsQueueBlocked: Boolean) {
            synchronized(lock) {
                val current = checkNotNull(session) { "no terminal-handoff session is active" }
                check(!current.terminalArmed) { "terminal-handoff session is already armed" }
                current.terminalArmed = true
                current.terminalArmFrameTimeNs = currentFrameTimeNs
                current.jsQueueBlocked = jsQueueBlocked
            }
            root.postInvalidateOnAnimation()
        }

        fun markTerminalInjectionComplete() {
            synchronized(lock) {
                val current = checkNotNull(session) { "no terminal-handoff session is active" }
                check(current.terminalArmed) {
                    "terminal-handoff continuity must be armed before terminal injection"
                }
                check(!current.postInjection) {
                    "terminal-handoff injection was already marked complete"
                }
                current.postInjection = true
                current.postInjectionFrameTimeNs = currentFrameTimeNs
            }
            root.postInvalidateOnAnimation()
        }

        fun endBlockedCoverage() {
            synchronized(lock) {
                session?.jsQueueBlocked = false
            }
        }

        fun awaitActiveOverlayAtTarget() {
            // Source visibility is a measured visual invariant, not an input
            // precondition. Record it for the complete session so a negative
            // control can emit its evidence before failing closed.
            awaitSnapshot("active overlay at the intended target") { snapshot, current ->
                val overlays =
                    snapshot.actors.filter { actor ->
                        actor.role == ActorRole.OVERLAY && actor.visible
                    }
                overlays.size == 1 &&
                    overlays.all { actor -> near(actor.center, current.target) }
            }
        }

        fun awaitBlockedTerminalCoverage(
            minimumFrames: Int,
            minimumSpanMs: Double,
        ) {
            val deadline = SystemClock.uptimeMillis() + PROBE_TIMEOUT_MS
            do {
                val covered =
                    synchronized(lock) {
                        val current = checkNotNull(session)
                        val spanMs = blockedSpanMs(current.blockedFrameTimesNs)
                        current.blockedFrameTimesNs.size >= minimumFrames && spanMs >= minimumSpanMs
                    }
                if (covered) {
                    return
                }
                SystemClock.sleep(PROBE_POLL_INTERVAL_MS)
            } while (SystemClock.uptimeMillis() < deadline)
            val state =
                synchronized(lock) {
                    val current = checkNotNull(session)
                    "frames=${current.blockedFrameTimesNs.size}, " +
                        "spanMs=${blockedSpanMs(current.blockedFrameTimesNs)}"
                }
            throw AssertionError("Timed out waiting for blocked terminal coverage; $state")
        }

        fun awaitVisibleRole(role: ActorRole) {
            awaitSnapshot("visible ${role.wireValue} actor") { snapshot, _ ->
                snapshot.actors.any { actor -> actor.role == role && actor.visible }
            }
        }

        fun awaitSettledCanonicalAtSource() {
            awaitSnapshot("one full canonical actor at the recovered source") { observed, current ->
                observed.frameTimeNs > current.terminalArmFrameTimeNs &&
                    observed.activeOverlayHosts == 0 &&
                    observed.retiringOverlayHosts == 0 &&
                    exactCanonicalPrimaryAt(observed, current.source)
            }
        }

        fun awaitSettledCanonicalAtTarget() {
            awaitSnapshot("one full canonical actor at the accepted target") { observed, current ->
                observed.frameTimeNs > current.terminalArmFrameTimeNs &&
                    observed.activeOverlayHosts == 0 &&
                    observed.retiringOverlayHosts == 0 &&
                    exactCanonicalPrimaryAt(observed, current.target)
            }
        }

        fun finishSession(): HandoffSessionReport =
            synchronized(lock) {
                val current = checkNotNull(session) { "no terminal-handoff session is active" }
                val snapshot =
                    checkNotNull(latestSnapshot) {
                        "terminal-handoff session has no latest draw snapshot"
                    }
                session = null
                HandoffSessionReport(
                    activeOverlayFrames = current.activeOverlayFrames,
                    blockedTerminalFrames = current.blockedFrameTimesNs.size,
                    blockedTerminalOverlayFrames = current.blockedTerminalOverlayFrames,
                    blockedTerminalSpanMs = blockedSpanMs(current.blockedFrameTimesNs),
                    canonicalFrames = current.canonicalFrames,
                    canonicalTransitionFrames = current.canonicalTransitionFrames,
                    finalActiveOverlayHosts = snapshot.activeOverlayHosts,
                    finalCanonicalAtSource = exactCanonicalPrimaryAt(snapshot, current.source),
                    finalCanonicalAtTarget = exactCanonicalPrimaryAt(snapshot, current.target),
                    finalRetiringOverlayHosts = snapshot.retiringOverlayHosts,
                    invalidPrimaryCompositionFrames = current.invalidPrimaryCompositionFrames,
                    offTargetFrames = current.offTargetFrames,
                    outcome = current.outcome,
                    overOpacityFrames = current.overOpacityFrames,
                    pendingSourceGhostFrames = current.pendingSourceGhostFrames,
                    pendingTargetFrames = current.pendingTargetFrames,
                    pendingCanonicalCrossfadeFrames = current.pendingCanonicalCrossfadeFrames,
                    postTerminalFrames = current.postTerminalFrames,
                    singlePrimaryFrames = current.singlePrimaryFrames,
                    sourceLocationFrames = current.sourceLocationFrames,
                    sourceSnapbackFrames = current.sourceSnapbackFrames,
                    sourceVisibleWithOverlayFrames = current.sourceVisibleWithOverlayFrames,
                    spatialDuplicateFrames = current.spatialDuplicateFrames,
                    targetLocationFrames = current.targetLocationFrames,
                    terminalOverlayFrames = current.terminalOverlayFrames,
                    underOpacityFrames = current.underOpacityFrames,
                    unexpectedLocationFrames = current.unexpectedLocationFrames,
                    zeroPrimaryFrames = current.zeroPrimaryFrames,
                )
            }

        override fun doFrame(frameTimeNanos: Long) {
            val keepRunning =
                synchronized(lock) {
                    if (!attached) {
                        false
                    } else {
                        currentFrameTimeNs = frameTimeNanos
                        true
                    }
                }
            if (!keepRunning) {
                return
            }
            // Force a real draw on every vsync while the test is attached. A
            // static blank or frozen overlay therefore cannot hide between
            // naturally invalidated frames.
            root.invalidate()
            choreographer.postFrameCallback(this)
        }

        override fun onDraw() {
            val frameTimeNs = synchronized(lock) { currentFrameTimeNs }
            if (frameTimeNs <= 0) {
                return
            }
            val descendants = descendantViews(root)
            val actors =
                descendants.mapNotNull { view ->
                    actorObservation(root, view)
                }
            val snapshot =
                DrawSnapshot(
                    activeOverlayHosts =
                        descendants.count { view ->
                            view.getTag(R.id.react_test_id) == ACTIVE_OVERLAY_TEST_ID
                        },
                    actors = actors,
                    frameTimeNs = frameTimeNs,
                    retiringOverlayHosts =
                        descendants.count { view ->
                            view.getTag(R.id.react_test_id) == RETIRING_OVERLAY_TEST_ID
                        },
                )
            synchronized(lock) {
                latestSnapshot = snapshot
                val current = session ?: return
                if (current.lastFrameTimeNs == frameTimeNs) {
                    return
                }
                current.lastFrameTimeNs = frameTimeNs
                recordSnapshot(current, snapshot)
            }
        }

        private fun recordSnapshot(
            current: MutableSession,
            snapshot: DrawSnapshot,
        ) {
            val visibleOverlays =
                snapshot.actors.filter { actor ->
                    actor.role == ActorRole.OVERLAY && actor.visible
                }
            if (visibleOverlays.isNotEmpty()) {
                current.activeOverlayFrames += 1
                if (sourceAlpha(snapshot, current.source) > VISIBILITY_EPSILON) {
                    current.sourceVisibleWithOverlayFrames += 1
                }
            }
            if (
                !current.terminalArmed ||
                snapshot.frameTimeNs <= current.terminalArmFrameTimeNs
            ) {
                return
            }

            current.postTerminalFrames += 1
            if (visibleOverlays.isNotEmpty()) {
                current.terminalOverlayFrames += 1
            }
            val blockedPostInjectionFrame =
                current.jsQueueBlocked &&
                    current.postInjection &&
                    snapshot.frameTimeNs > current.postInjectionFrameTimeNs
            if (blockedPostInjectionFrame) {
                current.blockedFrameTimesNs += snapshot.frameTimeNs
                if (
                    visibleOverlays.size == 1 &&
                    near(visibleOverlays.single().center, current.target)
                ) {
                    current.blockedTerminalOverlayFrames += 1
                }
            }
            val visibleActors = snapshot.actors.filter(ActorObservation::visible)
            if (visibleActors.any { actor -> actor.role == ActorRole.PENDING_SOURCE }) {
                current.pendingSourceGhostFrames += 1
            }
            if (visibleActors.any { actor -> actor.role == ActorRole.PENDING_TARGET }) {
                current.pendingTargetFrames += 1
            }
            if (visibleActors.any { actor -> actor.role == ActorRole.CANONICAL_TRANSITION }) {
                current.canonicalTransitionFrames += 1
            }
            if (visibleActors.any { actor -> actor.role == ActorRole.CANONICAL }) {
                current.canonicalFrames += 1
            }

            val primary = visibleActors.filter { actor -> actor.role.primary }
            if (primary.isEmpty()) {
                current.zeroPrimaryFrames += 1
                current.invalidPrimaryCompositionFrames += 1
                return
            }
            val opacityMass = primary.sumOf { actor -> actor.alpha.toDouble() }
            if (opacityMass < MINIMUM_PRIMARY_OPACITY) {
                current.underOpacityFrames += 1
            }
            if (opacityMass > MAXIMUM_PRIMARY_OPACITY) {
                current.overOpacityFrames += 1
            }
            when {
                primary.size == 1 && fullOpacity(primary.single().alpha) -> {
                    current.singlePrimaryFrames += 1
                }
                current.acceptedContinuity && allowedPendingCanonicalCrossfade(primary) -> {
                    current.pendingCanonicalCrossfadeFrames += 1
                }
                else -> {
                    current.invalidPrimaryCompositionFrames += 1
                }
            }
            val sourceVisible = primary.any { actor -> near(actor.center, current.source) }
            val targetVisible = primary.any { actor -> near(actor.center, current.target) }
            if (sourceVisible) {
                current.sourceLocationFrames += 1
            }
            if (targetVisible) {
                current.targetLocationFrames += 1
            }
            if (current.acceptedContinuity) {
                if (sourceVisible) {
                    current.sourceSnapbackFrames += 1
                }
                if (primary.any { actor -> !near(actor.center, current.target) }) {
                    current.offTargetFrames += 1
                }
            } else if (
                primary.any { actor ->
                    !near(actor.center, current.source) && !near(actor.center, current.target)
                }
            ) {
                current.unexpectedLocationFrames += 1
            }
            if (
                primary.indices.any { leftIndex ->
                    primary.indices.any { rightIndex ->
                        rightIndex > leftIndex &&
                            distance(primary[leftIndex].center, primary[rightIndex].center) >
                            CENTER_TOLERANCE_PX
                    }
                }
            ) {
                current.spatialDuplicateFrames += 1
            }
        }

        private fun awaitSnapshot(
            description: String,
            predicate: (DrawSnapshot, MutableSession) -> Boolean,
        ): DrawSnapshot {
            val deadline = SystemClock.uptimeMillis() + PROBE_TIMEOUT_MS
            do {
                val matched =
                    synchronized(lock) {
                        val current = checkNotNull(session)
                        latestSnapshot?.takeIf { snapshot -> predicate(snapshot, current) }
                    }
                if (matched != null) {
                    return matched
                }
                SystemClock.sleep(PROBE_POLL_INTERVAL_MS)
            } while (SystemClock.uptimeMillis() < deadline)
            val latest = synchronized(lock) { latestSnapshot }
            throw AssertionError("Timed out waiting for $description; latest=$latest")
        }

        private companion object {
            fun blockedSpanMs(frameTimesNs: List<Long>): Double =
                if (frameTimesNs.size < 2) {
                    0.0
                } else {
                    (frameTimesNs.last() - frameTimesNs.first()) / 1_000_000.0
                }

            fun sourceAlpha(snapshot: DrawSnapshot, source: Point): Float =
                snapshot.actors
                    .filter { actor ->
                        actor.role != ActorRole.OVERLAY && near(actor.center, source)
                    }.maxOfOrNull(ActorObservation::alpha) ?: 0f

            fun allowedPendingCanonicalCrossfade(primary: List<ActorObservation>): Boolean {
                if (primary.size != 2) {
                    return false
                }
                val pending = primary.singleOrNull { actor -> actor.role == ActorRole.PENDING_TARGET }
                val canonical =
                    primary.singleOrNull { actor ->
                        actor.role == ActorRole.CANONICAL_TRANSITION ||
                            actor.role == ActorRole.CANONICAL
                    }
                return pending != null &&
                    canonical != null &&
                    near(pending.center, canonical.center) &&
                    fullOpacity(pending.alpha + canonical.alpha)
            }

            fun exactCanonicalPrimaryAt(snapshot: DrawSnapshot, point: Point): Boolean {
                val primary =
                    snapshot.actors.filter { actor -> actor.visible && actor.role.primary }
                return primary.size == 1 &&
                    primary.single().role == ActorRole.CANONICAL &&
                    fullOpacity(primary.single().alpha) &&
                    near(primary.single().center, point)
            }

            fun fullOpacity(alpha: Float): Boolean =
                alpha >= MINIMUM_PRIMARY_OPACITY && alpha <= MAXIMUM_PRIMARY_OPACITY

            fun near(left: Point, right: Point): Boolean =
                distance(left, right) <= CENTER_TOLERANCE_PX

            fun distance(left: Point, right: Point): Double =
                hypot((left.x - right.x).toDouble(), (left.y - right.y).toDouble())
        }
    }

    private companion object {
        const val ACTIVE_OVERLAY_TEST_ID =
            "chessboard-native:native-interaction-terminal-handoff:provider-drag-overlay"
        const val RETIRING_OVERLAY_TEST_ID =
            "chessboard-native:native-interaction-terminal-handoff:provider-drag-retiring-overlay"
        const val ACTOR_TEST_ID_PREFIX = "terminal-handoff:actor:"
        const val BOARD_DIMENSION = 8f
        const val BOARD_LABEL = "Terminal handoff test board, white orientation"
        const val CENTER_TOLERANCE_PX = 14.0
        const val COMMIT_ACTION_LABEL = "Commit terminal handoff pending move"
        const val DRAG_READY_SETTLE_MS = 1_000L
        const val HANDOFF_LOG_PREFIX = "CHESSBOARD_DRAG_HANDOFF "
        const val INITIAL_POSITION_REVISION = 41
        const val INPUT_PRECONDITION_SETTLE_MS = 50L
        const val INTERACTION_TIMEOUT_MS = 30_000L
        const val JS_QUEUE_BLOCKER_FAILSAFE_MS = 15_000L
        const val JS_QUEUE_ENTRY_TIMEOUT_MS = 5_000L
        const val JS_QUEUE_EXIT_TIMEOUT_MS = 2_000L
        const val LOG_TAG = "ChessboardDragHandoff"
        const val MAXIMUM_PRIMARY_OPACITY = 1.05
        const val MINIMUM_BLOCKED_TERMINAL_FRAMES = 8
        const val MINIMUM_BLOCKED_TERMINAL_SPAN_MS = 100.0
        const val MINIMUM_PRIMARY_OPACITY = 0.95
        const val POLL_INTERVAL_MS = 25L
        const val PROBE_POLL_INTERVAL_MS = 8L
        const val PROBE_TIMEOUT_MS = 10_000L
        const val TOUCH_STEP_MS = 32L
        const val TRANSITION_SETTLE_MS = 500L
        const val VISIBILITY_EPSILON = 1f / 255f

        val ACTOR_TEST_ID_PATTERN =
            Regex("^terminal-handoff:actor:([a-z-]+):([a-z][0-9]+|none)$")

        fun actorObservation(root: View, view: View): ActorObservation? {
            val testId = view.getTag(R.id.react_test_id) as? String ?: return null
            if (!testId.startsWith(ACTOR_TEST_ID_PREFIX)) {
                return null
            }
            val match = ACTOR_TEST_ID_PATTERN.matchEntire(testId) ?: return null
            val role = ActorRole.fromWireValue(match.groupValues[1]) ?: return null
            val alpha = effectiveAlpha(root, view)
            val visibleRect = Rect()
            val hasVisibleRect = view.getGlobalVisibleRect(visibleRect)
            val location = IntArray(2).also(view::getLocationOnScreen)
            return ActorObservation(
                alpha = alpha,
                center =
                    Point(
                        x = location[0] + view.width / 2f,
                        y = location[1] + view.height / 2f,
                    ),
                role = role,
                visible =
                    view.isShown &&
                        hasVisibleRect &&
                        !visibleRect.isEmpty &&
                        alpha > VISIBILITY_EPSILON,
            )
        }

        fun effectiveAlpha(root: View, view: View): Float {
            var alpha = 1f
            var current: View? = view
            while (current != null) {
                if (current.visibility != View.VISIBLE) {
                    return 0f
                }
                alpha *= current.alpha
                if (alpha <= VISIBILITY_EPSILON || current === root) {
                    return max(0f, alpha)
                }
                current = current.parent as? View
            }
            return max(0f, alpha)
        }

        fun boardViews(root: View): List<View> =
            descendantViews(root).filter { view ->
                view.contentDescription?.toString()?.startsWith(BOARD_LABEL) == true
            }

        fun containsContentDescription(root: View, expected: String): Boolean =
            descendantViews(root).any { view ->
                view.contentDescription?.toString() == expected
            }

        fun descendantViews(root: View): List<View> {
            val views = mutableListOf<View>()

            fun visit(view: View) {
                views.add(view)
                if (view is ViewGroup) {
                    for (index in 0 until view.childCount) {
                        visit(view.getChildAt(index))
                    }
                }
            }

            visit(root)
            return views
        }
    }
}
