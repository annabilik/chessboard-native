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
class ChessboardProviderUnmountDragTest {
    private val launchIntent =
        Intent(
            ApplicationProvider.getApplicationContext<Context>(),
            MainActivity::class.java,
        ).putExtra(MainActivity.EXTRA_FIXTURE, "interaction-provider-unmount")

    @get:Rule
    val activityRule = ActivityScenarioRule<MainActivity>(launchIntent)

    @Test
    fun unmountingProviderDuringActiveDragDoesNotUpdateRemovedFabricHosts() {
        awaitStableState(completedDrags = 0)
        // The accessibility surface can precede Gesture Handler's native
        // detector in Release. Keep the first injected drag deterministic.
        onView(isRoot()).perform(waitForAtLeast(DRAG_READY_SETTLE_MS))

        repeat(PROVIDER_REMOUNT_REPETITIONS) { index ->
            onView(boardMatcher()).perform(
                beginDragAndCancelAfterProviderRemount(
                    file = 3,
                    fromRank = 4,
                    toRank = 5,
                ),
            )
            awaitStableState(completedDrags = index + 1)
        }

        onView(isRoot()).perform(waitForAtLeast(FINAL_SETTLE_INTERVAL_MS))
        assertStableState(completedDrags = PROVIDER_REMOUNT_REPETITIONS)
    }

    private fun awaitStableState(completedDrags: Int) {
        onView(isRoot()).perform(waitForStableState(expectedDescriptions(completedDrags)))
    }

    private fun assertStableState(completedDrags: Int) {
        val expected = expectedDescriptions(completedDrags)
        onView(isRoot()).check { root, error ->
            if (error != null) {
                throw error
            }
            expected.forEach { description ->
                assertTrue(
                    "missing provider-unmount state: $description",
                    containsContentDescription(root, description),
                )
            }
            assertTrue(
                "the remounted provider must not retain a drag overlay",
                !containsReactTestId(root, ACTIVE_DRAG_OVERLAY_TEST_ID),
            )
            assertTrue(
                "the remounted provider must not retain a retiring drag overlay",
                !containsReactTestId(root, RETIRING_DRAG_OVERLAY_TEST_ID),
            )
        }
    }

    private fun expectedDescriptions(completedDrags: Int): Set<String> =
        setOf(
            "Abort count: 0",
            "Callback count: 0",
            "Commit count: 0",
            "Drag start count: $completedDrags",
            "Piece square: d4",
            "Position revision: $INITIAL_POSITION_REVISION",
            "Provider generation: $completedDrags",
            "Remount count: $completedDrags",
        )

    private fun waitForStableState(expected: Set<String>): ViewAction = object : ViewAction {
        override fun getConstraints(): Matcher<View> = isRoot()

        override fun getDescription(): String =
            "wait for stable provider-unmount state ${expected.sorted()}"

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
                        } &&
                        !containsReactTestId(root, ACTIVE_DRAG_OVERLAY_TEST_ID) &&
                        !containsReactTestId(root, RETIRING_DRAG_OVERLAY_TEST_ID)
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
                "Timed out waiting for stable provider-unmount state; " +
                    "missing=$missing, activeOverlay=" +
                    containsReactTestId(root, ACTIVE_DRAG_OVERLAY_TEST_ID) +
                    ", retiringOverlay=" +
                    containsReactTestId(root, RETIRING_DRAG_OVERLAY_TEST_ID),
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

    private fun beginDragAndCancelAfterProviderRemount(
        file: Int,
        fromRank: Int,
        toRank: Int,
    ): ViewAction = object : ViewAction {
        override fun getConstraints(): Matcher<View> = isDisplayed()

        override fun getDescription(): String =
            "begin a native drag from file $file rank $fromRank to rank $toRank " +
                "while the provider remounts"

        override fun perform(uiController: UiController, view: View) {
            val start = squareCenterOnView(view, file, fromRank)
            val end = squareCenterOnView(view, file, toRank)
            val downTime = SystemClock.uptimeMillis()
            val startEvents =
                listOf(
                    touchEvent(downTime, downTime, MotionEvent.ACTION_DOWN, start),
                    touchEvent(
                        downTime,
                        downTime + TOUCH_STEP_MS,
                        MotionEvent.ACTION_MOVE,
                        floatArrayOf(
                            (start[0] + end[0]) / 2f,
                            (start[1] + end[1]) / 2f,
                        ),
                    ),
                    touchEvent(
                        downTime,
                        downTime + TOUCH_STEP_MS * 2,
                        MotionEvent.ACTION_MOVE,
                        end,
                    ),
                )

            try {
                startEvents.forEach { event ->
                    assertTrue(
                        "native touch injection must succeed",
                        uiController.injectMotionEvent(event),
                    )
                }
            } finally {
                startEvents.forEach(MotionEvent::recycle)
            }

            // onPieceDragStart schedules the keyed provider replacement for
            // the next animation frame. Keep the pointer down until that
            // replacement has had time to commit, then close the input stream.
            uiController.loopMainThreadForAtLeast(PROVIDER_REMOUNT_SETTLE_MS)
            val cancel =
                touchEvent(
                    downTime,
                    SystemClock.uptimeMillis(),
                    MotionEvent.ACTION_CANCEL,
                    end,
                )
            try {
                assertTrue(
                    "native touch cancellation must succeed",
                    uiController.injectMotionEvent(cancel),
                )
            } finally {
                cancel.recycle()
            }
            uiController.loopMainThreadForAtLeast(INPUT_CANCEL_SETTLE_MS)
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
            description.appendText(
                "provider-unmount interaction board with accessibility label $BOARD_LABEL",
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
            "chessboard-native:native-interaction-provider-unmount:provider-drag-overlay"
        const val BOARD_DIMENSION = 8
        const val BOARD_LABEL = "Provider unmount interaction test board, white orientation"
        const val FINAL_SETTLE_INTERVAL_MS = 1_000L
        const val INITIAL_POSITION_REVISION = 7
        const val INPUT_CANCEL_SETTLE_MS = 100L
        const val INTERACTION_TIMEOUT_MS = 30_000L
        const val POLL_INTERVAL_MS = 50L
        const val PROVIDER_REMOUNT_REPETITIONS = 8
        const val PROVIDER_REMOUNT_SETTLE_MS = 500L
        const val RETIRING_DRAG_OVERLAY_TEST_ID =
            "chessboard-native:native-interaction-provider-unmount:provider-drag-retiring-overlay"
        const val DRAG_READY_SETTLE_MS = 1_000L
        const val TOUCH_STEP_MS = 32L
    }
}
