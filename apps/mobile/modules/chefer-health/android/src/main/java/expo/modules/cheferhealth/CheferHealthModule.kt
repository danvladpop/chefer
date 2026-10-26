package expo.modules.cheferhealth

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.lang.ref.WeakReference

class CheferHealthModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("CheferHealth")

    // A running app hears the request at once: coming back from Health
    // Connect's permission sheet does not always change AppState.
    Events(PRIVACY_REQUEST_EVENT)

    /**
     * True once per Health Connect "privacy policy" tap. JS reads it on launch,
     * on every return to the foreground and on the event, then opens the policy.
     */
    Function("consumePrivacyRequest") {
      val pending = HealthRationale.pending
      HealthRationale.pending = false
      pending
    }

    OnCreate { current = WeakReference(this@CheferHealthModule) }
    OnDestroy { current = null }
  }

  companion object {
    private const val PRIVACY_REQUEST_EVENT = "onPrivacyRequest"
    @Volatile private var current: WeakReference<CheferHealthModule>? = null

    internal fun notifyPrivacyRequest() {
      current?.get()?.sendEvent(PRIVACY_REQUEST_EVENT, emptyMap<String, Any>())
    }
  }
}
