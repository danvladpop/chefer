import ExpoModulesCore
import WidgetKit

// Home-screen widget data (C4, next store build). The app writes Today's
// snapshot (JSON built in src/features/widget/today-widget-snapshot.ts) into
// the App Group the widget extension shares, then asks WidgetKit to redraw.
// The JS feature-detects this module; older binaries never call it. The pod is
// CheferWidgetData, not CheferWidgets: that is the widget extension's module.
public class CheferWidgetsModule: Module {
  // KEEP IN SYNC with targets/widgets/TodayWidget.swift.
  static let snapshotKey = "today.snapshot"
  static let widgetKind = "TodayWidget"

  public func definition() -> ModuleDefinition {
    Name("CheferWidgets")

    AsyncFunction("setTodaySnapshot") { (json: String?) in
      // group.<app bundle id> (app.config.js ios.entitlements).
      guard let bundleId = Bundle.main.bundleIdentifier,
        let defaults = UserDefaults(suiteName: "group.\(bundleId)")
      else { return }
      if let json {
        defaults.set(json, forKey: Self.snapshotKey)
      } else {
        defaults.removeObject(forKey: Self.snapshotKey)
      }
      WidgetCenter.shared.reloadTimelines(ofKind: Self.widgetKind)
    }
  }
}
