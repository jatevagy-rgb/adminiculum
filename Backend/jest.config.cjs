module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/tests/**/*.test.ts'],
  clearMocks: true,
  // Frontend-source interop tests (documentEditorDocxInterop, documentEditorReviewQuality)
  // import Frontend/src/lib/editor modules that `require('jszip')`. The backend job
  // installs only Backend dependencies, so jest and ts-jest must resolve jszip from
  // the backend's own node_modules instead of the (absent) Frontend node_modules.
  moduleNameMapper: {
    '^jszip$': '<rootDir>/node_modules/jszip',
  },
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: {
          ...require('./tsconfig.json').compilerOptions,
          baseUrl: './src',
          paths: {
            '@/*': ['./*'],
            jszip: ['../node_modules/jszip'],
          },
        },
      },
    ],
  },
};