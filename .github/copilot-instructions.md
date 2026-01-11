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

### Sync Architecture (CRITICAL)

The sync pipeline is **modular and unified**. All connectors (fetch-style and push-style) use the SAME processing logic.

**Key File Structure:**
```
src/modules/games/
├── sync/
│   ├── GameProcessor.ts       # SINGLE implementation for game processing
│   ├── MetadataPipeline.ts    # THE UNIFIED IMPLEMENTATION - composable pipeline with modular steps:
│   │                          #   - Core Steps: searchProvider(), fetchFromProvider(), enrichPlayerCounts(), applyToTitle()
│   │                          #   - High-level: processGame(), processGameBatch(), searchOptions()
│   │                          #   - Both manual and batch operations use the SAME core steps
│   └── MetadataFetcher.ts     # Backwards-compatible wrapper around MetadataPipeline
├── GameSyncService.ts         # Orchestration and scheduling
├── GameNameUtils.ts           # Edition extraction and title normalization
├── connectors/                # External connector implementations
└── metadata/                  # Metadata provider implementations (providers only, no services)

src/controller/games/          # Modular controller structure
├── gameTitleController.ts     # Title operations and metadata (uses MetadataFetcher)
├── gameReleaseController.ts   # Release operations
├── gameCopyController.ts      # Copy/item operations
├── gameAccountController.ts   # External account and sync operations
├── gameMappingController.ts   # Mapping queue operations
├── gamePlatformController.ts  # Platform operations
├── gameJobsController.ts      # Job listing operations
├── helpers.ts                 # Shared utility functions
└── index.ts                   # Module exports
```

**Critical Design Rules:**
1. BOTH fetch-style and push-style connectors use `processGameBatch()` from `GameProcessor.ts` - NO duplicate implementations
2. ALL metadata operations use the unified `MetadataPipeline.ts` - ONE implementation with modular, composable steps
3. Edition extraction is ALWAYS performed in `createGameFromData()`
4. DRY principle enforced: batch processing is just multiple single-game operations with shared state

**Metadata Pipeline Architecture:**
```
                    ┌─────────────────────────────────────────────┐
                    │           MetadataPipeline                  │
                    │                                             │
                    │   CORE STEPS (reusable building blocks):    │
                    │   ├── searchProvider()                      │
                    │   ├── fetchFromProvider()                   │
                    │   ├── enrichPlayerCounts()                  │
                    │   └── applyToTitle()                        │
                    │                                             │
                    │   HIGH-LEVEL OPERATIONS (compose steps):    │
                    │   ├── processGame()      ← Manual sync      │
                    │   ├── processGameBatch() ← Batch sync       │
                    │   └── searchOptions()    ← Search UI        │
                    └─────────────────────────────────────────────┘
                                      ↑
                    ┌─────────────────┴─────────────────┐
                    │                                   │
             Manual Operations                   Sync Operations
         (gameTitleController)                (GameSyncService)
                    │                                   │
                    └───── SAME core steps ─────────────┘
```

**Processing Flow:**
```
Connector (fetch/push) → processGameBatch() → safeCreateGameFromData()
                                                      │
                              ├── extractEdition(game.name)   ← ALWAYS runs
                              ├── getOrCreateGameTitle()      ← Uses baseName
                              └── getOrCreateGameRelease()    ← Uses edition
```

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
                    ├── processGameBatch()             ← UNIFIED sync pipeline
                    └── softRemoveUnseenEntries()      ← Shared soft-removal
