package com.vibechess.chessboardnativeharness

import android.content.Context
import android.content.Intent
import android.graphics.Rect
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import android.os.SystemClock
import android.util.Base64
import android.util.Log
import android.view.Choreographer
import android.view.FrameMetrics
import android.view.InputDevice
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import android.view.ViewTreeObserver
import android.view.Window
import androidx.test.core.app.ApplicationProvider
import androidx.test.espresso.Espresso.onView
import androidx.test.espresso.UiController
import androidx.test.espresso.ViewAction
import androidx.test.espresso.action.CoordinatesProvider
import androidx.test.espresso.action.GeneralSwipeAction
import androidx.test.espresso.action.Press
import androidx.test.espresso.action.Swipe
import androidx.test.espresso.matcher.ViewMatchers.isDisplayed
import androidx.test.espresso.matcher.ViewMatchers.isRoot
import androidx.test.ext.junit.rules.ActivityScenarioRule
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.filters.LargeTest
import com.facebook.react.R
import org.hamcrest.Description
import org.hamcrest.Matcher
import org.hamcrest.TypeSafeMatcher
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import java.security.MessageDigest
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import kotlin.math.abs
import kotlin.math.ceil
import kotlin.math.max
import kotlin.math.roundToInt

@RunWith(AndroidJUnit4::class)
@LargeTest
class ChessboardDragPerformanceTest {
    private val launchIntent =
        Intent(
            ApplicationProvider.getApplicationContext<Context>(),
            MainActivity::class.java,
        ).putExtra(MainActivity.EXTRA_FIXTURE, "interaction")

    @get:Rule
    val activityRule = ActivityScenarioRule<MainActivity>(launchIntent)

    @Test
    fun sustainedDragMeetsReleaseFrameBudget() {
        assertTrue("drag performance gate requires Android 12 or newer", Build.VERSION.SDK_INT >= 31)
        awaitInteractionState(
            callbackCount = 0,
            decision = "none",
            lastSource = "none",
            lastTarget = "none",
        )
        val refreshRate = requestAndReadSixtyHertzMode()
        assertTrue(
            "display refresh rate must be 60 Hz, observed $refreshRate",
            refreshRate in MINIMUM_REFRESH_RATE_HZ..MAXIMUM_REFRESH_RATE_HZ,
        )

        val metricsThread = HandlerThread("chessboard-drag-frame-metrics").apply { start() }
        val metricsHandler = Handler(metricsThread.looper)
        val collector = FrameMetricsCollector()
        lateinit var overlayDrawProbe: OverlayDrawProbe
        activityRule.scenario.onActivity { activity ->
            activity.window.addOnFrameMetricsAvailableListener(
                collector,
                metricsHandler,
            )
            overlayDrawProbe = OverlayDrawProbe(activity.window.decorView).also { it.attach() }
        }

        val summaries = mutableListOf<PerformanceRunSummary>()
        try {
            // Prime RNGH, Reanimated, SVG, and the provider overlay before any
            // frame is counted.
            onView(boardMatcher()).perform(
                sustainedDrag(
                    clearLingeringInput = true,
                    durationMs = WARM_UP_DURATION_MS,
                    moveCount = WARM_UP_MOVE_COUNT,
                ),
            )
            awaitInteractionState(
                callbackCount = 0,
                decision = "none",
                lastSource = "none",
                lastTarget = "none",
            )
            onView(isRoot()).perform(waitForReactTestIdToDisappear(DRAG_OVERLAY_TEST_ID))

            repeat(MEASURED_RUN_COUNT) { runIndex ->
                drainMetricsHandler(metricsHandler)
                overlayDrawProbe.beginRun(runIndex)
                collector.beginRun(runIndex)
                var frameSample: FrameSample? = null
                onView(boardMatcher()).perform(
                    sustainedDrag(
                        durationMs = MEASURED_RUN_DURATION_MS,
                        moveCount = MEASURED_MOVE_COUNT,
                        drawProbe = overlayDrawProbe,
                        runIndex = runIndex,
                        beforeCancel = { probeSample ->
                            drainMetricsHandler(metricsHandler)
                            frameSample = collector.finishRun(runIndex, probeSample)
                        },
                    ),
                )
                onView(isRoot()).perform(waitForReactTestIdToDisappear(DRAG_OVERLAY_TEST_ID))
                awaitInteractionState(
                    callbackCount = 0,
                    decision = "none",
                    lastSource = "none",
                    lastTarget = "none",
                )

                val summary =
                    summarizeRun(
                        runIndex = runIndex,
                        refreshRate = refreshRate,
                        successfulMoves = MEASURED_MOVE_COUNT + TERMINAL_PROBE_MOVE_COUNT,
                        sample =
                            frameSample
                                ?: throw AssertionError("missing frame sample for run $runIndex"),
                    )
                summaries.add(summary)
            }

            // Emit the one machine-readable record before threshold assertions
            // so a failed run retains the measured diagnostics that explain it.
            logPerformanceRecord(performanceJson(refreshRate, summaries))
            summaries.forEach(::assertRunWithinBudget)

            // The final measured CANCEL must leave the board reusable, not
            // merely visually quiet.
            onView(boardMatcher()).perform(
                GeneralSwipeAction(
                    Swipe.FAST,
                    squareCenter(file = 3, rank = 4),
                    squareCenter(file = 3, rank = 5),
                    Press.FINGER,
                ),
            )
            awaitInteractionState(
                callbackCount = 1,
                decision = "rejected",
                lastSource = "board:d4",
                lastTarget = "d5",
            )

        } finally {
            activityRule.scenario.onActivity { activity ->
                overlayDrawProbe.detach()
                activity.window.removeOnFrameMetricsAvailableListener(collector)
            }
            metricsThread.quitSafely()
            metricsThread.join(METRICS_THREAD_JOIN_TIMEOUT_MS)
        }
    }

    private fun drainMetricsHandler(handler: Handler) {
        val drained = CountDownLatch(1)
        assertTrue("frame metrics handler must accept its drain barrier", handler.post(drained::countDown))
        assertTrue(
            "frame metrics handler did not drain before the timeout",
            drained.await(METRICS_HANDLER_DRAIN_TIMEOUT_MS, TimeUnit.MILLISECONDS),
        )
    }

    private fun requestAndReadSixtyHertzMode(): Float {
        activityRule.scenario.onActivity { activity ->
            val display =
                activity.display
                    ?: throw AssertionError("activity has no display for performance gate")
            val mode =
                display.supportedModes
                    .filter { candidate ->
                        candidate.refreshRate in
                            MINIMUM_REFRESH_RATE_HZ..MAXIMUM_REFRESH_RATE_HZ
                    }.maxByOrNull { candidate -> candidate.physicalWidth * candidate.physicalHeight }
                    ?: throw AssertionError("device exposes no 60 Hz display mode")
            val attributes = activity.window.attributes
            attributes.preferredDisplayModeId = mode.modeId
            activity.window.attributes = attributes
        }
        onView(isRoot()).perform(waitForAtLeast(DISPLAY_MODE_SETTLE_MS))

        var refreshRate = -1f
        activityRule.scenario.onActivity { activity ->
            refreshRate =
                activity.display?.refreshRate
                    ?: throw AssertionError("activity lost its display during performance gate")
        }
        return refreshRate
    }

