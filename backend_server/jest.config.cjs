module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    testPathIgnorePatterns: ['/node_modules/', '/dist/'],
    collectCoverageFrom: ['src/**/*.ts', '!src/index.ts'],
    transformIgnorePatterns: ['/node_modules/(?!uuid)'],
    transform: {
        '^.+\\.tsx?$': ['ts-jest', {
            tsconfig: {
                module: 'commonjs',
                moduleResolution: 'node',
                esModuleInterop: true,
                allowSyntheticDefaultImports: true,
                allowImportingTsExtensions: true,
                verbatimModuleSyntax: false,
                isolatedModules: true,
            },
        }],
    },
};

