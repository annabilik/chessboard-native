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

/**
 * A packed install lives inside this app and needs only Metro's defaults. A
 * workspace install points outside the app, so watch that package alone and
 * resolve its peers from the harness. Never add the whole workspace as a
 * watch folder: the packed smoke must not see source-repository files.
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const config = isWorkspaceLink
  ? {
      watchFolders: [packageRoot],
      resolver: {
        nodeModulesPaths: [path.join(appRoot, 'node_modules')],
      },
    }
  : {};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
