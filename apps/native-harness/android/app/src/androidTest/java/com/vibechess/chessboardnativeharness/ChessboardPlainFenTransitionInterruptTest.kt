package com.vibechess.chessboardnativeharness

import android.content.Context
import android.content.Intent
import android.os.SystemClock
import android.view.InputDevice
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import androidx.core.view.ViewCompat
import androidx.test.core.app.ApplicationProvider
import androidx.test.espresso.Espresso.onView
import androidx.test.espresso.UiController
import androidx.test.espresso.ViewAction
import androidx.test.espresso.matcher.ViewMatchers.isDisplayed
import androidx.test.espresso.matcher.ViewMatchers.isRoot
import androidx.test.ext.junit.rules.ActivityScenarioRule
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.filters.LargeTest
import org.hamcrest.Description
import org.hamcrest.Matcher
import org.hamcrest.TypeSafeMatcher
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

abstract class PlainFenTransitionInterruptTestBase(
    private val fixtureName: String,
    private val injectEachTransition: Boolean,
    private val postSequenceSettleMs: Long,
    private val rapidCadenceMs: Int,
    private val rapidChangeCount: Int,
    private val transitionDurationMs: Int,
) {
    private val launchIntent =
        Intent(
            ApplicationProvider.getApplicationContext<Context>(),
            MainActivity::class.java,
        ).putExtra(
            MainActivity.EXTRA_FIXTURE,
            fixtureName,
        )

    @get:Rule
    val activityRule = ActivityScenarioRule<MainActivity>(launchIntent)

    @Test
    fun rapidPlainFenUpdatesRetireInterruptedTransitionHostsAndRemainReusable() {
        awaitState(
            changeCount = 0,
            currentFen = E2_FEN,
            pieceSquare = "e2",
            sequencePhase = "idle",
        )

        if (injectEachTransition) {
            onView(injectedTriggerMatcher()).perform(
                injectRawTapSequence(
                    tapCount = rapidChangeCount,
                    minimumIntervalMs = rapidCadenceMs.toLong(),
                ),
            )
        } else {
            onView(rapidTriggerMatcher()).perform(performDirectClick())
        }
        awaitState(
            changeCount = rapidChangeCount,
            currentFen = E2_FEN,
            pieceSquare = "e2",
            sequencePhase = "rapid-complete",
        )
        if (injectEachTransition) {
            assertInjectedGapTelemetry(expectedGapCount = rapidChangeCount - 1)
        }
        onView(isRoot()).perform(waitForAtLeast(postSequenceSettleMs))
        assertStableState(
            changeCount = rapidChangeCount,
            currentFen = E2_FEN,
            expectedBoardValue = "e4, empty; selected",
            expectedBoardIndex = E4_INDEX,
            pieceSquare = "e2",
            sequencePhase = "rapid-complete",
        )
        performActionAndAwait(
            actionLabel = "Move cursor down",
            description = "e3, empty",
            index = E3_INDEX,
        )
        performActionAndAwait(
            actionLabel = "Move cursor down",
            description = "e2, white pawn",
            index = E2_INDEX,
        )

        // Keep reuse as a separate raw native input after the retirement window.
        // Its DOWN/UP pair has no Espresso click-action post-delay and makes
        // Reanimated replay pending synchronous props after host removal.
        onView(reuseTriggerMatcher()).perform(
            injectRawTapSequence(tapCount = 1, minimumIntervalMs = 0),
        )
        awaitState(
            changeCount = rapidChangeCount + 1,
            currentFen = E4_FEN,
            pieceSquare = "e4",
            sequencePhase = "reused",
        )
        if (injectEachTransition) {
            assertInjectedGapTelemetry(expectedGapCount = rapidChangeCount - 1)
        }
        onView(isRoot()).perform(waitForAtLeast(transitionDurationMs + 300L))
        assertStableState(
            changeCount = rapidChangeCount + 1,
            currentFen = E4_FEN,
            expectedBoardValue = "e2, empty",
            expectedBoardIndex = E2_INDEX,
            pieceSquare = "e4",
            sequencePhase = "reused",
        )
        performActionAndAwait(
            actionLabel = "Move cursor up",
            description = "e3, empty",
            index = E3_INDEX,
        )
        performActionAndAwait(
            actionLabel = "Move cursor up",
            description = "e4, white pawn; selected",
            index = E4_INDEX,
        )
        assertStableState(
            changeCount = rapidChangeCount + 1,
            currentFen = E4_FEN,
            expectedBoardValue = "e4, white pawn; selected",
            expectedBoardIndex = E4_INDEX,
            pieceSquare = "e4",
            sequencePhase = "reused",
        )
    }

    private fun awaitState(
        changeCount: Int,
        currentFen: String,
        pieceSquare: String,
        sequencePhase: String,
    ) {
        onView(isRoot()).perform(
            waitForState(
                expectedDescriptions(
                    changeCount = changeCount,
                    currentFen = currentFen,
                    pieceSquare = pieceSquare,
                    sequencePhase = sequencePhase,
                ),
            ),
        )
    }

    private fun expectedDescriptions(
        changeCount: Int,
        currentFen: String,
        pieceSquare: String,
        sequencePhase: String,
    ): Set<String> =
        setOf(
            "Current FEN: $currentFen",
            "Piece count: 1",
            "Piece identities: absent",
            "Piece square: $pieceSquare",
            "Position change count: $changeCount",
            "Position input tier: plain-fen",
            "Post-sequence settle ms: $postSequenceSettleMs",
            "Rapid cadence ms: $rapidCadenceMs",
            "Sequence phase: $sequencePhase",
            "Transition duration ms: $transitionDurationMs",
        )

    private fun waitForState(expected: Set<String>): ViewAction = object : ViewAction {
        override fun getConstraints(): Matcher<View> = isRoot()

        override fun getDescription(): String =
            "wait for plain FEN transition state ${expected.sorted()}"

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
            throw AssertionError(
                "Timed out waiting for plain FEN transition state; missing=$missing",
            )
        }
    }

    private fun assertStableState(
        changeCount: Int,
        currentFen: String,
        expectedBoardIndex: Int,
        expectedBoardValue: String,
        pieceSquare: String,
        sequencePhase: String,
    ) {
        val expected =
            expectedDescriptions(
                changeCount = changeCount,
                currentFen = currentFen,
                pieceSquare = pieceSquare,
                sequencePhase = sequencePhase,
            )
        onView(isRoot()).check { root, error ->
            if (error != null) {
                throw error
            }

            expected.forEach { description ->
                assertTrue(
                    "missing stable plain FEN transition state: $description",
                    containsContentDescription(root, description),
                )
            }
            val board = boardViews(root).single()
            assertEquals(
                "$BOARD_LABEL, $expectedBoardValue",
                board.createAccessibilityNodeInfo().contentDescription?.toString(),
            )
            assertEquals(
                expectedBoardIndex.toFloat(),
                board.createAccessibilityNodeInfo().rangeInfo?.current,
            )
        }
    }

    private fun performActionAndAwait(
        actionLabel: String,
        description: String,
        index: Int,
    ) {
        onView(boardMatcher()).perform(performNativeAccessibilityAction(actionLabel))
        onView(isRoot()).perform(waitForBoardState(description, index))
    }

    private fun performNativeAccessibilityAction(actionLabel: String): ViewAction =
        object : ViewAction {
            override fun getConstraints(): Matcher<View> = isDisplayed()

            override fun getDescription(): String =
                "perform native accessibility action $actionLabel"

            override fun perform(uiController: UiController, view: View) {
                val actionId =
                    view
                        .createAccessibilityNodeInfo()
                        .actionList
                        .singleOrNull { action -> action.label?.toString() == actionLabel }
                        ?.id
                        ?: throw AssertionError(
                            "Missing native accessibility action: $actionLabel",
                        )
                val delegate =
                    ViewCompat.getAccessibilityDelegate(view)
                        ?: throw AssertionError("Missing native accessibility delegate")
                assertTrue(
                    "custom accessibility action must be handled",
                    delegate.performAccessibilityAction(view, actionId, null),
                )
                uiController.loopMainThreadForAtLeast(POLL_INTERVAL_MS)
            }
        }

    private fun waitForBoardState(description: String, index: Int): ViewAction =
        object : ViewAction {
            override fun getConstraints(): Matcher<View> = isRoot()

            override fun getDescription(): String =
                "wait for board accessibility value $description at index $index"

            override fun perform(uiController: UiController, root: View) {
                val deadline = SystemClock.uptimeMillis() + INTERACTION_TIMEOUT_MS
                do {
                    val board = boardViews(root).singleOrNull()
                    if (board != null) {
                        val node = board.createAccessibilityNodeInfo()
                        if (
                            node.contentDescription?.toString() ==
                                "$BOARD_LABEL, $description" &&
                                node.rangeInfo?.current == index.toFloat()
                        ) {
                            return
                        }
                    }
                    uiController.loopMainThreadForAtLeast(POLL_INTERVAL_MS)
                } while (SystemClock.uptimeMillis() < deadline)

                throw AssertionError(
                    "Timed out waiting for $BOARD_LABEL, $description at index $index",
                )
            }
        }

    private fun waitForAtLeast(durationMs: Long): ViewAction = object : ViewAction {
        override fun getConstraints(): Matcher<View> = isRoot()

        override fun getDescription(): String = "wait for $durationMs ms"

        override fun perform(uiController: UiController, view: View) {
            uiController.loopMainThreadForAtLeast(durationMs)
        }
    }

    private fun injectRawTapSequence(
        tapCount: Int,
        minimumIntervalMs: Long,
    ): ViewAction = object : ViewAction {
        override fun getConstraints(): Matcher<View> = isDisplayed()

        override fun getDescription(): String =
            "inject $tapCount raw native tap(s) with at least $minimumIntervalMs ms between DOWN events"

        override fun perform(uiController: UiController, view: View) {
            require(tapCount > 0) { "Raw tap count must be positive." }
            require(minimumIntervalMs >= 0) {
                "Raw tap minimum interval must be non-negative."
            }
            var previousDownAtMs: Long? = null
            var observedDownGapCount = 0

            repeat(tapCount) { index ->
                previousDownAtMs?.let { previous ->
                    val remainingMs = previous + minimumIntervalMs - SystemClock.uptimeMillis()
                    if (remainingMs > 0) {
                        uiController.loopMainThreadForAtLeast(remainingMs)
                    }
                }

                assertTrue(
                    "raw tap ${index + 1} target must remain attached",
                    view.isAttachedToWindow,
                )
                assertTrue("raw tap ${index + 1} target must remain shown", view.isShown)
                assertTrue(
                    "raw tap ${index + 1} target must retain positive geometry",
                    view.width > 0 && view.height > 0,
                )
                val location = IntArray(2).also(view::getLocationOnScreen)
                val coordinates =
                    floatArrayOf(
                        location[0] + view.width / 2f,
                        location[1] + view.height / 2f,
                    )
                val downAtMs = SystemClock.uptimeMillis()
                previousDownAtMs?.let { previous ->
                    val downGapMs = downAtMs - previous
                    observedDownGapCount += 1
                    assertTrue(
                        "raw tap ${index + 1} must start at least $minimumIntervalMs ms after its predecessor",
                        downGapMs >= minimumIntervalMs,
                    )
                    assertTrue(
                        "raw tap ${index + 1} must interrupt the $transitionDurationMs ms transition",
                        downGapMs < transitionDurationMs,
                    )
                }
                injectRawTapOrCancelOnFailure(
                    uiController = uiController,
                    downTime = downAtMs,
                    coordinates = coordinates,
                    tapNumber = index + 1,
                )
                previousDownAtMs = downAtMs
            }

            assertEquals(
                "every raw tap after the first must contribute one Android DOWN gap",
                tapCount - 1,
                observedDownGapCount,
            )
            uiController.loopMainThreadForAtLeast(RAW_TAP_DELIVERY_SETTLE_MS)
        }
    }

    private fun injectRawTapOrCancelOnFailure(
        uiController: UiController,
        downTime: Long,
        coordinates: FloatArray,
        tapNumber: Int,
    ) {
        var downAttempted = false
        var terminalDelivered = false
        try {
            val down =
                touchEvent(
                    downTime = downTime,
                    eventTime = downTime,
                    action = MotionEvent.ACTION_DOWN,
                    coordinates = coordinates,
                )
            val downInjected =
                try {
                    downAttempted = true
                    uiController.injectMotionEvent(down)
                } finally {
                    down.recycle()
                }
            if (!downInjected) {
                throw AssertionError("raw tap $tapNumber DOWN injection must succeed")
            }

            uiController.loopMainThreadForAtLeast(RAW_TAP_HOLD_MS)
            val upAtMs = SystemClock.uptimeMillis()
            val up =
                touchEvent(
                    downTime = downTime,
                    eventTime = upAtMs,
                    action = MotionEvent.ACTION_UP,
                    coordinates = coordinates,
                )
            val upInjected =
                try {
                    uiController.injectMotionEvent(up)
                } finally {
                    up.recycle()
                }
            if (!upInjected) {
                throw AssertionError("raw tap $tapNumber UP injection must succeed")
            }
            terminalDelivered = true
        } catch (failure: Throwable) {
            if (downAttempted && !terminalDelivered) {
                attemptRawCancel(
                    uiController = uiController,
                    downTime = downTime,
                    coordinates = coordinates,
                    originalFailure = failure,
                    tapNumber = tapNumber,
                )
            }
            throw failure
        }
    }

    private fun attemptRawCancel(
        uiController: UiController,
        downTime: Long,
        coordinates: FloatArray,
        originalFailure: Throwable,
        tapNumber: Int,
    ) {
        val cancelResult =
            runCatching {
                val cancelAtMs = SystemClock.uptimeMillis()
                val cancel =
                    touchEvent(
                        downTime = downTime,
                        eventTime = cancelAtMs,
                        action = MotionEvent.ACTION_CANCEL,
                        coordinates = coordinates,
                    )
                try {
                    if (!uiController.injectMotionEvent(cancel)) {
                        throw AssertionError(
                            "raw tap $tapNumber recovery CANCEL injection must succeed",
                        )
                    }
                } finally {
                    cancel.recycle()
                }
            }
        cancelResult.exceptionOrNull()?.let(originalFailure::addSuppressed)
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

    private fun assertInjectedGapTelemetry(expectedGapCount: Int) {
        onView(isRoot()).check { root, error ->
            if (error != null) {
                throw error
            }
            val telemetry =
                descendantViews(root)
                    .mapNotNull { view -> view.contentDescription?.toString() }
                    .singleOrNull { description ->
                        description.startsWith(INJECTED_GAP_TELEMETRY_PREFIX)
                    }
                    ?: throw AssertionError("Missing injected-gap telemetry")
            val match =
                INJECTED_GAP_TELEMETRY_PATTERN.matchEntire(telemetry)
                    ?: throw AssertionError("Malformed injected-gap telemetry: $telemetry")
            val gapCount = match.groupValues[1].toInt()
            val minimumGapMs = match.groupValues[2].toDouble()
            val maximumGapMs = match.groupValues[3].toDouble()
            val belowMinimumCount = match.groupValues[4].toInt()
            val atOrAboveTransitionCount = match.groupValues[5].toInt()
            val invalidCount = match.groupValues[6].toInt()

            assertEquals(
                "every successful injected onPress after the first must contribute one gap",
                expectedGapCount,
                gapCount,
            )
            assertTrue("every injected JS handler gap must be positive", minimumGapMs > 0)
            assertTrue(
                "injected JS handler gaps must preserve the robust minimum cadence",
                minimumGapMs >= MINIMUM_ASSERTED_HANDLER_GAP_MS,
            )
            assertTrue(
                "every injected JS handler gap must interrupt the configured transition",
                maximumGapMs < transitionDurationMs,
            )
            assertTrue(
                "injected JS handler telemetry must be internally ordered",
                maximumGapMs >= minimumGapMs,
            )
            assertEquals(
                "no injected JS handler gap may fall below the robust minimum",
                0,
                belowMinimumCount,
            )
            assertEquals(
                "no injected JS handler gap may reach the transition duration",
                0,
                atOrAboveTransitionCount,
            )
            assertEquals("all injected JS handler gaps must be finite", 0, invalidCount)
        }
    }

    private fun performDirectClick(): ViewAction = object : ViewAction {
        override fun getConstraints(): Matcher<View> = isDisplayed()

        override fun getDescription(): String =
            "invoke the plain FEN transition fixture trigger"

        override fun perform(uiController: UiController, view: View) {
            assertTrue("plain FEN transition trigger must accept a native click", view.performClick())
            uiController.loopMainThreadUntilIdle()
        }
    }

    private fun rapidTriggerMatcher(): Matcher<View> =
        contentDescriptionMatcher(RAPID_TRIGGER_LABEL)

    private fun reuseTriggerMatcher(): Matcher<View> =
        contentDescriptionMatcher(REUSE_TRIGGER_LABEL)

    private fun injectedTriggerMatcher(): Matcher<View> =
        contentDescriptionMatcher(INJECTED_TRIGGER_LABEL)

    private fun contentDescriptionMatcher(expected: String): Matcher<View> =
        object : TypeSafeMatcher<View>() {
            override fun describeTo(description: Description) {
                description.appendText("view with accessibility label $expected")
            }

            override fun matchesSafely(view: View): Boolean =
                view.contentDescription?.toString() == expected
        }

    private fun boardMatcher(): Matcher<View> = object : TypeSafeMatcher<View>() {
        override fun describeTo(description: Description) {
            description.appendText("native board with accessibility label $BOARD_LABEL")
        }

        override fun matchesSafely(view: View): Boolean =
            view.contentDescription?.toString()?.startsWith(BOARD_LABEL) == true
    }

    private fun boardViews(root: View): List<View> =
        descendantViews(root).filter { view ->
            view.contentDescription?.toString()?.startsWith(BOARD_LABEL) == true
        }

    private fun containsContentDescription(root: View, expected: String): Boolean =
        descendantViews(root).any { view ->
            view.contentDescription?.toString() == expected
        }

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

    private companion object {
        const val BOARD_LABEL = "Plain FEN transition interrupt test board, white orientation"
        const val E2_INDEX = 52
        const val E2_FEN = "8/8/8/8/8/8/4P3/8 w - - 0 1"
        const val E3_INDEX = 44
        const val E4_INDEX = 36
        const val E4_FEN = "8/8/8/8/4P3/8/8/8 w - - 0 1"
        const val INTERACTION_TIMEOUT_MS = 30_000L
        const val INJECTED_GAP_TELEMETRY_PREFIX = "Injected gap telemetry: "
        const val INJECTED_TRIGGER_LABEL = "Apply one injected plain FEN transition"
        val INJECTED_GAP_TELEMETRY_PATTERN =
            Regex(
                """^Injected gap telemetry: (\d+)\|(\d+\.\d{3})\|(\d+\.\d{3})\|(\d+)\|(\d+)\|(\d+)$""",
            )
        const val MINIMUM_ASSERTED_HANDLER_GAP_MS = 100.0
        const val POLL_INTERVAL_MS = 50L
        const val RAW_TAP_DELIVERY_SETTLE_MS = 25L
        const val RAW_TAP_HOLD_MS = 8L
        const val RAPID_TRIGGER_LABEL = "Start rapid plain FEN transition interruptions"
        const val REUSE_TRIGGER_LABEL = "Apply reusable plain FEN transition"
    }
}

@RunWith(AndroidJUnit4::class)
@LargeTest
class ChessboardPlainFenTransitionInterruptTest :
    PlainFenTransitionInterruptTestBase(
        fixtureName = "interaction-plain-fen-transition-interrupt",
        injectEachTransition = false,
        postSequenceSettleMs = 600,
        rapidCadenceMs = 190,
        rapidChangeCount = 18,
        transitionDurationMs = 300,
    )

@RunWith(AndroidJUnit4::class)
@LargeTest
class ChessboardPlainFenTransitionInterrupt200Test :
    PlainFenTransitionInterruptTestBase(
        fixtureName = "interaction-plain-fen-transition-interrupt-200ms",
        injectEachTransition = true,
        postSequenceSettleMs = 3_500,
        rapidCadenceMs = 125,
        rapidChangeCount = 72,
        transitionDurationMs = 200,
    )
