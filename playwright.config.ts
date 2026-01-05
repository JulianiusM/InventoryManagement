import {defineConfig, devices} from '@playwright/test';
import type {ReporterDescription} from '@playwright/test';
import * as dotenv from 'dotenv';

// Load E2E env before anything else
dotenv.config({path: process.env.E2E_DOTENV_FILE ?? '.env.e2e'});

const PORT = parseInt(process.env.APP_PORT ?? '3001', 10);
const BASE_URL = process.env.ROOT_URL ?? `http://localhost:${PORT}`;
const IS_CI = process.env.CI === 'true' || process.env.CI === '1';
const HTML_REPORT_DIR = process.env.PLAYWRIGHT_HTML_OUTPUT_DIR ?? 'playwright-report';
const junitReporter: ReporterDescription | null = process.env.PLAYWRIGHT_JUNIT_OUTPUT
    ? ['junit', {outputFile: process.env.PLAYWRIGHT_JUNIT_OUTPUT}]
    : IS_CI
        ? ['junit']
        : null;

const reporters: ReporterDescription[] = IS_CI
    ? [['line'], ...(junitReporter ? [junitReporter] : []), ['html', {open: 'never', outputFolder: HTML_REPORT_DIR}]]
    : [['list'], ['html', {open: 'never'}]];

export default defineConfig({
    testDir: 'tests/e2e',
    timeout: 30_000,
    expect: {timeout: 5_000},
    fullyParallel: true,
    forbidOnly: !!IS_CI,
    retries: IS_CI ? 2 : 0,
    reporter: reporters,
    use: {
        baseURL: BASE_URL,
        trace: 'on-first-retry',
        screenshot: 'only-on-failure',
        video: 'off', // Disable video to avoid ffmpeg dependency
    },

    // Start your real server; we chain DB init before launching the app.
    webServer: {
        command: `npm run e2e:init`,
        url: `${BASE_URL}/healthz`,
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
        stderr: 'pipe',
        stdout: 'pipe',
    },

    projects: [
        {name: 'chromium', use: {...devices['Desktop Chrome']}},
        // Add firefox/webkit if you want cross-browser
    ],
});
