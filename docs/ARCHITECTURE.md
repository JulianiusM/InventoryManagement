# Inventory Management Architecture

This document describes the overall architecture, design patterns, and technical decisions in the Inventory Management application.

## Table of Contents

- [System Overview](#system-overview)
- [Technology Stack](#technology-stack)
- [Application Layers](#application-layers)
- [Database Design](#database-design)
- [Frontend Architecture](#frontend-architecture)
- [Authentication & Authorization](#authentication--authorization)
- [Testing Architecture](#testing-architecture)
- [Games Module](#games-module)
- [Design Patterns](#design-patterns)

---

## System Overview

Inventory Management is a **monolithic web application** for item cataloging and tracking with the following characteristics:

- **Backend**: Node.js + Express.js + TypeScript
- **Database**: MariaDB with TypeORM
- **Frontend**: Server-rendered Pug templates + vanilla JavaScript/TypeScript (Bootstrap dark theme)
- **Authentication**: OIDC (OpenID Connect) + local login
- **Testing**: Jest + Playwright

### High-Level Architecture

```
┌─────────────────────────────────────────────────────┐
│                    Client Browser                     │
│  ┌────────────┐  ┌─────────────┐  ┌──────────────┐ │
│  │ Pug Views  │  │ Client JS   │  │ Bootstrap UI │ │
│  └────────────┘  └─────────────┘  └──────────────┘ │
└────────────────────┬────────────────────────────────┘
                     │ HTTP/HTTPS
┌────────────────────┴────────────────────────────────┐
│              Express.js Application                  │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────┐ │
│  │  Routes     │→ │ Controllers  │→ │ Services   │ │
│  └─────────────┘  └──────────────┘  └────────────┘ │
│  ┌─────────────┐  ┌──────────────┐                 │
│  │ Middleware  │  │ Permissions  │                 │
│  └─────────────┘  └──────────────┘                 │
└────────────────────┬────────────────────────────────┘
                     │
┌────────────────────┴────────────────────────────────┐
│              MariaDB Database (TypeORM)              │
│  ┌───────────────────────────────────────────────┐ │
│  │  Entities: Users, Surveys, Events, Activities │ │
│  └───────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

---

## Technology Stack

### Backend

| Technology | Version | Purpose |
|------------|---------|---------|
| Node.js | ≥ 24.x | Runtime environment |
| TypeScript | Latest | Type-safe JavaScript |
| Express.js | 4.x | Web framework |
| TypeORM | Latest | ORM for database access |
| Pug | 3.x | Template engine |
| bcryptjs | Latest | Password hashing |
| express-session | Latest | Session management |
| express-validator | Latest | Input validation |

### Frontend

| Technology | Version | Purpose |
|------------|---------|---------|
| TypeScript | Latest | Type-safe client code |
| Bootstrap | 5.3.x | UI framework |
| esbuild | Latest | Fast bundling |
| SASS | Latest | CSS preprocessing |

### Database

| Technology | Version | Purpose |
|------------|---------|---------|
| MariaDB | ≥ 10.4 | Relational database |

### Testing

| Technology | Version | Purpose |
|------------|---------|---------|
| Jest | Latest | Unit/integration testing |
| Playwright | Latest | E2E testing |
| MSW | Latest | API mocking |
| Testing Library | Latest | DOM testing |

---

## Application Layers

### 1. Routes Layer

**Location**: `src/routes/`

**Responsibility**: Define HTTP endpoints and route requests to controllers.

```typescript
// src/routes/survey.ts
router.get('/create', requireLogin, surveyController.renderCreate);
router.post('/create', requireLogin, asyncHandler(surveyController.create));
```

**Patterns:**
- One route file per feature
- Middleware applied at route level
- Use `asyncHandler` for async routes

### 2. Middleware Layer

**Location**: `src/middleware/`

**Responsibility**: Request preprocessing, authentication, authorization.

**Key Middleware:**
- `requireLogin` - Ensures user is authenticated
- `requireOwner` - Ensures user owns resource
- `requirePerm` - Checks entity permissions
- `assignFlowFactory` - Permission checking for assignments
- `asyncHandler` - Error handling for async routes
- `genericErrorHandler` - Centralized error handling

### 3. Controller Layer

**Location**: `src/controller/`

**Responsibility**: Business logic orchestration, request/response handling.

```typescript
// Controller pattern
export default {
    async create(req: Request, res: Response): Promise<void> {
        // 1. Validate input
        // 2. Call service layer
        // 3. Handle response
    }
};
```

**Patterns:**
- Controllers don't access database directly
- All business logic in controllers
- Services handle data access
- Return data, not responses (except render/redirect)

### 4. Service Layer

**Location**: `src/modules/database/services/`

**Responsibility**: Database access, transactions, data integrity.

```typescript
// Service pattern
export class ItemService {
    private itemRepo: Repository<Item>;
    
    async createItem(data: CreateItemDto): Promise<Item> {
        // Database operations
        return await this.itemRepo.save(item);
    }
}
```

**Patterns:**
- One service per entity
- Use transactions for multi-step operations
- Return entities, not query results
- Handle database errors

### 5. Entity Layer

**Location**: `src/modules/database/entities/`

**Responsibility**: Database schema definition, relationships.

```typescript
@Entity()
export class Item {
    @PrimaryGeneratedColumn('uuid')
    id: string;
    
    @Column()
    name: string;
    
    @ManyToOne(() => User)
    owner: User;
}
```

**Patterns:**
- One entity per table
- Define relationships with decorators
- Use TypeORM features (timestamps, etc.)
- Validation in controller, not entity

---

## Database Design

### Entity Relationship Overview

```
User ───┬─── Survey
        ├─── Event ───── EventRegistration
        ├─── PackingList ───── PackingItem
        ├─── ActivityPlan ───── ActivitySlot ───── SlotAssignment
        └─── DriversList ───── DriversItem

EntityPermissions ─── EntityAdminAssignment
```

### Key Entities

#### Users
- Authentication via OIDC
- Local accounts for guests
- Email verification system
- Password reset functionality

#### Surveys
- Multi-combination surveys
- Guest and user responses
- Ranked choice voting support

#### Events
- Event creation and management
- Registration system
- Invoice pool management
- Participant tracking

#### Packing Lists
- Shared packing coordination
- Item assignments
- Category organization

#### Activity Plans
- Time-boxed scheduling
- Role-based assignments
- Participant requirements
- Auto-assignment recommendations

#### Drivers Lists
- Driver coordination
- Seat management
- Participant assignments

### Permission System

**Table**: `entity_permissions`

Flexible permission system for all entity types:

```typescript
interface EntityPermissions {
    entityType: string;    // 'survey', 'event', 'packing', etc.
    entityId: string;      // UUID of the entity
    ownerId: number;       // User ID of owner
    defaultPermissions: {  // Default perms for all users
        view: boolean;
        edit: boolean;
        manage_assignments: boolean;
    };
    permMeta: Array<{      // Individual user permissions
        userId: number;
        permissions: string[];
    }>;
}
```

### Migrations

**Location**: `src/migrations/`

**Patterns:**
- Always create migrations for schema changes
- Never use `synchronize: true` in production
- Make migrations idempotent (use IF EXISTS/IF NOT EXISTS)
- Test both `up` and `down` methods
- Name migrations descriptively

---

## Frontend Architecture

### Modular Structure

**Location**: `src/public/js/`

```
js/
├── core/           # Foundation utilities
│   ├── http.ts             # HTTP client
│   ├── navigation.ts       # Navigation helpers
│   ├── form-utils.ts       # Form utilities
│   ├── formatting.ts       # Data formatting
│   └── permissions.ts      # Permission loader
├── shared/         # Shared UI behaviors
│   ├── alerts.ts           # Alert messages
│   ├── drag-drop.ts        # Drag & drop
│   ├── entity-assign.ts    # Assignment helpers
│   ├── inline-edit.ts      # Inline editing
│   ├── list-actions.ts     # List operations
│   └── ui-helpers.ts       # UI utilities
├── modules/        # Feature-specific widgets
│   ├── entity-select.ts    # Entity selector
│   ├── timezone-select.ts  # Timezone picker
│   ├── activity-*.ts       # Activity modules
│   └── ...
└── *.ts           # Page-level scripts
    ├── activity.ts
    ├── packing.ts
    ├── events.ts
    └── ...
```

### Module Pattern

```typescript
// Module initialization
export function init(): void {
    // Initialize module
}

// Expose via window
declare global {
    interface Window {
        InventoryApp: {
            init: () => void;
        };
    }
}

window.InventoryApp = window.InventoryApp || {};
window.InventoryApp.init = init;
```

### Client-Side Principles

1. **Reuse core/shared helpers** - Don't duplicate HTTP, DOM, or permission logic
2. **Load permissions early** - Use `loadPerms()` before checking permissions
3. **Type-safe DOM queries** - Cast elements to specific types
4. **Document with JSDoc** - Explain complex functions
5. **Minimize HTTP calls** - Batch when possible

---

## Authentication & Authorization

### Authentication (OIDC)

```typescript
// OIDC Provider: src/modules/oidc.ts
export const provider = new Provider(issuer, configuration);

// Strategy: Local accounts + OIDC
passport.use(new LocalStrategy(...));
passport.use('oidc', new Strategy(...));
```

**Flow:**
1. User attempts login
2. If OIDC configured, redirect to provider
3. Provider authenticates and returns
4. Application creates/updates local user
5. Session established

### Authorization (Permissions)

**Permission Engine**: `src/modules/permissionEngine.ts`

```typescript
interface PermissionEngine {
    has(user: User, entity: Entity, permission: string): boolean;
    grant(user: User, entity: Entity, permission: string): void;
    revoke(user: User, entity: Entity, permission: string): void;
}
```

**Permission Levels:**
- `VIEW` - Can view entity
- `EDIT` - Can edit entity
- `MANAGE_ASSIGNMENTS` - Can manage participants/assignments
- `ADMIN` - Full control (owner)

**Checking Permissions:**

Backend (middleware):
```typescript
router.get('/:id', requirePerm('VIEW'), controller.view);
```

Frontend (client-side):
```typescript
const perms = await loadPerms('activity', activityId);
if (perms.has('EDIT')) {
    // Show edit button
}
```

---

## Testing Architecture

### Testing Pyramid

```
       /\        E2E Tests (7 files, 424 tests)
      /  \       - Complete user workflows
     /    \      - Playwright + real browser
    /------\     
   / Database \  Database Tests (7 files, 1000+ tests)
  /   Tests   \  - Real database operations
 /------------\ 
/  Controller  \ Controller Tests (7 files, 518 tests)
| & Unit Tests | - Mocked services
|  (60 files)  | - Business logic focus
+--------------+
|Frontend Tests| Frontend Tests (43 files, 2900+ tests)
| (No Backend) | - MSW for API mocking
+--------------+ - Testing Library for DOM
```

### Testing Patterns

#### Data-Driven Testing

```typescript
// tests/data/controller/surveyData.ts
export const createSurveyData = [
    {
        description: 'creates survey with valid data',
        input: { title: 'Test' },
        expected: { id: '123', title: 'Test' },
    },
];

// tests/controller/survey.test.ts
test.each(createSurveyData)('$description', async (testCase) => {
    // Test implementation
});
```

#### Keyword-Driven Testing

```typescript
// tests/keywords/common/controllerKeywords.ts
export function setupMock(mockFn: jest.Mock, returnValue: any): void {
    mockFn.mockResolvedValue(returnValue);
}

export function verifyResult(actual: any, expected: any): void {
    expect(actual).toEqual(expected);
}

// Usage in tests
setupMock(service.create, testCase.expected);
const result = await controller.create(testCase.input);
verifyResult(result, testCase.expected);
```

### Test Organization

- **Unit tests**: Test individual functions in isolation
- **Controller tests**: Test business logic with mocked services
- **Database tests**: Test data operations with real database
- **Frontend tests**: Test client code with MSW (no backend)
- **E2E tests**: Test complete workflows with Playwright

See [TESTING_GUIDE.md](TESTING_GUIDE.md) for comprehensive testing documentation.

---

## Games Module

The Games module is a comprehensive system for managing video games, board games, and other game types with external provider integration.

### Core Entities

| Entity | Purpose |
|--------|---------|
| GameTitle | Core game info (name, description, player counts) |
| GameRelease | Platform-specific release (PC, PS5, edition, region) |
| Item (type=GAME_DIGITAL/GAME) | Game copies (digital or physical) |
| ExternalAccount | Linked external accounts (Steam, Playnite) |
| ConnectorDevice | Devices for push-style sync |
| SyncJob | Sync job tracking and history |
| Platform | Game platforms with normalization aliases |

### Controller Architecture

The games controller is modular for maintainability:

```
src/controller/games/
├── gameTitleController.ts     # Title CRUD and metadata operations
├── gameReleaseController.ts   # Release management
├── gameCopyController.ts      # Copy/item operations and lending
├── gameAccountController.ts   # External accounts and sync triggers
├── gameMappingController.ts   # Mapping queue for unmatched games
├── gamePlatformController.ts  # Platform CRUD and merging
├── gameJobsController.ts      # Sync job listing
├── helpers.ts                 # Shared utilities (auth, ownership checks)
└── index.ts                   # Re-exports all functions
```

### Sync Architecture

The sync pipeline is unified for all connector types:

```
Connector (fetch/push) → processGameBatch() → safeCreateGameFromData()
                                                      │
                              ├── extractEdition()     ← Extract edition from name
                              ├── getOrCreateTitle()   ← Merge by normalized name
                              └── getOrCreateRelease() ← By platform+edition
```

**Key Files:**
- `sync/GameProcessor.ts` - Unified game processing
- `sync/MetadataFetcher.ts` - Centralized metadata fetching with rate limiting
- `GameSyncService.ts` - Orchestration and scheduling
- `GameNameUtils.ts` - Edition extraction and title normalization

### Connector Types

| Type | Description | Example |
|------|-------------|---------|
| Fetch-style | Connector pulls from external API | Steam |
| Push-style | External agent pushes via API | Playnite |

### Metadata Providers

Providers are selected by capability, not hardcoded references:

- `hasAccuratePlayerCounts` - For accurate multiplayer info
- `supportsSearch` - For game name lookup

Providers: Steam, IGDB, RAWG, Wikidata (board games)

---

## Design Patterns

### 1. Repository Pattern

Service layer uses repository pattern:

```typescript
class SurveyService {
    private repository: Repository<Survey>;
    
    constructor() {
        this.repository = AppDataSource.getRepository(Survey);
    }
    
    async findById(id: string): Promise<Survey | null> {
        return await this.repository.findOne({ where: { id } });
    }
}
```

### 2. DTO Pattern

Data Transfer Objects for API boundaries:

```typescript
interface CreateSurveyDto {
    title: string;
    description: string;
    combinations: CombinationDto[];
}

// Validated in controller
// Transformed to entity in service
```

### 3. Middleware Chain Pattern

Request processing through middleware chain:

```typescript
router.post('/create', 
    requireLogin,        // Authentication
    requirePerm('EDIT'), // Authorization
    validate(),          // Validation
    asyncHandler(        // Error handling
        controller.create
    )
);
```

### 4. Factory Pattern

Permission middleware factory:

```typescript
export function requirePerm(permission: string) {
    return async (req: Request, res: Response, next: NextFunction) => {
        // Check permission
        if (hasPermission) next();
        else res.status(403).send();
    };
}
```

### 5. Strategy Pattern

Authentication strategies:

```typescript
passport.use('local', new LocalStrategy(...));
passport.use('oidc', new OIDCStrategy(...));

// Use based on configuration
app.use(passport.authenticate(strategy));
```

### 6. Observer Pattern

Event emitters for logging and monitoring:

```typescript
eventEmitter.on('user.login', (user) => {
    logger.info(`User ${user.id} logged in`);
});
```

---

## Performance Considerations

### Database

- **Indexes**: Added on foreign keys and frequently queried columns
- **Transactions**: Used for multi-step operations
- **Connection Pooling**: Configured in TypeORM
- **Query Optimization**: Use `EXPLAIN` for slow queries

### Caching

- **Session Store**: Redis (configurable)
- **Query Cache**: TypeORM query caching
- **Static Assets**: Nginx caching (production)

### Frontend

- **Bundling**: esbuild for fast, optimized bundles
- **Lazy Loading**: Modules loaded on demand
- **Minification**: Production builds minified
- **CDN**: Bootstrap and libraries from CDN

---

## Security Architecture

### Security Layers

1. **Input Validation**: express-validator on all inputs
2. **Output Escaping**: Pug auto-escapes by default
3. **Authentication**: OIDC + bcrypt password hashing
4. **Authorization**: Permission system on all entities
5. **Session Security**: Secure cookies, HTTPS-only in production
6. **CSRF Protection**: CSRF tokens on forms
7. **SQL Injection**: Parameterized queries via TypeORM
8. **XSS Protection**: Content Security Policy headers

### Security Best Practices

- ✅ Passwords hashed with bcrypt (10 rounds)
- ✅ Sessions use secure, httpOnly cookies
- ✅ Input validated on backend and frontend
- ✅ Output escaped in templates
- ✅ HTTPS enforced in production
- ✅ Database credentials in environment variables
- ✅ Rate limiting on authentication endpoints
- ✅ Regular dependency updates

---

## Deployment Architecture

### Development

```
Node.js (nodemon) ──→ TypeScript ──→ Source
     ↓                                 ↑
esbuild (watch) ─────────────────────┘
```

### Production

```
[Nginx] ──→ [Node.js App] ──→ [MariaDB]
   ↓              ↓
[Static         [Sessions]
 Assets]        (Redis)
```

**Production Checklist:**
- [ ] Environment variables configured
- [ ] Database migrations run
- [ ] Static assets compiled and cached
- [ ] HTTPS certificates installed
- [ ] Monitoring and logging configured
- [ ] Backups configured
- [ ] Rate limiting enabled

---

## Scalability Considerations

### Current State: Monolith

The application is currently a monolith, suitable for:
- Small to medium user bases (< 10,000 users)
- Single server deployment
- Moderate traffic (< 1,000 req/min)

### Future Scaling Options

If needed, consider:

1. **Horizontal Scaling**: Load balancer + multiple app instances
2. **Database Optimization**: Read replicas, connection pooling
3. **Caching Layer**: Redis for sessions and data caching
4. **CDN**: Static assets served from CDN
5. **Microservices**: Split by feature (if truly necessary)

---

## Monitoring and Observability

### Logging

- **Winston**: Structured logging
- **Levels**: Error, Warn, Info, Debug
- **Destinations**: Console, Files, External service

### Metrics

Consider adding:
- Response times
- Error rates
- Database query times
- User activity

### Health Checks

```typescript
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        database: await checkDatabase(),
        version: process.env.npm_package_version
    });
});
```

---

## Future Architecture Considerations

### Potential Improvements

1. **API Layer**: Add REST or GraphQL API for mobile apps
2. **Real-time**: WebSockets for live updates
3. **Background Jobs**: Queue system for long-running tasks
4. **File Storage**: S3 or similar for file uploads
5. **Email Queue**: Asynchronous email sending
6. **Search**: Elasticsearch for full-text search

### Migration Paths

If requirements grow:
- Extract services to microservices (feature by feature)
- Add API gateway for service orchestration
- Implement event-driven architecture
- Add message queue (RabbitMQ, Kafka)

---

## Documentation Links

- **Testing**: [TESTING_GUIDE.md](TESTING_GUIDE.md)
- **Development**: [DEVELOPMENT.md](DEVELOPMENT.md)
- **Frontend Testing**: [FRONTEND_TESTING.md](FRONTEND_TESTING.md)
- **Database**: [DATABASE.md](DATABASE.md)

---

**Last Updated:** December 10, 2025  
**Architecture Version:** 1.0  
**Next Review:** Quarterly or with major changes
