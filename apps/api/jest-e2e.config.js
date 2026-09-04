// apps/api/jest-e2e.config.js
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testEnvironment: 'node',
  // Serialize e2e specs: they all hit one shared Postgres DB and several share seed users
  // (finance.employee / eng.employee lockout + credential rows across vault.reauth,
  // vault.credentials, credential-launch). Parallel workers let one suite's create/delete
  // land inside another's assertion window. In-band eliminates the whole race class.
  maxWorkers: 1,
  testRegex: '\\.e2e-spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
};
