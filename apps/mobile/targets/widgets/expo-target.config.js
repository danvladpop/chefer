// WidgetKit extension (@bacons/apple-targets): the gym rest Live Activity
// (lock screen + Dynamic Island, C1). One extension, so the home-screen widget
// (C4) joins this bundle instead of adding a second target.
/** @type {import('@bacons/apple-targets/app.plugin').Config} */
module.exports = {
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
  },
};
