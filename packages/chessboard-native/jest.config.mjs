export default {
  clearMocks: true,
  collectCoverageFrom: ['src/**/*.{ts,tsx}'],
  coverageDirectory: '<rootDir>/../../coverage/unit',
  coverageReporters: ['text', 'json-summary', 'lcov'],
  preset: 'jest-expo',
  restoreMocks: true,
  roots: ['<rootDir>/src', '<rootDir>/tests'],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.cjs'],
  testMatch: ['**/*.test.{ts,tsx}'],
};
