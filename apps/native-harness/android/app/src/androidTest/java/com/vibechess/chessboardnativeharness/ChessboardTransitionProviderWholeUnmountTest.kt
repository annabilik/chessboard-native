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
import androidx.test.espresso.action.ViewActions.click
import androidx.test.espresso.matcher.ViewMatchers.isRoot
import androidx.test.espresso.matcher.ViewMatchers.withContentDescription
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

@RunWith(AndroidJUnit4::class)
@LargeTest
class ChessboardTransitionProviderWholeUnmountTest {
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
    fun wholeProviderUnmountDuringActiveTransitionSurvivesNativeTouchesAndRemainsReusable() {
        awaitState(
            transitionCount = 0,
            transitionWindow = "idle",
            lifecycleProbeCount = 0,
            pieceSquare = "d4",
            positionRevision = INITIAL_POSITION_REVISION,
            boardCount = 1,
        )

        // Cycle A probes the riskiest prompt-remount path. Every action uses
        // Espresso click(), which injects a fresh native DOWN/UP stream and
        // therefore exercises Reanimated's event-driven synchronous-props
        // replay rather than View.performClick().
        clickAction(PROMPT_START_LABEL)
        awaitState(
            transitionCount = 1,
            transitionWindow = "absent-prompt",
            lifecycleProbeCount = 0,
            pieceSquare = "d5",
            positionRevision = INITIAL_POSITION_REVISION + 1,
            boardCount = 0,
        )
        clickAction(PROMPT_ABSENT_PROBE_LABEL)
        awaitState(
            transitionCount = 1,
            transitionWindow = "absent-prompt-probed",
            lifecycleProbeCount = 1,
            pieceSquare = "d5",
            positionRevision = INITIAL_POSITION_REVISION + 1,
            boardCount = 0,
        )
        clickAction(PROMPT_REMOUNT_LABEL)
        awaitState(
            transitionCount = 1,
            transitionWindow = "remounted-prompt",
            lifecycleProbeCount = 1,
            pieceSquare = "d5",
            positionRevision = INITIAL_POSITION_REVISION + 1,
            boardCount = 1,
        )
        clickAction(PROMPT_POST_REMOUNT_LABEL)
        awaitState(
            transitionCount = 2,
            transitionWindow = "ready-long",
            lifecycleProbeCount = 1,
            pieceSquare = "d4",
            positionRevision = INITIAL_POSITION_REVISION + 2,
            boardCount = 1,
        )

        // Cycle B probes immediately after removal, then keeps the entire
        // provider/board subtree absent past the conservative native registry
        // window before a second real absent touch remounts it.
        clickAction(LONG_START_LABEL)
        awaitState(
            transitionCount = 3,
            transitionWindow = "absent-long",
            lifecycleProbeCount = 1,
            pieceSquare = "d5",
            positionRevision = INITIAL_POSITION_REVISION + 3,
            boardCount = 0,
        )
        clickAction(LONG_IMMEDIATE_PROBE_LABEL)
        awaitState(
            transitionCount = 3,
            transitionWindow = "absent-long-draining",
            lifecycleProbeCount = 2,
            pieceSquare = "d5",
            positionRevision = INITIAL_POSITION_REVISION + 3,
            boardCount = 0,
        )
        awaitState(
            transitionCount = 3,
            transitionWindow = "absent-long-drained",
            lifecycleProbeCount = 2,
            pieceSquare = "d5",
            positionRevision = INITIAL_POSITION_REVISION + 3,
            boardCount = 0,
        )
        clickAction(LONG_POST_DRAIN_REMOUNT_LABEL)
        awaitState(
            transitionCount = 3,
            transitionWindow = "remounted-long",
            lifecycleProbeCount = 3,
            pieceSquare = "d5",
            positionRevision = INITIAL_POSITION_REVISION + 3,
            boardCount = 1,
        )
        clickAction(LONG_POST_REMOUNT_LABEL)
        awaitState(
            transitionCount = 4,
            transitionWindow = "complete",
            lifecycleProbeCount = 3,
            pieceSquare = "d4",
            positionRevision = INITIAL_POSITION_REVISION + 4,
            boardCount = 1,
        )

        onView(isRoot()).perform(waitForAtLeast(FINAL_SETTLE_INTERVAL_MS))
        assertStableFinalState()
    }

