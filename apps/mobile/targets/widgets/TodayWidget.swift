import SwiftUI
import WidgetKit

// Home-screen widget (C4): the next planned meal and what is left of today's
// targets. The app writes the snapshot (CheferWidgetsModule, App Group); this
// only displays its strings. Tapping opens Today.

private struct TodaySnapshot: Decodable {
  let v: Int
  let date: String  // local YYYY-MM-DD
  let eyebrow: String
  let title: String
  let detail: String?
  let url: String
}

struct TodayEntry: TimelineEntry {
  let date: Date
  fileprivate let snapshot: TodaySnapshot?
}

private enum TodayStore {
  // KEEP IN SYNC with modules/chefer-widgets/ios/CheferWidgetsModule.swift.
  static let snapshotKey = "today.snapshot"

  /// The extension is <app id>.widgets; the App Group is group.<app id>.
  static var groupId: String? {
    guard let id = Bundle.main.bundleIdentifier, id.hasSuffix(".widgets") else { return nil }
    return "group." + id.dropLast(".widgets".count)
  }

  static func read() -> TodaySnapshot? {
    guard let groupId, let json = UserDefaults(suiteName: groupId)?.string(forKey: snapshotKey),
      let data = json.data(using: .utf8)
    else { return nil }
    return try? JSONDecoder().decode(TodaySnapshot.self, from: data)
  }
}

private func localDay(_ date: Date) -> String {
  let c = Calendar.current.dateComponents([.year, .month, .day], from: date)
  return String(format: "%04d-%02d-%02d", c.year ?? 0, c.month ?? 0, c.day ?? 0)
}

struct TodayProvider: TimelineProvider {
  func placeholder(in context: Context) -> TodayEntry {
    TodayEntry(
      date: Date(),
      snapshot: TodaySnapshot(
        v: 1, date: localDay(Date()), eyebrow: "Next · Lunch", title: "Chicken & Chickpea Bowl",
        detail: "1,540 kcal · 102 g protein left", url: "chefer://"))
  }

  func getSnapshot(in context: Context, completion: @escaping (TodayEntry) -> Void) {
    completion(context.isPreview ? placeholder(in: context) : TodayEntry(date: Date(), snapshot: TodayStore.read()))
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<TodayEntry>) -> Void) {
    let now = Date()
    // Redraw at midnight so yesterday's day turns into "Open Chefer"; the app
    // reloads the timeline whenever Today changes.
    let midnight = Calendar.current.startOfDay(for: now.addingTimeInterval(86_400))
    completion(
      Timeline(
        entries: [TodayEntry(date: now, snapshot: TodayStore.read()), TodayEntry(date: midnight, snapshot: TodayStore.read())],
        policy: .after(midnight)))
  }
}

struct TodayWidgetView: View {
  let entry: TodayEntry
  @Environment(\.widgetFamily) private var family

  private var current: TodaySnapshot? {
    guard let s = entry.snapshot, s.v == 1, s.date == localDay(entry.date) else { return nil }
    return s
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 4) {
      if let s = current {
        Text(s.eyebrow)
          .font(.caption.weight(.semibold))
          .foregroundStyle(Color("brand"))
          .lineLimit(1)
        Text(s.title)
          .font(family == .systemSmall ? .headline : .title3.weight(.semibold))
          .foregroundStyle(Color("ink"))
          .lineLimit(family == .systemSmall ? 3 : 2)
        Spacer(minLength: 0)
        if let detail = s.detail {
          Text(detail)
            .font(.caption)
            .foregroundStyle(Color("inkSecondary"))
            .lineLimit(2)
        }
      } else {
        Text("Chefer")
          .font(.caption.weight(.semibold))
          .foregroundStyle(Color("brand"))
        Text("Open Chefer to see today")
          .font(.headline)
          .foregroundStyle(Color("ink"))
        Spacer(minLength: 0)
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    .widgetURL(current.flatMap { URL(string: $0.url) })
    .modifier(SurfaceBackground())
  }
}

/// iOS 17 requires the container background API; 16.x pads by hand.
private struct SurfaceBackground: ViewModifier {
  func body(content: Content) -> some View {
    if #available(iOS 17.0, *) {
      content.containerBackground(for: .widget) { Color("surface") }
    } else {
      content.padding().background(Color("surface"))
    }
  }
}

struct TodayWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "TodayWidget", provider: TodayProvider()) { entry in
      TodayWidgetView(entry: entry)
    }
    .configurationDisplayName("Today")
    .description("Your next meal and what's left of today's targets.")
    .supportedFamilies([.systemSmall, .systemMedium])
  }
}
