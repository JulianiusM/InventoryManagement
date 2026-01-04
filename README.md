# Inventory Management

A comprehensive inventory management application built with TypeScript, Express, and TypeORM.

## Features

- 📦 **Items** - Catalog items with type, condition, tags, and serial numbers
- 📍 **Locations** - Hierarchical location management (rooms, shelves, boxes, bins)
- 🏷️ **Barcodes** - Map barcodes to items for quick lookup via scanning
- 🤝 **Lending** - Track loans with counterparties, due dates, and condition notes
- 📷 **Scan** - Camera-based barcode/QR code scanning for quick item lookup

## Documentation

Comprehensive documentation is available in the [`docs/`](docs/) directory:

- **[Getting Started Guide](docs/user-guide/GETTING_STARTED.md)** - New user onboarding
- **[Architecture](docs/ARCHITECTURE.md)** - System design and patterns
- **[Development Guide](docs/DEVELOPMENT.md)** - Development workflow
- **[Testing Guide](docs/TESTING_GUIDE.md)** - Testing patterns and best practices
- **[User Guides](docs/user-guide/)** - Feature-specific documentation
- **[AI Agent Guide](AGENTS.md)** - For AI coding assistants

## Quick Start

### Prerequisites

- Node.js 24 or higher
- MariaDB 10.4 or higher
- npm

### Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up your database configuration (see Database Setup below)

4. Build the application:
   ```bash
   npm run build
   ```

5. Start the application:
   ```bash
   npm run run
   ```

## Database Setup

The application requires MariaDB for both development and testing.

### Testing Setup

#### Unit and Integration Tests

Create a `tests/.env.test` file based on `tests/.env.test.example`:

```bash
cp tests/.env.test.example tests/.env.test
```

The test database should be configured with:

- Database name: `inventory_test`
- User: `inventory`
- Password: `inventory`

#### E2E Tests

Create a `.env.e2e` file based on `.env.e2e.example`:

```bash
cp .env.e2e.example .env.e2e
```

The E2E database should be configured with:

- Database name: `inventory_e2e` (must contain 'e2e' for safety)
- User: `inventory`
- Password: `inventory`

## Running Tests

The Inventory Management test suite uses **data-driven** and **keyword-driven** testing approaches for maintainable, reusable, and comprehensive test coverage. 

**Quick Summary:**
- ⭐⭐⭐⭐⭐ Test quality rating: Excellent
- 83 test files with ~5,000+ test cases
- 100% pass rate
- All layers covered (unit, controller, database, frontend, E2E)

See [docs/TESTING_GUIDE.md](docs/TESTING_GUIDE.md) for comprehensive testing documentation and [docs/TEST_REVIEW.md](docs/TEST_REVIEW.md) for detailed quality review.

### Quick Start - One-Click Test Execution

**Run all tests (recommended for CI/verification):**

```bash
npm run test:all
```

This single command will:
1. Install dependencies (if needed)
2. Start MariaDB test container
3. Configure test databases
4. Build the application
5. Run all Jest tests (unit, controller, middleware, database)
6. Prepare and run E2E tests with Playwright
7. Clean up resources

**Options:**
- `npm run test:all -- --skip-deps` - Skip npm install
- `npm run test:all -- --skip-build` - Skip building (use existing build)
- `npm run test:all -- --skip-e2e` - Skip E2E tests

**Run only Jest tests (fast):**

```bash
npm run test:quick
# or
npm test
```

### Test Organization

Tests are organized into:
- **Unit tests** (`tests/unit/`) - Test individual functions in isolation
- **Controller tests** (`tests/controller/`) - Test business logic with mocked services
- **Middleware tests** (`tests/middleware/`) - Test request/response handling
- **Database tests** (`tests/database/`) - Test database operations with real DB
- **E2E tests** (`tests/e2e/`) - Test complete user workflows

Test data is separated into `tests/data/` and reusable test keywords are in `tests/keywords/`.

### Individual Test Commands

**Jest tests:**

