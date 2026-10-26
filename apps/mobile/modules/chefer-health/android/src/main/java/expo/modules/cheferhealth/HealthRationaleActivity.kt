package expo.modules.cheferhealth

import android.app.Activity
import android.content.Intent
import android.os.Bundle

/**
 * Health Connect asks the app to show why it wants health data (its privacy
 * policy). This activity has no UI: it records the request and brings the app
 * forward, and JS opens the in-app Privacy Policy (`consumePrivacyRequest`).
 */
class HealthRationaleActivity : Activity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    HealthRationale.pending = true
    packageManager.getLaunchIntentForPackage(packageName)?.let { launch ->
      launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT)
      startActivity(launch)
    }
    finish()
  }
}

internal object HealthRationale {
  @Volatile var pending = false
}