    private fun sustainedDrag(
        durationMs: Long,
        moveCount: Int,
        clearLingeringInput: Boolean = false,
        drawProbe: OverlayDrawProbe? = null,
        runIndex: Int? = null,
        beforeCancel: ((DrawProbeSample) -> Unit)? = null,
    ): ViewAction = object : ViewAction {
        override fun getConstraints(): Matcher<View> = isDisplayed()

        override fun getDescription(): String =
            "sustain a native board drag for $durationMs ms with $moveCount moves"

        override fun perform(uiController: UiController, view: View) {
            val source = squareCenterOnView(view, file = 3, rank = 4)
            val upper = squareCenterOnView(view, file = 3, rank = 5)
            val lower = squareCenterOnView(view, file = 3, rank = 3)
            val terminal = squareCenterOnView(view, file = 6, rank = 2)
            val terminalApproachOffsetPx =
                drawProbeCenterTolerancePx(view) * TERMINAL_APPROACH_TOLERANCE_MULTIPLIER
            val terminalApproach =
                floatArrayOf(
                    terminal[0] - terminalApproachOffsetPx,
                    terminal[1] - terminalApproachOffsetPx,
                )
            check((drawProbe === null) == (runIndex === null)) {
                "draw probe and run index must be provided together"
            }
            check(drawProbe === null || beforeCancel !== null) {
                "a measured drag requires its frame-sample callback"
            }
            // Clear contamination from a previously interrupted test once,
            // before warm-up. Every drag below asserts its terminal CANCEL,
            // so repeating a best-effort orphan CANCEL before measured runs
            // only makes InputDispatcher emit expensive diagnostics.
            if (clearLingeringInput) {
                cancelLingeringInjectedTouchStream(uiController, source)
            }

            val downTime = SystemClock.uptimeMillis()
            val down = touchEvent(downTime, downTime, MotionEvent.ACTION_DOWN, source)
            try {
                assertTrue(
                    "performance drag ACTION_DOWN injection must succeed",
                    uiController.injectMotionEvent(down),
                )
            } finally {
                down.recycle()
            }

            var firstMoveAt = -1L
            var lastMoveAt = -1L
            var pacedMovesStartAt = -1L
            repeat(moveCount) { moveIndex ->
                val targetTime =
                    if (drawProbe === null) {
                        if (firstMoveAt < 0) {
                            SystemClock.uptimeMillis()
                        } else {
                            firstMoveAt +
                                if (moveCount == 1) {
                                    0L
                                } else {
                                    durationMs * moveIndex / (moveCount - 1)
                                }
                        }
                    } else if (moveIndex == 0 || moveCount <= 2) {
                        SystemClock.uptimeMillis()
                    } else if (moveIndex == 1) {
                        firstMoveAt + ACTIVATION_FOLLOW_UP_DELAY_MS
                    } else {
                        pacedMovesStartAt +
                            durationMs * (moveIndex - 1) / (moveCount - 2)
                    }
                if (moveIndex > 0 || drawProbe === null) {
                    val waitMs = targetTime - SystemClock.uptimeMillis()
                    if (waitMs > 0) {
                        uiController.loopMainThreadForAtLeast(waitMs)
                    }
                }
                val eventTime = SystemClock.uptimeMillis()
                val coordinates =
                    if (drawProbe !== null && moveIndex == moveCount - 1) {
                        // End the sustained phase beside the terminal probe.
                        // A one-frame teleport from d5 to g2 makes Android's
                        // input resampler project the synthetic pointer beyond
                        // g2; a physical finger supplies this settling sample.
                        terminalApproach
                    } else {
                        zigzagCoordinate(upper, lower, moveIndex)
                    }
                if (moveIndex == 0 && drawProbe !== null) {
                    drawProbe.arm(
                        runIndex = checkNotNull(runIndex),
                        kind = DrawProbeKind.ACTIVATION,
                        eventTimeNs = eventTime * NANOSECONDS_PER_MILLISECOND_LONG,
                        expectedCenter = coordinates,
                    )
                } else if (moveIndex == 1 && drawProbe !== null) {
                    drawProbe.addExpectedCenter(
                        runIndex = checkNotNull(runIndex),
                        kind = DrawProbeKind.ACTIVATION,
                        expectedCenter = coordinates,
                    )
                }
                val move =
                    touchEvent(
                        downTime,
                        eventTime,
                        MotionEvent.ACTION_MOVE,
                        coordinates,
                    )
                try {
                    assertTrue(
                        "performance drag ACTION_MOVE $moveIndex injection must succeed",
                        uiController.injectMotionEvent(move),
                    )
                } finally {
                    move.recycle()
                }
                if (moveIndex == 0) {
                    firstMoveAt = eventTime
                }
                if (moveIndex == 1 && drawProbe !== null) {
                    // A physical pan continues delivering MOVE events while
                    // the provider overlay mounts and resolves its window
                    // origin. Give that activation pipeline one real 60 Hz
                    // follow-up sample before waiting for the painted result;
                    // latency remains anchored to the first activating MOVE.
                    awaitDrawProbeMatch(
                        uiController = uiController,
                        drawProbe = drawProbe,
                        runIndex = checkNotNull(runIndex),
                        kind = DrawProbeKind.ACTIVATION,
                    )
                    pacedMovesStartAt = SystemClock.uptimeMillis()
                }
                lastMoveAt = eventTime
            }

            var cancelCoordinates = zigzagCoordinate(upper, lower, moveCount - 1)
            if (drawProbe !== null) {
                val measuredRunIndex = checkNotNull(runIndex)
                val terminalTargetTime = lastMoveAt + TERMINAL_FOLLOW_UP_DELAY_MS
                val terminalWaitMs = terminalTargetTime - SystemClock.uptimeMillis()
                if (terminalWaitMs > 0) {
                    uiController.loopMainThreadForAtLeast(terminalWaitMs)
                }
                val terminalEventTime = SystemClock.uptimeMillis()
                drawProbe.arm(
                    runIndex = measuredRunIndex,
                    kind = DrawProbeKind.TERMINAL,
                    eventTimeNs = terminalEventTime * NANOSECONDS_PER_MILLISECOND_LONG,
                    expectedCenter = terminal,
                )
                val terminalMove =
                    touchEvent(
                        downTime,
                        terminalEventTime,
                        MotionEvent.ACTION_MOVE,
                        terminal,
                    )
                try {
                    assertTrue(
                        "performance drag terminal ACTION_MOVE injection must succeed",
                        uiController.injectMotionEvent(terminalMove),
                    )
                } finally {
                    terminalMove.recycle()
                }
                awaitDrawProbeMatch(
                    uiController = uiController,
                    drawProbe = drawProbe,
                    runIndex = measuredRunIndex,
                    kind = DrawProbeKind.TERMINAL,
                )
                lastMoveAt = terminalEventTime
                cancelCoordinates = terminal

                // Keep the pointer held while the exact terminal draw's frame
                // metrics cross the asynchronous listener before CANCEL.
                uiController.loopMainThreadForAtLeast(FRAME_METRICS_DRAIN_MS)
                beforeCancel?.invoke(drawProbe.finishRun(measuredRunIndex))
            }
            assertTrue(
                "performance drag input span must be positive",
                firstMoveAt > 0 && lastMoveAt > firstMoveAt,
            )

            val cancelTime = SystemClock.uptimeMillis()
            val cancel =
                touchEvent(
                    downTime,
                    cancelTime,
                    MotionEvent.ACTION_CANCEL,
                    cancelCoordinates,
                )
            try {
                assertTrue(
                    "performance drag ACTION_CANCEL injection must succeed",
                    uiController.injectMotionEvent(cancel),
                )
            } finally {
                cancel.recycle()
            }
            uiController.loopMainThreadForAtLeast(OVERLAY_RETIRE_SETTLE_MS)
        }
    }

