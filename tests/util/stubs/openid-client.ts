/**
 * Faithful Jest mock for 'openid-client' as used by src/modules/oidc.ts
 * Exposes helpers: discovery, randomPKCECodeVerifier, calculatePKCECodeChallenge,
 * randomState, randomNonce, buildAuthorizationUrl, authorizationCodeGrant, fetchUserInfo.
 */
export type Configuration = {
    issuer: URL;
    authorization_endpoint: string;
    token_endpoint: string;
    userinfo_endpoint: string;
    end_session_endpoint?: string;
    client_id: string;
    client_secret?: string;
    redirect_uri?: string;
    scope?: string;
};

function toUrl(base: URL | string, path: string): string {
    const u = base instanceof URL ? new URL(base) : new URL(base);
    // ensure pathname concatenation
    const joined = new URL(path.replace(/^\//, ''), u.origin + u.pathname.replace(/\/$/, '/'));
    return joined.toString();
}

export async function discovery(server: URL, clientId: string, clientSecret?: string): Promise<Configuration> {
    return {
        issuer: server,
        authorization_endpoint: toUrl(server, '/authorize'),
        token_endpoint: toUrl(server, '/token'),
        userinfo_endpoint: toUrl(server, '/userinfo'),
        end_session_endpoint: toUrl(server, '/logout'),
        client_id: clientId,
        client_secret: clientSecret,
        scope: 'openid profile email',
    };
}

// PKCE + state/nonce helpers used by your code
export function randomPKCECodeVerifier(): string {
    return 'verifier_' + Math.random().toString(36).slice(2);
}

export function calculatePKCECodeChallenge(verifier: string): string {
    // deterministic enough for tests
    return 'challenge_' + (verifier || 'verifier');
}

export function randomState(): string {
    return 'state_' + Math.random().toString(36).slice(2);
}

export function randomNonce(): string {
    return 'nonce_' + Math.random().toString(36).slice(2);
}

export function nonce(): string {
    return randomNonce();
}

export function buildAuthorizationUrl(cfg: Configuration, params: Record<string, string>): string {
    const url = new URL(cfg.authorization_endpoint);
    Object.entries(params || {}).forEach(([k, v]) => url.searchParams.set(k, String(v)));
    // ensure client_id & scope
    if (cfg.client_id && !url.searchParams.get('client_id')) url.searchParams.set('client_id', cfg.client_id);
    if (cfg.scope && !url.searchParams.get('scope')) url.searchParams.set('scope', cfg.scope);
    return url.toString();
}

type GrantChecks = {
    code_verifier?: string;
    expectedState?: string;
    expectedNonce?: string;
    redirect_uri?: string;
};

export type TokenEndpointResponse = {
    access_token: string;
    id_token?: string;
    token_type: 'Bearer';
    refresh_token?: string;
    expires_in?: number;
};

export async function authorizationCodeGrant(
    cfg: Configuration,
    currentUrl: string | URL,
    checks: GrantChecks
): Promise<TokenEndpointResponse> {
    // In tests, return a stable token response
    const state = (checks as any)?.expectedState || 'state_test';
    const nonce = (checks as any)?.expectedNonce || 'nonce_test';
    const sub = 'user-test-sub';
    const idTokenPayload = {iss: cfg.issuer.toString(), sub, aud: cfg.client_id, nonce};
    const id_token = Buffer.from(JSON.stringify({alg: 'none', typ: 'JWT'})).toString('base64url')
        + '.' + Buffer.from(JSON.stringify(idTokenPayload)).toString('base64url') + '.';
    return {
        access_token: 'access_' + state,
        id_token,
        token_type: 'Bearer',
        refresh_token: 'refresh_' + state,
        expires_in: 3600,
    };
}

export async function fetchUserInfo(
    _cfg: Configuration,
    _accessToken?: string,
    sub?: string
): Promise<Record<string, any>> {
    return {
        sub: sub || 'user-test-sub',
        email: 'user@example.com',
        email_verified: true,
        name: 'Test User',
        given_name: 'Test',
        family_name: 'User',
    };
}
