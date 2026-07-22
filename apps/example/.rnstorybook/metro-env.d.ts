/// <reference types="@storybook/react-native/metro-env" />

// Storybook's Metro declarations augment NodeJS.Require/Module, while the
// Node declarations currently expose the globals through these legacy names.
// Bridge them without editing the generated storybook.requires.ts file.
type NodeRequire = __MetroModuleApi.RequireFunction;

interface NodeModule {
  hot?: __MetroModuleApi.Hot;
}
