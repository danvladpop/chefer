import AppIntents
import Foundation

#if canImport(CheferRestTimer)
  internal import CheferRestTimer
#endif

// The Live Activity's +30 s / Skip buttons (C1). This file is linked into both
// the app and the widget extension (@bacons/apple-targets `_shared`): the
// widget needs the types for `Button(intent:)`, and iOS runs a
// LiveActivityIntent's `perform()` in the APP's process, where the rest-timer
// module (CheferRestTimer pod) is importable. The widget build skips the body.

@available(iOS 17.0, *)
struct AddRestTimeIntent: LiveActivityIntent {
  static var title: LocalizedStringResource = "Add 30 seconds of rest"
  static var isDiscoverable = false

  func perform() async throws -> some IntentResult {
    #if canImport(CheferRestTimer)
      await CheferRestTimerController.shared.addFromLockScreen()
    #endif
    return .result()
  }
}

@available(iOS 17.0, *)
struct SkipRestIntent: LiveActivityIntent {
  static var title: LocalizedStringResource = "Skip rest"
  static var isDiscoverable = false

  func perform() async throws -> some IntentResult {
    #if canImport(CheferRestTimer)
      await CheferRestTimerController.shared.skipFromLockScreen()
    #endif
    return .result()
  }
}
