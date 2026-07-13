package com.vibechess.chessboardnativeharness

import android.os.SystemClock
import android.view.View
import android.view.ViewGroup
import android.view.accessibility.AccessibilityNodeInfo
import androidx.core.view.ViewCompat
import androidx.test.espresso.Espresso.onView
import androidx.test.espresso.UiController
import androidx.test.espresso.ViewAction
import androidx.test.espresso.accessibility.AccessibilityChecks
import androidx.test.espresso.matcher.ViewMatchers.isDisplayed
import androidx.test.espresso.matcher.ViewMatchers.isRoot
import androidx.test.ext.junit.rules.ActivityScenarioRule
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.filters.LargeTest
import org.hamcrest.Description
import org.hamcrest.Matcher
import org.hamcrest.TypeSafeMatcher
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
@LargeTest
class ChessboardAccessibilityAuditTest {
    @get:Rule
    val activityRule = ActivityScenarioRule(MainActivity::class.java)

    @Test
    fun auditsThePackedBoardAccessibilitySurface() {
        onView(isRoot()).perform(
            waitForBoardState(INITIAL_DESCRIPTION, INITIAL_INDEX, requireVisualLayers = true),
        )

        onView(isRoot()).check { root, error ->
            if (error != null) {
                throw error
            }
            val boards = boardViews(root)
            assertEquals("exactly one native board accessibility host", 1, boards.size)
        }

        onView(boardMatcher()).check { board, error ->
            if (error != null) {
                throw error
            }
            assertInitialNodeContract(board)
        }

        AccessibilityChecks.enable().setRunChecksFromRootView(true)
        try {
            onView(boardMatcher()).perform(triggerAccessibilityAudit())
        } finally {
            AccessibilityChecks.disable()
        }

        performActionAndAwait(
            actionLabel = "Activate square",
            description = "$INITIAL_DESCRIPTION; pending move source",
            index = INITIAL_INDEX,
        )
        performActionAndAwait(
            actionLabel = "Move cursor right",
            description = "e4, empty; pending move target",
            index = 36,
        )
        performActionAndAwait(
            actionLabel = "Activate square",
            description = "e4, empty",
            index = 36,
        )
        performActionAndAwait(
            actionLabel = "Move cursor left",
            description = INITIAL_DESCRIPTION,
            index = INITIAL_INDEX,
        )
        performActionAndAwait(
            actionLabel = "Activate square",
            description = "$INITIAL_DESCRIPTION; pending move source",
            index = INITIAL_INDEX,
        )
        performActionAndAwait(
            actionLabel = "Cancel move",
            description = INITIAL_DESCRIPTION,
            index = INITIAL_INDEX,
        )
        performActionAndAwait(
            actionLabel = "Remove piece",
            description = INITIAL_DESCRIPTION,
            index = INITIAL_INDEX,
        )

        performActionAndAwait(
            actionId = AccessibilityNodeInfo.ACTION_SCROLL_FORWARD,
            description = "e4, empty",
            index = 36,
        )
        performActionAndAwait(
            actionId = AccessibilityNodeInfo.ACTION_SCROLL_BACKWARD,
            description = INITIAL_DESCRIPTION,
            index = INITIAL_INDEX,
        )
        performActionAndAwait(
            actionLabel = "Move cursor left",
            description = "c4, empty",
            index = 34,
        )
        performActionAndAwait(
            actionLabel = "Move cursor right",
            description = INITIAL_DESCRIPTION,
            index = INITIAL_INDEX,
        )
        performActionAndAwait(
            actionLabel = "Move cursor up",
            description = "d5, empty",
            index = 27,
        )
        performActionAndAwait(
            actionLabel = "Move cursor down",
            description = INITIAL_DESCRIPTION,
            index = INITIAL_INDEX,
        )
    }

    private fun assertInitialNodeContract(board: View) {
        val node = board.createAccessibilityNodeInfo()
        assertEquals("android.widget.SeekBar", node.className?.toString())
        assertEquals(fullDescription(INITIAL_DESCRIPTION), node.contentDescription?.toString())
        assertTrue(node.isEnabled)
        assertFalse(node.isClickable)
        assertFalse(node.isLongClickable)

        val range = node.rangeInfo
        assertNotNull("adjustable node must expose a native range", range)
        assertEquals(AccessibilityNodeInfo.RangeInfo.RANGE_TYPE_INT, range?.type)
        assertEquals(0f, range?.min)
        assertEquals(63f, range?.max)
        assertEquals(INITIAL_INDEX.toFloat(), range?.current)

        val actions = node.actionList
        assertTrue(actions.any { it.id == AccessibilityNodeInfo.ACTION_SCROLL_FORWARD })
        assertTrue(actions.any { it.id == AccessibilityNodeInfo.ACTION_SCROLL_BACKWARD })
        val labels =
            actions.mapNotNull { action ->
                action.label?.toString()?.takeIf(String::isNotEmpty)
            }.toSet()
        assertEquals(INITIAL_ACTION_LABELS, labels)

        assertTrue("board host must contain rendered visual layers", board is ViewGroup)
        val boardGroup = board as ViewGroup
        assertTrue("board host must contain rendered visual layers", boardGroup.childCount > 0)
        for (index in 0 until boardGroup.childCount) {
            assertEquals(
                "every direct visual layer must hide its descendants",
                View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS,
                boardGroup.getChildAt(index).importantForAccessibility,
            )
        }
        val gesturePlanes =
            (0 until boardGroup.childCount)
                .map(boardGroup::getChildAt)
                .filterIsInstance<ViewGroup>()
                .filter { child ->
                    child.childCount == 0 &&
                        child.importantForAccessibility ==
                            View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS &&
                        child.width == boardGroup.width &&
                        child.height == boardGroup.height
                }
        assertEquals(
            "exactly one identifier-free full-board gesture plane",
            1,
            gesturePlanes.size,
        )
    }

