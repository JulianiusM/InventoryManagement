# Common Tasks

## Adding a New Feature

1. Create or update entities if needed
2. Create migration if database changes are required
3. Implement the feature in appropriate modules
4. Write unit tests for business logic
5. Write integration tests for database operations
6. Write E2E tests for user-facing functionality
7. Update documentation if needed

## Fixing a Bug

1. Write a failing test that reproduces the bug
2. Fix the bug
3. Ensure the test passes
4. Run full test suite to ensure no regressions

## Database Changes

1. Create a new migration file in `src/migrations/`
2. Test the migration locally
3. Update entities if needed
4. Run `npm run typeorm` to apply migrations
5. Test both up and down migrations

## Security Considerations

- Never commit `.env` files or credentials
- Use environment variables for all configuration
- Hash all passwords with bcrypt
- Validate and sanitize all user input
- Use express-validator for input validation
- Keep dependencies up to date

## Notes for Copilot

- When suggesting database changes, always remind about creating migrations
- When suggesting new features, remind about testing requirements
- The E2E database name must contain 'e2e' for safety
- All database operations should be timezone-aware (UTC)
- Mock external services in tests
- Use existing patterns and structures from the codebase
