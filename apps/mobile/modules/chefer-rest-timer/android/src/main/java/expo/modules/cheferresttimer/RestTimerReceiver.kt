package expo.modules.cheferresttimer

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** The rest-over alarm and the countdown notification's +30 s / Skip buttons. */
class RestTimerReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    when (intent.action) {
      RestTimerController.ACTION_ALARM ->
        RestTimerController.onRestOver(context, intent.getLongExtra(RestTimerController.EXTRA_ENDS_AT, 0L))
      RestTimerController.ACTION_ADD -> RestTimerController.addFromLockScreen(context)
      RestTimerController.ACTION_SKIP -> RestTimerController.skipFromLockScreen(context)
    }
  }
}
