import ActivityKit
import Foundation
import UserNotifications

/// The rest as the native side knows it. Mirrors the JS `RestTimerState`.
public struct NativeRest: Codable, Equatable {
  public var endsAt: Double  // epoch ms
  public var durationSec: Double
  public var label: String?
}

/// Owns the two things a rest needs outside the app: the Live Activity (lock
/// screen + Dynamic Island) and the "Rest is over" local notification. The JS
/// rest timer stays the source of truth; it calls `sync` on every change. The
/// Live Activity's +30 s / Skip buttons (iOS 17, RestTimerIntents.swift) change
/// the rest here, record `lastActionAt`, and post `changedNotification` so the
/// module can tell a running JS; a JS that was suspended reads it on resume.
public final class CheferRestTimerController {
  public static let shared = CheferRestTimerController()
  public static let changedNotification = Notification.Name("CheferRestTimerChanged")

  static let notificationId = "chefer.rest-timer.over"
  private static let restKey = "chefer.restTimer.native"
  private static let actionKey = "chefer.restTimer.lastActionAt"
  public static let addStepSec: Double = 30

  private let defaults = UserDefaults.standard
  private let queue = DispatchQueue(label: "chefer.rest-timer")

  public var current: NativeRest? {
    guard let data = defaults.data(forKey: Self.restKey) else { return nil }
    return try? JSONDecoder().decode(NativeRest.self, from: data)
  }

  public var lastActionAt: Double? {
    let value = defaults.double(forKey: Self.actionKey)
    return value > 0 ? value : nil
  }

  /// Makes the Live Activity and the alert match `rest` (nil = no rest).
  public func sync(_ rest: NativeRest?) async {
    if let rest, rest.endsAt > nowMs() + 1000 {
      store(rest)
      scheduleAlert(rest)
      await upsertActivity(rest)
    } else {
      store(nil)
      UNUserNotificationCenter.current().removePendingNotificationRequests(withIdentifiers: [Self.notificationId])
      await endActivities()
    }
  }

  // MARK: Lock-screen actions (LiveActivityIntent, runs in the app's process)

  public func skipFromLockScreen() async {
    markAction()
    await sync(nil)
    NotificationCenter.default.post(name: Self.changedNotification, object: nil)
  }

  public func addFromLockScreen() async {
    guard var rest = current else { return }
    let now = nowMs()
    rest.endsAt = max(rest.endsAt, now) + Self.addStepSec * 1000
    rest.durationSec += Self.addStepSec
    markAction()
    await sync(rest)
    NotificationCenter.default.post(name: Self.changedNotification, object: nil)
  }

  // MARK: Internals

  private func nowMs() -> Double { Date().timeIntervalSince1970 * 1000 }

  private func markAction() { defaults.set(nowMs(), forKey: Self.actionKey) }

  private func store(_ rest: NativeRest?) {
    if let rest, let data = try? JSONEncoder().encode(rest) {
      defaults.set(data, forKey: Self.restKey)
    } else {
      defaults.removeObject(forKey: Self.restKey)
    }
  }

  private func content(_ rest: NativeRest) -> ActivityContent<RestTimerAttributes.ContentState> {
    let endsAt = Date(timeIntervalSince1970: rest.endsAt / 1000)
    let startedAt = endsAt.addingTimeInterval(-rest.durationSec)
    // Stale at the end: the widget then shows "Rest is over" even though the
    // app is suspended and can't end the activity itself.
    return ActivityContent(
      state: .init(startedAt: startedAt, endsAt: endsAt, label: rest.label),
      staleDate: endsAt,
      relevanceScore: 100
    )
  }

  private func upsertActivity(_ rest: NativeRest) async {
    guard ActivityAuthorizationInfo().areActivitiesEnabled else { return }
    let activities = Activity<RestTimerAttributes>.activities
    if let first = activities.first {
      await first.update(content(rest))
      // Only ever one rest; drop strays (e.g. after a crash).
      for extra in activities.dropFirst() { await extra.end(nil, dismissalPolicy: .immediate) }
      return
    }
    do {
      _ = try Activity.request(attributes: RestTimerAttributes(), content: content(rest), pushType: nil)
    } catch {
      // Live Activities are a convenience; the in-app timer and alert still work.
    }
  }

  private func endActivities() async {
    for activity in Activity<RestTimerAttributes>.activities {
      await activity.end(nil, dismissalPolicy: .immediate)
    }
  }

  private func scheduleAlert(_ rest: NativeRest) {
    let center = UNUserNotificationCenter.current()
    center.getNotificationSettings { settings in
      guard settings.authorizationStatus == .authorized || settings.authorizationStatus == .provisional
      else { return }
      let content = UNMutableNotificationContent()
      content.title = "Rest is over"
      content.body = "Time for your next set."
      content.sound = .default
      content.userInfo = ["kind": "gym-rest-timer"]
      let fireAt = Date(timeIntervalSince1970: rest.endsAt / 1000)
      let trigger = UNTimeIntervalNotificationTrigger(
        timeInterval: max(1, fireAt.timeIntervalSinceNow), repeats: false)
      // Same identifier every time: adding it replaces the pending one.
      center.add(UNNotificationRequest(identifier: Self.notificationId, content: content, trigger: trigger))
    }
  }
}
