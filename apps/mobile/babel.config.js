// babel-preset-expo and @babel/plugin-transform-react-jsx (named by string in
// NativeWind's css-interop preset) MUST stay direct devDependencies: release
// builds bundle via a bare `node …/@expo/cli` call from Gradle/Xcode, without
// the NODE_PATH that pnpm's `expo` shim adds — plan §5 gotcha 9.
module.exports = function (api) {
  api.cache(true);
  return {
    presets: [['babel-preset-expo', { jsxImportSource: 'nativewind' }], 'nativewind/babel'],
  };
};
