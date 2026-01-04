// tests/jest.setup.ts
import 'reflect-metadata';

require('ts-node').register({project: 'tsconfig.test.json', transpileOnly: true});
process.env.NODE_ENV = 'test';
