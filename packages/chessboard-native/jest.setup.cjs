jest.mock('react-native-worklets', () =>
  require('react-native-worklets/lib/module/mock'),
);

require('react-native-gesture-handler/jestSetup');

const { setUpTests } = require('react-native-reanimated');

setUpTests();
