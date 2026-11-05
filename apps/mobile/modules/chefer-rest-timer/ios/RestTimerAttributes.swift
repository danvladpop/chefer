import ActivityKit
import Foundation

// KEEP IN SYNC with targets/widgets/RestTimerAttributes.swift: ActivityKit
// matches the app's and the widget extension's copies by type name and
// Codable shape (tests/unit/rest-timer-native-sync.test.ts compares them).
public struct RestTimerAttributes: ActivityAttributes {
  public struct ContentState: Codable, Hashable {
    /// When the rest started (for the progress bar).
    public var startedAt: Date
    /// When the rest is over.
    public var endsAt: Date
    /// What comes next, e.g. "Bench press". Nil when unknown.
    public var label: String?

    public init(startedAt: Date, endsAt: Date, label: String?) {
      self.startedAt = startedAt
      self.endsAt = endsAt
      self.label = label
    }
  }

  public init() {}
}
