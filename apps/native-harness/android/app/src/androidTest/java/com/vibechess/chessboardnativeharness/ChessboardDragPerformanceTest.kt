package com.vibechess.chessboardnativeharness

import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import android.os.SystemClock
import android.util.Base64
import android.util.Log
import android.view.FrameMetrics
import android.view.InputDevice
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
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
        activityRule.scenario.onActivity { activity ->
            activity.window.addOnFrameMetricsAvailableListener(
                collector,
                metricsHandler,
            )
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
                collector.beginRun(runIndex)
                var frameSample: FrameSample? = null
                onView(boardMatcher()).perform(
                    sustainedDrag(
                        durationMs = MEASURED_RUN_DURATION_MS,
                        moveCount = MEASURED_MOVE_COUNT,
                        beforeCancel = { measurementWindow ->
                            drainMetricsHandler(metricsHandler)
                            frameSample = collector.finishRun(runIndex, measurementWindow)
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
                        successfulMoves = MEASURED_MOVE_COUNT,
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
        beforeCancel: ((MeasurementWindow) -> Unit)? = null,
    ): ViewAction = object : ViewAction {
        override fun getConstraints(): Matcher<View> = isDisplayed()

        override fun getDescription(): String =
            "sustain a native board drag for $durationMs ms with $moveCount moves"

        override fun perform(uiController: UiController, view: View) {
            val source = squareCenterOnView(view, file = 3, rank = 4)
            val upper = squareCenterOnView(view, file = 3, rank = 5)
            val lower = squareCenterOnView(view, file = 3, rank = 3)
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

            val firstMoveAt = SystemClock.uptimeMillis()
            var lastMoveAt = firstMoveAt
            var measurementStartNs = -1L
            repeat(moveCount) { moveIndex ->
                val targetTime =
                    firstMoveAt +
                        if (moveCount == 1) {
                            0L
                        } else {
                            durationMs * moveIndex / (moveCount - 1)
                        }
                val waitMs = targetTime - SystemClock.uptimeMillis()
                if (waitMs > 0) {
                    uiController.loopMainThreadForAtLeast(waitMs)
                }
                if (moveIndex == 0) {
                    measurementStartNs = System.nanoTime()
                }
                val eventTime = SystemClock.uptimeMillis()
                val move =
                    touchEvent(
                        downTime,
                        eventTime,
                        MotionEvent.ACTION_MOVE,
                        zigzagCoordinate(upper, lower, moveIndex),
                    )
                try {
                    assertTrue(
                        "performance drag ACTION_MOVE $moveIndex injection must succeed",
                        uiController.injectMotionEvent(move),
                    )
                } finally {
                    move.recycle()
                }
                lastMoveAt = eventTime
            }

            // Close the measured interval immediately after the final MOVE.
            // Keep the pointer held while pending callbacks drain so the
            // listener can retain every record whose intended-vsync belongs
            // to that exact input interval before CANCEL tears down the drag.
            val measurementEndNs = System.nanoTime()
            assertTrue(
                "performance drag measurement window must start before it ends",
                measurementStartNs > 0 && measurementEndNs > measurementStartNs,
            )
            uiController.loopMainThreadForAtLeast(FRAME_METRICS_DRAIN_MS)
            beforeCancel?.invoke(
                MeasurementWindow(
                    endNs = measurementEndNs,
                    inputSpanMs = lastMoveAt - firstMoveAt,
                    startNs = measurementStartNs,
                ),
            )

            val cancelTime = SystemClock.uptimeMillis()
            val cancel =
                touchEvent(
                    downTime,
                    cancelTime,
                    MotionEvent.ACTION_CANCEL,
                    zigzagCoordinate(upper, lower, moveCount - 1),
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
        val leadingCoverageGapNs =
            orderedFrames.firstOrNull()?.let { firstFrame ->
                firstFrame.intendedVsyncTimestampNs - sample.measurementStartNs
            } ?: measurementSpanNs
        val trailingCoverageGapNs =
            orderedFrames.lastOrNull()?.let { lastFrame ->
                sample.measurementEndNs - lastFrame.intendedVsyncTimestampNs
            } ?: measurementSpanNs
        val worstCoverageGapNs =
            maxOf(
                leadingCoverageGapNs,
                trailingCoverageGapNs,
                sortedVsyncGaps.lastOrNull() ?: 0L,
            )
        val heuristicJankCount =
            orderedFrames.count { frame -> frame.uiDurationNs > heuristicJankThresholdNs }
        val maximumPlausibleDeadlineNs =
            (expectedFrameDurationNs * MAXIMUM_PLAUSIBLE_DEADLINE_PERIODS).toLong()
        val implausibleDeadlineCount =
            orderedFrames.count { frame ->
                frame.deadlineNs <= 0 || frame.deadlineNs > maximumPlausibleDeadlineNs
            }
        return PerformanceRunSummary(
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
            leadingCoverageGapMs = leadingCoverageGapNs.toMilliseconds(),
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
            trailingCoverageGapMs = trailingCoverageGapNs.toMilliseconds(),
            worstCoverageGapMs = worstCoverageGapNs.toMilliseconds(),
            worstTotalDurationMs = sortedTotalDurations.lastOrNull()?.toMilliseconds() ?: 0.0,
            worstUiDurationMs = sortedUiDurations.lastOrNull()?.toMilliseconds() ?: 0.0,
            worstVsyncGapMs = sortedVsyncGaps.lastOrNull()?.toMilliseconds() ?: 0.0,
        )
    }

    private fun assertRunWithinBudget(summary: PerformanceRunSummary) {
        val label = "performance run ${summary.run}"
        assertEquals("$label move count", MEASURED_MOVE_COUNT, summary.successfulMoves)
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
            "$label worst coverage gap was ${summary.worstCoverageGapMs} ms",
            summary.worstCoverageGapMs < MAXIMUM_COVERAGE_GAP_MS,
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
            .put("schemaVersion", 3)
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
                                .put("leadingCoverageGapMs", summary.leadingCoverageGapMs)
                                .put("trailingCoverageGapMs", summary.trailingCoverageGapMs)
                                .put("worstCoverageGapMs", summary.worstCoverageGapMs)
                                .put("p95VsyncGapMs", summary.p95VsyncGapMs)
                                .put("p99VsyncGapMs", summary.p99VsyncGapMs)
                                .put("worstVsyncGapMs", summary.worstVsyncGapMs)
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
                totalDurationNs == other.totalDurationNs
    }

    private data class FrameSample(
        val callbackCount: Int,
        val droppedReports: Int,
        val duplicateMetrics: Int,
        val duplicatePayloadMismatchCount: Int,
        val frames: List<FrameDatum>,
        val inputSpanMs: Long,
        val invalidMetrics: Int,
        val measurementEndNs: Long,
        val measurementStartNs: Long,
        val measurementSpanMs: Long,
        val outOfWindowMetrics: Int,
    )

    private data class MeasurementWindow(
        val endNs: Long,
        val inputSpanMs: Long,
        val startNs: Long,
    )

    private data class PerformanceRunSummary(
        val callbackCount: Int,
        val deadlinePlausible: Boolean,
        val deliveryPercent: Double,
        val droppedReports: Int,
        val duplicateMetrics: Int,
        val duplicatePayloadMismatchCount: Int,
        val expectedVsyncSlots: Int,
        val frameCount: Int,
        val heuristicJankCount: Int,
        val heuristicJankPercent: Double,
        val implausibleDeadlineCount: Int,
        val inputSpanMs: Long,
        val invalidMetrics: Int,
        val intendedVsyncSpanMs: Double,
        val leadingCoverageGapMs: Double,
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
        val trailingCoverageGapMs: Double,
        val worstCoverageGapMs: Double,
        val worstTotalDurationMs: Double,
        val worstUiDurationMs: Double,
        val worstVsyncGapMs: Double,
    )

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
            measurementWindow: MeasurementWindow,
        ): FrameSample =
            synchronized(lock) {
                check(activeRun == runIndex) { "performance run $runIndex is not active" }
                check(measurementWindow.startNs > 0) {
                    "performance run $runIndex has no measurement start"
                }
                check(measurementWindow.endNs > measurementWindow.startNs) {
                    "performance run $runIndex has an invalid measurement window"
                }
                activeRun = null

                val uniqueFrames = mutableListOf<FrameDatum>()
                val intendedVsyncs = mutableMapOf<Long, FrameDatum>()
                var duplicateMetricCount = 0
                var duplicatePayloadMismatchCount = 0
                var outOfWindowMetricCount = 0
                for (frame in frames.remove(runIndex).orEmpty()) {
                    if (
                        frame.intendedVsyncTimestampNs < measurementWindow.startNs ||
                        frame.intendedVsyncTimestampNs > measurementWindow.endNs
                    ) {
                        outOfWindowMetricCount += 1
                    } else if (intendedVsyncs.containsKey(frame.intendedVsyncTimestampNs)) {
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
                        uniqueFrames.add(frame)
                    }
                }
                FrameSample(
                    callbackCount = callbackCounts.remove(runIndex) ?: 0,
                    droppedReports = droppedReports.remove(runIndex) ?: 0,
                    duplicateMetrics = duplicateMetricCount,
                    duplicatePayloadMismatchCount = duplicatePayloadMismatchCount,
                    frames = uniqueFrames,
                    inputSpanMs = measurementWindow.inputSpanMs,
                    invalidMetrics = invalidMetrics.remove(runIndex) ?: 0,
                    measurementEndNs = measurementWindow.endNs,
                    measurementStartNs = measurementWindow.startNs,
                    measurementSpanMs =
                        (measurementWindow.endNs - measurementWindow.startNs) /
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
                    ),
                )
            }
        }
    }

    private companion object {
        const val BOARD_DIMENSION = 8
        const val BOARD_LABEL = "Interaction test board, white orientation"
        const val DISPLAY_MODE_SETTLE_MS = 1_000L
        const val DRAG_OVERLAY_TEST_ID =
            "chessboard-native:native-interaction:provider-drag-overlay"
        const val FRAME_METRICS_DRAIN_MS = 150L
        const val HEX_DIGITS = "0123456789abcdef"
        const val INPUT_PRECONDITION_SETTLE_MS = 50L
        const val INTERACTION_TIMEOUT_MS = 30_000L
        const val JANK_HEURISTIC_MULTIPLIER = 2.0
        const val MAXIMUM_COVERAGE_GAP_MS = 50.0
        const val MAXIMUM_INPUT_SPAN_MS = 4_100L
        const val MAXIMUM_MEASURED_FRAMES = 270
        const val MAXIMUM_MEASUREMENT_SPAN_MS = 4_100L
        const val MAXIMUM_PLAUSIBLE_DEADLINE_PERIODS = 4.0
        const val MAXIMUM_REFRESH_RATE_HZ = 60.5f
        const val MAXIMUM_TOTAL_DURATION_MS = 50.0
        const val MEASURED_MOVE_COUNT = 240
        const val MEASURED_RUN_COUNT = 5
        const val MEASURED_RUN_DURATION_MS = 4_000L
        const val METRICS_THREAD_JOIN_TIMEOUT_MS = 2_000L
        const val METRICS_HANDLER_DRAIN_TIMEOUT_MS = 2_000L
        const val MINIMUM_INPUT_SPAN_MS = 3_950L
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
        const val WARM_UP_DURATION_MS = 1_000L
        const val WARM_UP_MOVE_COUNT = 60
        const val ZIGZAG_MOVES_PER_LEG = 60
    }
}
