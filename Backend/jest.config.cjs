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
    // TypeScript ESM-style relative specifiers such as
    // `await import('../sharepoint/driveService.js')` (valid in the compiled
    // CommonJS build and under tsx) are not resolved by jest's resolver, which
    // treated the explicit `.js` as a literal missing file. Strip the extension
    // so jest resolves the real `driveService.ts`. Without this, the document
    // reader/download routes cannot be exercised by any test.
    '^(\\.{1,2}/.*)\\.js$': '$1',
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
