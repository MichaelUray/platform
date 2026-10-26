module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/?(*.)+(spec|test).[jt]s?(x)'],
  transform: {
    '^.+\\.tsx?$': 'ts-jest',
    '^.+\\.(js|svelte)$': '<rootDir>/svelte-jest-transformer.js'
  },
  transformIgnorePatterns: ['node_modules/(?!(?:\\.pnpm/)?svelte(?:/|@))'],
  moduleNameMapper: {
    '^\\./TagsPopup\\.svelte$': '<rootDir>/src/__tests__/fixtures/TagsPopupStub.svelte',
    '^\\./TagsEditor\\.svelte$': '<rootDir>/src/__tests__/fixtures/TagsEditorStub.svelte'
  }
}
