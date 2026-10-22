import ActivityKit
import SwiftUI
import WidgetKit

// Gym rest countdown on the lock screen and in the Dynamic Island (C1). The
// countdown and the bar are system-driven (`timerInterval:`), so they keep
// running while the app is suspended. At `endsAt` the content goes stale and
// the views say the rest is over until the app ends the activity.
struct RestTimerLiveActivity: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: RestTimerAttributes.self) { context in
      RestLockScreenView(state: context.state, isStale: context.isStale)
        .activityBackgroundTint(Color("brandSoft"))
        .activitySystemActionForegroundColor(Color("brand"))
    } dynamicIsland: { context in
      let state = context.state
      return DynamicIsland {
        DynamicIslandExpandedRegion(.leading) {
          Label("Rest", systemImage: "timer")
            .font(.headline)
            .foregroundStyle(Color("brand"))
        }
        DynamicIslandExpandedRegion(.trailing) {
          RestCountdownText(state: state, isStale: context.isStale)
            .font(.title2.monospacedDigit().weight(.semibold))
            .multilineTextAlignment(.trailing)
        }
        DynamicIslandExpandedRegion(.bottom) {
          VStack(alignment: .leading, spacing: 8) {
            if let label = state.label {
              Text("Next: \(label)").font(.subheadline).lineLimit(1)
            }
            RestProgressBar(state: state, isStale: context.isStale)
            RestActions(isStale: context.isStale)
          }
        }
      } compactLeading: {
        Image(systemName: "timer").foregroundStyle(Color("brand"))
      } compactTrailing: {
        RestCountdownText(state: state, isStale: context.isStale)
          .monospacedDigit()
          .frame(maxWidth: 52)
      } minimal: {
        Image(systemName: "timer").foregroundStyle(Color("brand"))
      }
      .keylineTint(Color("brand"))
    }
  }
}

private struct RestCountdownText: View {
  let state: RestTimerAttributes.ContentState
  let isStale: Bool

  var body: some View {
    if isStale || state.endsAt <= Date() {
      Text("0:00")
    } else {
      Text(timerInterval: Date()...state.endsAt, countsDown: true)
    }
  }
}

private struct RestProgressBar: View {
  let state: RestTimerAttributes.ContentState
  let isStale: Bool

  var body: some View {
    if isStale || state.endsAt <= state.startedAt {
      ProgressView(value: 1).tint(Color("brand"))
    } else {
      ProgressView(timerInterval: state.startedAt...state.endsAt, countsDown: false) {
        EmptyView()
      } currentValueLabel: {
        EmptyView()
      }
      .tint(Color("brand"))
    }
  }
}

/// +30 s and Skip (iOS 17+: buttons in a Live Activity run an App Intent).
private struct RestActions: View {
  let isStale: Bool

  var body: some View {
    if #available(iOS 17.0, *), !isStale {
      HStack(spacing: 8) {
        Button(intent: AddRestTimeIntent()) {
          Text("+30 s").frame(maxWidth: .infinity)
        }
        Button(intent: SkipRestIntent()) {
          Text("Skip").frame(maxWidth: .infinity)
        }
      }
      .buttonStyle(.bordered)
      .tint(Color("brand"))
      .font(.subheadline.weight(.semibold))
    }
  }
}

private struct RestLockScreenView: View {
  let state: RestTimerAttributes.ContentState
  let isStale: Bool

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      HStack(alignment: .firstTextBaseline) {
        VStack(alignment: .leading, spacing: 2) {
          Label(isStale ? "Rest is over" : "Rest", systemImage: "timer")
            .font(.headline)
            .foregroundStyle(Color("brand"))
          Text(isStale ? "Time for your next set." : (state.label.map { "Next: \($0)" } ?? "Chefer workout"))
            .font(.subheadline)
            .foregroundStyle(.secondary)
            .lineLimit(1)
        }
        Spacer(minLength: 8)
        RestCountdownText(state: state, isStale: isStale)
          .font(.system(size: 40, weight: .semibold).monospacedDigit())
          .multilineTextAlignment(.trailing)
          .frame(maxWidth: 130, alignment: .trailing)
      }
      RestProgressBar(state: state, isStale: isStale)
      RestActions(isStale: isStale)
    }
    .padding(16)
  }
}
