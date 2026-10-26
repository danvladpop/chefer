package expo.modules.cheferhealth

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class CheferHealthModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("CheferHealth")

    /**
     * True once per Health Connect "privacy policy" tap. JS reads it on launch
     * and on every return to the foreground, then opens the policy.
     */
    Function("consumePrivacyRequest") {
      val pending = HealthRationale.pending
      HealthRationale.pending = false
      pending
    }
  }
}
