/// <reference types="@storybook/react-native/metro-env" />

// Storybook's Metro declarations augment NodeJS.Require/Module, while the
// Node declarations currently expose the globals through these legacy names.
// Bridge them without editing the generated storybook.requires.ts file.
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- Intentional declaration merging for React Native's legacy require global.
interface NodeRequire extends __MetroModuleApi.RequireFunction {}

interface NodeModule {
  hot?: __MetroModuleApi.Hot;
}
