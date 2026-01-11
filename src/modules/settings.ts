// src/settings-csv.ts
import fs from "node:fs";
import crypto from "node:crypto";
import * as dotenv from "dotenv";

// Load env before anything else.
// Priority: E2E_DOTENV_FILE > .env.e2e (when NODE_ENV=e2e) > .env
const envPath =
    process.env.E2E_DOTENV_FILE ??
    (process.env.NODE_ENV === "e2e" ? ".env.e2e" : ".env");
dotenv.config({path: envPath});

export type Settings = {
    appPort: number;
    file: string;

    dbType: "mariadb" | "mysql";
    dbName: string;
    dbHost: string;
    dbPassword: string;
    dbPort: number;
    dbUser: string;

    rootUrl: string;
    sessionSecret: string;

    smtpEmail: string;
    smtpHost: string;
    smtpPassword: string;
    smtpPool: boolean;
    smtpPort: number;
    smtpSecure: boolean;
    smtpUser: string;

    localLoginEnabled: boolean;
    oidcEnabled: boolean;
    oidcName: string;
    oidcIssuerBaseUrl: string;
    oidcClientId: string;
    oidcClientSecret: string;
    oidcRedirectUrl: string;

    imprintUrl: string;
    privacyPolicyUrl: string;

    // Metadata provider API keys
    steamWebApiKey: string;
    rawgApiKey: string;
    twitchClientId: string;
    twitchClientSecret: string;
    boardGameAtlasClientId: string;
    
    // Metadata sync configuration
    metadataEnrichmentQueryTimeoutMs: number;

    // Token expiration (in milliseconds)
    tokenExpirationMs: number;

    // Rate limiting configuration
    rateLimitWindowMs: number;
    rateLimitMaxPushConnector: number;
    rateLimitMaxDeviceRegistration: number;

    // Pagination defaults
    paginationDefaultItems: number;
    paginationDefaultLocations: number;
    paginationDefaultGames: number;
    paginationDefaultLoans: number;
    paginationMaxPerPage: number;
    paginationMaxTimezoneItems: number;

    // Description length constraints
    minValidDescriptionLength: number;
    maxDescriptionLength: number;

    // Similar title matching thresholds
    minNormalizedTitleLength: number;
    minSimilarityScore: number;

    initialized: boolean;
};

const defaults: Settings = {
    initialized: false,
    rootUrl: "http://localhost:3000",

    dbType: "mariadb",
    dbHost: "localhost",
    dbPort: 3306,
    dbUser: "user",
    dbPassword: "password",
    dbName: "database",

    smtpPool: true,
    smtpHost: "smtp.example.com",
    smtpPort: 465,
    smtpSecure: true,
    smtpEmail: "test@example.com",
    smtpUser: "username",
    smtpPassword: "password",

    oidcEnabled: false,
    oidcName: "OIDC Provider",
    oidcClientId: "CLIENT_ID",
    oidcClientSecret: "CLIENT_SECRET",
    oidcIssuerBaseUrl: "http://example.com",
    oidcRedirectUrl: "http://localhost:3000/user/oidc/callback",

    localLoginEnabled: true,

    sessionSecret:
        "CHANGE__" + crypto.randomBytes(32).toString("base64url").slice(0, 20),
    appPort: 3000,

    file: "./settings.csv",

    imprintUrl: "http://example.com/imprint",
    privacyPolicyUrl: "http://example.com/privacy",

    // Metadata provider API keys (optional)
    steamWebApiKey: "",
    rawgApiKey: "",
    twitchClientId: "",
    twitchClientSecret: "",
    boardGameAtlasClientId: "",
    
    // Metadata sync configuration
    metadataEnrichmentQueryTimeoutMs: 3000000, // 5 minutes default for thorough metadata enrichment

    // Token expiration (1 hour in milliseconds)
    tokenExpirationMs: 3600_000,

    // Rate limiting configuration (1 hour window)
    rateLimitWindowMs: 60 * 60 * 1000,
    rateLimitMaxPushConnector: 10,
    rateLimitMaxDeviceRegistration: 5,

    // Pagination defaults
    paginationDefaultItems: 30,
    paginationDefaultLocations: 50,
    paginationDefaultGames: 24,
    paginationDefaultLoans: 30,
    paginationMaxPerPage: 100,
    paginationMaxTimezoneItems: 200,

    // Description length constraints
    minValidDescriptionLength: 50,
    maxDescriptionLength: 250,

    // Similar title matching thresholds
    minNormalizedTitleLength: 4,
    minSimilarityScore: 50,
};

