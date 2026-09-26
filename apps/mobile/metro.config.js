// Monorepo-aware Metro config: watch the workspace root so @chefer/* packages
// (which export raw TypeScript) resolve and hot-reload, and let Metro fall
// back to the root node_modules for hoisted dependencies.
const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// Runtime singletons MUST resolve to the app's own copy. Workspace packages
// (@chefer/ui-mobile) have their own devDependency copies, and pnpm can pick a
// different peer variant for them (e.g. nativewind built against another
// react-native-worklets) — a second react-native-css-interop instance then
// breaks context lookups ("Couldn't find a navigation context", 2026-09-24).
const SINGLETONS = [
  'react',
  'react-native',
  'nativewind',
  'react-native-css-interop',
  'react-native-reanimated',
  'react-native-worklets',
  'expo-haptics',
  'react-native-safe-area-context',
  'react-native-svg',
  'react-native-screens',
  '@react-navigation/native',
  'expo-router',
];
const upstreamResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const isSingleton = SINGLETONS.some(
    (name) => moduleName === name || moduleName.startsWith(`${name}/`),
  );
  const ctx = isSingleton
    ? { ...context, originModulePath: path.join(projectRoot, 'package.json') }
    : context;
  return (upstreamResolveRequest ?? context.resolveRequest)(ctx, moduleName, platform);
};

module.exports = withNativeWind(config, { input: './global.css' });
