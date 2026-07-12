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
}
