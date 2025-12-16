/* eslint-disable @typescript-eslint/no-var-requires */
const crypto = require('crypto');
const clientContext = require('./util/client-context');
const { resolveRedirectOrigin } = require('./util/redirect-origin');
const { SCOPES, KEYCLOAK_AUDIENCE } = require('./util/auth-config');

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
    console.log('[authorization-code] Request received', {
        httpMethod: event.httpMethod,
        path: event.path,
        queryParams: event.queryStringParameters,
        headers: {
            origin: event.headers?.origin || event.headers?.Origin,
            referer: event.headers?.referer || event.headers?.Referer,
        },
    });

    try {
        const client = await clientContext.createClient();
        console.log('[authorization-code] Keycloak client created successfully');
        
        const state = randomString(32);
        const redirectOrigin = resolveRedirectOrigin(event);
        const redirectUri = `${redirectOrigin}/code`;

        console.log('[authorization-code] Resolved redirect origin', {
            redirectOrigin,
            redirectUri,
            queryOrigin: event.queryStringParameters?.redirect_origin,
            headerOrigin: event.headers?.origin || event.headers?.Origin,
            headerReferer: event.headers?.referer || event.headers?.Referer,
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

        console.log('[authorization-code] Building authorization URL', {
            redirectUri,
            scopes: SCOPES,
            audience: KEYCLOAK_AUDIENCE,
            stateLength: state.length,
        });

        const baseAuthUrl = client.authorizationUrl(authParams);

        let authUrl = baseAuthUrl;

        try {
            const url = new URL(baseAuthUrl);
            if (!url.searchParams.has('resource')) {
                url.searchParams.append('resource', KEYCLOAK_AUDIENCE);
            }
            authUrl = url.toString();
        } catch (parseError) {
            console.warn('[authorization-code] Failed to inspect authorization URL, using raw value', {
                error: parseError.message,
                baseAuthUrl: baseAuthUrl.substring(0, 200),
            });
        }

        console.log('[authorization-code] Authorization URL generated successfully', {
            authUrlLength: authUrl.length,
            authUrlPreview: authUrl.substring(0, 200),
            fullAuthUrl: authUrl, // Log full URL for debugging
        });

        // Validate the auth URL before returning
        try {
            const url = new URL(authUrl);
            if (!url.hostname || !url.pathname) {
                throw new Error('Invalid URL structure');
            }
        } catch (urlError) {
            console.error('[authorization-code] Generated invalid auth URL', {
                authUrl,
                error: urlError.message,
            });
            throw new Error(`Failed to generate valid authorization URL: ${urlError.message}`);
        }

        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ state, auth_url: authUrl }),
        };
    } catch (error) {
        console.error('[authorization-code] Error in authorization-code function', {
            error: error.message,
            stack: error.stack,
            name: error.name,
        });
        return {
            statusCode: 500,
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                error: 'Failed to generate authorization URL',
                message: error.message,
                stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
            }),
        };
    }
};
