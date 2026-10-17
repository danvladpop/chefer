package expo.modules.chefercredentials

import android.content.MutableContextWrapper
import android.os.Build
import android.view.autofill.AutofillManager
import androidx.credentials.CreatePasswordRequest
import androidx.credentials.CredentialManager
import androidx.credentials.exceptions.CreateCredentialCancellationException
import androidx.credentials.exceptions.CreateCredentialNoCreateOptionException
import androidx.credentials.exceptions.CreateCredentialProviderConfigurationException
import androidx.credentials.exceptions.CreateCredentialUnsupportedException
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

// F8 (docs/research/password-autofill.md §10–§12): React Native never commits the
// autofill session, so Google's autofill never offers to save on its own. After
// a successful email sign-up or typed sign-in the JS hands the credential here,
// and Credential Manager shows its "save password" sheet for the user's provider.
class CheferCredentialsModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("CheferCredentials")

    AsyncFunction("savePassword") Coroutine { username: String, password: String ->
      val activity = appContext.currentActivity ?: return@Coroutine "unavailable"
      if (username.isEmpty() || password.isEmpty()) return@Coroutine "unavailable"
      try {
        // An activity context keeps the sheet in this task (androidx.credentials docs).
        CredentialManager.create(activity)
          .createCredential(MutableContextWrapper(activity), CreatePasswordRequest(username, password))
        "saved"
      } catch (e: CreateCredentialCancellationException) {
        "cancelled"
      } catch (e: CreateCredentialNoCreateOptionException) {
        "unavailable"
      } catch (e: CreateCredentialProviderConfigurationException) {
        "unavailable"
      } catch (e: CreateCredentialUnsupportedException) {
        "unavailable"
      } finally {
        // Drop the pending autofill session so it can't offer the same
        // credential a second time when the activity later finishes.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
          activity.getSystemService(AutofillManager::class.java)?.cancel()
        }
      }
    }
  }
}
