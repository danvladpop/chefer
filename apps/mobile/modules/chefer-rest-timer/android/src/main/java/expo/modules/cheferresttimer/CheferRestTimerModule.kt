package expo.modules.cheferresttimer

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

// Gym rest timer, native half (C1, next store build). The JS feature-detects
// this module (requireOptionalNativeModule('CheferRestTimer')); binaries
// without it keep the expo-notifications alert.
class CheferRestTimerModule : Module() {
  private val context
    get() = requireNotNull(appContext.reactContext) { "React context is not available" }

  override fun definition() = ModuleDefinition {
    Name("CheferRestTimer")

    Events("onChange")

    Constants("lockScreenAddSec" to RestTimerController.ADD_STEP_SEC)

    AsyncFunction("sync") { rest: Map<String, Any?>? ->
      RestTimerController.sync(context, parse(rest))
    }

    Function("getState") { state() }

    OnStartObserving { RestTimerController.onChange = { sendEvent("onChange", state()) } }

    OnStopObserving { RestTimerController.onChange = null }
  }

  private fun state(): Map<String, Any?> {
    val rest = RestTimerController.current(context)
    return mapOf(
      "rest" to rest?.let { mapOf("endsAt" to it.endsAt.toDouble(), "durationSec" to it.durationSec.toDouble(), "label" to it.label) },
      "lastActionAt" to RestTimerController.lastActionAt(context)?.toDouble(),
    )
  }

  private fun parse(raw: Map<String, Any?>?): NativeRest? {
    if (raw == null) return null
    val endsAt = (raw["endsAt"] as? Number)?.toLong() ?: return null
    val durationSec = (raw["durationSec"] as? Number)?.toLong() ?: return null
    return NativeRest(endsAt, durationSec, raw["label"] as? String)
  }
}
