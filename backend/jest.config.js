module.exports = {
  testEnvironment: "node",
  setupFilesAfterEnv: ["./tests/setup.js"],
  testMatch: ["**/tests/**/*.test.js"],
  testTimeout: 60000,
  coverageThreshold: {
    global: {
      lines: 65,
      statements: 60,
      functions: 65,
      branches: 45
    },
    "./routes/auth.js": { lines: 80, branches: 70, functions: 75, statements: 75 },
    "./routes/bookings.js": { lines: 75, branches: 65 },
    "./services/matching.js": { lines: 95, branches: 85 },
    "./services/bidding.js": { lines: 95, branches: 85 }
  },
  collectCoverageFrom: [
    "**/*.js",
    "!**/node_modules/**",
    "!**/coverage/**",
    "!**/tests/**",
    "!jest.config.js",
    "!scripts/**"
  ]
};