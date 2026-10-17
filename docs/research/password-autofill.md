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

- **Strong passwords need an association.** [About the Password AutoFill workflow](https://developer.apple.com/documentation/security/about-the-password-autofill-workflow) says: "The system suggests a strong, unique password in apps that have an associated domain. It also saves any new credentials." So if iOS suggests a strong password, the association already works. That rules out "missing entitlement" as the cause of F8.
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

| #   | Hypothesis                                                                                     | Prediction                                                                                 | Verdict                                                                                                                                                                                                                                      |
| --- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| H1  | The account field is tagged `emailAddress`, so iOS has no `username` to pair with the password | With `username`, iOS offers to save, or saves the accepted strong password under the email | **Most likely, and fixed.** Apple's text-field and HTML guidance and WWDC18 all say `username` (plus the email keyboard). Shipped in `EMAIL_FIELD_PROPS`, and on web as `autocomplete="username"`. Needs the owner's device to confirm (§9). |
| H4  | The build lacks the `webcredentials` entitlement                                               | With no association, there would be no strong-password suggestion either                   | **Ruled out.** The owner sees a strong password, and Apple only suggests one "in apps that have an associated domain". `eas.json` production sets `EXPO_PUBLIC_API_URL`, and Apple's CDN serves our AASA.                                    |
| H3  | The fields never leave the view hierarchy after sign-up                                        | Explicitly dismissing the screen would bring the prompt back                               | **Unlikely.** `setToken` flips `Stack.Protected guard={token === null}` (`app/_layout.tsx`), which drops the whole `(auth)` group. Nothing clears the fields before that.                                                                    |
| H2  | The Show toggle flips `secureTextEntry`, so iOS loses the password context                     | The prompt would appear only when Show is never tapped                                     | **Unlikely.** Both fields keep an explicit `textContentType`, which Apple says is exactly what keeps the context when text is shown in plain text. §9 step 9 covers it.                                                                      |

**Simulator and emulator check (dev variant, local API, 2026-10-17).**

- **iOS 26.5, iPhone 17 Pro simulator.** The V4 form shows Email, Password and Confirm password. One Show reveals both fields. A mismatch shows "Passwords do not match", which clears as soon as the passwords match. The confirm key reads Go, and sign-up lands on onboarding.
- **What the simulator can't show.** The dev variant has no associated domain and uses `oneTimeCode`, so it can't show the strong-password or Keychain behaviour. That is the owner's check (§9).
- **Android, Pixel_8 emulator with Google Autofill and a signed-in Google account.** The same F9 behaviour works, but Google offered no save after sign-up.
  - `adb shell dumpsys autofill` shows the app's session with `mSaveOnAllViewsInvisible: false`, so the save would need an activity finish or `AutofillManager.commit()`. React Native sends neither.
  - That confirms §6: a guaranteed save on Android needs a native change.

**OTA or binary: OTA.** The fix only changes JS props on existing `TextInput`s. It needs no `app.config.js` or entitlement change. Android save is the exception: guaranteeing it would take Credential Manager, a native module, so a new binary (§6).

## 9. Owner check on iPhone (production build)

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
