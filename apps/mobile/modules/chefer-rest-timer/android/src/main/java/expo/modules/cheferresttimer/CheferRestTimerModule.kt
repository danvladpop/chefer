package expo.modules.cheferresttimer

import android.app.AlarmManager
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
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

    // Android 12+: whether "Alarms & reminders" is off, i.e. long rests can
    // ring late (RestTimerService covers only ~3 min). iOS has no such function.
    Function("needsExactAlarmPermission") {
      Build.VERSION.SDK_INT >= Build.VERSION_CODES.S &&
        context.getSystemService(AlarmManager::class.java)?.canScheduleExactAlarms() == false
    }

    /** Opens this app's "Alarms & reminders" switch; false if there is none to open. */
    Function("openExactAlarmSettings") {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return@Function false
      try {
        val activity = appContext.currentActivity
        val intent =
          Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:${context.packageName}"))
        if (activity != null) activity.startActivity(intent)
        else context.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        true
      } catch (e: Exception) {
        false
      }
    }

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
