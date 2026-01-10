# GitHub Copilot Instructions for Inventory Management

This is the main instruction file for GitHub Copilot. Additional detailed guidelines are organized in modular files:

- [Project Overview](copilot/project-overview.md) - Project description and dependencies
- [Code Style Guidelines](copilot/code-style.md) - TypeScript and file organization
- [Database Guidelines](copilot/database-guidelines.md) - Entities, migrations, and database testing
- [Testing Quick Reference](copilot/testing-quick-reference.md) - Testing patterns summary
- [Building and Running](copilot/build-and-run.md) - Development, build, and CI information
- [Common Tasks](copilot/common-tasks.md) - Frequent workflows and security notes

For comprehensive documentation:
- **[docs/README.md](../docs/README.md)** - Documentation index and navigation
- **[docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md)** - System architecture and design
- **[docs/DEVELOPMENT.md](../docs/DEVELOPMENT.md)** - Development workflow
- **[docs/TESTING_GUIDE.md](../docs/TESTING_GUIDE.md)** - Complete testing guide
- **[docs/TEST_REVIEW.md](../docs/TEST_REVIEW.md)** - Test quality review (⭐⭐⭐⭐⭐)
- **[AGENTS.md](../AGENTS.md)** - General AI agent guidance

## Quick Reference

### Project Structure
- `src/modules/` - Application modules (database, user, etc.)
- `src/migrations/` - Database migrations
- `src/controller/` - Business logic controllers
- `src/routes/` - Express routes (page navigation and API)
- `tests/` - All test files (unit, controller, middleware, database, e2e)
- `tests/data/` - Test data files for data-driven testing
- `tests/keywords/` - Test keywords for keyword-driven testing

### Key Principles
1. **TypeScript**: Use strict typing, interfaces over types, async/await
2. **Database**: Always create migrations, never use synchronize in production
3. **Testing**: Use data-driven and keyword-driven approaches (see TESTING.md)
4. **Security**: Never commit secrets, validate all input, hash passwords
5. **Following Directions**: Always follow user directions. If you are not sure, make reasonable assumptions. Interpret requirements conservatively.
6. **Generic approach**: If the user asks you to fix all tests, fix all tests including database and e2e tests. Fix all issues including those that are not influenced or caused by your changes.
7. **Pre-commit requirement**: **ALWAYS run all tests (including database and E2E) before committing. All tests must pass. Fix all test failures, including unrelated ones.**
8. **Dark theme**: All UI pages use Bootstrap dark theme (`text-bg-dark`, `table-dark`, `text-white`, `text-white-50` for muted)

## Testing Approach

The project uses **data-driven** and **keyword-driven** testing approaches. For complete details, see [TESTING.md](../TESTING.md).

### Quick Summary

**Test Structure:**
- Test data in `tests/data/<type>/` - Separated from logic
- Test keywords in `tests/keywords/<type>/` - Reusable actions
- Test files in `tests/<type>/` - Focus on test flow

**Writing Tests:**
```typescript
// Import data and keywords
import { testData } from '../data/controller/featureData';
import { setupMock, verifyResult } from '../keywords/common/controllerKeywords';

// Data-driven test
test.each(testData)('$description', async (testCase) => {
    setupMock(service.method, testCase.expected);
    const result = await controller.method(testCase.input);
    verifyResult(result, testCase.expected);
});
```

**Test Types:**
- **Unit tests** (`tests/unit/`) - Individual functions, mocked dependencies
- **Controller tests** (`tests/controller/`) - Business logic, mocked services
- **Middleware tests** (`tests/middleware/`) - Request/response handling
- **Database tests** (`tests/database/`) - Real database operations
- **E2E tests** (`tests/e2e/`) - Complete user workflows with Playwright

See [Testing Quick Reference](copilot/testing-quick-reference.md) for more details.

## E2E Testing Patterns

E2E tests follow the same data-driven and keyword-driven patterns. Key points:

- **Test data**: All constants (URLs, selectors, messages) in `tests/data/e2e/*.ts`
- **Keywords**: Reusable actions in `tests/keywords/e2e/*.ts`
  - `authKeywords.ts` - Authentication (login, register, verify)
  - `entityKeywords.ts` - Entity management (create, navigate, verify)
  - `navigationKeywords.ts` - Navigation (links, pages, titles)
  - `validationKeywords.ts` - Validation (errors, fields, alerts)
  - `dbKeywords.ts` - Database helpers (tokens, queries)
- **For-loop pattern**: Use `for (const data of testData)` to iterate test cases
- **Zero hardcoded strings**: All constants externalized to data files

