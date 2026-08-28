package com.vibechess.chessboardnativeharness

import android.content.Context
import android.content.Intent
import android.os.SystemClock
import android.view.InputDevice
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import androidx.test.core.app.ApplicationProvider
import androidx.test.espresso.Espresso.onView
import androidx.test.espresso.UiController
import androidx.test.espresso.ViewAction
import androidx.test.espresso.matcher.ViewMatchers.isDisplayed
import androidx.test.espresso.matcher.ViewMatchers.isRoot
import androidx.test.ext.junit.rules.ActivityScenarioRule
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.filters.LargeTest
import com.facebook.react.R
import org.hamcrest.Description
import org.hamcrest.Matcher
import org.hamcrest.TypeSafeMatcher
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
@LargeTest
class ChessboardTransitionProviderUnmountDragTest {
    private val launchIntent =
        Intent(
            ApplicationProvider.getApplicationContext<Context>(),
            MainActivity::class.java,
        ).putExtra(
            MainActivity.EXTRA_FIXTURE,
            "interaction-transition-provider-unmount",
        )

    @get:Rule
    val activityRule = ActivityScenarioRule<MainActivity>(launchIntent)

    @Test
    fun providerReplacementWhileTransitionAndDragOverlapLeavesStateReusable() {
        awaitState(
            expectedDescriptions(
                completedCycles = 0,
                pieceSquare = "d4",
                positionRevision = INITIAL_POSITION_REVISION,
                transitionWindow = "idle",
            ),
        )
        onView(isRoot()).perform(waitForAtLeast(DRAG_READY_SETTLE_MS))

        repeat(OVERLAP_REPETITIONS) { index ->
            val completedCycles = index + 1
            val pieceSquare = if (completedCycles % 2 == 1) "d5" else "d4"
            val sourceRank = if (pieceSquare == "d5") 5 else 4
            val targetRank = if (pieceSquare == "d5") 6 else 3
            val positionRevision = INITIAL_POSITION_REVISION + completedCycles

            onView(transitionTriggerMatcher()).perform(performDirectClick())
            awaitState(
                expectedDescriptions(
                    completedCycles = completedCycles,
                    dragStartCount = index,
                    pieceSquare = pieceSquare,
                    positionRevision = positionRevision,
                    providerGeneration = index,
                    transitionWindow = "active",
                ),
            )

            onView(boardMatcher()).perform(
                beginDragAndCancelAfterProviderReplacement(
                    file = 3,
                    fromRank = sourceRank,
                    toRank = targetRank,
                ),
            )

            awaitState(
                expectedDescriptions(
                    completedCycles = completedCycles,
                    pieceSquare = pieceSquare,
                    positionRevision = positionRevision,
                    transitionWindow = "cleared",
                ),
            )
        }

        onView(isRoot()).perform(waitForAtLeast(FINAL_SETTLE_INTERVAL_MS))
        val finalSquare = if (OVERLAP_REPETITIONS % 2 == 1) "d5" else "d4"
        assertStableState(
            expectedDescriptions(
                completedCycles = OVERLAP_REPETITIONS,
                pieceSquare = finalSquare,
                positionRevision = INITIAL_POSITION_REVISION + OVERLAP_REPETITIONS,
                transitionWindow = "cleared",
            ),
        )
    }

    private fun expectedDescriptions(
        completedCycles: Int,
        dragStartCount: Int = completedCycles,
        pieceSquare: String,
        positionRevision: Int,
        providerGeneration: Int = completedCycles,
        transitionWindow: String,
    ): Set<String> =
        setOf(
            "Abort count: 0",
            "Callback count: 0",
            "Commit count: 0",
            "Drag start count: $dragStartCount",
            "Piece square: $pieceSquare",
            "Position revision: $positionRevision",
            "Provider generation: $providerGeneration",
            "Transition count: $completedCycles",
            "Transition window: $transitionWindow",
        )

    private fun awaitState(expected: Set<String>) {
        onView(isRoot()).perform(waitForState(expected))
    }