// CSV_KEY -> settings key
const keyMap: Record<string, keyof Settings> = {
    ROOT_URL: "rootUrl",
    DB_TYPE: "dbType",
    DB_HOST: "dbHost",
    DB_PORT: "dbPort",
    DB_NAME: "dbName",
    DB_USER: "dbUser",
    DB_PASSWORD: "dbPassword",
    SMTP_POOL: "smtpPool",
    SMTP_HOST: "smtpHost",
    SMTP_PORT: "smtpPort",
    SMTP_SECURE: "smtpSecure",
    SMTP_EMAIL: "smtpEmail",
    SMTP_USER: "smtpUser",
    SMTP_PASSWORD: "smtpPassword",
    OIDC_ENABLED: "oidcEnabled",
    OIDC_NAME: "oidcName",
    OIDC_CLIENT_ID: "oidcClientId",
    OIDC_CLIENT_SECRET: "oidcClientSecret",
    OIDC_ISSUER_BASE_URL: "oidcIssuerBaseUrl",
    OIDC_REDIRECT_URL: "oidcRedirectUrl",
    LOCAL_LOGIN_ENABLED: "localLoginEnabled",
    SESSION_SECRET: "sessionSecret",
    APP_PORT: "appPort",
    IMPRINT_URL: "imprintUrl",
    PRIVACY_POLICY_URL: "privacyPolicyUrl",
    STEAM_WEB_API_KEY: "steamWebApiKey",
    RAWG_API_KEY: "rawgApiKey",
    TWITCH_CLIENT_ID: "twitchClientId",
    TWITCH_CLIENT_SECRET: "twitchClientSecret",
    BOARD_GAME_ATLAS_CLIENT_ID: "boardGameAtlasClientId",
    METADATA_ENRICHMENT_QUERY_TIMEOUT_MS: "metadataEnrichmentQueryTimeoutMs",
    TOKEN_EXPIRATION_MS: "tokenExpirationMs",
    RATE_LIMIT_WINDOW_MS: "rateLimitWindowMs",
    RATE_LIMIT_MAX_PUSH_CONNECTOR: "rateLimitMaxPushConnector",
    RATE_LIMIT_MAX_DEVICE_REGISTRATION: "rateLimitMaxDeviceRegistration",
    PAGINATION_DEFAULT_ITEMS: "paginationDefaultItems",
    PAGINATION_DEFAULT_LOCATIONS: "paginationDefaultLocations",
    PAGINATION_DEFAULT_GAMES: "paginationDefaultGames",
    PAGINATION_DEFAULT_LOANS: "paginationDefaultLoans",
    PAGINATION_MAX_PER_PAGE: "paginationMaxPerPage",
    PAGINATION_MAX_TIMEZONE_ITEMS: "paginationMaxTimezoneItems",
    MIN_VALID_DESCRIPTION_LENGTH: "minValidDescriptionLength",
    MAX_DESCRIPTION_LENGTH: "maxDescriptionLength",
    MIN_NORMALIZED_TITLE_LENGTH: "minNormalizedTitleLength",
    MIN_SIMILARITY_SCORE: "minSimilarityScore",
};

// per-field coercion
const coerce: Partial<Record<keyof Settings, (v: string) => any>> = {
    dbPort: (v) => Number(v),
    smtpPort: (v) => Number(v),
    appPort: (v) => Number(v),
    metadataEnrichmentQueryTimeoutMs: (v) => Number(v),
    tokenExpirationMs: (v) => Number(v),
    rateLimitWindowMs: (v) => Number(v),
    rateLimitMaxPushConnector: (v) => Number(v),
    rateLimitMaxDeviceRegistration: (v) => Number(v),
    paginationDefaultItems: (v) => Number(v),
    paginationDefaultLocations: (v) => Number(v),
    paginationDefaultGames: (v) => Number(v),
    paginationDefaultLoans: (v) => Number(v),
    paginationMaxPerPage: (v) => Number(v),
    paginationMaxTimezoneItems: (v) => Number(v),
    minValidDescriptionLength: (v) => Number(v),
    maxDescriptionLength: (v) => Number(v),
    minNormalizedTitleLength: (v) => Number(v),
    minSimilarityScore: (v) => Number(v),
    smtpPool: (v) => /^(1|true|yes|on)$/i.test(v),
    smtpSecure: (v) => /^(1|true|yes|on)$/i.test(v),
    localLoginEnabled: (v) => /^(1|true|yes|on)$/i.test(v),
    oidcEnabled: (v) => /^(1|true|yes|on)$/i.test(v),
};

