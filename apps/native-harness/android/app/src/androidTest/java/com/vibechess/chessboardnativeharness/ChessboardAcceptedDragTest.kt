package com.vibechess.chessboardnativeharness

import android.content.Context
import android.content.Intent
import android.os.SystemClock
import android.view.View
import android.view.ViewGroup
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
import org.hamcrest.Description
import org.hamcrest.Matcher
import org.hamcrest.TypeSafeMatcher
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
@LargeTest
class ChessboardAcceptedDragTest {
    private val launchIntent =
        Intent(
            ApplicationProvider.getApplicationContext<Context>(),
            MainActivity::class.java,
        ).putExtra(MainActivity.EXTRA_FIXTURE, "interaction-accepted")

    @get:Rule
    val activityRule = ActivityScenarioRule<MainActivity>(launchIntent)

    @Test
    fun acceptedDragsPublishCorrelatedControlledCommitsExactlyOnce() {
        awaitAcceptedState(
            baseRevision = "none",
            callbackCount = 0,
            commitCorrelation = "none",
            decision = "none",
            lastSource = "none",
            lastTarget = "none",
            pieceSquare = "d4",
            positionRevision = INITIAL_POSITION_REVISION,
        )
        // React Native can publish the accessibility tree before Gesture Handler
        // finishes attaching its native detector. Give the Release surface one
        // bounded settling interval so the first injected swipe exercises drag,
        // rather than racing mount and degenerating into a no-op.
        onView(isRoot()).perform(waitForAtLeast(DRAG_READY_SETTLE_MS))

        repeat(ACCEPTED_DRAG_REPETITIONS) { index ->
            val sourceRank = if (index % 2 == 0) 4 else 5
            val targetRank = if (sourceRank == 4) 5 else 4
            val sourceSquare = "d$sourceRank"
            val targetSquare = "d$targetRank"

            onView(boardMatcher()).perform(
                swipeBetweenSquares(
                    file = 3,
                    fromRank = sourceRank,
                    toRank = targetRank,
                ),
            )

            awaitAcceptedState(
                baseRevision = (INITIAL_POSITION_REVISION + index).toString(),
                callbackCount = index + 1,
                commitCorrelation = "matched",
                decision = "accepted",
                lastSource = "board:$sourceSquare",
                lastTarget = targetSquare,
                pieceSquare = targetSquare,
                positionRevision = INITIAL_POSITION_REVISION + index + 1,
            )
        }

        onView(isRoot()).perform(waitForAtLeast(SETTLE_INTERVAL_MS))
        assertAcceptedState(
            baseRevision = (INITIAL_POSITION_REVISION + ACCEPTED_DRAG_REPETITIONS - 1).toString(),
            callbackCount = ACCEPTED_DRAG_REPETITIONS,
            commitCorrelation = "matched",
            decision = "accepted",
            lastSource = "board:d5",
            lastTarget = "d4",
            pieceSquare = "d4",
            positionRevision = INITIAL_POSITION_REVISION + ACCEPTED_DRAG_REPETITIONS,
        )
    }

    private fun awaitAcceptedState(
        baseRevision: String,
        callbackCount: Int,
        commitCorrelation: String,
        decision: String,
        lastSource: String,
        lastTarget: String,
        pieceSquare: String,
        positionRevision: Int,
    ) {
        onView(isRoot()).perform(
            waitForAcceptedState(
                expectedDescriptions(
                    baseRevision = baseRevision,
                    callbackCount = callbackCount,
                    commitCorrelation = commitCorrelation,
                    decision = decision,
                    lastSource = lastSource,
                    lastTarget = lastTarget,
                    pieceSquare = pieceSquare,
                    positionRevision = positionRevision,
                ),
            ),
        )
    }

    private fun assertAcceptedState(
        baseRevision: String,
        callbackCount: Int,
        commitCorrelation: String,
        decision: String,
        lastSource: String,
        lastTarget: String,
        pieceSquare: String,
        positionRevision: Int,
    ) {
        val expected =
            expectedDescriptions(
                baseRevision = baseRevision,
                callbackCount = callbackCount,
                commitCorrelation = commitCorrelation,
                decision = decision,
                lastSource = lastSource,
                lastTarget = lastTarget,
                pieceSquare = pieceSquare,
                positionRevision = positionRevision,
            )
        onView(isRoot()).check { root, error ->
            if (error != null) {
                throw error
            }
            expected.forEach { description ->
                assertTrue(
                    "missing accepted-drag state: $description",
                    containsContentDescription(root, description),
                )
            }
        }
    }

    private fun expectedDescriptions(
        baseRevision: String,
        callbackCount: Int,
        commitCorrelation: String,
        decision: String,
        lastSource: String,
        lastTarget: String,
        pieceSquare: String,
        positionRevision: Int,
    ): Set<String> =
        setOf(
            "Abort count: 0",
            "Callback count: $callbackCount",
            "Commit correlation: $commitCorrelation",
            "Commit count: $callbackCount",
            "Decision: $decision",
            "Last base revision: $baseRevision",
            "Last input: ${if (callbackCount == 0) "none" else "drag"}",
            "Last source: $lastSource",
            "Last target: $lastTarget",
            "Piece square: $pieceSquare",
            "Position revision: $positionRevision",
        )

    private fun waitForAcceptedState(expected: Set<String>): ViewAction = object : ViewAction {
        override fun getConstraints(): Matcher<View> = isRoot()

        override fun getDescription(): String =
            "wait for accepted-drag state ${expected.sorted()}"

        override fun perform(uiController: UiController, root: View) {
            val deadline = SystemClock.uptimeMillis() + INTERACTION_TIMEOUT_MS
            do {
                val board = acceptedBoardViews(root).singleOrNull()
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
            throw AssertionError("Timed out waiting for accepted-drag state; missing=$missing")
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

    private fun squareCenter(file: Int, rank: Int): CoordinatesProvider =
        CoordinatesProvider { view ->
            val location = IntArray(2).also(view::getLocationOnScreen)
            val squareWidth = view.width / BOARD_DIMENSION.toFloat()
            val squareHeight = view.height / BOARD_DIMENSION.toFloat()
            val visualRow = BOARD_DIMENSION - rank
            floatArrayOf(
                location[0] + (file + 0.5f) * squareWidth,
                location[1] + (visualRow + 0.5f) * squareHeight,
            )
        }

    private fun boardMatcher(): Matcher<View> = object : TypeSafeMatcher<View>() {
        override fun describeTo(description: Description) {
            description.appendText(
                "accepted interaction board with accessibility label $BOARD_LABEL",
            )
        }

        override fun matchesSafely(view: View): Boolean =
            view.contentDescription?.toString()?.startsWith(BOARD_LABEL) == true
    }

    private fun acceptedBoardViews(root: View): List<View> =
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
        const val ACCEPTED_DRAG_REPETITIONS = 8
        const val BOARD_DIMENSION = 8
        const val BOARD_LABEL = "Accepted interaction test board, white orientation"
        const val INITIAL_POSITION_REVISION = 7
        const val INTERACTION_TIMEOUT_MS = 30_000L
        const val POLL_INTERVAL_MS = 50L
        const val DRAG_READY_SETTLE_MS = 1_000L
        const val SETTLE_INTERVAL_MS = 500L
    }
}
