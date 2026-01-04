# Database Guidelines

## Entities

- All entities should be in `src/modules/database/entities/`
- Use TypeORM decorators for entity definitions
- Include proper relationships between entities
- Use timezone 'Z' for consistent UTC handling

## Migrations

- Always create migrations for schema changes
- Never use `synchronize: true` in production
- Test migrations with both up and down operations
- Place migrations in `src/migrations/`

## Testing with Database

- Unit/integration tests use `surveyor_test` database
- E2E tests use `surveyor_e2e` database (name must contain 'e2e')
- Use the provided datasource mocks in tests
- Database tests run serially to avoid conflicts
