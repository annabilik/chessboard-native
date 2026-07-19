import XCTest

final class ChessboardNativeHarnessAccessibilityUITests: XCTestCase {
  override func setUpWithError() throws {
    continueAfterFailure = false
  }

  func testPackedBoardAccessibilitySurface() throws {
    let app = XCUIApplication()
    app.launchArguments += ["-AppleLanguages", "(en)", "-AppleLocale", "en_US"]
    app.launch()

    let boards = app.descendants(matching: .any).matching(
      NSPredicate(format: "label == %@", "Accessibility audit board, white orientation")
    )
    let board = boards.firstMatch

    XCTAssertTrue(board.waitForExistence(timeout: 30))
    XCTAssertEqual(boards.count, 1)
    XCTAssertTrue(board.isEnabled)
    XCTAssertEqual(board.value as? String, "d4, white knight; selected")
    XCTAssertEqual(board.descendants(matching: .any).count, 0)

    try app.performAccessibilityAudit()
  }

  func testPackedAnnotationAccessibilitySurface() throws {
    let app = XCUIApplication()
    app.launchArguments += [
      "-AppleLanguages", "(en)",
      "-AppleLocale", "en_US",
      "--fixture", "annotation-arrow",
    ]
    app.launch()

    let boards = app.descendants(matching: .any).matching(
      NSPredicate(format: "label == %@", "Annotation test board, white orientation")
    )
    let board = boards.firstMatch

    XCTAssertTrue(board.waitForExistence(timeout: 30))
    XCTAssertEqual(boards.count, 1)
    XCTAssertTrue(board.isEnabled)
    XCTAssertEqual(board.value as? String, "a2, empty")
    XCTAssertEqual(board.descendants(matching: .any).count, 0)
    XCTAssertEqual(app.staticTexts["annotation:operation-count"].label, "Operation count: 0")
    XCTAssertEqual(app.staticTexts["annotation:revision"].label, "Annotation revision: 0")
    XCTAssertEqual(app.staticTexts["annotation:count"].label, "Annotation count: 0")

    try app.performAccessibilityAudit()
    let screenshot = XCTAttachment(screenshot: board.screenshot())
    screenshot.name = "annotation-arrow-initial"
    screenshot.lifetime = .keepAlways
    add(screenshot)
  }
}

final class ChessboardNativeHarnessInteractionUITests: XCTestCase {
  private let boardLabel = "Interaction test board, white orientation"

  override func setUpWithError() throws {
    continueAfterFailure = false
  }

  func testDraggablePieceCapturesScrollAndRejectsExactlyOnce() throws {
    let app = launchInteractionFixture()
    let board = interactionBoard(in: app)
    let callbackCount = app.staticTexts["interaction:callback-count"]
    let lastTarget = app.staticTexts["interaction:last-target"]
    let positionRevision = app.staticTexts["interaction:position-revision"]
    let initialBoardTop = board.frame.minY

    // Cross two ranks so the hosted simulator reliably clears the gesture
    // activation threshold before XCUITest releases the touch.
    dragPiece(on: board, file: 3, fromRank: 4, toRank: 6)

    waitForLabel(callbackCount, "Callback count: 1")
    waitForLabel(lastTarget, "Last target: d6")
    waitForLabel(app.staticTexts["interaction:last-source"], "Last source: board:d4")
    waitForLabel(app.staticTexts["interaction:decision"], "Decision: rejected")
    XCTAssertEqual(app.staticTexts["interaction:abort-count"].label, "Abort count: 0")
    XCTAssertEqual(positionRevision.label, "Position revision: 7")
    Thread.sleep(forTimeInterval: 0.5)
    XCTAssertEqual(callbackCount.label, "Callback count: 1")
    XCTAssertEqual(
      board.frame.minY,
      initialBoardTop,
      accuracy: 4,
      "a draggable-piece gesture must remain captured by the board"
    )
  }

  func testEmptySquareDefersToTheParentScrollView() throws {
    let app = launchInteractionFixture()
    let board = interactionBoard(in: app)
    let callbackCount = app.staticTexts["interaction:callback-count"]
    let initialBoardTop = board.frame.minY

    drag(on: board, file: 0, fromRank: 4, toRank: 6)

    XCTAssertTrue(
      waitUntil(timeout: 10) {
        board.frame.minY <= initialBoardTop - 20
      },
      "an empty-square gesture must scroll the parent ScrollView"
    )
    XCTAssertEqual(callbackCount.label, "Callback count: 0")
    XCTAssertEqual(app.staticTexts["interaction:last-source"].label, "Last source: none")
    XCTAssertEqual(app.staticTexts["interaction:decision"].label, "Decision: none")
    XCTAssertEqual(
      app.staticTexts["interaction:position-revision"].label,
      "Position revision: 7"
    )
  }

