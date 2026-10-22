import ExpoModulesCore

// Gym rest timer, native half (C1, next store build). The JS feature-detects
// this module (requireOptionalNativeModule('CheferRestTimer')); binaries
// without it keep the expo-notifications alert.
public class CheferRestTimerModule: Module {
  private var observer: NSObjectProtocol?

  public func definition() -> ModuleDefinition {
    Name("CheferRestTimer")

    Events("onChange")

    Constants([
      "lockScreenAddSec": CheferRestTimerController.addStepSec
    ])

    AsyncFunction("sync") { (rest: [String: Any]?) in
      await CheferRestTimerController.shared.sync(Self.parse(rest))
    }

    Function("getState") { () -> [String: Any?] in
      let controller = CheferRestTimerController.shared
      return ["rest": Self.serialize(controller.current), "lastActionAt": controller.lastActionAt]
    }

    OnStartObserving {
      self.observer = NotificationCenter.default.addObserver(
        forName: CheferRestTimerController.changedNotification, object: nil, queue: .main
      ) { [weak self] _ in
        let controller = CheferRestTimerController.shared
        self?.sendEvent("onChange", [
          "rest": Self.serialize(controller.current), "lastActionAt": controller.lastActionAt,
        ])
      }
    }

    OnStopObserving {
      if let observer = self.observer { NotificationCenter.default.removeObserver(observer) }
      self.observer = nil
    }
  }

  private static func parse(_ raw: [String: Any]?) -> NativeRest? {
    guard let raw, let endsAt = raw["endsAt"] as? Double, let durationSec = raw["durationSec"] as? Double
    else { return nil }
    return NativeRest(endsAt: endsAt, durationSec: durationSec, label: raw["label"] as? String)
  }

  private static func serialize(_ rest: NativeRest?) -> [String: Any]? {
    guard let rest else { return nil }
    return ["endsAt": rest.endsAt, "durationSec": rest.durationSec, "label": rest.label as Any]
  }
}
