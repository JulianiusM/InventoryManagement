# AI Agent Guide for Inventory Management

This document provides guidance for AI coding agents working on the Inventory Management project. Whether you're using GitHub Copilot, Cursor, Claude, or another AI assistant, this guide will help you understand the project structure and conventions.

## Project Overview

Inventory Management is a TypeScript-based item cataloging and tracking application with comprehensive testing and documentation. The project uses:

- **Backend**: Express.js + TypeORM + MariaDB
- **Frontend**: Pug templates + Bootstrap (dark theme) + Vanilla TypeScript
- **Testing**: Jest (unit/integration) + Playwright (E2E) + MSW (frontend mocking)
- **Language**: TypeScript with strict type checking
- **Testing Approach**: Data-driven and keyword-driven patterns

### Core Features

- **Items**: Catalog items with type, condition, tags, serial numbers, and barcodes
- **Locations**: Hierarchical location management (rooms, shelves, boxes, bins)
- **Barcodes**: Map barcodes/QR codes to items for quick lookup via camera scanning
- **Lending**: Track loans with counterparties, due dates, and condition notes
- **Scanning**: Camera-based barcode/QR code scanning using ZXing library

## Quick Start for AI Agents

1. **Read the documentation first**: 
   - [README.md](README.md) - Project setup and quick start
   - [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) - System architecture and design
   - [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) - Development workflow and guidelines
   - [docs/TESTING_GUIDE.md](docs/TESTING_GUIDE.md) - Comprehensive testing guide
   - [.github/copilot-instructions.md](.github/copilot-instructions.md) - GitHub Copilot-specific instructions

2. **Understand the documentation structure**:
   - **Developer docs**: `docs/` directory - architecture, development, testing
   - **User guides**: `docs/user-guide/` - end-user documentation
   - **AI-specific**: `.github/copilot-instructions.md` and this file

3. **Understand the testing approach**:
   - All tests use **data-driven** and **keyword-driven** patterns
   - Test data externalized to `tests/data/`
   - Reusable keywords in `tests/keywords/`
   - See [docs/TESTING_GUIDE.md](docs/TESTING_GUIDE.md) for comprehensive patterns
   - Test quality is excellent (see [docs/TEST_REVIEW.md](docs/TEST_REVIEW.md))

4. **Follow the conventions**:
   - TypeScript for all code
   - Async/await over promises
   - Interfaces over types
   - Always create migrations for database changes
   - Data-driven testing for all new tests
   - Use centralized settings module for all configuration constants
   - NEVER commit anything included in .gitignore, especially not generated files (like __index__.ts, *.gen.js, ...)

## Configuration Management

All configuration constants are centralized in `src/modules/settings.ts`:
- Token expiration times
- Rate limiting parameters
- Pagination defaults and limits
- Description length constraints
- Metadata scoring thresholds
- Similar title matching parameters

**Always use** `settings.value.<propertyName>` instead of hardcoded values.

## Key Directories

```
inventory-management/
├── docs/                # Documentation
│   ├── README.md            # Documentation index
│   ├── ARCHITECTURE.md      # System architecture
│   ├── DEVELOPMENT.md       # Development guide
│   ├── TESTING_GUIDE.md     # Testing documentation
│   ├── TEST_REVIEW.md       # Test quality review
│   ├── FRONTEND_TESTING.md  # Frontend testing guide
│   ├── user-guide/          # End-user documentation
│   └── archive/             # Historical documents
├── src/
│   ├── controller/      # Business logic controllers
│   ├── middleware/      # Express middleware
│   ├── migrations/      # TypeORM database migrations
│   ├── modules/         # Application modules
│   │   ├── database/    # Database entities and services
│   │   └── lib/         # Utility libraries
│   ├── public/          # Static assets
│   │   ├── js/          # Client-side TypeScript
│   │   │   ├── core/    # Core utilities
│   │   │   ├── shared/  # Shared UI behaviors
│   │   │   └── modules/ # Feature widgets
│   │   └── style/       # SASS stylesheets
│   ├── routes/          # Express routes
│   ├── views/           # Pug templates
│   └── server.ts        # Application entry point
├── tests/
│   ├── client/          # Frontend tests (Jest + MSW)
│   ├── controller/      # Controller tests
│   ├── database/        # Database integration tests
│   ├── e2e/             # End-to-end tests (Playwright)
│   ├── middleware/      # Middleware tests
│   ├── unit/            # Backend unit tests
│   ├── data/            # Test data (data-driven testing)
│   ├── keywords/        # Test keywords (keyword-driven testing)
│   └── util/            # Test utilities and mocks
└── scripts/             # Build and utility scripts
```

## Coding Conventions

### TypeScript