    private fun awaitDrawProbeMatch(
        uiController: UiController,
        drawProbe: OverlayDrawProbe,
        runIndex: Int,
        kind: DrawProbeKind,
    ) {
        val deadline = SystemClock.uptimeMillis() + DRAW_PROBE_TIMEOUT_MS
        do {
            drawProbe.throwIfFailed(runIndex)
            if (drawProbe.hasMatched(runIndex, kind)) {
                return
            }
            uiController.loopMainThreadForAtLeast(DRAW_PROBE_POLL_INTERVAL_MS)
        } while (SystemClock.uptimeMillis() < deadline)
        drawProbe.throwIfFailed(runIndex)
        throw AssertionError(
            "performance run ${runIndex + 1} did not draw the $kind overlay probe: " +
                drawProbe.describePending(runIndex, kind),
        )
    }

    private fun zigzagCoordinate(
        upper: FloatArray,
        lower: FloatArray,
        moveIndex: Int,
    ): FloatArray {
        val legIndex = moveIndex / ZIGZAG_MOVES_PER_LEG
        val offset = moveIndex % ZIGZAG_MOVES_PER_LEG
        val progress = offset.toFloat() / (ZIGZAG_MOVES_PER_LEG - 1).toFloat()
        val directedProgress = if (legIndex % 2 == 0) progress else 1f - progress
        return floatArrayOf(
            upper[0] + (lower[0] - upper[0]) * directedProgress,
            upper[1] + (lower[1] - upper[1]) * directedProgress,
        )
    }

    private fun summarizeRun(
        runIndex: Int,
        refreshRate: Float,
        successfulMoves: Int,
        sample: FrameSample,
    ): PerformanceRunSummary {
        val expectedFrameDurationNs = calculateExpectedFrameDurationNs(refreshRate)
        val heuristicJankThresholdNs =
            (expectedFrameDurationNs * JANK_HEURISTIC_MULTIPLIER).toLong()
        val orderedFrames = sample.frames.sortedBy(FrameDatum::intendedVsyncTimestampNs)
        val sortedUiDurations = orderedFrames.map(FrameDatum::uiDurationNs).sorted()
        val sortedTotalDurations = orderedFrames.map(FrameDatum::totalDurationNs).sorted()
        val sortedDeadlines = orderedFrames.map(FrameDatum::deadlineNs).sorted()
        val measurementSpanNs = sample.measurementEndNs - sample.measurementStartNs
        check(measurementSpanNs > 0) { "measurement span must be positive" }
        check(
            orderedFrames.all { frame ->
                frame.intendedVsyncTimestampNs in
                    sample.measurementStartNs..sample.measurementEndNs
            },
        ) { "summarized frames must remain inside the measurement window" }
        val sortedVsyncGaps =
            orderedFrames
                .zipWithNext { previous, current ->
                    current.intendedVsyncTimestampNs - previous.intendedVsyncTimestampNs
                }.also { gaps ->
                    check(gaps.all { gap -> gap > 0 }) {
                        "deduped intended-vsync timestamps must be strictly increasing"
                    }
                }.sorted()
        val internalVsyncSlots =
            if (orderedFrames.isEmpty()) {
                0
            } else {
                1 +
                    sortedVsyncGaps.sumOf { gap ->
                        max(1, (gap.toDouble() / expectedFrameDurationNs).roundToInt())
                    }
            }
        val frameCount = orderedFrames.size
        val nominalVsyncSlots =
            max(1, (measurementSpanNs.toDouble() / expectedFrameDurationNs).roundToInt())
        val expectedVsyncSlots = maxOf(frameCount, internalVsyncSlots, nominalVsyncSlots)
        val missedVsyncSlots = expectedVsyncSlots - frameCount
        val heuristicJankCount =
            orderedFrames.count { frame -> frame.uiDurationNs > heuristicJankThresholdNs }
        val maximumPlausibleDeadlineNs =
            (expectedFrameDurationNs * MAXIMUM_PLAUSIBLE_DEADLINE_PERIODS).toLong()
        val implausibleDeadlineCount =
            orderedFrames.count { frame ->
                frame.deadlineNs <= 0 || frame.deadlineNs > maximumPlausibleDeadlineNs
            }
        return PerformanceRunSummary(
            activationLatencyMs = sample.activationLatencyNs.toMilliseconds(),
            callbackCount = sample.callbackCount,
            deadlinePlausible = implausibleDeadlineCount == 0,
            deliveryPercent =
                if (expectedVsyncSlots == 0) {
                    0.0
                } else {
                    frameCount * 100.0 / expectedVsyncSlots
                },
            droppedReports = sample.droppedReports,
            duplicateMetrics = sample.duplicateMetrics,
            duplicatePayloadMismatchCount = sample.duplicatePayloadMismatchCount,
            expectedVsyncSlots = expectedVsyncSlots,
            finalMoveLatencyMs = sample.finalMoveLatencyNs.toMilliseconds(),
            frameCount = frameCount,
            heuristicJankCount = heuristicJankCount,
            heuristicJankPercent =
                if (frameCount == 0) 0.0 else heuristicJankCount * 100.0 / frameCount,
            implausibleDeadlineCount = implausibleDeadlineCount,
            inputSpanMs = sample.inputSpanMs,
            invalidMetrics = sample.invalidMetrics,
            intendedVsyncSpanMs =
                if (frameCount < 2) {
                    0.0
                } else {
                    (orderedFrames.last().intendedVsyncTimestampNs -
                        orderedFrames.first().intendedVsyncTimestampNs) /
                        NANOSECONDS_PER_MILLISECOND
                },
            maximumDeadlineMs = sortedDeadlines.lastOrNull()?.toMilliseconds() ?: 0.0,
            measurementSpanMs = sample.measurementSpanMs,
            minimumDeadlineMs = sortedDeadlines.firstOrNull()?.toMilliseconds() ?: 0.0,
            missedVsyncSlots = missedVsyncSlots,
            outOfWindowMetrics = sample.outOfWindowMetrics,
            p50DeadlineMs = percentileMsOrZero(sortedDeadlines, 0.50),
            p95DeadlineMs = percentileMsOrZero(sortedDeadlines, 0.95),
            p95TotalDurationMs = percentileMsOrZero(sortedTotalDurations, 0.95),
            p95UiDurationMs = percentileMsOrZero(sortedUiDurations, 0.95),
            p95VsyncGapMs = percentileMsOrZero(sortedVsyncGaps, 0.95),
            p99TotalDurationMs = percentileMsOrZero(sortedTotalDurations, 0.99),
            p99UiDurationMs = percentileMsOrZero(sortedUiDurations, 0.99),
            p99VsyncGapMs = percentileMsOrZero(sortedVsyncGaps, 0.99),
            run = runIndex + 1,
            successfulMoves = successfulMoves,
            worstSustainedVsyncGapMs =
                sortedVsyncGaps.lastOrNull()?.toMilliseconds() ?: 0.0,
            worstTotalDurationMs = sortedTotalDurations.lastOrNull()?.toMilliseconds() ?: 0.0,
            worstUiDurationMs = sortedUiDurations.lastOrNull()?.toMilliseconds() ?: 0.0,
        )
    }