    private fun performActionAndAwait(
        description: String,
        index: Int,
        actionId: Int? = null,
        actionLabel: String? = null,
    ) {
        onView(boardMatcher()).perform(performNativeAccessibilityAction(actionId, actionLabel))
        onView(isRoot()).perform(waitForBoardState(description, index))
    }

    private fun triggerAccessibilityAudit(): ViewAction = object : ViewAction {
        override fun getConstraints(): Matcher<View> = isDisplayed()

        override fun getDescription(): String = "run the full-root Espresso accessibility audit"

        override fun perform(uiController: UiController, view: View) {
            uiController.loopMainThreadUntilIdle()
        }
    }

    private fun performNativeAccessibilityAction(
        actionId: Int?,
        actionLabel: String?,
    ): ViewAction = object : ViewAction {
        override fun getConstraints(): Matcher<View> = isDisplayed()

        override fun getDescription(): String =
            actionLabel?.let { "perform native accessibility action $it" }
                ?: "perform native accessibility action ${actionId.toString()}"

        override fun perform(uiController: UiController, view: View) {
            val resolvedActionId =
                actionId
                    ?: view
                        .createAccessibilityNodeInfo()
                        .actionList
                        .singleOrNull { it.label?.toString() == actionLabel }
                        ?.id
                    ?: throw AssertionError("Missing native accessibility action: $actionLabel")
            val delegate =
                ViewCompat.getAccessibilityDelegate(view)
                    ?: throw AssertionError("Missing native accessibility delegate")
            val handled = delegate.performAccessibilityAction(view, resolvedActionId, null)
            if (actionLabel != null) {
                assertTrue("custom accessibility action must be handled", handled)
            }
            uiController.loopMainThreadForAtLeast(POLL_INTERVAL_MS)
        }
    }

    private fun waitForBoardState(
        description: String,
        index: Int,
        requireVisualLayers: Boolean = false,
    ): ViewAction = object : ViewAction {
        override fun getConstraints(): Matcher<View> = isRoot()

        override fun getDescription(): String =
            "wait for board accessibility value $description at index $index"

        override fun perform(uiController: UiController, root: View) {
            val deadline = SystemClock.uptimeMillis() + BOARD_TIMEOUT_MS
            do {
                val board = boardViews(root).singleOrNull()
                if (board != null) {
                    val node = board.createAccessibilityNodeInfo()
                    val hasLayers =
                        !requireVisualLayers || (board is ViewGroup && board.childCount > 0)
                    if (
                        node.contentDescription?.toString() == fullDescription(description) &&
                            node.rangeInfo?.current == index.toFloat() &&
                            hasLayers
                    ) {
                        return
                    }
                }
                uiController.loopMainThreadForAtLeast(POLL_INTERVAL_MS)
            } while (SystemClock.uptimeMillis() < deadline)

            throw AssertionError(
                "Timed out waiting for ${fullDescription(description)} at index $index",
            )
        }
    }

    private fun boardMatcher(): Matcher<View> = object : TypeSafeMatcher<View>() {
        override fun describeTo(description: Description) {
            description.appendText("native board with accessibility label $BOARD_LABEL")
        }

        override fun matchesSafely(view: View): Boolean = isBoardView(view)
    }

    private fun boardViews(root: View): List<View> {
        val matches = mutableListOf<View>()

        fun visit(view: View) {
            if (isBoardView(view)) {
                matches.add(view)
            }
            if (view is ViewGroup) {
                for (index in 0 until view.childCount) {
                    visit(view.getChildAt(index))
                }
            }
        }

        visit(root)
        return matches
    }

    private fun isBoardView(view: View): Boolean =
        view.contentDescription?.toString()?.startsWith(BOARD_LABEL) == true

    private fun fullDescription(squareValue: String): String = "$BOARD_LABEL, $squareValue"

    private companion object {
        const val BOARD_LABEL = "Accessibility audit board, white orientation"
        const val INITIAL_DESCRIPTION = "d4, white knight; selected"
        const val INITIAL_INDEX = 35
        const val BOARD_TIMEOUT_MS = 30_000L
        const val POLL_INTERVAL_MS = 50L

        val INITIAL_ACTION_LABELS =
            setOf(
                "Activate square",
                "Remove piece",
                "Move cursor left",
                "Move cursor right",
                "Move cursor up",
                "Move cursor down",
            )
    }
}