```typescript
// ✅ Good: Async/await
async function getUser(id: number): Promise<User> {
    return await userRepository.findOne({ where: { id } });
}

// ❌ Bad: Promises
function getUser(id: number): Promise<User> {
    return userRepository.findOne({ where: { id } }).then(user => user);
}

// ✅ Good: Interface
interface CreateUserDto {
    username: string;
    email: string;
    password: string;
}

// ❌ Bad: Type (for object shapes)
type CreateUserDto = {
    username: string;
    email: string;
    password: string;
};
```

### Database

```typescript
// ✅ Good: Always create migrations
// 1. Create migration file in src/migrations/
// 2. Define up() and down() operations
// 3. Test both directions

// ❌ Bad: Never use synchronize in production
{
    synchronize: true  // DON'T DO THIS
}

// ✅ Good: Timezone-aware dates
@CreateDateColumn({ type: 'datetime', precision: 0, default: () => 'CURRENT_TIMESTAMP' })
createdAt: Date;
```

### Testing

```typescript
// ✅ Good: Data-driven test
import { loginTestData } from '../data/controller/authData';

test.each(loginTestData)('$description', async ({ input, expected }) => {
    const result = await login(input);
    expect(result).toEqual(expected);
});

// ❌ Bad: Hard-coded test data
test('logs in user', async () => {
    const result = await login({ username: 'test', password: 'pass123' });
    expect(result).toBeDefined();
});

// ✅ Good: Keyword-driven test
import { loginUser, verifyDashboard } from '../keywords/e2e/authKeywords';

test('successful login shows dashboard', async ({ page }) => {
    await loginUser(page, 'testuser', 'password');
    await verifyDashboard(page);
});

// ❌ Bad: Inline test actions
test('successful login shows dashboard', async ({ page }) => {
    await page.goto('/users/login');
    await page.fill('input[name="username"]', 'testuser');
    await page.fill('input[name="password"]', 'password');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL('/users/dashboard');
});
```

## Common Tasks

### Adding a New Feature

1. **Plan the feature**:
   - Identify required database changes
   - Design the API/controller interface
   - Plan test coverage

2. **Database changes** (if needed):
   ```bash
   # Create migration
   npm run typeorm migration:create src/migrations/AddFeatureName
   
   # Edit migration file
   # Test migration
   npm run typeorm migration:run
   npm run typeorm migration:revert
   ```

3. **Implement the feature**:
   - Create/update entities in `src/modules/database/entities/`
   - Create service layer in module
   - Create controller endpoints
   - Add validation and error handling

4. **Write tests** (in order):
   - Unit tests for business logic
   - Controller tests for orchestration
   - Database tests for data operations
   - E2E tests for user workflows

5. **Update documentation**:
   - Update README.md if user-facing
   - Update TESTING.md if new patterns introduced
   - Add comments for complex logic

### Writing Tests

**Always use the data-driven and keyword-driven approach:**

1. **Create test data**:
   ```typescript
   // tests/data/controller/featureData.ts
   export const createFeatureData = [
       {
           description: 'creates feature with valid input',
           input: { name: 'Test', value: 42 },
           expected: { id: 'feature-123', name: 'Test', value: 42 },
       },
       // More test cases...
   ];
   ```

2. **Create/reuse keywords**:
   ```typescript
   // tests/keywords/common/controllerKeywords.ts
   export function setupMock(mockFn: jest.Mock, returnValue: any): void {
       mockFn.mockResolvedValue(returnValue);
   }
   ```

3. **Write the test**:
   ```typescript
   // tests/controller/feature.test.ts
   import { createFeatureData } from '../data/controller/featureData';
   import { setupMock, verifyResult } from '../keywords/common/controllerKeywords';
   
   test.each(createFeatureData)('$description', async (testCase) => {
       setupMock(service.create, testCase.expected);
       const result = await controller.create(testCase.input);
       verifyResult(result, testCase.expected);
   });
   ```

### Fixing a Bug

1. **Write a failing test** that reproduces the bug
2. **Fix the bug** with minimal changes
3. **Verify the test passes**
4. **Run full test suite** to ensure no regressions
5. **Update documentation** if the bug revealed unclear behavior

## Testing Requirements

### Test Coverage

- **Unit tests**: All business logic functions
- **Controller tests**: All endpoints and validation
- **Middleware tests**: All authentication and authorization
- **Database tests**: All CRUD operations and complex queries
- **E2E tests**: All user-facing workflows

### Test Organization

- Place test files in appropriate directory (`tests/unit/`, `tests/controller/`, etc.)
- Create test data in `tests/data/<type>/` matching test file name
- Use or create keywords in `tests/keywords/<type>/`
- Mock external dependencies (database in unit/controller, OIDC, email)

### E2E Test Specifics

- **Authentication**: Use `loginUser()` keyword, not inline login
- **Navigation**: Use `navigateToEntityCreatePage()` and similar keywords
- **Validation**: Use `verifyErrorMessage()`, `verifyFieldRequired()` keywords
- **Database**: Use `dbKeywords.ts` for token/query helpers
- **Data**: Externalize ALL constants (URLs, selectors, messages) to data files