    private fun assertRunWithinBudget(summary: PerformanceRunSummary) {
        val label = "performance run ${summary.run}"
        assertEquals(
            "$label move count",
            MEASURED_MOVE_COUNT + TERMINAL_PROBE_MOVE_COUNT,
            summary.successfulMoves,
        )
        assertTrue(
            "$label input span was ${summary.inputSpanMs} ms",
            summary.inputSpanMs in MINIMUM_INPUT_SPAN_MS..MAXIMUM_INPUT_SPAN_MS,
        )
        assertTrue(
            "$label measurement span was ${summary.measurementSpanMs} ms",
            summary.measurementSpanMs in
                MINIMUM_MEASUREMENT_SPAN_MS..MAXIMUM_MEASUREMENT_SPAN_MS,
        )
        assertTrue(
            "$label collected ${summary.frameCount} unique in-window frames",
            summary.frameCount in MINIMUM_MEASURED_FRAMES..MAXIMUM_MEASURED_FRAMES,
        )
        assertEquals(
            "$label callback accounting",
            summary.callbackCount,
            summary.frameCount +
                summary.duplicateMetrics +
                summary.outOfWindowMetrics +
                summary.invalidMetrics,
        )
        assertEquals(
            "$label duplicate payload mismatches",
            0,
            summary.duplicatePayloadMismatchCount,
        )
        assertEquals("$label heuristic-jank frames", 0, summary.heuristicJankCount)
        assertTrue(
            "$label intended-vsync delivery was ${summary.deliveryPercent}%",
            summary.deliveryPercent >= MINIMUM_VSYNC_DELIVERY_PERCENT,
        )
        assertTrue(
            "$label activation latency was ${summary.activationLatencyMs} ms",
            summary.activationLatencyMs < MAXIMUM_ACTIVATION_LATENCY_MS,
        )
        assertTrue(
            "$label final-move latency was ${summary.finalMoveLatencyMs} ms",
            summary.finalMoveLatencyMs < MAXIMUM_FINAL_MOVE_LATENCY_MS,
        )
        assertTrue(
            "$label worst sustained vsync gap was ${summary.worstSustainedVsyncGapMs} ms",
            summary.worstSustainedVsyncGapMs < MAXIMUM_SUSTAINED_VSYNC_GAP_MS,
        )
        assertTrue(
            "$label worst total duration was ${summary.worstTotalDurationMs} ms",
            summary.worstTotalDurationMs < MAXIMUM_TOTAL_DURATION_MS,
        )
        assertEquals("$label dropped frame-metric reports", 0, summary.droppedReports)
        assertEquals("$label invalid frame metrics", 0, summary.invalidMetrics)
    }

    private fun percentileMsOrZero(sortedDurations: List<Long>, percentile: Double): Double {
        if (sortedDurations.isEmpty()) return 0.0
        val index = (ceil(percentile * sortedDurations.size).toInt() - 1).coerceAtLeast(0)
        return sortedDurations[index].toMilliseconds()
    }

    private fun Long.toMilliseconds(): Double = this / NANOSECONDS_PER_MILLISECOND

    private fun calculateExpectedFrameDurationNs(refreshRate: Float): Double =
        NANOSECONDS_PER_SECOND / refreshRate.toDouble()

    private fun performanceJson(
        refreshRate: Float,
        summaries: List<PerformanceRunSummary>,
    ): String =
        JSONObject()
            .put("schemaVersion", 4)
            .put("displayRefreshHz", refreshRate.toDouble())
            .put(
                "expectedFrameDurationMs",
                calculateExpectedFrameDurationNs(refreshRate) / NANOSECONDS_PER_MILLISECOND,
            )
            .put("jankHeuristicMultiplier", JANK_HEURISTIC_MULTIPLIER)
            .put(
                "runs",
                JSONArray().apply {
                    summaries.forEach { summary ->
                        put(
                            JSONObject()
                                .put("run", summary.run)
                                .put("successfulMoves", summary.successfulMoves)
                                .put("activationLatencyMs", summary.activationLatencyMs)
                                .put("finalMoveLatencyMs", summary.finalMoveLatencyMs)
                                .put("inputSpanMs", summary.inputSpanMs)
                                .put("measurementSpanMs", summary.measurementSpanMs)
                                .put("invalidMetrics", summary.invalidMetrics)
                                .put("callbackCount", summary.callbackCount)
                                .put("duplicateMetrics", summary.duplicateMetrics)
                                .put(
                                    "duplicatePayloadMismatchCount",
                                    summary.duplicatePayloadMismatchCount,
                                )
                                .put("outOfWindowMetrics", summary.outOfWindowMetrics)
                                .put("frameCount", summary.frameCount)
                                .put("intendedVsyncSpanMs", summary.intendedVsyncSpanMs)
                                .put("expectedVsyncSlots", summary.expectedVsyncSlots)
                                .put("missedVsyncSlots", summary.missedVsyncSlots)
                                .put("deliveryPercent", summary.deliveryPercent)
                                .put("p95VsyncGapMs", summary.p95VsyncGapMs)
                                .put("p99VsyncGapMs", summary.p99VsyncGapMs)
                                .put(
                                    "worstSustainedVsyncGapMs",
                                    summary.worstSustainedVsyncGapMs,
                                )
                                .put("p95UiDurationMs", summary.p95UiDurationMs)
                                .put("p99UiDurationMs", summary.p99UiDurationMs)
                                .put("worstUiDurationMs", summary.worstUiDurationMs)
                                .put("heuristicJankCount", summary.heuristicJankCount)
                                .put("heuristicJankPercent", summary.heuristicJankPercent)
                                .put("p95TotalDurationMs", summary.p95TotalDurationMs)
                                .put("p99TotalDurationMs", summary.p99TotalDurationMs)
                                .put("worstTotalDurationMs", summary.worstTotalDurationMs)
                                .put("deadlinePlausible", summary.deadlinePlausible)
                                .put(
                                    "implausibleDeadlineCount",
                                    summary.implausibleDeadlineCount,
                                )
                                .put("minimumDeadlineMs", summary.minimumDeadlineMs)
                                .put("p50DeadlineMs", summary.p50DeadlineMs)
                                .put("p95DeadlineMs", summary.p95DeadlineMs)
                                .put("maximumDeadlineMs", summary.maximumDeadlineMs)
                                .put("droppedReports", summary.droppedReports),
                        )
                    }
                },
            ).toString()

    private fun logPerformanceRecord(json: String) {
        val jsonBytes = json.toByteArray(Charsets.UTF_8)
        val checksum =
            MessageDigest
                .getInstance(PERFORMANCE_LOG_CHECKSUM_ALGORITHM)
                .digest(jsonBytes)
                .joinToString(separator = "") { byte ->
                    val value = byte.toInt() and 0xff
                    "${HEX_DIGITS[value ushr 4]}${HEX_DIGITS[value and 0x0f]}"
                }
        val recordId = checksum.take(PERFORMANCE_LOG_RECORD_ID_LENGTH)
        val chunks =
            Base64
                .encodeToString(jsonBytes, Base64.NO_WRAP)
                .chunked(PERFORMANCE_LOG_CHUNK_PAYLOAD_CHARACTERS)

        check(chunks.isNotEmpty()) { "performance log record must not be empty" }
        chunks.forEachIndexed { index, chunk ->
            Log.i(
                PERFORMANCE_LOG_TAG,
                "$PERFORMANCE_LOG_CHUNK_PREFIX" +
                    "v=$PERFORMANCE_LOG_TRANSPORT_VERSION " +
                    "id=$recordId " +
                    "sha256=$checksum " +
                    "part=${index + 1}/${chunks.size} " +
                    "bytes=${jsonBytes.size} " +
                    "data=$chunk",
            )
        }
    }

    private fun cancelLingeringInjectedTouchStream(
        uiController: UiController,
        coordinates: FloatArray,
    ) {
        val cancelTime = SystemClock.uptimeMillis()
        val cancel =
            touchEvent(
                cancelTime,
                cancelTime,
                MotionEvent.ACTION_CANCEL,
                coordinates,
            )
        try {
            uiController.injectMotionEvent(cancel)
        } finally {
            cancel.recycle()
        }
        uiController.loopMainThreadForAtLeast(INPUT_PRECONDITION_SETTLE_MS)
    }