// Apply environment variable overrides AFTER reading CSV.
// In E2E: E2E_* vars override; otherwise plain vars override.
// Example: E2E_DB_HOST > DB_HOST > CSV value.
function applyEnvOverrides(target: Settings): void {
    const entries = Object.entries(keyMap) as [string, keyof Settings][];

    for (const [csvKey, settingsKey] of entries) {
        // Prefer E2E_ prefixed variables when running in E2E mode
        let raw;
        if (process.env.NODE_ENV === 'e2e') {
            raw = process.env[`E2E_${csvKey}` as keyof NodeJS.ProcessEnv]
        }
        raw = raw ?? process.env[csvKey as keyof NodeJS.ProcessEnv];

        if (raw === undefined || raw === "") continue;

        const conv = coerce[settingsKey];
        const v = conv ? conv(String(raw)) : String(raw);
        (target as any)[settingsKey] = v;
    }

    // Allow overriding the settings file location itself.
    if (process.env.SETTINGS_FILE) {
        target.file = process.env.SETTINGS_FILE;
    }

    // Safety: when in E2E, nudge to use a dedicated database.
    if (
        process.env.NODE_ENV === "e2e" &&
        target.dbName &&
        !/e2e/i.test(target.dbName)
    ) {
        console.warn(
            `[settings] E2E mode: database name "${target.dbName}" does not contain "e2e". ` +
            `Consider setting E2E_DB_NAME for safety.`
        );
    }
}

export class SettingsStore {
    private _settings: Settings = {...defaults};

    get value(): Settings {
        return this._settings;
    }

    async read(file = this._settings.file, forceCsv: boolean = false): Promise<void> {
        // If an env override for the file is present, prefer it.
        if (!forceCsv && process.env.SETTINGS_FILE) {
            file = process.env.SETTINGS_FILE;
            this._settings.file = file;
        }

        const isE2E = process.env.NODE_ENV === "e2e";

        // If the CSV doesn't exist:
        // - in normal modes, create it from defaults (original behavior)
        // - in E2E, SKIP writing (we rely on env-only for secrets)
        if (!fs.existsSync(file)) {
            if (!isE2E) {
                await this.write(file);
            }
            applyEnvOverrides(this._settings);
            this._settings.initialized = true;
            return;
        }

        // Parse CSV
        const text = fs.readFileSync(file, "utf8");
        for (const line of text.split(/\r?\n/)) {
            if (!line.trim()) continue;
            const [kRaw, ...rest] = line.split(",");
            const k = kRaw.trim();
            const vRaw = rest.join(","); // allow commas in values
            const mapKey = keyMap[k];
            if (!mapKey) {
                console.warn("Unknown setting:", k);
                continue;
            }
            const conv = coerce[mapKey];
            const v = (conv ? conv(vRaw) : vRaw) as any;
            (this._settings as any)[mapKey] = v;
        }

        // Finally, apply env overrides on top.
        if (!forceCsv) applyEnvOverrides(this._settings);
        this._settings.initialized = true;
    }

    async write(file = this._settings.file): Promise<void> {
        const reverse = Object.fromEntries(
            Object.entries(keyMap).map(([csv, key]) => [key, csv])
        );
        const lines: string[] = [];
        for (const [key, value] of Object.entries(this._settings)) {
            const csvKey = (reverse as any)[key];
            if (!csvKey) continue; // skip fields not in CSV
            lines.push(`${csvKey},${String(value)}`);
        }
        fs.writeFileSync(file, lines.join("\n") + "\n", "utf8");
        console.log("Settings file written!");
    }
}

const settingsStore = new SettingsStore();
export default settingsStore;
