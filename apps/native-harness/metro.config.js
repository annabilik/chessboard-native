const fs = require('node:fs');
const path = require('node:path');
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

const appRoot = fs.realpathSync(__dirname);
const packageRoot = fs.realpathSync(
  path.join(appRoot, 'node_modules', '@vibechess', 'chessboard-native'),
);
const packageRelativeToApp = path.relative(appRoot, packageRoot);
const isWorkspaceLink =
  packageRelativeToApp === '..' ||
  packageRelativeToApp.startsWith(`..${path.sep}`) ||
  path.isAbsolute(packageRelativeToApp);
const workspacePnpmStore = path.resolve(
  appRoot,
  '..',
  '..',
  'node_modules',
  '.pnpm',
);
const appNodeModules = path.join(appRoot, 'node_modules');
const workspacePnpmModules = path.join(workspacePnpmStore, 'node_modules');
const runtimePackages = [
  'react',
  'react-native',
  'react-native-gesture-handler',
  'react-native-reanimated',
  'react-native-svg',
  'react-native-worklets',
];

/**
 * A packed install lives inside this app and needs only Metro's defaults. A
 * workspace install points outside the app, so watch that package and pnpm's
 * dependency store while resolving the native runtime exclusively from the
 * harness. The pnpm virtual modules directory remains a fallback for transitive
 * dependencies that the harness does not declare directly. Never add the whole
 * workspace as a watch folder: the packed smoke must not see source-repository
 * files, and this branch is not used for a packed install.
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const config = isWorkspaceLink
  ? {
      watchFolders: [packageRoot, workspacePnpmStore],
      resolver: {
        disableHierarchicalLookup: true,
        nodeModulesPaths: [appNodeModules, workspacePnpmModules],
        extraNodeModules: Object.fromEntries(
          runtimePackages.map((packageName) => [
            packageName,
            path.join(appNodeModules, ...packageName.split('/')),
          ]),
        ),
      },
    }
  : {};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
