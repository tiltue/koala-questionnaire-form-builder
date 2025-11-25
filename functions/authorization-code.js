/* eslint-disable @typescript-eslint/no-var-requires */
const crypto = require('crypto');
const clientContext = require('./util/client-context');
const { resolveRedirectOrigin } = require('./util/redirect-origin');
const { SCOPES, KEYCLOAK_AUDIENCE } = require('./util/auth-config');

const describeState = (value) => {
    if (!value) return 'n/a';
    if (value.length <= 8) return value;
    return `${value.slice(0, 4)}…${value.slice(-4)} (${value.length} chars)`;
};

const logAuthRequest = (message, payload = {}) => {
    console.log(`[authorization-code] ${message}`, payload);
};

// Generate random state string (32 characters)
function randomString(length) {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(crypto.randomBytes(1)[0] % chars.length));
    }
    return result;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
exports.handler = async (event, context) => {
    try {
        const client = await clientContext.createClient();
        const state = randomString(32);
        const redirectOrigin = resolveRedirectOrigin(event);
        const redirectUri = `${redirectOrigin}/code`;

        logAuthRequest('Starting authorization handshake', {
            redirectOrigin,
            redirectUri,
            scope: SCOPES,
            state: describeState(state),
        });

        // Build authorization URL with optional audience/resource
        const authParams = {
            redirect_uri: redirectUri,
            scope: SCOPES,
            response_type: 'code',
            state: state,
            prompt: 'login',
        };

        authParams.audience = KEYCLOAK_AUDIENCE;
        authParams.resource = KEYCLOAK_AUDIENCE;

        const baseAuthUrl = client.authorizationUrl(authParams);

        let authUrl = baseAuthUrl;

        try {
            const url = new URL(baseAuthUrl);
            if (!url.searchParams.has('resource')) {
                url.searchParams.append('resource', KEYCLOAK_AUDIENCE);
            }
            authUrl = url.toString();
        } catch (parseError) {
            console.warn('[authorization-code] Failed to inspect authorization URL, using raw value', parseError);
        }

        logAuthRequest('Generated authorization URL', {
            authUrl,
            redirectUri,
        });

        return { statusCode: 200, body: JSON.stringify({ state, auth_url: authUrl }) };
    } catch (error) {
        console.error('Error in authorization-code function:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({
                error: 'Failed to generate authorization URL',
                message: error.message,
                stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
            }),
        };
    }
};