```

### Connector Metadata Extraction

Connectors extract as much metadata as possible from their sources:

**Steam Connector:**
- `name`, `playtimeMinutes`, `lastPlayedAt` from GetOwnedGames API
- `coverImageUrl` generated from Steam CDN URL
- `storeUrl` generated from app ID
- Multiplayer info NOT available from GetOwnedGames API (requires metadata enrichment)

**Playnite Connector:**
- Basic fields: `name`, `playtimeSeconds`, `lastActivity`, `installed`
- From `raw` data: `description`, `genres`, `releaseDate`, `developer`, `publisher`
- Multiplayer support from `features`/`tags`/`categories`:
  - Online: "online multiplayer", "online co-op", "mmo", etc.
  - Local: "local multiplayer", "split screen", "couch co-op", etc.
- Store URLs extracted from `raw.links` array (5-pass algorithm)
- Cover images: Playnite uses local paths, so metadata providers fill this

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
- `MetadataFetcher` class in `sync/MetadataFetcher.ts` handles rate limiting
- Two metadata runs: general info from primary provider, player counts from providers with `hasAccuratePlayerCounts` capability
- Provider fallback uses capabilities (never hardcoded provider references)

### Player Count Handling

Player counts are handled with explicit "known" vs "unknown" distinction:

**Design Principles:**
1. **Singleplayer games**: Player count is implied as 1 (no modes enabled = 1 player)
2. **Multiplayer games**: ALL counts (including overall) can be null = "unknown"
3. **Never set defaults**: Do NOT set arbitrary defaults that would obscure unknown data
4. **Invalid data = unknown**: Values ≤0, NaN, or Infinity are treated as "unknown" (null)
5. **Preserve provider data**: We never change values we get from providers; if invalid, we just don't apply them

**Data Model:**
- `overallMinPlayers` / `overallMaxPlayers`: **NULLABLE**
  - `null` = player count unknown
  - For singleplayer-only games (no modes), null = implied 1 player
  - For multiplayer games, null = we don't know (UI shows warning)
- `onlineMaxPlayers` / `localMaxPlayers` / `physicalMaxPlayers`: **NULLABLE**
  - `null` = player count unknown for this mode
  - Valid number = known player count from metadata or user

**UI Behavior:**
- Overall badge: shows "? players" with warning for multiplayer games with null count
- Singleplayer-only games (no modes): shows "1 player" even if overall is null
- Mode badges (Online/Local): show warning icon (⚠️) when mode-specific count is null
- Details section shows "Unknown (click Fetch Metadata to update)" text
- Edit form allows leaving player counts empty (= unknown)

**Key Code Locations:**
- `GameProcessor.ts`: `createGameFromData()` preserves null for unknown counts
- `MetadataPipeline.ts`: `applyPlayerInfoUpdates()` only applies valid values
- `GameValidationService.ts`: Allows null for all player counts
- `GameTitleService.ts`: Interface allows nullable overall counts

### Plugin Isolation Rules (CRITICAL)

**Connectors and Metadata Providers are treated as external plugins.**

#### Rule 1: No direct references to connectors/providers from app code
- The app (GameSyncService, controllers, etc.) must ONLY use generic interfaces
- **NEVER** reference a specific connector or provider by name/ID outside their respective folder
- Use `ConnectorRegistry` and `MetadataProviderRegistry` for all lookups
- Use capabilities (`getCapabilities()`) to select providers, not hardcoded IDs

**Forbidden in app code:**
```typescript
// BAD - hardcoded provider reference
const igdb = metadataProviderRegistry.getById('igdb');

// GOOD - use capability-based lookup
const providers = metadataProviderRegistry.getAllByCapability('hasAccuratePlayerCounts');
```

#### Rule 2: No app internal references from connectors/providers
- Connectors and providers should ONLY call external APIs (Steam API, IGDB, etc.)
- **NEVER** import or call app internals (database services, controllers, other modules)
- They receive data via method parameters and return results via defined interfaces
- They are stateless external adapters

**Forbidden in connector/provider code:**
```typescript
// BAD - importing app internals
import * as gameTitleService from '../../database/services/GameTitleService';

// GOOD - return data via interface, let app handle persistence
return { games: [...], success: true };
```

#### Rule 3: Folder isolation
- All Playnite-specific code: `src/modules/games/connectors/playnite/`
- All Steam connector code: `src/modules/games/connectors/SteamConnector.ts`
- All metadata providers: `src/modules/games/metadata/*.ts`
- These folders could be moved to separate packages without breaking the app

### Key Entities
- **GameTitle**: A game's core info (name, description, player counts)
- **GameRelease**: Platform-specific release (PC, PS5, etc. with edition/region)
- **Item** (with `type=GAME_DIGITAL` or `GAME_PHYSICAL`): Game copies
- **ExternalAccount**: Linked external accounts (Steam, Playnite, etc.)
- **ConnectorDevice**: Devices for push-style connectors
- **SyncJob**: Tracks sync history (pending, in_progress, completed, failed)
- **Platform**: Game platforms with user-defined aliases for normalization

## Additional Resources