    private fun awaitInteractionState(
        callbackCount: Int,
        decision: String,
        lastSource: String,
        lastTarget: String,
    ) {
        onView(isRoot()).perform(
            waitForInteractionState(callbackCount, decision, lastSource, lastTarget),
        )
    }

    private fun waitForInteractionState(
        callbackCount: Int,
        decision: String,
        lastSource: String,
        lastTarget: String,
    ): ViewAction = object : ViewAction {
        override fun getConstraints(): Matcher<View> = isRoot()

        override fun getDescription(): String =
            "wait for callback $callbackCount, decision $decision, source $lastSource, and target $lastTarget"

        override fun perform(uiController: UiController, root: View) {
            val deadline = SystemClock.uptimeMillis() + INTERACTION_TIMEOUT_MS
            do {
                if (
                    boardViews(root).singleOrNull()?.let { board ->
                        board.width > 0 && board.height > 0
                    } == true &&
                    containsContentDescription(root, "Callback count: $callbackCount") &&
                    containsContentDescription(root, "Abort count: 0") &&
                    containsContentDescription(root, "Last target: $lastTarget") &&
                    containsContentDescription(root, "Last source: $lastSource") &&
                    containsContentDescription(root, "Decision: $decision") &&
                    containsContentDescription(root, POSITION_REVISION_DESCRIPTION)
                ) {
                    return
                }
                uiController.loopMainThreadForAtLeast(POLL_INTERVAL_MS)
            } while (SystemClock.uptimeMillis() < deadline)
            throw AssertionError(getDescription())
        }
    }

    private fun waitForReactTestIdToDisappear(testId: String): ViewAction = object : ViewAction {
        override fun getConstraints(): Matcher<View> = isRoot()

        override fun getDescription(): String = "wait for React test id $testId to disappear"

        override fun perform(uiController: UiController, root: View) {
            val deadline = SystemClock.uptimeMillis() + INTERACTION_TIMEOUT_MS
            do {
                if (
                    descendantViews(root).none { view ->
                        view.getTag(R.id.react_test_id) == testId && view.isShown
                    }
                ) {
                    return
                }
                uiController.loopMainThreadForAtLeast(POLL_INTERVAL_MS)
            } while (SystemClock.uptimeMillis() < deadline)
            throw AssertionError(getDescription())
        }
    }

    private fun waitForAtLeast(durationMs: Long): ViewAction = object : ViewAction {
        override fun getConstraints(): Matcher<View> = isRoot()

        override fun getDescription(): String = "wait for $durationMs ms"

        override fun perform(uiController: UiController, view: View) {
            uiController.loopMainThreadForAtLeast(durationMs)
        }
    }

    private fun touchEvent(
        downTime: Long,
        eventTime: Long,
        action: Int,
        coordinates: FloatArray,
    ): MotionEvent =
        MotionEvent.obtain(
            downTime,
            eventTime,
            action,
            coordinates[0],
            coordinates[1],
            0,
        ).apply {
            source = InputDevice.SOURCE_TOUCHSCREEN
        }

    private fun squareCenter(file: Int, rank: Int): CoordinatesProvider =
        CoordinatesProvider { view -> squareCenterOnView(view, file, rank) }

    private fun squareCenterOnView(view: View, file: Int, rank: Int): FloatArray {
        val location = IntArray(2).also(view::getLocationOnScreen)
        val squareWidth = view.width / BOARD_DIMENSION.toFloat()
        val squareHeight = view.height / BOARD_DIMENSION.toFloat()
        val visualRow = BOARD_DIMENSION - rank
        return floatArrayOf(
            location[0] + (file + 0.5f) * squareWidth,
            location[1] + (visualRow + 0.5f) * squareHeight,
        )
    }

    private fun boardMatcher(): Matcher<View> = object : TypeSafeMatcher<View>() {
        override fun describeTo(description: Description) {
            description.appendText("interaction board with accessibility label $BOARD_LABEL")
        }

        override fun matchesSafely(view: View): Boolean =
            view.contentDescription?.toString()?.startsWith(BOARD_LABEL) == true
    }

    private fun boardViews(root: View): List<View> =
        descendantViews(root).filter { view ->
            view.contentDescription?.toString()?.startsWith(BOARD_LABEL) == true
        }

    private fun containsContentDescription(root: View, expected: String): Boolean =
        descendantViews(root).any { view -> view.contentDescription?.toString() == expected }

