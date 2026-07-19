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
class ChessboardArrowAnnotationAccessibilityTest {
    @get:Rule
    val activityRule = ActivityScenarioRule<MainActivity>(fixtureIntent("annotation-arrow"))

    @Test
    fun createsAndCancelsAControlledArrowThroughNativeActions() {
        awaitAnnotationStatus("annotation:operation-count", "Operation count: 0")
        awaitSingleAnnotationBoard(setOf("Start arrow", "Move cursor right", "Move cursor down"))

        performAnnotationAction("Start arrow")
        awaitAnnotationActions(setOf("Cancel annotation"), absent = setOf("Finish arrow"))
        performAnnotationAction("Move cursor right")
        awaitAnnotationActions(setOf("Finish arrow", "Cancel annotation"))
        performAnnotationAction("Finish arrow")

        awaitAnnotationStatus("annotation:operation-count", "Operation count: 1")
        awaitAnnotationStatus("annotation:revision", "Annotation revision: 1")
        awaitAnnotationStatus("annotation:count", "Annotation count: 1")
        awaitAnnotationStatus("annotation:last-input", "Last input: accessibility")
        awaitAnnotationStatus("annotation:last-type", "Last type: toggle")
        awaitAnnotationStatus("annotation:last-from", "Last from: a2")
        awaitAnnotationStatus("annotation:last-to", "Last to: b2")

        performAnnotationAction("Start arrow")
        performAnnotationAction("Cancel annotation")
        onView(isRoot()).perform(waitForAtLeast(SETTLE_INTERVAL_MS))
        assertAnnotationStatus("annotation:operation-count", "Operation count: 1")
        assertAnnotationStatus("annotation:revision", "Annotation revision: 1")
        assertAnnotationStatus("annotation:count", "Annotation count: 1")
    }
}

@RunWith(AndroidJUnit4::class)
@LargeTest
class ChessboardSquareAnnotationAccessibilityTest {
    @get:Rule
    val activityRule = ActivityScenarioRule<MainActivity>(fixtureIntent("annotation-square"))

    @Test
    fun togglesAControlledSquareOnAndOffThroughOneNativeAction() {
        awaitAnnotationStatus("annotation:operation-count", "Operation count: 0")
        awaitSingleAnnotationBoard(
            setOf("Toggle square annotation", "Move cursor right", "Move cursor down"),
        )

        performAnnotationAction("Toggle square annotation")
        awaitAnnotationStatus("annotation:operation-count", "Operation count: 1")
        awaitAnnotationStatus("annotation:revision", "Annotation revision: 1")
        awaitAnnotationStatus("annotation:count", "Annotation count: 1")
        awaitAnnotationStatus("annotation:last-square", "Last square: a2")

        performAnnotationAction("Toggle square annotation")
        awaitAnnotationStatus("annotation:operation-count", "Operation count: 2")
        awaitAnnotationStatus("annotation:revision", "Annotation revision: 2")
        awaitAnnotationStatus("annotation:count", "Annotation count: 0")
        assertAnnotationStatus("annotation:last-input", "Last input: accessibility")
        assertAnnotationStatus("annotation:last-type", "Last type: toggle")
    }
}

private fun fixtureIntent(fixture: String): Intent =
    Intent(
        ApplicationProvider.getApplicationContext<Context>(),
        MainActivity::class.java,
    ).putExtra(MainActivity.EXTRA_FIXTURE, fixture)

private fun awaitSingleAnnotationBoard(required: Set<String>) {
    awaitAnnotationActions(required)
}

private fun awaitAnnotationActions(
    required: Set<String>,
    absent: Set<String> = emptySet(),
) {
    onView(isRoot()).perform(
        waitForAnnotationActions(
            absent = absent + ORDINARY_ACTION_LABELS,
            required = required,
        ),
    )
}

private fun performAnnotationAction(actionLabel: String) {
    awaitAnnotationActions(setOf(actionLabel))
    onView(annotationBoardMatcher()).perform(nativeAccessibilityAction(actionLabel))
}