    private fun clickAction(accessibilityLabel: String) {
        onView(withContentDescription(accessibilityLabel)).perform(click())
    }

    private fun awaitState(
        transitionCount: Int,
        transitionWindow: String,
        lifecycleProbeCount: Int,
        pieceSquare: String,
        positionRevision: Int,
        boardCount: Int,
    ) {
        onView(isRoot()).perform(
            waitForState(
                expectedDescriptions(
                    transitionCount = transitionCount,
                    transitionWindow = transitionWindow,
                    lifecycleProbeCount = lifecycleProbeCount,
                    pieceSquare = pieceSquare,
                    positionRevision = positionRevision,
                ),
                boardCount,
            ),
        )
    }

    private fun expectedDescriptions(
        transitionCount: Int,
        transitionWindow: String,
        lifecycleProbeCount: Int,
        pieceSquare: String,
        positionRevision: Int,
    ): Set<String> =
        setOf(
            "Abort count: 0",
            "Callback count: 0",
            "Commit count: 0",
            "Drag start count: 0",
            "Lifecycle probe count: $lifecycleProbeCount",
            "Piece square: $pieceSquare",
            "Position revision: $positionRevision",
            "Provider generation: 0",
            "Transition count: $transitionCount",
            "Transition window: $transitionWindow",
        )

    private fun waitForState(
        expected: Set<String>,
        expectedBoardCount: Int,
    ): ViewAction = object : ViewAction {
        override fun getConstraints(): Matcher<View> = isRoot()

        override fun getDescription(): String =
            "wait for whole-unmount transition state ${expected.sorted()} " +
                "with $expectedBoardCount board(s)"

        override fun perform(uiController: UiController, root: View) {
            val deadline = SystemClock.uptimeMillis() + INTERACTION_TIMEOUT_MS
            do {
                if (
                    boardViews(root).size == expectedBoardCount &&
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
                "Timed out waiting for whole-unmount transition state; " +
                    "missing=$missing, expectedBoardCount=$expectedBoardCount, " +
                    "actualBoardCount=${boardViews(root).size}",
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

    private fun assertStableFinalState() {
        val expected =
            expectedDescriptions(
                transitionCount = 4,
                transitionWindow = "complete",
                lifecycleProbeCount = 3,
                pieceSquare = "d4",
                positionRevision = INITIAL_POSITION_REVISION + 4,
            )
        onView(isRoot()).check { root, error ->
            if (error != null) {
                throw error
            }
            assertEquals("exactly one remounted board must remain", 1, boardViews(root).size)
            expected.forEach { description ->
                assertTrue(
                    "missing final whole-unmount transition state: $description",
                    containsContentDescription(root, description),
                )
            }
        }
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
        const val BOARD_LABEL = "Transition provider unmount test board, white orientation"
        const val FINAL_SETTLE_INTERVAL_MS = 500L
        const val INITIAL_POSITION_REVISION = 31
        const val INTERACTION_TIMEOUT_MS = 15_000L
        const val LONG_IMMEDIATE_PROBE_LABEL =
            "Record immediate long-cycle touch while board absent"
        const val LONG_POST_DRAIN_REMOUNT_LABEL =
            "Record post-drain touch and remount board"
        const val LONG_POST_REMOUNT_LABEL = "Apply long post-remount transition"
        const val LONG_START_LABEL = "Start long whole-unmount lifecycle"
        const val POLL_INTERVAL_MS = 25L
        const val PROMPT_ABSENT_PROBE_LABEL = "Record prompt touch while board absent"
        const val PROMPT_POST_REMOUNT_LABEL = "Apply prompt post-remount transition"
        const val PROMPT_REMOUNT_LABEL = "Remount board promptly"
        const val PROMPT_START_LABEL = "Start prompt whole-unmount lifecycle"
    }
}