    private fun descendantViews(root: View): List<View> {
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

    private data class FrameDatum(
        val animationDurationNs: Long,
        val deadlineNs: Long,
        val drawDurationNs: Long,
        val inputHandlingDurationNs: Long,
        val intendedVsyncTimestampNs: Long,
        val layoutMeasureDurationNs: Long,
        val syncDurationNs: Long,
        val totalDurationNs: Long,
        val unknownDelayDurationNs: Long,
        val vsyncTimestampNs: Long,
    ) {
        val uiDurationNs: Long
            get() =
                unknownDelayDurationNs +
                    inputHandlingDurationNs +
                    animationDurationNs +
                    layoutMeasureDurationNs +
                    drawDurationNs +
                    syncDurationNs

        fun hasSameGatePayload(other: FrameDatum): Boolean =
            unknownDelayDurationNs == other.unknownDelayDurationNs &&
                inputHandlingDurationNs == other.inputHandlingDurationNs &&
                animationDurationNs == other.animationDurationNs &&
                layoutMeasureDurationNs == other.layoutMeasureDurationNs &&
                drawDurationNs == other.drawDurationNs &&
                syncDurationNs == other.syncDurationNs &&
                totalDurationNs == other.totalDurationNs &&
                vsyncTimestampNs == other.vsyncTimestampNs
    }

    private data class FrameSample(
        val activationLatencyNs: Long,
        val callbackCount: Int,
        val droppedReports: Int,
        val duplicateMetrics: Int,
        val duplicatePayloadMismatchCount: Int,
        val finalMoveLatencyNs: Long,
        val frames: List<FrameDatum>,
        val inputSpanMs: Long,
        val invalidMetrics: Int,
        val measurementEndNs: Long,
        val measurementStartNs: Long,
        val measurementSpanMs: Long,
        val outOfWindowMetrics: Int,
    )

    private enum class DrawProbeKind {
        ACTIVATION,
        TERMINAL,
    }

    private data class ArmedDrawProbe(
        val eventTimeNs: Long,
        val expectedCenters: List<DrawProbeCenter>,
        val kind: DrawProbeKind,
    )

    private data class DrawProbeCenter(
        val x: Float,
        val y: Float,
    )

    private data class DrawProbeDatum(
        val drawVsyncTimestampNs: Long,
        val eventTimeNs: Long,
    )

    private data class DrawProbeSample(
        val activation: DrawProbeDatum,
        val terminal: DrawProbeDatum,
    )

    private data class PerformanceRunSummary(
        val activationLatencyMs: Double,
        val callbackCount: Int,
        val deadlinePlausible: Boolean,
        val deliveryPercent: Double,
        val droppedReports: Int,
        val duplicateMetrics: Int,
        val duplicatePayloadMismatchCount: Int,
        val expectedVsyncSlots: Int,
        val finalMoveLatencyMs: Double,
        val frameCount: Int,
        val heuristicJankCount: Int,
        val heuristicJankPercent: Double,
        val implausibleDeadlineCount: Int,
        val inputSpanMs: Long,
        val invalidMetrics: Int,
        val intendedVsyncSpanMs: Double,
        val maximumDeadlineMs: Double,
        val measurementSpanMs: Long,
        val minimumDeadlineMs: Double,
        val missedVsyncSlots: Int,
        val outOfWindowMetrics: Int,
        val p50DeadlineMs: Double,
        val p95DeadlineMs: Double,
        val p95TotalDurationMs: Double,
        val p95UiDurationMs: Double,
        val p95VsyncGapMs: Double,
        val p99TotalDurationMs: Double,
        val p99UiDurationMs: Double,
        val p99VsyncGapMs: Double,
        val run: Int,
        val successfulMoves: Int,
        val worstSustainedVsyncGapMs: Double,
        val worstTotalDurationMs: Double,
        val worstUiDurationMs: Double,
    )

    private inner class OverlayDrawProbe(
        private val root: View,
    ) : Choreographer.FrameCallback,
        ViewTreeObserver.OnDrawListener {
        private val lock = Any()
        private val centerTolerancePx = drawProbeCenterTolerancePx(root)
        private var activeRun: Int? = null
        private var armed: ArmedDrawProbe? = null
        private var activation: DrawProbeDatum? = null
        private var armedFrameCallbackCount = 0
        private var armedOnDrawCount = 0
        private var choreographerFrameTimeNs = -1L
        private var failure: String? = null
        private var lastObservation = "not observed"
        private var terminal: DrawProbeDatum? = null

        fun attach() {
            check(root.viewTreeObserver.isAlive) { "overlay draw observer is not alive" }
            root.viewTreeObserver.addOnDrawListener(this)
        }

        fun detach() {
            synchronized(lock) {
                activeRun = null
                armed = null
            }
            Choreographer.getInstance().removeFrameCallback(this)
            if (root.viewTreeObserver.isAlive) {
                root.viewTreeObserver.removeOnDrawListener(this)
            }
        }

        fun beginRun(runIndex: Int) {
            synchronized(lock) {
                check(activeRun === null) { "another overlay draw-probe run is active" }
                activeRun = runIndex
                armed = null
                activation = null
                armedFrameCallbackCount = 0
                armedOnDrawCount = 0
                choreographerFrameTimeNs = -1L
                failure = null
                lastObservation = "not observed"
                terminal = null
            }
        }

        fun arm(
            runIndex: Int,
            kind: DrawProbeKind,
            eventTimeNs: Long,
            expectedCenter: FloatArray,
        ) {
            check(expectedCenter.size == 2) { "draw-probe center must contain x and y" }
            check(eventTimeNs > 0) { "draw-probe MotionEvent timestamp must be positive" }
            synchronized(lock) {
                check(activeRun == runIndex) { "overlay draw-probe run $runIndex is not active" }
                check(failure === null) { failure ?: "overlay draw probe failed" }
                check(armed === null) { "another overlay draw probe is already armed" }
                val prior = if (kind == DrawProbeKind.ACTIVATION) activation else terminal
                check(prior === null) { "$kind overlay draw probe was already captured" }
                armed =
                    ArmedDrawProbe(
                        eventTimeNs = eventTimeNs,
                        expectedCenters =
                            listOf(
                                DrawProbeCenter(
                                    x = expectedCenter[0],
                                    y = expectedCenter[1],
                                ),
                            ),
                        kind = kind,
                    )
                armedFrameCallbackCount = 0
                armedOnDrawCount = 0
                lastObservation = "armed; no draw observed"
            }
            Choreographer.getInstance().postFrameCallback(this)
        }

        fun addExpectedCenter(
            runIndex: Int,
            kind: DrawProbeKind,
            expectedCenter: FloatArray,
        ) {
            check(expectedCenter.size == 2) { "draw-probe center must contain x and y" }
            synchronized(lock) {
                check(activeRun == runIndex) { "overlay draw-probe run $runIndex is not active" }
                val armedSnapshot = armed
                if (armedSnapshot === null) {
                    val matched =
                        if (kind == DrawProbeKind.ACTIVATION) activation !== null else terminal !== null
                    check(matched) { "$kind overlay draw probe is neither armed nor captured" }
                    return
                }
                check(armedSnapshot.kind == kind) {
                    "cannot add a $kind center to ${armedSnapshot.kind} draw probe"
                }
                armed =
                    armedSnapshot.copy(
                        expectedCenters =
                            armedSnapshot.expectedCenters +
                                DrawProbeCenter(
                                    x = expectedCenter[0],
                                    y = expectedCenter[1],
                                ),
                    )
            }
        }

        fun hasMatched(
            runIndex: Int,
            kind: DrawProbeKind,
        ): Boolean =
            synchronized(lock) {
                check(activeRun == runIndex) { "overlay draw-probe run $runIndex is not active" }
                if (kind == DrawProbeKind.ACTIVATION) activation !== null else terminal !== null
            }

        fun throwIfFailed(runIndex: Int) {
            synchronized(lock) {
                check(activeRun == runIndex) { "overlay draw-probe run $runIndex is not active" }
                failure?.let { message -> throw AssertionError(message) }
            }
        }

        fun describePending(
            runIndex: Int,
            kind: DrawProbeKind,
        ): String =
            synchronized(lock) {
                check(activeRun == runIndex) { "overlay draw-probe run $runIndex is not active" }
                val armedSnapshot = armed
                val expected =
                    armedSnapshot
                        ?.takeIf { it.kind == kind }
                        ?.expectedCenters
                        ?.joinToString(prefix = "[", postfix = "]") { center ->
                            "(${center.x},${center.y})"
                        } ?: "none"
                "expected=$expected, onDraw=$armedOnDrawCount, " +
                    "frameCallbacks=$armedFrameCallbackCount, " +
                    "lastFrameTimeNs=$choreographerFrameTimeNs, $lastObservation"
            }

        fun finishRun(runIndex: Int): DrawProbeSample =
            synchronized(lock) {
                check(activeRun == runIndex) { "overlay draw-probe run $runIndex is not active" }
                failure?.let { message -> throw AssertionError(message) }
                check(armed === null) { "an overlay draw probe remains armed" }
                val activationDatum =
                    checkNotNull(activation) { "activation overlay draw probe was not captured" }
                val terminalDatum =
                    checkNotNull(terminal) { "terminal overlay draw probe was not captured" }
                check(terminalDatum.eventTimeNs > activationDatum.eventTimeNs) {
                    "terminal MotionEvent must follow the activation MotionEvent"
                }
                check(terminalDatum.drawVsyncTimestampNs > activationDatum.drawVsyncTimestampNs) {
                    "terminal overlay draw must follow the activation overlay draw"
                }
                activeRun = null
                DrawProbeSample(
                    activation = activationDatum,
                    terminal = terminalDatum,
                )
            }

        override fun doFrame(frameTimeNanos: Long) {
            val remainsArmed =
                synchronized(lock) {
                    if (armed === null) {
                        false
                    } else {
                        armedFrameCallbackCount += 1
                        choreographerFrameTimeNs = frameTimeNanos
                        true
                    }
                }
            if (remainsArmed) {
                Choreographer.getInstance().postFrameCallback(this)
            }
        }

        override fun onDraw() {
            val armedSnapshot =
                synchronized(lock) {
                    val snapshot = armed ?: return
                    armedOnDrawCount += 1
                    snapshot
                }
            val descendants = descendantViews(root).toList()
            val overlays =
                descendants.filter { view ->
                    view.getTag(R.id.react_test_id) == DRAG_OVERLAY_TEST_ID
                }
            val taggedTestIds =
                descendants
                    .mapNotNull { view -> view.getTag(R.id.react_test_id) as? String }
                    .filter { testId -> testId.startsWith("chessboard-native:") }
                    .distinct()
            if (overlays.size > 1) {
                synchronized(lock) {
                    if (armed == armedSnapshot) {
                        failure =
                            "${armedSnapshot.kind} draw probe found ${overlays.size} active overlays"
                    }
                }
                return
            }
            val overlay = overlays.singleOrNull()
            if (overlay === null) {
                synchronized(lock) {
                    if (armed == armedSnapshot) {
                        lastObservation =
                            "overlayCount=0, taggedTestIds=${taggedTestIds.ifEmpty { listOf("none") }}"
                    }
                }
                return
            }
            val visibleRect = Rect()
            val hasVisibleRect = overlay.getGlobalVisibleRect(visibleRect)
            // The injected MotionEvent coordinates are in screen space.
            // getGlobalVisibleRect can clip the overlay and shift the rect's
            // center, so use it only as the visibility proof and compare the
            // native host's un-clipped screen-space center instead.
            val screenLocation = IntArray(2).also(overlay::getLocationOnScreen)
            val centerX = screenLocation[0] + overlay.width / 2f
            val centerY = screenLocation[1] + overlay.height / 2f
            val rootLocation = IntArray(2).also(root::getLocationOnScreen)
            val centerMatched =
                armedSnapshot.expectedCenters.any { expectedCenter ->
                    abs(centerX - expectedCenter.x) <= centerTolerancePx &&
                        abs(centerY - expectedCenter.y) <= centerTolerancePx
                }
            synchronized(lock) {
                if (armed == armedSnapshot) {
                    lastObservation =
                        "overlayCount=1, taggedTestIds=$taggedTestIds, " +
                            "attached=${overlay.isAttachedToWindow}, shown=${overlay.isShown}, " +
                            "visibility=${overlay.visibility}, alpha=${overlay.alpha}, " +
                            "size=${overlay.width}x${overlay.height}, " +
                            "screenCenter=($centerX,$centerY), visibleRect=$visibleRect, " +
                            "hasVisibleRect=$hasVisibleRect, rootScreen=(${rootLocation[0]}," +
                            "${rootLocation[1]}), centerMatched=$centerMatched"
                }
            }
            if (!overlay.isShown || !hasVisibleRect || visibleRect.isEmpty || !centerMatched) {
                return
            }
            val frameTimeNs = synchronized(lock) { choreographerFrameTimeNs }
            synchronized(lock) {
                if (armed != armedSnapshot) {
                    return
                }
                if (frameTimeNs <= 0) {
                    failure = "${armedSnapshot.kind} draw probe observed no Choreographer frame time"
                    return
                }
                val datum =
                    DrawProbeDatum(
                        drawVsyncTimestampNs = frameTimeNs,
                        eventTimeNs = armedSnapshot.eventTimeNs,
                    )
                if (armedSnapshot.kind == DrawProbeKind.ACTIVATION) {
                    activation = datum
                } else {
                    terminal = datum
                }
                armed = null
            }
        }
    }

    private class FrameMetricsCollector : Window.OnFrameMetricsAvailableListener {
        private val lock = Any()
        private var activeRun: Int? = null
        private val callbackCounts = mutableMapOf<Int, Int>()
        private val droppedReports = mutableMapOf<Int, Int>()
        private val frames = mutableMapOf<Int, MutableList<FrameDatum>>()
        private val invalidMetrics = mutableMapOf<Int, Int>()

        fun beginRun(runIndex: Int) {
            synchronized(lock) {
                check(activeRun === null) { "another performance run is active" }
                callbackCounts[runIndex] = 0
                frames[runIndex] = mutableListOf()
                droppedReports[runIndex] = 0
                invalidMetrics[runIndex] = 0
                activeRun = runIndex
            }
        }

        fun finishRun(
            runIndex: Int,
            probeSample: DrawProbeSample,
        ): FrameSample =
            synchronized(lock) {
                check(activeRun == runIndex) { "performance run $runIndex is not active" }
                check(
                    probeSample.terminal.eventTimeNs > probeSample.activation.eventTimeNs,
                ) {
                    "performance run $runIndex has an invalid probe input span"
                }
                activeRun = null

                val allUniqueFrames = mutableListOf<FrameDatum>()
                val intendedVsyncs = mutableMapOf<Long, FrameDatum>()
                var duplicateMetricCount = 0
                var duplicatePayloadMismatchCount = 0
                for (frame in frames.remove(runIndex).orEmpty()) {
                    if (intendedVsyncs.containsKey(frame.intendedVsyncTimestampNs)) {
                        // Android can deliver a completely duplicated FrameMetrics
                        // record for one intended-vsync timestamp (b/206956036).
                        // Keep the first report, matching AndroidX JankStats.
                        duplicateMetricCount += 1
                        if (
                            !frame.hasSameGatePayload(
                                intendedVsyncs.getValue(frame.intendedVsyncTimestampNs),
                            )
                        ) {
                            duplicatePayloadMismatchCount += 1
                        }
                    } else {
                        intendedVsyncs[frame.intendedVsyncTimestampNs] = frame
                        allUniqueFrames.add(frame)
                    }
                }
                fun exactProbeFrame(
                    label: String,
                    probe: DrawProbeDatum,
                ): FrameDatum {
                    val matches =
                        allUniqueFrames.filter { frame ->
                            frame.vsyncTimestampNs == probe.drawVsyncTimestampNs
                        }
                    check(matches.size == 1) {
                        "performance run $runIndex $label draw timestamp " +
                            "${probe.drawVsyncTimestampNs} matched ${matches.size} frame metrics"
                    }
                    return matches.single()
                }

                val activationFrame = exactProbeFrame("activation", probeSample.activation)
                val terminalFrame = exactProbeFrame("terminal", probeSample.terminal)
                val measurementStartNs = activationFrame.intendedVsyncTimestampNs
                val measurementEndNs = terminalFrame.intendedVsyncTimestampNs
                check(measurementEndNs > measurementStartNs) {
                    "performance run $runIndex terminal frame must follow activation frame"
                }
                val bracketedFrames =
                    allUniqueFrames.filter { frame ->
                        frame.intendedVsyncTimestampNs in measurementStartNs..measurementEndNs
                    }
                check(bracketedFrames.contains(activationFrame)) {
                    "performance run $runIndex activation frame escaped the measured bracket"
                }
                check(bracketedFrames.contains(terminalFrame)) {
                    "performance run $runIndex terminal frame escaped the measured bracket"
                }
                val outOfWindowMetricCount = allUniqueFrames.size - bracketedFrames.size
                val activationCompletionNs =
                    activationFrame.intendedVsyncTimestampNs + activationFrame.totalDurationNs
                val terminalCompletionNs =
                    terminalFrame.intendedVsyncTimestampNs + terminalFrame.totalDurationNs
                val activationLatencyNs =
                    activationCompletionNs - probeSample.activation.eventTimeNs
                val finalMoveLatencyNs =
                    terminalCompletionNs - probeSample.terminal.eventTimeNs
                check(activationLatencyNs >= 0) {
                    "performance run $runIndex activation completed before its MotionEvent"
                }
                check(finalMoveLatencyNs >= 0) {
                    "performance run $runIndex terminal draw completed before its MotionEvent"
                }
                FrameSample(
                    activationLatencyNs = activationLatencyNs,
                    callbackCount = callbackCounts.remove(runIndex) ?: 0,
                    droppedReports = droppedReports.remove(runIndex) ?: 0,
                    duplicateMetrics = duplicateMetricCount,
                    duplicatePayloadMismatchCount = duplicatePayloadMismatchCount,
                    finalMoveLatencyNs = finalMoveLatencyNs,
                    frames = bracketedFrames,
                    inputSpanMs =
                        (probeSample.terminal.eventTimeNs -
                            probeSample.activation.eventTimeNs) /
                            NANOSECONDS_PER_MILLISECOND_LONG,
                    invalidMetrics = invalidMetrics.remove(runIndex) ?: 0,
                    measurementEndNs = measurementEndNs,
                    measurementStartNs = measurementStartNs,
                    measurementSpanMs =
                        (measurementEndNs - measurementStartNs) /
                            NANOSECONDS_PER_MILLISECOND_LONG,
                    outOfWindowMetrics = outOfWindowMetricCount,
                )
            }

        override fun onFrameMetricsAvailable(
            window: Window,
            frameMetrics: FrameMetrics,
            dropCountSinceLastInvocation: Int,
        ) {
            synchronized(lock) {
                val runIndex = activeRun ?: return
                callbackCounts[runIndex] = callbackCounts.getValue(runIndex) + 1
                droppedReports[runIndex] =
                    droppedReports.getValue(runIndex) + dropCountSinceLastInvocation
                val intendedVsyncTimestamp =
                    frameMetrics.getMetric(FrameMetrics.INTENDED_VSYNC_TIMESTAMP)
                val vsyncTimestamp = frameMetrics.getMetric(FrameMetrics.VSYNC_TIMESTAMP)
                val unknownDelayDuration =
                    frameMetrics.getMetric(FrameMetrics.UNKNOWN_DELAY_DURATION)
                val inputHandlingDuration =
                    frameMetrics.getMetric(FrameMetrics.INPUT_HANDLING_DURATION)
                val animationDuration = frameMetrics.getMetric(FrameMetrics.ANIMATION_DURATION)
                val layoutMeasureDuration =
                    frameMetrics.getMetric(FrameMetrics.LAYOUT_MEASURE_DURATION)
                val drawDuration = frameMetrics.getMetric(FrameMetrics.DRAW_DURATION)
                val syncDuration = frameMetrics.getMetric(FrameMetrics.SYNC_DURATION)
                val totalDuration = frameMetrics.getMetric(FrameMetrics.TOTAL_DURATION)
                val deadline = frameMetrics.getMetric(FrameMetrics.DEADLINE)
                if (
                    intendedVsyncTimestamp <= 0 ||
                    vsyncTimestamp <= 0 ||
                    totalDuration <= 0 ||
                    unknownDelayDuration < 0 ||
                    inputHandlingDuration < 0 ||
                    animationDuration < 0 ||
                    layoutMeasureDuration < 0 ||
                    drawDuration < 0 ||
                    syncDuration < 0 ||
                    unknownDelayDuration +
                        inputHandlingDuration +
                        animationDuration +
                        layoutMeasureDuration +
                        drawDuration +
                        syncDuration <= 0
                ) {
                    invalidMetrics[runIndex] = invalidMetrics.getValue(runIndex) + 1
                    return
                }
                frames.getValue(runIndex).add(
                    FrameDatum(
                        animationDurationNs = animationDuration,
                        deadlineNs = deadline,
                        drawDurationNs = drawDuration,
                        inputHandlingDurationNs = inputHandlingDuration,
                        intendedVsyncTimestampNs = intendedVsyncTimestamp,
                        layoutMeasureDurationNs = layoutMeasureDuration,
                        syncDurationNs = syncDuration,
                        totalDurationNs = totalDuration,
                        unknownDelayDurationNs = unknownDelayDuration,
                        vsyncTimestampNs = vsyncTimestamp,
                    ),
                )
            }
        }
    }

    private fun drawProbeCenterTolerancePx(view: View): Float =
        max(
            MINIMUM_DRAW_PROBE_CENTER_TOLERANCE_PX,
            DRAW_PROBE_CENTER_TOLERANCE_DP * view.resources.displayMetrics.density,
        )

    private companion object {
        const val BOARD_DIMENSION = 8
        const val BOARD_LABEL = "Interaction test board, white orientation"
        const val ACTIVATION_FOLLOW_UP_DELAY_MS = 17L
        const val DISPLAY_MODE_SETTLE_MS = 1_000L
        const val DRAG_OVERLAY_TEST_ID =
            "chessboard-native:native-interaction:provider-drag-overlay"
        const val DRAW_PROBE_CENTER_TOLERANCE_DP = 2f
        const val DRAW_PROBE_POLL_INTERVAL_MS = 1L
        const val DRAW_PROBE_TIMEOUT_MS = 2_000L
        const val FRAME_METRICS_DRAIN_MS = 150L
        const val HEX_DIGITS = "0123456789abcdef"
        const val INPUT_PRECONDITION_SETTLE_MS = 50L
        const val INTERACTION_TIMEOUT_MS = 30_000L
        const val JANK_HEURISTIC_MULTIPLIER = 2.0
        const val MAXIMUM_ACTIVATION_LATENCY_MS = 50.0
        const val MAXIMUM_FINAL_MOVE_LATENCY_MS = 50.0
        const val MAXIMUM_INPUT_SPAN_MS = 4_100L
        const val MAXIMUM_MEASURED_FRAMES = 270
        const val MAXIMUM_MEASUREMENT_SPAN_MS = 4_100L
        const val MAXIMUM_PLAUSIBLE_DEADLINE_PERIODS = 4.0
        const val MAXIMUM_REFRESH_RATE_HZ = 60.5f
        const val MAXIMUM_SUSTAINED_VSYNC_GAP_MS = 50.0
        const val MAXIMUM_TOTAL_DURATION_MS = 50.0
        const val MEASURED_MOVE_COUNT = 240
        const val MEASURED_RUN_COUNT = 5
        const val MEASURED_RUN_DURATION_MS = 4_000L
        const val METRICS_THREAD_JOIN_TIMEOUT_MS = 2_000L
        const val METRICS_HANDLER_DRAIN_TIMEOUT_MS = 2_000L
        const val MINIMUM_INPUT_SPAN_MS = 3_950L
        const val MINIMUM_DRAW_PROBE_CENTER_TOLERANCE_PX = 2f
        const val MINIMUM_MEASURED_FRAMES = 228
        const val MINIMUM_MEASUREMENT_SPAN_MS = 3_950L
        const val MINIMUM_REFRESH_RATE_HZ = 59.5f
        const val MINIMUM_VSYNC_DELIVERY_PERCENT = 95.0
        const val NANOSECONDS_PER_MILLISECOND = 1_000_000.0
        const val NANOSECONDS_PER_MILLISECOND_LONG = 1_000_000L
        const val NANOSECONDS_PER_SECOND = 1_000_000_000.0
        const val OVERLAY_RETIRE_SETTLE_MS = 250L
        const val PERFORMANCE_LOG_CHECKSUM_ALGORITHM = "SHA-256"
        const val PERFORMANCE_LOG_CHUNK_PAYLOAD_CHARACTERS = 2_000
        const val PERFORMANCE_LOG_CHUNK_PREFIX = "CHESSBOARD_DRAG_PERF_CHUNK "
        const val PERFORMANCE_LOG_RECORD_ID_LENGTH = 16
        const val PERFORMANCE_LOG_TAG = "ChessboardDragPerf"
        const val PERFORMANCE_LOG_TRANSPORT_VERSION = 1
        const val POLL_INTERVAL_MS = 50L
        const val POSITION_REVISION_DESCRIPTION = "Position revision: 7"
        const val TERMINAL_APPROACH_TOLERANCE_MULTIPLIER = 1.5f
        const val TERMINAL_FOLLOW_UP_DELAY_MS = 17L
        const val TERMINAL_PROBE_MOVE_COUNT = 1
        const val WARM_UP_DURATION_MS = 1_000L
        const val WARM_UP_MOVE_COUNT = 60
        const val ZIGZAG_MOVES_PER_LEG = 60
    }
}
