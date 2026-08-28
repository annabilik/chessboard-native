package com.vibechess.chessboardnativeharness

import android.content.Context
import android.content.Intent
import android.os.SystemClock
import android.view.View
import android.view.ViewGroup
import androidx.core.view.ViewCompat
import androidx.test.core.app.ApplicationProvider
import androidx.test.espresso.Espresso.onView
import androidx.test.espresso.UiController
import androidx.test.espresso.ViewAction
import androidx.test.espresso.action.ViewActions.click
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
            repeat(rapidChangeCount) {
                onView(injectedTriggerMatcher()).perform(click())
                onView(isRoot()).perform(waitForAtLeast(rapidCadenceMs.toLong()))
            }
        } else {
            onView(rapidTriggerMatcher()).perform(performDirectClick())
        }
        awaitState(
            changeCount = rapidChangeCount,
            currentFen = E2_FEN,
            pieceSquare = "e2",
            sequencePhase = "rapid-complete",
        )
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

        // This must remain a real Espresso input after the retirement window.
        // Its DOWN/UP pair makes Reanimated replay pending synchronous props, so
        // the log scanner proves removed tags are absent from the native registry.
        onView(reuseTriggerMatcher()).perform(click())
        awaitState(
            changeCount = rapidChangeCount + 1,
            currentFen = E4_FEN,
            pieceSquare = "e4",
            sequencePhase = "reused",
        )
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
        const val INJECTED_TRIGGER_LABEL = "Apply one injected plain FEN transition"
        const val POLL_INTERVAL_MS = 50L
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