**Example:**
```typescript
// Import data and keywords
import { surveyCreationData } from '../data/e2e/surveyData';
import { loginUser } from '../keywords/e2e/authKeywords';
import { createSurvey } from '../keywords/e2e/entityKeywords';

// Data-driven test
for (const data of surveyCreationData) {
    test(data.description, async ({ page }) => {
        await loginUser(page, testCredentials.username, testCredentials.password);
        await page.goto(data.createUrl);
        await createSurvey(page, data.title, data.description, data.submitButtonText);
        await page.waitForURL((url) => data.expectedRedirectPattern.test(url.pathname));
    });
}
```

**E2E Test Organization:**
- `auth.test.ts` - Authentication and session management
- `survey.test.ts` / `packing.test.ts` / `activity.test.ts` / `drivers.test.ts` - Entity management
- `navigation.test.ts` - UI navigation and accessibility
- `error-handling.test.ts` - Frontend validation and error scenarios

**Important E2E Guidelines:**
- Use Playwright test framework
- Mock OIDC for frontend testing (no real authentication)
- Use `.env.e2e` configuration
- Tests run against built application
- Clear cookies/session in `test.beforeEach`
- Use keywords for common operations
- Test both positive and negative paths

For detailed E2E testing patterns and examples, see [TESTING.md](../TESTING.md) and [tests/e2e/README.md](../tests/e2e/README.md).

## Games Module Architecture

The Games module supports managing game titles, releases, and copies with external provider integration.

### Connectors

Connectors sync game libraries from external providers like Steam or Playnite.

**Architecture:**
```
src/modules/games/connectors/
├── ConnectorInterface.ts      # Generic interfaces
├── ConnectorRegistry.ts       # Connector registration
├── SteamConnector.ts          # Steam (fetch-style)
└── playnite/                  # Playnite (push-style aggregator)
    ├── PlayniteConnector.ts
    ├── PlayniteImportService.ts
    └── PlayniteProviders.ts
```

**Connector Types:**
- **Fetch-style** (`syncStyle: 'fetch'`): Connector pulls data from external API (e.g., Steam)
- **Push-style** (`syncStyle: 'push'`): External agent pushes data via unified API (e.g., Playnite)

**Aggregator Pattern:**
Aggregators like Playnite import games from multiple sources while preserving original provider info:
- `aggregatorProviderId`: The aggregator (e.g., "playnite")
- `originalProviderName`: The actual source (e.g., "Steam", "Epic")
- `originalProviderGameId`: The game ID on the original provider

**Push Import Flow:**
```
Device Token → requirePushConnectorAuth → processPushImport()
                                              │
                    ├── connector.preprocessImport()   ← Connector-specific validation
                    ├── processGamesWithAutoCreate()   ← Shared sync pipeline
                    └── softRemoveUnseenEntries()      ← Shared soft-removal
```

### Platform Normalization

Platforms are normalized to prevent duplicates (e.g., "PS5" → "PlayStation 5"):
- `normalizePlatformName()` in `PlatformService.ts` (sync fallback)
- `normalizePlatformNameWithDb()` in `PlatformService.ts` (async, uses database aliases)
- User-defined aliases stored in Platform entity `aliases` column (comma-separated)
- Unknown platforms are auto-created

### Game Title Merging

Game titles with different editions merge to the same title with different releases:
- `extractEdition()` in `GameNameUtils.ts` extracts edition from game name
- `normalizeGameTitle()` handles trademark symbols (™®©), punctuation variants
- `getOrCreateGameTitle()` finds existing titles by normalized name
- Example: "The Sims 4", "The Sims™ 4", "The Sims 4 Premium Edition" → same title

### Smart Sync

Syncs are optimized to skip unnecessary processing:
- Pre-fetch existing items before processing
- Games with existing copies only update playtime/status (skip metadata)
- Metadata enrichment only for NEW games
- Reduces API calls and sync duration

### Metadata Provider Architecture

Metadata providers are standardized with centralized rate limiting:
- Providers implement `getCapabilities()` and `getRateLimitConfig()`
- `MetadataFetcher` class in `GameSyncService.ts` handles rate limiting
- Two metadata runs: general info from primary provider, player counts from IGDB
- Provider fallback on 429 rate limit (IGDB → RAWG)

### Key Entities
- **GameTitle**: A game's core info (name, description, player counts)
- **GameRelease**: Platform-specific release (PC, PS5, etc. with edition/region)
- **Item** (with `type=GAME_DIGITAL` or `GAME_PHYSICAL`): Game copies
- **ExternalAccount**: Linked external accounts (Steam, Playnite, etc.)
- **ConnectorDevice**: Devices for push-style connectors
- **SyncJob**: Tracks sync history (pending, in_progress, completed, failed)
- **Platform**: Game platforms with user-defined aliases for normalization

## Additional Resources
