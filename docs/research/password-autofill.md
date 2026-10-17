# Password AutoFill: what makes iOS and Android save a new password

Researched 2026-10-17 for owner feedback F8 and F9 ([`feedback-2026-10-17.md`](../backlog-2026-10/feedback-2026-10-17.md)). F8: at sign-up iOS suggests a strong password but never offers to save it to the Keychain. F9: sign-up needs a "re-type password" field that works with the suggested password.

Sources are primary only: Apple's developer documentation, read through its JSON feed at `developer.apple.com/tutorials/data/documentation/<path>.json`; the WWDC18 session 204 transcript; the Android developer documentation; the React Native docs; and React Native 0.86.3 source in `node_modules`, which is the version this repo ships.

## 1. iOS: the four steps before iOS saves a password

WWDC18 session 204, ["Automatic Strong Passwords and Security Code AutoFill"](https://developer.apple.com/videos/play/wwdc2018/204/), describes saving as four steps:

1. "Autofill infers that we're in a login scenario."
2. "Autofill checks the eligibility of your app based on if there's an association between your app and the domain on the Web. Without this association saving passwords will not be offered."
3. "It detects that a sign in action has occurred."
4. It "decided whether to prompt to save or update the password based on if this is a brand new credential."

From the same session, what the app has to do:

- **Tag the account field as a username.** "Make sure to tag your username field with UI textContentType username." When the username is an email address, the presenter keeps the `username` content type and sets only the keyboard: "I'm also correctly setting the Keyboard Type to Email Address."
- **Tag both password fields as new passwords.** "Make sure to tag your new password and confirm new password fields with UI textContentType newPassword."
- **Take the fields off screen when sign-in succeeds.** "Make sure to remove your username and password fields from the view hierarchy when a sign in occurs. This way, Autofill can detect that a sign in is occurring." Dismissing the view controller that holds them is enough.
- **Don't clear the fields too early.** "Only clear the username and password fields after they've been removed from the view hierarchy."
- **Use one text field per value.** Use "unique instances of UITextField for the username and the password field … once Autofill detects username and password fields, it expects to be able to reliably read their values later on."

## 2. iOS: content types

Apple's article [Enabling Password AutoFill on a text input view](https://developer.apple.com/documentation/security/enabling-password-autofill-on-a-text-input-view) says:

- "If your site uses email addresses as user names, set the input view's `textContentType` property to `username`, and set the `keyboardType` property to `emailAddress`." Its login example is `userTextField.textContentType = .username` with `.keyboardType = .emailAddress`.
- "When creating a new account or changing the password, use the `newPassword` text content type instead." Its example tags both fields, `newPasswordTextField` and `confirmPasswordTextField`, with `.newPassword`.
- An explicit content type "improves the performance of Password AutoFill's heuristics." Without one, iOS has to guess.

[`UITextContentType.emailAddress`](https://developer.apple.com/documentation/uikit/uitextcontenttype/emailaddress) marks a field as "an email address". [`.username`](https://developer.apple.com/documentation/uikit/uitextcontenttype/username) marks it as "an account or login name". Only `.username` appears in Apple's Password AutoFill guidance. `.emailAddress` is the contact-data type.

The web equivalent is [Enabling Password AutoFill on an HTML input element](https://developer.apple.com/documentation/security/enabling-password-autofill-on-an-html-input-element). Its sign-in example is `type="email" autocomplete="username"`, and its sign-up example uses `autocomplete="new-password"` on both the password and the confirm field.

## 3. iOS: associated domains, strong passwords and passwordrules

- **Strong passwords and the association.** [About the Password AutoFill workflow](https://developer.apple.com/documentation/security/about-the-password-autofill-workflow) says: "The system suggests a strong, unique password in apps that have an associated domain. It also saves any new credentials."
  - **Correction (§11):** iOS 26.5 offers "Use Strong Password?" in a build with **no** associated domain too. A strong-password suggestion therefore does not prove the association works.
  - The entitlement in build 8 was instead checked directly, with `codesign` (§11).
- **How the association is checked.** At install, iOS takes each domain in `com.apple.developer.associated-domains` and downloads its `apple-app-site-association` file. If that succeeds, it "enables Password AutoFill for that domain's credentials" (same article).
- **Where the file comes from.** On iOS 14 and later, devices fetch the AASA from Apple's CDN, not from our server ([`com.apple.developer.associated-domains`](https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.developer.associated-domains)). "Apple's content delivery network requests the `apple-app-site-association` file for your domain within 24 hours. Devices check for updates approximately once per week after app installation." ([Supporting associated domains](https://developer.apple.com/documentation/xcode/supporting-associated-domains)).
  - Checked 2026-10-17: `https://app-site-association.cdn-apple.com/a/v1/chefer.duckdns.org` returns `{"webcredentials":{"apps":["45TS85YK89.com.popdan.chefer"]}}`, the same as our origin.
- **Development mode.** `webcredentials:<domain>?mode=developer` skips the CDN. Per the entitlement docs, "only apps that you sign with a development profile can use developer mode, and users must opt-in on any device they use." Our domain is public, so it isn't needed here.
- **passwordrules.** [Customizing Password AutoFill rules](https://developer.apple.com/documentation/security/customizing-password-autofill-rules) says:
  - "If you have two password fields (one for the password, one for confirmation), you don't need to specify password rules for both fields."
  - The default rule is `allowed: ascii-printable`.
  - "No password rule at all creates the second most-difficult-to-guess passwords."
  - Our `newPasswordSchema` accepts Apple's default generated password, a 20-character string with letters, digits and hyphens. We set no rule.

## 4. iOS: things that break the flow

- **Don't tear down the UI during Face ID.** When the user picks a QuickType item, Face ID makes the app inactive. "Don't remove your user interface when these methods are called. If you do, the system won't be able to autocomplete your input views." ([workflow article](https://developer.apple.com/documentation/security/about-the-password-autofill-workflow)).
- **Plain-text password fields lose their password context.** The heuristics "assume that password and new password inputs always use secure text." A field the user may show in plain text therefore needs an explicit content type ([HTML article](https://developer.apple.com/documentation/security/enabling-password-autofill-on-an-html-input-element)). WWDC18 says the same: "If you've chosen not to use Secure Text Entry … it's particularly important that you tag your fields with the password content type." Our Show toggle flips `secureTextEntry`, but both fields keep `textContentType`, so this is covered.

## 5. React Native 0.86 mapping

- **`textContentType` (iOS).** Per the [React Native TextInput docs](https://reactnative.dev/docs/textinput), "You can set `textContentType` to `username` or `password` to enable autofill of login details from the device keychain. `newPassword` can be used to indicate a new password input the user may want to save in the keychain."
- **`autoComplete` is the cross-platform prop.** "Avoid using both … For backwards compatibility, `textContentType` takes precedence when both properties are set."
  - In `Libraries/Components/TextInput/TextInput.js`, iOS falls back to `autoCompleteWebToTextContentTypeMap[autoComplete]` when `textContentType` is unset. That maps `'new-password'` to `newPassword` and `'username'` to `username`.
  - On Android, `'new-password'` maps to `'password-new'`.
- **Android autofill hints** (`ReactAndroid/.../textinput/ReactTextInputManager.kt`):

  | `autoComplete` | Android hint                  |
  | -------------- | ----------------------------- |
  | `email`        | `AUTOFILL_HINT_EMAIL_ADDRESS` |
  | `username`     | `AUTOFILL_HINT_USERNAME`      |
  | `password-new` | `AUTOFILL_HINT_NEW_PASSWORD`  |
  | `username-new` | `AUTOFILL_HINT_NEW_USERNAME`  |

## 6. Android: autofill save and Credential Manager

- **Hints.** [Optimize your app for autofill](https://developer.android.com/identity/autofill/autofill-optimize) says: "On a login form, you can include account credential hints such as `AUTOFILL_HINT_USERNAME` and `AUTOFILL_HINT_PASSWORD`." For account creation, use "`AUTOFILL_HINT_NEW_USERNAME` and `AUTOFILL_HINT_NEW_PASSWORD`."
- **When the save dialog appears.** It shows "after the autofill context is finished. Typically, the autofill context is finished when an activity finishes." A single-activity app has to finish the context itself "by calling `AutofillManager.commit()`" when "using the same activity but different fragments for both your login and content screens" (same page).
  - [`SaveInfo`](https://developer.android.com/reference/android/service/autofill/SaveInfo) also lets a save trigger when "All required views become invisible (if the SaveInfo was created with the FLAG_SAVE_ON_ALL_VIEWS_INVISIBLE flag)". The autofill service (Google) chooses that flag, not the app.
  - React Native is a single activity and never calls `commit()`. Whether Android offers to save after our sign-up therefore depends on the provider's flags. JS can't force it.
- **Credential Manager.** The [Passwords guide](https://developer.android.com/identity/passwords) says: "When a user successfully signs up or updates their password within your app, save these credentials in their password manager." You build a `CreatePasswordRequest(id = username, password = password)` and call `credentialManager.createCredential()`. That needs a native module, so a new binary.
- **Digital Asset Links.** `https://chefer.duckdns.org/.well-known/assetlinks.json` is live with `delegate_permission/common.get_login_creds` for `dev.chefer.app` and two SHA-256 fingerprints. Google Password Manager uses it to share credentials between the site and the app.

## 7. What this means for Chefer

| Finding                                                                                                                    | Consequence                                                                                                                                                                                                                                                                                 |
| -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Our account email field is tagged `emailAddress` (`EMAIL_FIELD_PROPS`). Apple asks for `username` with the email keyboard. | iOS has no tagged username to pair with the new password, so step 1 ("infers … a login scenario") is left to heuristics. **Top-ranked cause of F8.** Fix: `textContentType: 'username'` + `autoComplete: 'username'`, keeping `keyboardType: 'email-address'`. JS-only, so it ships by OTA. |
| A strong password is suggested.                                                                                            | The app↔domain association works on the owner's build, so the entitlement is not the cause. Apple's CDN serves our AASA.                                                                                                                                                                    |
| On success, `setToken` flips `Stack.Protected guard={token === null}` and the whole `(auth)` group unmounts.               | The fields do leave the view hierarchy (step 3), and nothing clears them first. Low-ranked cause.                                                                                                                                                                                           |
| Apple tags the confirm field `newPassword` too.                                                                            | F9: both fields use `NEW_PASSWORD_FIELD_PROPS`, so iOS fills both with the same strong password.                                                                                                                                                                                            |
| Android save needs an autofill-context commit, which React Native never sends.                                             | The `username` hint helps Google pair the fields. A guaranteed Android save needs Credential Manager `createCredential`, which is a native module and a new binary. Out of scope for an OTA fix; tracked as a follow-up.                                                                    |

## 8. F8 diagnosis (2026-10-17)

**Red loop.** `apps/mobile/tests/unit/password-autofill.test.tsx` renders the V4 sign-up, the V3 sign-up and sign-in, and checks each field against Apple's contract. Before the fix all three cases failed with `Expected: "username"`, `Received: "emailAddress"`. After the fix they pass.

| #   | Hypothesis                                                                                     | Prediction                                                                                 | Verdict                                                                                                                                                                                                                                                                                                                   |
| --- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| H1  | The account field is tagged `emailAddress`, so iOS has no `username` to pair with the password | With `username`, iOS offers to save, or saves the accepted strong password under the email | **Most likely, and fixed.** Apple's text-field and HTML guidance and WWDC18 all say `username` (plus the email keyboard). Shipped in `EMAIL_FIELD_PROPS`, and on web as `autocomplete="username"`. Needs the owner's device to confirm (§9).                                                                              |
| H4  | The build lacks the `webcredentials` entitlement                                               | With no association, there would be no strong-password suggestion either                   | **Ruled out** (the reasoning is wrong, see §3; the conclusion holds because build 8's entitlements were read directly in §11). The owner sees a strong password, and Apple only suggests one "in apps that have an associated domain". `eas.json` production sets `EXPO_PUBLIC_API_URL`, and Apple's CDN serves our AASA. |
| H3  | The fields never leave the view hierarchy after sign-up                                        | Explicitly dismissing the screen would bring the prompt back                               | **Unlikely.** `setToken` flips `Stack.Protected guard={token === null}` (`app/_layout.tsx`), which drops the whole `(auth)` group. Nothing clears the fields before that.                                                                                                                                                 |
| H2  | The Show toggle flips `secureTextEntry`, so iOS loses the password context                     | The prompt would appear only when Show is never tapped                                     | **Unlikely.** Both fields keep an explicit `textContentType`, which Apple says is exactly what keeps the context when text is shown in plain text. §9 step 9 covers it.                                                                                                                                                   |

**Simulator and emulator check (dev variant, local API, 2026-10-17).**

- **iOS 26.5, iPhone 17 Pro simulator.** The V4 form shows Email, Password and Confirm password. One Show reveals both fields. A mismatch shows "Passwords do not match", which clears as soon as the passwords match. The confirm key reads Go, and sign-up lands on onboarding.
- **What the simulator can't show.** The dev variant has no associated domain and uses `oneTimeCode`, so it can't show the strong-password or Keychain behaviour. That is the owner's check (§9).
- **Android, Pixel_8 emulator with Google Autofill and a signed-in Google account.** The same F9 behaviour works, but Google offered no save after sign-up.
  - `adb shell dumpsys autofill` shows the app's session with `mSaveOnAllViewsInvisible: false`, so the save would need an activity finish or `AutofillManager.commit()`. React Native sends neither.
  - That confirms §6: a guaranteed save on Android needs a native change.

**OTA or binary: OTA.** The fix only changes JS props on existing `TextInput`s. It needs no `app.config.js` or entitlement change. Android save is the exception: guaranteeing it would take Credential Manager, a native module, so a new binary (§6).

## 9. Owner check on iPhone (production build) — superseded by §13

Do this after the PR is merged and deployed. Deploying publishes the OTA update.

1. **Settings.** In Settings → General → AutoFill & Passwords, check that **AutoFill Passwords and Passkeys** is on and **Passwords** (iCloud Keychain) is ticked.
2. **Get the update.** Open the App Store/TestFlight build of Chefer, wait about 5 s, then force-quit and reopen it so the OTA update applies.
3. **Sign out** if you are signed in (More → Sign out).
4. **Open the email form.** On Welcome, tap **Get started** to reach **Save your plan**, then tap **Continue with email**. The form should show **Email, Password and Confirm password**.
5. **Email.** Tap Email and type a new address, for example `you+f8a@…`. The keyboard should still be the email keyboard, with @ and `.`.
6. **Strong password.** Tap Password. iOS should offer **Use Strong Password**; accept it. **Expect both Password and Confirm password to fill**, both shown as yellow "Strong Password".
7. **Create the account.** Tick the 16+ box and tap **Create account**.
8. **Check it was saved.** Open the Passwords app (or Settings → Passwords) and search for `chefer`. **Expect a `chefer.duckdns.org` entry whose user name is the email from step 5.** This is the F8 pass. If it's missing, screenshot the Passwords search and the sign-up form, and tell the session.
9. **Your own password.** Sign out and repeat steps 4–7 with a new address. This time, tap **Show** first and type your own password in both fields. **Expect an iOS "Save Password?" sheet** after Create account. Tap Save, then check the Passwords app again.
10. **Mismatch.** Start a third sign-up, type different passwords, tick the box and tap Create account. **Expect "Passwords do not match"** under Confirm password and no account created. Fix the confirmation and the message should disappear straight away.
11. **Sign-in fill.** Sign out and go to **Sign in**. Tap Email. **Expect the QuickType bar to offer the saved `chefer.duckdns.org` login.** Tap it and authenticate with Face ID; email and password should both fill.
12. **Clean up.** Delete the test accounts in the app (Profile → Your data → Delete account) and their Passwords entries.

## 10. Explicit save: the platform APIs (researched 2026-10-17, evening)

Second round, for a native save in the 1.0.2 build. Primary sources: the iOS 26.5 SDK in the local Xcode (headers and the AuthenticationServices `.swiftinterface`), Apple documentation, the `androidx.credentials` 1.6.0 sources and release notes, React Native 0.86.3 and expo-modules-core 57.0.14 source in `node_modules`, and the published npm tarballs of the candidate libraries.

### iOS

- **`SecAddSharedWebCredential` is deprecated from iOS 26.2, not removed.** `Security.framework/Headers/SecSharedCredential.h:72-73`: `API_DEPRECATED("Use ASCredentialDataManager.save(password:for:title:anchor:) …", ios(8.0, 26.2))`. [Apple's page](<https://developer.apple.com/documentation/security/secaddsharedwebcredential(_:_:_:_:)>) agrees.
  - It is asynchronous with a completion handler. `fqdn` is a bare host, and a NULL password **deletes** the item.
  - It needs the `webcredentials:` associated domain: "the system tries to get the site association file from the server" (same page).
  - [Managing Shared Credentials](https://developer.apple.com/documentation/security/managing-shared-credentials): a new credential is saved "without prompting the user", and changing an existing one prompts first.
- **The replacement is `ASCredentialDataManager.save(password:for:title:anchor:)`.** It is iOS 26.2+, Swift-only and `async throws` (`AuthenticationServices.swiftinterface`). It saves "to the user's preferred password manager" and is "equivalent to the saving behavior that occurs when submitting a form with a password field".
  - The scope's host "must be listed as an associated domain for Web Credentials".
  - The class "does not indicate whether the operation succeeded". The simulator confirms it: it returned success after the user tapped **Not Now** (§11).
- **No other iOS 26 API saves a password from an app.**
  - `ASCredentialUpdater` (26.0, deprecated 26.2) only reports or hides credentials.
  - `ASSavePasswordRequest` is the password-manager extension's side. Its header (`ASSavePasswordRequest.h:16-36`) names the same two save triggers as WWDC18: a form "submitted or removed from the screen". It also saves a filled generated password "as pending accounts".
- **The username field may be read-only.** WWDC18 204 says so. No primary source mentions the enabled or editable state of the fields when they leave the screen.

### Android

- **androidx.credentials 1.6.0** is the stable release (2026-04-08, [release notes](https://developer.android.com/jetpack/androidx/releases/credentials)). Its minSdk is 23; Expo 57 builds for 24.
  - Dependencies are `credentials` plus `credentials-play-services-auth`, which provides Google Password Manager on API 33 and below.
- **The call is `CredentialManager.createCredential(activityContext, CreatePasswordRequest(id, password))`.** "Use an activity context" (`CredentialManager.kt:245-256`). The guide wraps it in `MutableContextWrapper`; Chefer passes the activity itself, because on Android 14+ a wrapper is not an `Activity` and the sheet could open in a new task.
- **Errors** all extend `CreateCredentialException`:
  - `CreateCredentialCancellationException` means the user said no.
  - `NoCreateOption`, `ProviderConfiguration` and `Unsupported` mean there is nothing to save to.
  - After repeated "Not now" taps the provider "may no longer display the bottom sheet".
- **Avoiding a second prompt.** The autofill framework only offers its own save when the autofill context is committed: by `AutofillManager.commit()`, or when the activity finishes (`AutofillManager.java:2336-2383`). React Native calls neither. To make sure a later activity finish can't offer the same credential again, call `AutofillManager.cancel()` after the request. RN 0.86 has no `isCredential` prop, so the Android 14+ overlap suppression isn't available.

### Library or local module

| Package                                  | Android password save         | iOS password save                                    | Verdict                                                                                            |
| ---------------------------------------- | ----------------------------- | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `react-native-credentials-manager` 0.9.0 | Yes (`CreatePasswordRequest`) | Rejects ("Manual password storage is not supported") | Pins `credentials:1.6.0-alpha02`; its config plugin always adds the Sign in with Apple entitlement |
| `react-native-keychain` 10.0.0 (2025-03) | No                            | `SecAddSharedWebCredential` only                     | No release in 19 months; no 26.2 path                                                              |
| `expo-credential-manager` 0.1.2          | Yes                           | Stubs                                                | GitHub repo gone                                                                                   |
| `react-native-passkey`, google-signin    | No                            | No                                                   | Out of scope                                                                                       |

**Choice: a local Expo module, `apps/mobile/modules/chefer-credentials`.** No library covers both platforms, and the only Android one pins an alpha and injects an unrelated entitlement. The module is about 50 lines of Kotlin, Android only (§12). The JS reaches it through `requireOptionalNativeModule('CheferCredentials')` from `expo`, which returns `null` on a binary without the module, so the same JS bundle is a no-op on 1.0.1 and on iOS.

## 11. Diagnosis round 2: why the owner's phones don't save (2026-10-17, evening)

The owner's report after the #168 update:

- **iOS** (TestFlight build 8, 1.0.1) still suggests a strong password but never saves.
- **Android** never offers to save.
- The only Keychain entry is from 22 Sep: `alice@chefer.dev`, website "Chefer app". It was saved by a free-team build that had no associated domain.

### Evidence

| Check                                                                                       | Result                                                                                                                                                                           |
| ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Build 8's entitlements: EAS build `c93e4c5b` IPA, read with `codesign -d --entitlements :-` | `application-identifier` `45TS85YK89.com.popdan.chefer`, `com.apple.developer.associated-domains` = `[webcredentials:chefer.duckdns.org]`. **Present.**                          |
| Apple's CDN, `app-site-association.cdn-apple.com/a/v1/chefer.duckdns.org`                   | 200, `{"webcredentials":{"apps":["45TS85YK89.com.popdan.chefer"]}}`, `Apple-From` is our origin                                                                                  |
| Props reaching `UITextField`                                                                | RN 0.86.3 `TextInput.js:946-954`: `textContentType` wins whenever it is set, and every account field sets it. So the native fields get `username`, `newPassword` and `password`. |
| `assetlinks.json`                                                                           | Lists `CE:4D:03:31:…` (the signer of the release APK, `apksigner verify --print-certs`) and `97:EB:C7:…`. Not empty.                                                             |
| Android emulator, `adb shell dumpsys autofill` (§8)                                         | `mSaveOnAllViewsInvisible: false`, and RN never calls `AutofillManager.commit()`. Google's autofill save can't fire.                                                             |

**Reproduction on the iOS 26.5 simulator (iPhone 17 Pro), against a local API.** Each save was confirmed in the unified log, where `securityd` logs `inserted <inet,acct=…,srvr=…>`.

| Build                                                                                                                                   | Typed sign-in                                                                                                                             | Strong-password sign-up (V4)                                            |
| --------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Dev variant (`dev.chefer.app.dev`, **no** associated domain)                                                                            | "Save Password?" shown                                                                                                                    | iOS **still offers** "Use Strong Password?" and saves at Create account |
| Production-like Debug: bundle `com.popdan.chefer`, embedded entitlements identical to build 8, post-#168 JS                             | "Save Password?" → `srvr=chefer.duckdns.org`                                                                                              | saved silently at Create account → `srvr=chefer.duckdns.org`            |
| Same, **Release** configuration (no dev client, embedded bundle)                                                                        | "Save Password?" → `srvr=chefer.duckdns.org`                                                                                              | saved silently → `srvr=chefer.duckdns.org`                              |
| Same, Debug, with the **pre-#168** `emailAddress` tag                                                                                   | —                                                                                                                                         | saved silently → `srvr=chefer.duckdns.org`                              |
| Same, Debug, entitlement `webcredentials:chefer.duckdns.org?mode=developer` with developer mode off (domain declared but not validated) | "Save Password?" → `srvr=chefer.duckdns.org`                                                                                              | —                                                                       |
| Production-like Debug **plus** an explicit `ASCredentialDataManager.save` after sign-in                                                 | **Two** "Save Password?" sheets: the second appears after "Not Now" on the first. The API returned success even though the user declined. | —                                                                       |

Screenshots, in [`password-autofill-evidence/`](./password-autofill-evidence/):

- [Release build, typed sign-in](./password-autofill-evidence/ios-prodlike-RELEASE-signin-implicit-save-prompt.png)
- [The stacked second sheet](./password-autofill-evidence/ios-prodlike-explicit-on-2nd-prompt-after-not-now.png)
- [Strong password with no associated domain](./password-autofill-evidence/ios-dev-use-strong-password-no-domain.png)

### Hypotheses

| #   | Hypothesis                                                                                                                                                                                                                                                                                                                  | Verdict                                                                                                              |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| H1  | Build 8 lacks the `webcredentials` entitlement                                                                                                                                                                                                                                                                              | **Ruled out.** `codesign` shows it.                                                                                  |
| H2  | Apple can't fetch or doesn't approve our AASA                                                                                                                                                                                                                                                                               | **Ruled out.** The CDN serves it, and a simulator build with the same app ID saves under `chefer.duckdns.org`.       |
| H3  | `autoComplete` overrides `textContentType` on iOS                                                                                                                                                                                                                                                                           | **Ruled out.** RN source says the opposite.                                                                          |
| H4  | Something in the app stops iOS from seeing a sign-in: fields disabled while the request runs (`editable={!isPending}`), Fabric recycling the text field, `Keyboard.dismiss()`, the dev client's view hierarchy                                                                                                              | **Ruled out** on iOS 26.5. The implicit save works in both Debug and Release builds of the production configuration. |
| H5  | The `emailAddress` tag (fixed in #168) blocked the save                                                                                                                                                                                                                                                                     | **Not the cause** on iOS 26.5: the pre-#168 tag saves too. #168 is still Apple's documented contract, so keep it.    |
| H6  | Something on the owner's iPhone. Candidates: its iOS version (RN issue [#53050](https://github.com/facebook/react-native/issues/53050) reports AutoFill/Fabric behaviour changing between 26.x point releases); the AutoFill provider settings ("Passwords" unticked, or another provider first); its own association state | **Open.** It can't be reproduced here. §13 collects the version, the settings and a device log.                      |
| H7  | Android: autofill never commits, so Google never offers to save                                                                                                                                                                                                                                                             | **Confirmed** (dumpsys, plus RN never calls `commit()`). Fixed by the explicit Credential Manager save.              |

**Root cause.**

- **Android:** confirmed as H7.
- **iOS:** no app-side cause reproduces. Every production-like configuration available here saves, in both flows.
- **What's left is the owner's device (H6).** §13 asks for the evidence that would separate its candidates.

**Bug found on the way and fixed.** On the simulator, a `react-hook-form` `Controller` render passed a stale `value` to `onChangeText`: every keystroke arrived as `'' → n`. The sign-in typed/filled check therefore keeps its own copy of the text (`src/features/auth/password-entry.ts`).

**Not verified: the Android sheet itself.** The Pixel_8 emulator has no Google account (`dumpsys account` → `Accounts: 0`), and an agent must not sign in to one. The module's request reached Google Play services' `PasswordAndPasskeyService`, which failed with GMS error 28434 for lack of an account; the module mapped that to "unavailable" and the app carried on. The sheet itself is the owner's check (§13).

## 12. What 1.0.2 ships

- **Android: explicit save.** The new local Expo module `apps/mobile/modules/chefer-credentials` (Android only) runs `CredentialManager.createCredential(CreatePasswordRequest(email, password))`, then `AutofillManager.cancel()` so the autofill session can't offer the same credential again.
  - JS: `saveCredentials(email, password)` in `src/features/auth/save-credentials.ts`.
  - Called once, after `setToken`, on a successful email sign-up (V4 `account-v4.tsx`, V3 `register.tsx`) and on a successful sign-in whose password was **typed** (`login.tsx` + `password-entry.ts`; a password-manager fill is already saved).
  - Never called on social sign-in or on a failure. A cancel or error is logged (`[credentials] …` in logcat) and never shown.
  - On a binary without the module (1.0.1), `requireOptionalNativeModule` returns `null` and the call does nothing.
- **iOS: no explicit save.** iOS's own save works with the production entitlements (§11). An explicit `ASCredentialDataManager.save` (iOS 26.2+) or `SecAddSharedWebCredential` would stack a second sheet. The owner's brief said to prefer the implicit prompt and not to stack, so iOS has no module.
  - **Fallback, if §13's iPhone checks A–C still save nothing on 1.0.2:** add an iOS side to the module. Use `ASCredentialDataManager().save(password: ASPasswordCredential(user:password:), for: ASAutoFillURLScope(host: "chefer.duckdns.org"), anchor: window)` on 26.2+, else `SecAddSharedWebCredential(host, email, password)`, never with an empty password.
  - It compiled and ran on the simulator in this round (§11, last row). It needs another binary.
- **Web: unchanged.** Both forms are real `<form onSubmit>` with `autocomplete` `username` / `current-password` / `new-password` and navigate after success. That is the pattern browsers' password managers save from.

## 13. Owner check with the 1.0.2 build

Use a fresh address for each sign-up (`you+f8b@…`, `you+f8c@…`), and delete the test accounts (Profile → Your data → Delete account) and their saved passwords afterwards.

### iPhone

1. **Record the device.** Note the iOS version (Settings → General → About). Then open Settings → General → AutoFill & Passwords and record whether **AutoFill Passwords and Passkeys** is on, and which providers are ticked under "AutoFill From". If **Passwords** is not ticked, tick it for the test and say so.
2. **Install 1.0.2** from TestFlight, open it, and sign out if you're signed in.
3. **A. Strong-password sign-up.**
   - Get started → Continue with email. Type a new address, tap Password, and choose **Use Strong Password**: both fields fill.
   - Tick the box and tap Create account. **Expect no prompt**: iOS saves suggested passwords by itself.
   - Open the Passwords app and search `duckdns`. **Expect a `chefer.duckdns.org` entry with that address.**
4. **B. Typed sign-up.**
   - Sign out and start a new sign-up. Tap Show, then type your own password in both fields.
   - Create account. **Expect one "Save Password?" sheet.** Tap Save and check the Passwords app.
5. **C. Typed sign-in.**
   - Delete B's entry in the Passwords app, sign out, then sign in to B's account by **typing** the email and password.
   - **Expect one "Save Password?" sheet.**
6. **D. Filled sign-in.**
   - Sign out, tap Email on Sign in, and pick the `chefer.duckdns.org` login from the bar above the keyboard (Face ID).
   - **Expect no sheet.**
7. **If A, B or C saves nothing:**
   - Screenshot the sign-up form and the empty Passwords search, and send them with step 1's details.
   - If you can: connect the iPhone to the Mac, open Console.app → your iPhone, start streaming, search `inserted <inet`, repeat the step, and send what appears (nothing appearing is also the answer).
   - That decides between H6's candidates and whether the §12 fallback is needed.

### Android phone

1. **Check the settings.** Settings → Passwords, passkeys & autofill: a Google account is signed in, and Google is the preferred service. In Google Password Manager settings, **Offer to save passwords** is on.
2. **Install the 1.0.2 build** and sign out.
3. **A. Sign-up.** Create an account with an email and password you type. **Expect a "Save password?" sheet** from Google Password Manager showing the address. Tap Save.
4. **B. Typed sign-in.**
   - Remove A's entry from Google Password Manager, sign out, and sign in by typing.
   - **Expect the sheet.** This time tap **Not now**: the app carries on with no error.
5. **C. Filled sign-in.** Sign out, then sign in by picking the saved login that Google suggests above the keyboard. **Expect no sheet.**
6. **D. Wrong password.** Sign in with a wrong password. **Expect "Invalid email or password" and no sheet.**
7. **Google sign-in still works.** Sign out and use Continue with Google. The new module brings `androidx.credentials` 1.6.0 into the build, and Gradle may resolve Google sign-in's copy to that version too.
8. **If A or B shows nothing:** run `adb logcat | grep -E "credentials\]|CredentialManager"` while repeating, and send the output. The app logs `[credentials] save: saved | cancelled | unavailable`.
