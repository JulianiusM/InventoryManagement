# Testing Quick Reference

For comprehensive testing guidelines, see [TESTING.md](../../TESTING.md).

## Quick Start

**Run all tests (one command):**

```bash
npm run test:all
```

This automatically sets up database, builds, and runs all tests (Jest + E2E).

**Run only Jest tests (fast):**

```bash
npm test
# or
npm run test:quick
```

**Options for test:all:**
- `--skip-deps` - Skip npm install
- `--skip-build` - Skip building
- `--skip-e2e` - Skip E2E tests

## Overview

The project uses **data-driven** and **keyword-driven** testing approaches.

- **Test data** is separated into `tests/data/` directory organized by test type
- **Test keywords** (reusable actions) are in `tests/keywords/` directory
- **Test builders** for creating test objects are in `tests/data/builders/`

## Test Organization

- Place unit tests in `tests/unit/`
- Place controller tests in `tests/controller/`
- Place middleware tests in `tests/middleware/`
- Place database integration tests in `tests/database/`
- Place E2E tests in `tests/e2e/`

## Writing Tests

- **Use data-driven tests**: Externalize test data into data files, use `test.each()` for parameterized tests
- **Use test keywords**: Leverage reusable keywords from `tests/keywords/` for common operations
- **Use builders**: Use test data builders from `tests/data/builders/` for creating test objects
- **Separate concerns**: Test data in `tests/data/`, test logic in test files, test utilities in keywords
- **Mock wisely**: Mock external dependencies using existing mock utilities in `tests/util/`
- **Database tests**: Must use the MariaDB test datasource mock
- **E2E tests**: Must use the `.env.e2e` configuration

## Test Data Guidelines

- Create test data files in `tests/data/<type>/` matching the test file name
- Export arrays of test cases with descriptive names
- Include both success and failure scenarios
- Cover edge cases and boundary conditions
- Use test builders for complex objects

## Test Keywords Guidelines

- Create keywords in `tests/keywords/<type>/` for reusable test actions
- Use clear, action-oriented names (create*, verify*, setup*, expect*)
- Keywords should be composable and single-purpose
- Return useful data to enable further assertions
- Handle errors gracefully within keywords
