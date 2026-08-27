package com.vibechess.chessboardnativeharness

import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import android.os.SystemClock
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
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import kotlin.math.ceil

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
                        successfulMoves = MEASURED_MOVE_COUNT,
                        sample =
                            frameSample
                                ?: throw AssertionError("missing frame sample for run $runIndex"),
                    )
                summaries.add(summary)
            }

            // Emit the one machine-readable record before threshold assertions
            // so a failed run retains the measured diagnostics that explain it.
            Log.i(
                PERFORMANCE_LOG_TAG,
                PERFORMANCE_LOG_PREFIX + performanceJson(refreshRate, summaries),
            )
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
        beforeCancel: ((MeasurementWindow) -> Unit)? = null,
    ): ViewAction = object : ViewAction {
        override fun getConstraints(): Matcher<View> = isDisplayed()

        override fun getDescription(): String =
            "sustain a native board drag for $durationMs ms with $moveCount moves"

        override fun perform(uiController: UiController, view: View) {
            val source = squareCenterOnView(view, file = 3, rank = 4)
            val upper = squareCenterOnView(view, file = 3, rank = 5)
            val lower = squareCenterOnView(view, file = 3, rank = 3)
            cancelLingeringInjectedTouchStream(uiController, source)

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

            // Keep the pointer held while the frame-listener thread drains the
            // final moving frame, then close the measurement before CANCEL.
            uiController.loopMainThreadForAtLeast(FRAME_METRICS_DRAIN_MS)
            val measurementEndNs = System.nanoTime()
            assertTrue(
                "performance drag measurement window must start before it ends",
                measurementStartNs > 0 && measurementEndNs > measurementStartNs,
            )
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
        successfulMoves: Int,
        sample: FrameSample,
    ): PerformanceRunSummary {
        val sortedDurations = sample.frames.map(FrameDatum::totalDurationNs).sorted()
        val sortedOverruns =
            sample.frames
                .map { frame -> frame.totalDurationNs - frame.deadlineNs }
                .sorted()
        val jankyFrames =
            sample.frames.count { frame ->
                frame.totalDurationNs >= frame.deadlineNs
            }
        val frameCount = sortedDurations.size
        return PerformanceRunSummary(
            callbackCount = sample.callbackCount,
            droppedReports = sample.droppedReports,
            duplicateMetrics = sample.duplicateMetrics,
            frameCount = frameCount,
            inputSpanMs = sample.inputSpanMs,
            invalidMetrics = sample.invalidMetrics,
            jankPercent = if (frameCount == 0) 0.0 else jankyFrames * 100.0 / frameCount,
            measurementSpanMs = sample.measurementSpanMs,
            outOfWindowMetrics = sample.outOfWindowMetrics,
            p95Ms = if (frameCount == 0) 0.0 else percentileMs(sortedDurations, 0.95),
            p95OverrunMs = if (frameCount == 0) 0.0 else percentileMs(sortedOverruns, 0.95),
            p99Ms = if (frameCount == 0) 0.0 else percentileMs(sortedDurations, 0.99),
            p99OverrunMs = if (frameCount == 0) 0.0 else percentileMs(sortedOverruns, 0.99),
            run = runIndex + 1,
            successfulMoves = successfulMoves,
            worstFrameMs =
                sortedDurations.lastOrNull()?.div(NANOSECONDS_PER_MILLISECOND) ?: 0.0,
            worstOverrunMs =
                sortedOverruns.lastOrNull()?.div(NANOSECONDS_PER_MILLISECOND) ?: 0.0,
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
        assertTrue(
            "$label jank was ${summary.jankPercent}%",
            summary.jankPercent == 0.0,
        )
        assertTrue(
            "$label p95 overrun was ${summary.p95OverrunMs} ms",
            summary.p95OverrunMs < 0.0,
        )
        assertTrue(
            "$label p99 overrun was ${summary.p99OverrunMs} ms",
            summary.p99OverrunMs < 0.0,
        )
        assertTrue(
            "$label worst overrun was ${summary.worstOverrunMs} ms",
            summary.worstOverrunMs < 0.0,
        )
        assertTrue(
            "$label worst frame was ${summary.worstFrameMs} ms",
            summary.worstFrameMs < MAXIMUM_FRAME_MS,
        )
        assertEquals("$label dropped frame-metric reports", 0, summary.droppedReports)
        assertEquals("$label invalid frame metrics", 0, summary.invalidMetrics)
    }

    private fun percentileMs(sortedDurations: List<Long>, percentile: Double): Double {
        val index = (ceil(percentile * sortedDurations.size).toInt() - 1).coerceAtLeast(0)
        return sortedDurations[index] / NANOSECONDS_PER_MILLISECOND
    }

    private fun performanceJson(
        refreshRate: Float,
        summaries: List<PerformanceRunSummary>,
    ): String =
        JSONObject()
            .put("schemaVersion", 2)
            .put("displayRefreshHz", refreshRate.toDouble())
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
                                .put("outOfWindowMetrics", summary.outOfWindowMetrics)
                                .put("frameCount", summary.frameCount)
                                .put("p95Ms", summary.p95Ms)
                                .put("p99Ms", summary.p99Ms)
                                .put("p95OverrunMs", summary.p95OverrunMs)
                                .put("p99OverrunMs", summary.p99OverrunMs)
                                .put("jankPercent", summary.jankPercent)
                                .put("worstFrameMs", summary.worstFrameMs)
                                .put("worstOverrunMs", summary.worstOverrunMs)
                                .put("droppedReports", summary.droppedReports),
                        )
                    }
                },
            ).toString()

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
        val deadlineNs: Long,
        val intendedVsyncTimestampNs: Long,
        val totalDurationNs: Long,
    )

    private data class FrameSample(
        val callbackCount: Int,
        val droppedReports: Int,
        val duplicateMetrics: Int,
        val frames: List<FrameDatum>,
        val inputSpanMs: Long,
        val invalidMetrics: Int,
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
        val droppedReports: Int,
        val duplicateMetrics: Int,
        val frameCount: Int,
        val inputSpanMs: Long,
        val invalidMetrics: Int,
        val jankPercent: Double,
        val measurementSpanMs: Long,
        val outOfWindowMetrics: Int,
        val p95Ms: Double,
        val p95OverrunMs: Double,
        val p99Ms: Double,
        val p99OverrunMs: Double,
        val run: Int,
        val successfulMoves: Int,
        val worstFrameMs: Double,
        val worstOverrunMs: Double,
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
                val intendedVsyncs = mutableSetOf<Long>()
                var duplicateMetricCount = 0
                var outOfWindowMetricCount = 0
                for (frame in frames.remove(runIndex).orEmpty()) {
                    if (
                        frame.intendedVsyncTimestampNs < measurementWindow.startNs ||
                        frame.intendedVsyncTimestampNs > measurementWindow.endNs
                    ) {
                        outOfWindowMetricCount += 1
                    } else if (!intendedVsyncs.add(frame.intendedVsyncTimestampNs)) {
                        // Android can deliver a completely duplicated FrameMetrics
                        // record for one intended-vsync timestamp (b/206956036).
                        // Keep the first report, matching AndroidX JankStats.
                        duplicateMetricCount += 1
                    } else {
                        uniqueFrames.add(frame)
                    }
                }
                FrameSample(
                    callbackCount = callbackCounts.remove(runIndex) ?: 0,
                    droppedReports = droppedReports.remove(runIndex) ?: 0,
                    duplicateMetrics = duplicateMetricCount,
                    frames = uniqueFrames,
                    inputSpanMs = measurementWindow.inputSpanMs,
                    invalidMetrics = invalidMetrics.remove(runIndex) ?: 0,
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
                val totalDuration = frameMetrics.getMetric(FrameMetrics.TOTAL_DURATION)
                val deadline = frameMetrics.getMetric(FrameMetrics.DEADLINE)
                if (
                    intendedVsyncTimestamp <= 0 ||
                    totalDuration <= 0 ||
                    deadline <= 0
                ) {
                    invalidMetrics[runIndex] = invalidMetrics.getValue(runIndex) + 1
                    return
                }
                frames.getValue(runIndex).add(
                    FrameDatum(
                        deadlineNs = deadline,
                        intendedVsyncTimestampNs = intendedVsyncTimestamp,
                        totalDurationNs = totalDuration,
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
        const val INPUT_PRECONDITION_SETTLE_MS = 50L
        const val INTERACTION_TIMEOUT_MS = 30_000L
        const val MAXIMUM_FRAME_MS = 50.0
        const val MAXIMUM_INPUT_SPAN_MS = 4_100L
        const val MAXIMUM_MEASURED_FRAMES = 270
        const val MAXIMUM_MEASUREMENT_SPAN_MS = 4_300L
        const val MAXIMUM_REFRESH_RATE_HZ = 60.5f
        const val MEASURED_MOVE_COUNT = 240
        const val MEASURED_RUN_COUNT = 5
        const val MEASURED_RUN_DURATION_MS = 4_000L
        const val METRICS_THREAD_JOIN_TIMEOUT_MS = 2_000L
        const val METRICS_HANDLER_DRAIN_TIMEOUT_MS = 2_000L
        const val MINIMUM_INPUT_SPAN_MS = 3_950L
        const val MINIMUM_MEASURED_FRAMES = 228
        const val MINIMUM_MEASUREMENT_SPAN_MS = 4_100L
        const val MINIMUM_REFRESH_RATE_HZ = 59.5f
        const val NANOSECONDS_PER_MILLISECOND = 1_000_000.0
        const val NANOSECONDS_PER_MILLISECOND_LONG = 1_000_000L
        const val OVERLAY_RETIRE_SETTLE_MS = 250L
        const val PERFORMANCE_LOG_PREFIX = "CHESSBOARD_DRAG_PERF "
        const val PERFORMANCE_LOG_TAG = "ChessboardDragPerf"
        const val POLL_INTERVAL_MS = 50L
        const val POSITION_REVISION_DESCRIPTION = "Position revision: 7"
        const val WARM_UP_DURATION_MS = 1_000L
        const val WARM_UP_MOVE_COUNT = 60
        const val ZIGZAG_MOVES_PER_LEG = 60
    }
}