## Environment Setup

### Development

```bash
npm install
npm run build
npm run server  # Runs server + client watch
```

### Testing

**Quick start - run all tests:**

```bash
npm run test:all
```

This one command sets up everything and runs all tests (Jest + E2E). Perfect for CI or comprehensive testing.

**Options:**
- `npm run test:all -- --skip-deps` - Skip npm install
- `npm run test:all -- --skip-build` - Skip building
- `npm run test:all -- --skip-e2e` - Skip E2E tests

**Individual test commands:**

```bash
# Jest tests only (fast)
npm test
npm run test:quick

# E2E tests only (requires build + database)
npm run build
npm run e2e:prepare
npm run e2e
```

### Database

Tests use two databases:
- `inventory_test` - Unit and integration tests
- `inventory_e2e` - E2E tests (name must contain 'e2e')

Configuration:
- `tests/.env.test` - Unit/integration test config
- `.env.e2e` - E2E test config

The `test:all` script automatically sets up and configures both databases.

## CI/CD

The project uses GitHub Actions for CI:
- Runs on push/PR to main branches
- Sets up MariaDB 10.11
- Runs all tests (Jest + Playwright)
- Uploads coverage and test reports

See `.github/workflows/ci.yml` for details.

## Security Considerations

- **Never commit secrets**: Use environment variables
- **Hash passwords**: Use bcryptjs
- **Validate input**: Use express-validator
- **Sanitize output**: Escape user content in views
- **Update dependencies**: Keep packages current
- **Review changes**: Run security scans before committing

## Best Practices for AI Agents

1. **Understand before coding**: Read existing code to understand patterns
2. **Maintain consistency**: Follow existing conventions and styles
3. **Test thoroughly**: Write tests for all changes
4. **Document clearly**: Update docs when adding features or patterns
5. **Ask when unclear**: If requirements are ambiguous, ask for clarification
6. **Minimize changes**: Make the smallest change that solves the problem
7. **Verify correctness**: Run linters, tests, and build before committing

## Common Pitfalls

❌ **Don't**:
- Use `synchronize: true` in database config
- Hard-code test data in test files
- Duplicate test actions instead of using keywords
- Skip writing tests
- Ignore TypeScript errors
- Commit environment files (`.env`, `.env.e2e`)
- Mix inline styles/scripts in Pug templates
- Use `any` type excessively

✅ **Do**:
- Create migrations for schema changes
- Externalize test data to data files
- Use keywords for reusable test actions
- Write tests for all code changes
- Fix TypeScript errors
- Use environment variables for config
- Keep presentation logic in templates, business logic in controllers
- Use proper TypeScript types

## Getting Help

- **Documentation**: Check README.md, TESTING.md, and this file first
- **Examples**: Look at existing code for patterns
- **Tests**: Existing tests show correct usage patterns
- **Comments**: Code comments explain complex logic

## Agent-Specific Notes

### GitHub Copilot
See [.github/copilot-instructions.md](.github/copilot-instructions.md) for Copilot-specific instructions and patterns.

### Other AI Agents
This file serves as the primary guide. Read it along with:
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for system design
- [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) for development workflow
- [docs/TESTING_GUIDE.md](docs/TESTING_GUIDE.md) for testing patterns
- Existing code for implementation examples

## Documentation Structure

Inventory Management has comprehensive, well-organized documentation:

### For Developers
- **[docs/README.md](docs/README.md)** - Documentation navigation
- **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** - System architecture
- **[docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)** - Development workflow
- **[docs/TESTING_GUIDE.md](docs/TESTING_GUIDE.md)** - Testing documentation
- **[docs/TEST_REVIEW.md](docs/TEST_REVIEW.md)** - Test quality review (⭐⭐⭐⭐⭐)
- **[docs/FRONTEND_TESTING.md](docs/FRONTEND_TESTING.md)** - Frontend testing

### For End Users
- **[docs/user-guide/](docs/user-guide/)** - Complete user documentation
  - Getting started, dashboard, items, locations, loans, scanning

### For AI Agents
- **This file** - General AI agent guidance
- **[.github/copilot-instructions.md](.github/copilot-instructions.md)** - Copilot-specific
- **[.github/copilot/](..github/copilot/)** - Modular Copilot guidelines

## Contributing Guidelines

When making changes:

1. **Analyze**: Understand the problem and existing code
2. **Plan**: Outline your approach
3. **Implement**: Make minimal, focused changes
4. **Test**: Write/update tests, verify all tests pass
5. **Document**: Update documentation if needed
6. **Review**: Check code quality, security, and best practices

## Version Information

- **Node.js**: >= 24
- **TypeScript**: Latest stable
- **MariaDB**: >= 10.4
- **Playwright**: Latest stable
- **Jest**: Latest stable

For license information, see [README.md](README.md).
