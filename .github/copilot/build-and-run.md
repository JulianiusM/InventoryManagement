# Building and Running

## Development

```bash
npm run server          # Run server with client watch mode
npm run server:dev      # Run server only
npm run server:client   # Build client assets in watch mode
```

## Production Build

```bash
npm run build           # Build everything
npm run build:server    # Build server only
npm run build:client    # Build client only
```

## Testing

```bash
npm test                # Run all tests
npm run test:watch      # Run tests in watch mode
npm run e2e             # Run E2E tests
npm run e2e:headed      # Run E2E tests with browser
```

## CI Pipeline

The GitHub Actions CI pipeline:

- Runs on push to `master` or `dev` branches
- Runs on pull requests to `master` or `dev`
- Sets up MariaDB 10.11 service container
- Sets up Node.js 24
- Creates test and E2E databases with proper users
- Runs all unit, integration, and E2E tests
- Uploads Playwright reports as artifacts

### Environment Files

- `tests/.env.test` - Configuration for unit/integration tests
- `.env.e2e` - Configuration for E2E tests
- Both files are created automatically in CI
