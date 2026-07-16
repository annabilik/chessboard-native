package com.vibechess.chessboardnativeharness

import android.content.Context
import android.content.Intent
import android.os.SystemClock
import android.view.InputDevice
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import androidx.lifecycle.Lifecycle
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
import org.hamcrest.Matchers.equalTo
import org.hamcrest.TypeSafeMatcher
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
@LargeTest
class ChessboardInteractionTest {
    private val launchIntent =
        Intent(
            ApplicationProvider.getApplicationContext<Context>(),
            MainActivity::class.java,
        ).putExtra(MainActivity.EXTRA_FIXTURE, "interaction")

    @get:Rule
    val activityRule = ActivityScenarioRule<MainActivity>(launchIntent)

    @Test
    fun draggablePieceCapturesTheScrollGestureAndRejectsExactlyOnce() {
        awaitInteractionState(
            callbackCount = 0,
            decision = "none",
            lastSource = "none",
            lastTarget = "none",
        )
        val initialTop = boardTop()

        onView(boardMatcher()).perform(swipeBetweenSquares(file = 3, fromRank = 4, toRank = 5))

        awaitInteractionState(
            callbackCount = 1,
            decision = "rejected",
            lastSource = "board:d4",
            lastTarget = "d5",
        )
        onView(isRoot()).perform(waitForAtLeast(SETTLE_INTERVAL_MS))
        assertInteractionState(
            callbackCount = 1,
            decision = "rejected",
            lastSource = "board:d4",
            lastTarget = "d5",
        )
        assertEquals(
            "a draggable-piece gesture must remain captured by the board",
            initialTop,
            boardTop(),
        )
    }

    @Test
    fun emptySquareDefersToTheParentScrollView() {
        awaitInteractionState(
            callbackCount = 0,
            decision = "none",
            lastSource = "none",
            lastTarget = "none",
        )
        val initialTop = boardTop()

        onView(boardMatcher()).perform(swipeBetweenSquares(file = 0, fromRank = 4, toRank = 6))
        onView(isRoot()).perform(waitForBoardTopAtMost(initialTop - MINIMUM_SCROLL_DISTANCE_PX))

        assertInteractionState(
            callbackCount = 0,
            decision = "none",
            lastSource = "none",
            lastTarget = "none",
        )
    }

    @Test
    fun clippedSparePieceReachesTheBoardExactlyOnceWithoutScrolling() {
        awaitInteractionState(
            callbackCount = 0,
            decision = "none",
            lastSource = "none",
            lastTarget = "none",
        )
        val initialTop = boardTop()

        onView(spareMatcher()).perform(dragSpareToSquare(file = 4, rank = 2))

        awaitInteractionState(
            callbackCount = 1,
            decision = "rejected",
            lastSource = "spare:clipped-white-queen",
            lastTarget = "e2",
        )
        onView(isRoot()).perform(waitForAtLeast(SETTLE_INTERVAL_MS))
        assertInteractionState(
            callbackCount = 1,
            decision = "rejected",
            lastSource = "spare:clipped-white-queen",
            lastTarget = "e2",
        )
        assertEquals(
            "a spare-piece drag must remain captured while crossing the clipped palette",
            initialTop,
            boardTop(),
        )
    }

