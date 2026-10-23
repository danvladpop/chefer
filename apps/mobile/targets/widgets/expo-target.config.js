// WidgetKit extension (@bacons/apple-targets): the gym rest Live Activity
// (lock screen + Dynamic Island, C1) and the Today home-screen widget (C4).
// The widget reads the app's Today snapshot from the app's App Group
// (group.<app id>, app.config.js ios.entitlements), so it gets the same one.
/** @type {import('@bacons/apple-targets/app.plugin').ConfigFunction} */
module.exports = (config) => ({
  type: 'widget',
  name: 'CheferWidgets',
  displayName: 'Chefer',
  bundleIdentifier: '.widgets',
  deploymentTarget: '16.4',
  frameworks: ['SwiftUI', 'WidgetKit', 'ActivityKit', 'AppIntents'],
  colors: {
    // Brand brown (@chefer/tokens primary) and its light-mode surface tint.
    $accent: '#944a00',
    brand: '#944a00',
    brandSoft: '#ffdcc2',
    // Light-only, like the app (UX-X-07): @chefer/tokens canvas / label /
    // labelSecondary (light) for the Today widget.
    surface: '#FAF7F2',
    ink: '#1C1917',
    inkSecondary: '#57534E',
  },
  entitlements: {
    'com.apple.security.application-groups':
      config.ios.entitlements['com.apple.security.application-groups'],
  },
});
