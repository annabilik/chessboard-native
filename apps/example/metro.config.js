const path = require('node:path');

const { getDefaultConfig } = require('expo/metro-config');
const { withStorybook } = require('@storybook/react-native/withStorybook');

const config = getDefaultConfig(__dirname);

module.exports = withStorybook(config, {
  configPath: path.resolve(__dirname, '.rnstorybook'),
  docTools: false,
  liteMode: true,
});