    @Test
    fun backgroundResumeCancelsAnActiveDragAndAllowsTheNextGesture() {
        awaitInteractionState(
            callbackCount = 0,
            decision = "none",
            lastSource = "none",
            lastTarget = "none",
        )
        onView(boardMatcher()).perform(beginDragBetweenSquares(file = 3, fromRank = 4, toRank = 5))
        onView(reactTestIdMatcher(DRAG_OVERLAY_TEST_ID)).check { view, error ->
            if (error != null) {
                throw error
            }
            assertTrue("the fixture must enter an active native drag before backgrounding", view.isShown)
        }

        activityRule.scenario.moveToState(Lifecycle.State.CREATED)
        activityRule.scenario.moveToState(Lifecycle.State.RESUMED)

        awaitInteractionState(
            callbackCount = 0,
            decision = "none",
            lastSource = "none",
            lastTarget = "none",
        )
        onView(boardMatcher()).perform(swipeBetweenSquares(file = 3, fromRank = 4, toRank = 5))
        awaitInteractionState(
            callbackCount = 1,
            decision = "rejected",
            lastSource = "board:d4",
            lastTarget = "d5",
        )
        onView(isRoot()).perform(waitForAtLeast(SETTLE_INTERVAL_MS))
        assertInteractionState(
            callbackCount = 1,
            decision = "rejected",
            lastSource = "board:d4",
            lastTarget = "d5",
        )
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

    private fun assertInteractionState(
        callbackCount: Int,
        decision: String,
        lastSource: String,
        lastTarget: String,
    ) {
        onView(isRoot()).check { root, error ->
            if (error != null) {
                throw error
            }
            assertTrue(
                "missing callback count $callbackCount",
                containsContentDescription(root, "Callback count: $callbackCount"),
            )
            assertTrue(
                "missing last target $lastTarget",
                containsContentDescription(root, "Last target: $lastTarget"),
            )
            assertTrue(
                "missing last source $lastSource",
                containsContentDescription(root, "Last source: $lastSource"),
            )
            assertTrue(
                "missing decision $decision",
                containsContentDescription(root, "Decision: $decision"),
            )
            assertTrue(
                "unexpected lifecycle abort",
                containsContentDescription(root, "Abort count: 0"),
            )
            assertTrue(
                "the controlled position revision must remain unchanged",
                containsContentDescription(root, POSITION_REVISION_DESCRIPTION),
            )
        }
    }

    private fun boardTop(): Int {
        var top: Int? = null
        onView(boardMatcher()).check { board, error ->
            if (error != null) {
                throw error
            }
            top = boardLocation(board)[1]
        }
        return top ?: throw AssertionError("Interaction board did not publish a screen location")
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
                val board = boardViews(root).singleOrNull()
                if (
                    board != null &&
                        board.width > 0 &&
                        board.height > 0 &&
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

            throw AssertionError(
                "Timed out waiting for callback $callbackCount, decision $decision, source $lastSource, and target $lastTarget",
            )
        }
    }

    private fun waitForBoardTopAtMost(maximumTop: Int): ViewAction = object : ViewAction {
        override fun getConstraints(): Matcher<View> = isRoot()

        override fun getDescription(): String =
            "wait for the interaction board to scroll above $maximumTop px"

        override fun perform(uiController: UiController, root: View) {
            val deadline = SystemClock.uptimeMillis() + INTERACTION_TIMEOUT_MS
            do {
                val board = boardViews(root).singleOrNull()
                if (board != null && boardLocation(board)[1] <= maximumTop) {
                    return
                }
                uiController.loopMainThreadForAtLeast(POLL_INTERVAL_MS)
            } while (SystemClock.uptimeMillis() < deadline)

            val currentTop = boardViews(root).singleOrNull()?.let(::boardLocation)?.get(1)
            throw AssertionError(
                "Timed out waiting for parent ScrollView movement; board top was $currentTop",
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

    private fun swipeBetweenSquares(
        file: Int,
        fromRank: Int,
        toRank: Int,
    ): ViewAction =
        GeneralSwipeAction(
            Swipe.FAST,
            squareCenter(file, fromRank),
            squareCenter(file, toRank),
            Press.FINGER,
        )

    private fun dragSpareToSquare(file: Int, rank: Int): ViewAction =
        GeneralSwipeAction(
            Swipe.SLOW,
            CoordinatesProvider { view ->
                val location = boardLocation(view)
                floatArrayOf(
                    location[0] + view.width / 2f,
                    location[1] + view.height / 2f,
                )
            },
            CoordinatesProvider { view ->
                val board =
                    boardViews(view.rootView).singleOrNull()
                        ?: throw AssertionError("Missing interaction board for spare release")
                squareCenterOnView(board, file, rank)
            },
            Press.FINGER,
        )

    private fun beginDragBetweenSquares(
        file: Int,
        fromRank: Int,
        toRank: Int,
    ): ViewAction = object : ViewAction {
        override fun getConstraints(): Matcher<View> = isDisplayed()

        override fun getDescription(): String =
            "begin a native drag from file $file rank $fromRank to rank $toRank without releasing"

        override fun perform(uiController: UiController, view: View) {
            val start = squareCenter(file, fromRank).calculateCoordinates(view)
            val end = squareCenter(file, toRank).calculateCoordinates(view)
            val downTime = SystemClock.uptimeMillis()
            val events =
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
                events.forEach { event ->
                    assertTrue("native touch injection must succeed", uiController.injectMotionEvent(event))
                }
            } finally {
                events.forEach(MotionEvent::recycle)
            }
            uiController.loopMainThreadForAtLeast(DRAG_START_SETTLE_MS)
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
        val location = boardLocation(view)
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

    private fun reactTestIdMatcher(testId: String): Matcher<View> =
        androidx.test.espresso.matcher.ViewMatchers.withTagKey(
            R.id.react_test_id,
            equalTo(testId),
        )

    private fun spareMatcher(): Matcher<View> = object : TypeSafeMatcher<View>() {
        override fun describeTo(description: Description) {
            description.appendText("clipped white queen spare button")
        }

        override fun matchesSafely(view: View): Boolean =
            view.contentDescription?.toString() == SPARE_LABEL
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

    private fun boardLocation(view: View): IntArray =
        IntArray(2).also(view::getLocationOnScreen)

    private companion object {
        const val BOARD_DIMENSION = 8
        const val BOARD_LABEL = "Interaction test board, white orientation"
        const val DRAG_OVERLAY_TEST_ID =
            "chessboard-native:native-interaction:provider-drag-overlay"
        const val POSITION_REVISION_DESCRIPTION = "Position revision: 7"
        const val SPARE_LABEL = "Clipped white queen spare"
        const val INTERACTION_TIMEOUT_MS = 30_000L
        const val POLL_INTERVAL_MS = 50L
        const val SETTLE_INTERVAL_MS = 500L
        const val DRAG_START_SETTLE_MS = 500L
        const val TOUCH_STEP_MS = 32L
        const val MINIMUM_SCROLL_DISTANCE_PX = 24
    }
}