  func testClippedSparePieceReachesBoardExactlyOnceWithoutScrolling() throws {
    let app = launchInteractionFixture()
    let board = interactionBoard(in: app)
    let spares = app.buttons.matching(
      NSPredicate(format: "label == %@", "Clipped white queen spare")
    )
    let spare = spares.firstMatch
    let initialBoardTop = board.frame.minY

    XCTAssertTrue(spare.waitForExistence(timeout: 30))
    XCTAssertEqual(spares.count, 1)
    spare.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5))
      .press(
        forDuration: 0.05,
        thenDragTo: squareCoordinate(on: board, file: 4, rank: 2)
      )

    waitForLabel(app.staticTexts["interaction:callback-count"], "Callback count: 1")
    waitForLabel(app.staticTexts["interaction:last-target"], "Last target: e2")
    waitForLabel(
      app.staticTexts["interaction:last-source"],
      "Last source: spare:clipped-white-queen"
    )
    waitForLabel(app.staticTexts["interaction:decision"], "Decision: rejected")
    XCTAssertEqual(app.staticTexts["interaction:abort-count"].label, "Abort count: 0")
    XCTAssertEqual(
      app.staticTexts["interaction:position-revision"].label,
      "Position revision: 7"
    )
    Thread.sleep(forTimeInterval: 0.5)
    XCTAssertEqual(
      app.staticTexts["interaction:callback-count"].label,
      "Callback count: 1"
    )
    XCTAssertEqual(
      board.frame.minY,
      initialBoardTop,
      accuracy: 4,
      "a spare-piece drag must stay captured while crossing the clipped palette"
    )
  }

  func testBackgroundResumeCancelsPendingInteractionWork() throws {
    let app = launchInteractionFixture("interaction-lifecycle")
    let board = interactionBoard(in: app)

    dragPiece(on: board, file: 3, fromRank: 4, toRank: 6)
    waitForLabel(app.staticTexts["interaction:callback-count"], "Callback count: 1")
    waitForLabel(app.staticTexts["interaction:decision"], "Decision: pending")

    XCUIDevice.shared.press(.home)
    Thread.sleep(forTimeInterval: 0.5)
    app.activate()
    XCTAssertTrue(board.waitForExistence(timeout: 30))

    waitForLabel(app.staticTexts["interaction:abort-count"], "Abort count: 1")
    waitForLabel(app.staticTexts["interaction:decision"], "Decision: aborted")
    waitForLabel(app.staticTexts["interaction:callback-count"], "Callback count: 1")
    waitForLabel(app.staticTexts["interaction:last-target"], "Last target: d6")
    waitForLabel(app.staticTexts["interaction:last-source"], "Last source: board:d4")
    XCTAssertEqual(
      app.staticTexts["interaction:position-revision"].label,
      "Position revision: 7"
    )
  }

  private func launchInteractionFixture(
    _ fixture: String = "interaction"
  ) -> XCUIApplication {
    let app = XCUIApplication()
    app.launchArguments += [
      "-AppleLanguages", "(en)",
      "-AppleLocale", "en_US",
      "--fixture", fixture,
    ]
    app.launch()

    let callbackCount = app.staticTexts["interaction:callback-count"]
    XCTAssertTrue(callbackCount.waitForExistence(timeout: 30))
    XCTAssertEqual(callbackCount.label, "Callback count: 0")
    XCTAssertEqual(app.staticTexts["interaction:abort-count"].label, "Abort count: 0")
    XCTAssertEqual(app.staticTexts["interaction:decision"].label, "Decision: none")
    XCTAssertEqual(app.staticTexts["interaction:last-source"].label, "Last source: none")
    XCTAssertEqual(
      app.staticTexts["interaction:position-revision"].label,
      "Position revision: 7"
    )
    return app
  }

  private func interactionBoard(in app: XCUIApplication) -> XCUIElement {
    let boards = app.descendants(matching: .any).matching(
      NSPredicate(format: "label == %@", boardLabel)
    )
    let board = boards.firstMatch

    XCTAssertTrue(board.waitForExistence(timeout: 30))
    XCTAssertEqual(boards.count, 1)
    return board
  }

  private func drag(
    on board: XCUIElement,
    file: Int,
    fromRank: Int,
    toRank: Int
  ) {
    let start = squareCoordinate(on: board, file: file, rank: fromRank)
    let end = squareCoordinate(on: board, file: file, rank: toRank)
    start.press(forDuration: 0.05, thenDragTo: end)
  }

  private func dragPiece(
    on board: XCUIElement,
    file: Int,
    fromRank: Int,
    toRank: Int
  ) {
    let start = squareCoordinate(on: board, file: file, rank: fromRank)
    let end = squareCoordinate(on: board, file: file, rank: toRank)
    start.press(
      forDuration: 0.15,
      thenDragTo: end,
      withVelocity: .slow,
      thenHoldForDuration: 0.1
    )
  }

  private func squareCoordinate(
    on board: XCUIElement,
    file: Int,
    rank: Int
  ) -> XCUICoordinate {
    let dimension = 8.0
    let visualRow = 8 - rank
    return board.coordinate(
      withNormalizedOffset: CGVector(
        dx: (Double(file) + 0.5) / dimension,
        dy: (Double(visualRow) + 0.5) / dimension
      )
    )
  }

  private func waitForLabel(
    _ element: XCUIElement,
    _ expectedLabel: String
  ) {
    let expectation = XCTNSPredicateExpectation(
      predicate: NSPredicate(format: "label == %@", expectedLabel),
      object: element
    )
    XCTAssertEqual(
      XCTWaiter.wait(for: [expectation], timeout: 30),
      .completed,
      "timed out waiting for \(expectedLabel)"
    )
  }

  private func waitUntil(
    timeout: TimeInterval,
    condition: () -> Bool
  ) -> Bool {
    let deadline = Date().addingTimeInterval(timeout)
    repeat {
      if condition() {
        return true
      }
      RunLoop.current.run(until: Date().addingTimeInterval(0.05))
    } while Date() < deadline
    return condition()
  }
}