private fun nativeAccessibilityAction(actionLabel: String): ViewAction = object : ViewAction {
    override fun getConstraints(): Matcher<View> = isDisplayed()

    override fun getDescription(): String = "perform native accessibility action $actionLabel"

    override fun perform(uiController: UiController, view: View) {
        val actionId =
            view
                .createAccessibilityNodeInfo()
                .actionList
                .singleOrNull { it.label?.toString() == actionLabel }
                ?.id
                ?: throw AssertionError("Missing native accessibility action: $actionLabel")
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

private fun awaitAnnotationStatus(testId: String, expected: String) {
    onView(isRoot()).perform(waitForAnnotationStatus(testId, expected))
}

private fun assertAnnotationStatus(testId: String, expected: String) {
    onView(reactTestIdMatcher(testId)).check { view, error ->
        if (error != null) throw error
        assertEquals(expected, view.contentDescription?.toString())
    }
}

private fun waitForAnnotationStatus(testId: String, expected: String): ViewAction =
    object : ViewAction {
        override fun getConstraints(): Matcher<View> = isRoot()

        override fun getDescription(): String = "wait for $testId to expose $expected"

        override fun perform(uiController: UiController, root: View) {
            val deadline = SystemClock.uptimeMillis() + BOARD_TIMEOUT_MS
            do {
                val status =
                    descendantViews(root).singleOrNull { view ->
                        view.getTag(R.id.react_test_id) == testId
                    }
                if (status?.contentDescription?.toString() == expected) {
                    return
                }
                uiController.loopMainThreadForAtLeast(POLL_INTERVAL_MS)
            } while (SystemClock.uptimeMillis() < deadline)
            throw AssertionError("Timed out waiting for $testId to expose $expected")
        }
    }

private fun waitForAnnotationActions(
    required: Set<String>,
    absent: Set<String>,
): ViewAction =
    object : ViewAction {
        override fun getConstraints(): Matcher<View> = isRoot()

        override fun getDescription(): String =
            "wait for annotation board actions required=$required absent=$absent"

        override fun perform(uiController: UiController, root: View) {
            val deadline = SystemClock.uptimeMillis() + BOARD_TIMEOUT_MS
            var lastLabels = emptySet<String>()
            var lastBoardCount = 0
            do {
                val boards = annotationBoards(root)
                lastBoardCount = boards.size
                val board = boards.singleOrNull()
                if (board != null) {
                    lastLabels =
                        board
                            .createAccessibilityNodeInfo()
                            .actionList
                            .mapNotNullTo(mutableSetOf()) { action -> action.label?.toString() }
                    val hasRequired = required.all(lastLabels::contains)
                    val omitsAbsent = absent.none(lastLabels::contains)
                    if (hasRequired && omitsAbsent) {
                        return
                    }
                }
                uiController.loopMainThreadForAtLeast(POLL_INTERVAL_MS)
            } while (SystemClock.uptimeMillis() < deadline)
            throw AssertionError(
                "Timed out waiting for annotation actions; " +
                    "boards=$lastBoardCount required=$required absent=$absent actual=$lastLabels",
            )
        }
    }

private fun waitForAtLeast(durationMs: Long): ViewAction = object : ViewAction {
    override fun getConstraints(): Matcher<View> = isRoot()

    override fun getDescription(): String = "wait for at least $durationMs ms"

    override fun perform(uiController: UiController, view: View) {
        uiController.loopMainThreadForAtLeast(durationMs)
    }
}

private fun annotationBoardMatcher(): Matcher<View> = object : TypeSafeMatcher<View>() {
    override fun describeTo(description: Description) {
        description.appendText("annotation board with accessibility label $ANNOTATION_BOARD_LABEL")
    }

    override fun matchesSafely(view: View): Boolean =
        view.contentDescription?.toString()?.startsWith(ANNOTATION_BOARD_LABEL) == true
}

private fun reactTestIdMatcher(testId: String): Matcher<View> =
    androidx.test.espresso.matcher.ViewMatchers.withTagKey(
        R.id.react_test_id,
        equalTo(testId),
    )

private fun annotationBoards(root: View): List<View> =
    descendantViews(root).filter { view ->
        view.contentDescription?.toString()?.startsWith(ANNOTATION_BOARD_LABEL) == true
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

private const val ANNOTATION_BOARD_LABEL = "Annotation test board, white orientation"
private const val BOARD_TIMEOUT_MS = 30_000L
private const val POLL_INTERVAL_MS = 50L
private const val SETTLE_INTERVAL_MS = 500L
private val ORDINARY_ACTION_LABELS = setOf("Activate square", "Remove piece")