```bash
npm test                    # Run all Jest tests
npm run test:watch          # Watch mode for development
npm test -- --coverage      # Run with coverage report
npm run test:debug          # Run with database logging
```

**E2E tests:**

```bash
npm run e2e                 # Run all E2E tests
npm run e2e:headed          # Run with visible browser
npm run e2e:ui              # Run with Playwright UI
```

**Manual E2E setup (if needed):**

```bash
npm run build               # Build application
npm run e2e:prepare         # Initialize E2E database
npx playwright install      # Install browsers (first time)
npm run e2e                 # Run E2E tests
```

### E2E Test Structure

The E2E tests are organized by feature area:

- `auth.test.ts` - Authentication flows (login, registration, password reset, tokens)
- `items.test.ts` - Item management
- `locations.test.ts` - Location management
- `loans.test.ts` - Lending workflow
- `scan.test.ts` - Barcode scanning
- `navigation.test.ts` - UI navigation and accessibility
- `error-handling.test.ts` - Frontend error handling and validation

For detailed E2E test coverage and configuration information, see `tests/e2e/README.md`.

## CI Pipeline

The project includes a GitHub Actions CI pipeline that:

1. Sets up a MariaDB 10.11 service container
2. Creates and configures both test and E2E databases
3. Installs dependencies and builds the application
4. Runs all unit and integration tests
5. Runs Playwright E2E tests
6. Uploads test reports as artifacts

The CI pipeline runs on:

- Push to `main` or `develop` branches
- Pull requests targeting `main` or `develop` branches

### Database Setup in CI

The CI pipeline automatically:

- Creates `inventory_test` database for unit/integration tests
- Creates `inventory_e2e` database for E2E tests
- Sets up required users and permissions
- Initializes the test database schema using `npm run typeorm -- schema:sync`
- Creates `.env.test` and `.env.e2e` files with appropriate credentials

## Development Scripts

- `npm run server:dev` - Run the server in development mode
- `npm run server:client` - Build client-side assets in watch mode
- `npm run server` - Run both server and client in development mode
- `npm run build` - Build the entire application (includes SASS compilation)
- `npm run build:server` - Build server-side code only
- `npm run build:sass` - Compile SASS files to CSS
- `npm run build:client` - Build client-side assets only
- `npm run typeorm` - Run TypeORM migrations
- `npm run generate` - Generate database indexes

## Frontend Architecture

The frontend uses modular TypeScript organized under `src/public/js/` with reusable building blocks:

- **core/** – foundational utilities (HTTP client, navigation helpers, form utilities, formatting, permission loader).
- **shared/** – UI behaviors shared across pages (alerts, drag-and-drop, assignment helpers, inline editing, list actions, UI helpers).
- **modules/** – feature-specific widgets (e.g., timezone-select, entity-select) composed from core/shared pieces.
- **feature files** – page-level scripts such as `activity.ts`, `packing.ts`, and `events.ts` that orchestrate DOM bindings using the shared helpers.

When adding or updating frontend code:

- Reuse the core and shared helpers instead of re-implementing HTTP, drag-and-drop, inline editing, or permission checks.
- Load permissions with `loadPerms()` and gate UI actions using `requireEntityPerm`/`requireItemPerm` before calling protected endpoints.
- Keep new components documented with JSDoc comments and prefer type-safe DOM queries (`querySelector`/`closest` with element type casting) over `any`.
- Expose initialization via `window.InventoryApp.init` for consistent page bootstrapping.
- Use Bootstrap dark theme classes (`text-bg-dark`, `table-dark`, `text-white`, `text-white-50` for muted text).

## Project Structure

- `src/` - Application source code
    - `modules/` - Application modules
    - `migrations/` - Database migrations
    - `public/` - Static assets
    - `views/` - View templates
- `tests/` - Test files
    - `unit/` - Unit tests
    - `controller/` - Controller tests
    - `middleware/` - Middleware tests
    - `database/` - Database integration tests
    - `e2e/` - End-to-end tests
    - `util/` - Test utilities and mocks
- `scripts/` - Utility scripts

## License

Private - All rights reserved