    private fun waitForState(expected: Set<String>): ViewAction = object : ViewAction {
        override fun getConstraints(): Matcher<View> = isRoot()

        override fun getDescription(): String =
            "wait for transition/provider overlap state ${expected.sorted()}"

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
                "Timed out waiting for transition/provider overlap state; " +
                    "missing=$missing, activeOverlay=" +
                    containsReactTestId(root, ACTIVE_DRAG_OVERLAY_TEST_ID) +
                    ", retiringOverlay=" +
                    containsReactTestId(root, RETIRING_DRAG_OVERLAY_TEST_ID),
            )
        }
    }

    private fun assertStableState(expected: Set<String>) {
        onView(isRoot()).check { root, error ->
            if (error != null) {
                throw error
            }
            expected.forEach { description ->
                assertTrue(
                    "missing transition/provider overlap state: $description",
                    containsContentDescription(root, description),
                )
            }
            assertTrue(
                "the replacement provider must not retain an active drag overlay",
                !containsReactTestId(root, ACTIVE_DRAG_OVERLAY_TEST_ID),
            )
            assertTrue(
                "the replacement provider must not retain a retiring drag overlay",
                !containsReactTestId(root, RETIRING_DRAG_OVERLAY_TEST_ID),
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

    private fun performDirectClick(): ViewAction = object : ViewAction {
        override fun getConstraints(): Matcher<View> = isDisplayed()

        override fun getDescription(): String =
            "invoke the transition fixture trigger without injecting a second touch stream"

        override fun perform(uiController: UiController, view: View) {
            assertTrue("transition fixture trigger must accept a native click", view.performClick())
            uiController.loopMainThreadUntilIdle()
        }
    }

    private fun beginDragAndCancelAfterProviderReplacement(
        file: Int,
        fromRank: Int,
        toRank: Int,
    ): ViewAction = object : ViewAction {
        override fun getConstraints(): Matcher<View> = isDisplayed()

        override fun getDescription(): String =
            "hold a native drag from file $file rank $fromRank to rank $toRank " +
                "across keyed provider replacement"

        override fun perform(uiController: UiController, view: View) {
            val start = squareCenterOnView(view, file, fromRank)
            val end = squareCenterOnView(view, file, toRank)
            cancelLingeringInjectedTouchStream(uiController, start)
            val downTime = SystemClock.uptimeMillis()
            val down = touchEvent(downTime, downTime, MotionEvent.ACTION_DOWN, start)
            val move =
                touchEvent(
                    downTime,
                    downTime + TOUCH_STEP_MS,
                    MotionEvent.ACTION_MOVE,
                    end,
                )

            try {
                assertTrue(
                    "native touch down injection must succeed",
                    uiController.injectMotionEvent(down),
                )
                // The activating MOVE schedules provider deletion after two
                // RAFs. Android may report a false acknowledgement once that
                // original target disappears; the observable drag/remount
                // counters below prove whether the event was delivered.
                uiController.injectMotionEvent(move)
            } finally {
                down.recycle()
                move.recycle()
            }

            // The fixture waits two RAFs after onPieceDragStart. Keep the
            // pointer down long enough for the transition host and drag
            // overlay to be removed with their keyed provider.
            uiController.loopMainThreadForAtLeast(PROVIDER_REPLACEMENT_SETTLE_MS)
            val cancel =
                touchEvent(
                    downTime,
                    SystemClock.uptimeMillis(),
                    MotionEvent.ACTION_CANCEL,
                    end,
                )
            try {
                // Closing an input stream whose target provider no longer
                // exists may likewise return false; semantic state and logcat
                // are the authoritative teardown oracles.
                uiController.injectMotionEvent(cancel)
            } finally {
                cancel.recycle()
            }
            uiController.loopMainThreadForAtLeast(INPUT_CANCEL_SETTLE_MS)
        }
    }

    private fun cancelLingeringInjectedTouchStream(
        uiController: UiController,
        coordinates: FloatArray,
    ) {
        // A failed instrumentation attempt can leave InputDispatcher's
        // synthetic DeviceId(-1) pointer down across test-process restarts.
        // Close that harness-owned stream before asserting delivery of the
        // real DOWN. ACTION_CANCEL is intentionally allowed to return false
        // when no prior stream exists.
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

    private fun transitionTriggerMatcher(): Matcher<View> = object : TypeSafeMatcher<View>() {
        override fun describeTo(description: Description) {
            description.appendText(
                "transition trigger with accessibility label $TRANSITION_TRIGGER_LABEL",
            )
        }

        override fun matchesSafely(view: View): Boolean =
            view.contentDescription?.toString() == TRANSITION_TRIGGER_LABEL
    }

    private fun boardMatcher(): Matcher<View> = object : TypeSafeMatcher<View>() {
        override fun describeTo(description: Description) {
            description.appendText(
                "transition/provider board with accessibility label $BOARD_LABEL",
            )
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

    private fun containsReactTestId(root: View, expected: String): Boolean =
        descendantViews(root).any { view ->
            view.getTag(R.id.react_test_id) == expected
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
        const val ACTIVE_DRAG_OVERLAY_TEST_ID =
            "chessboard-native:native-interaction-transition-provider-unmount:provider-drag-overlay"
        const val BOARD_DIMENSION = 8
        const val BOARD_LABEL =
            "Transition provider unmount test board, white orientation"
        const val DRAG_READY_SETTLE_MS = 1_000L
        const val FINAL_SETTLE_INTERVAL_MS = 1_000L
        const val INITIAL_POSITION_REVISION = 31
        const val INPUT_CANCEL_SETTLE_MS = 100L
        const val INPUT_PRECONDITION_SETTLE_MS = 50L
        const val INTERACTION_TIMEOUT_MS = 30_000L
        const val OVERLAP_REPETITIONS = 4
        const val POLL_INTERVAL_MS = 50L
        const val PROVIDER_REPLACEMENT_SETTLE_MS = 750L
        const val RETIRING_DRAG_OVERLAY_TEST_ID =
            "chessboard-native:native-interaction-transition-provider-unmount:provider-drag-retiring-overlay"
        const val TOUCH_STEP_MS = 32L
        const val TRANSITION_TRIGGER_LABEL = "Start controlled position transition"
    }
}
