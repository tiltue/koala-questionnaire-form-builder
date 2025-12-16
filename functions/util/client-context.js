/* eslint-disable @typescript-eslint/no-var-requires */
const { Issuer } = require('openid-client');
const { DEFAULT_REDIRECT_ORIGIN } = require('./redirect-origin');

// Keycloak configuration
// NOTE: The client "api-debugger" must exist in Keycloak with:
// - Standard Flow enabled
// - Redirect URIs: http://localhost/code, http://127.0.0.1/code, etc.
// - Client secret matching CLIENT_SECRET below
// See KEYCLOAK_SETUP.md for detailed configuration instructions
const ISSUER = process.env.KEYCLOAK_ISSUER || 'https://sso.koala.primbs.dev/realms/koala/';
const CLIENT_ID = process.env.KEYCLOAK_CLIENT_ID || 'api-debugger';
const CLIENT_SECRET = process.env.KEYCLOAK_CLIENT_SECRET || 'tmjUsGOVXLHYwXnmhdbMdXaEln3aOXii';

const createClient = async () => {
    // Construct the well-known URL properly (ISSUER already ends with /)
    // Remove trailing slash if present, then add .well-known path
    const issuerBase = ISSUER.endsWith('/') ? ISSUER.slice(0, -1) : ISSUER;
    const wellKnownUrl = `${issuerBase}/.well-known/openid-configuration`;

    try {
        console.log('[client-context] Discovering Keycloak issuer', { wellKnownUrl, clientId: CLIENT_ID });
        const keycloakIssuer = await Issuer.discover(wellKnownUrl);
        console.log('[client-context] Keycloak issuer discovered', {
            issuer: keycloakIssuer.issuer,
            authorization_endpoint: keycloakIssuer.authorization_endpoint,
        });

        const redirectUri = `${DEFAULT_REDIRECT_ORIGIN}/code`;
        console.log('[client-context] Creating client', {
            clientId: CLIENT_ID,
            redirectUri,
            hasSecret: Boolean(CLIENT_SECRET),
        });

        const client = new keycloakIssuer.Client({
            client_id: CLIENT_ID,
            client_secret: CLIENT_SECRET,
            redirect_uris: [redirectUri],
            response_types: ['code'],
        });

        console.log('[client-context] Client created successfully');
        return client;
    } catch (error) {
        console.error('[client-context] Failed to discover Keycloak issuer', {
            wellKnownUrl,
            error: error.message,
            stack: error.stack,
        });
        
        // Provide more helpful error messages
        if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
            throw new Error(
                `Cannot connect to Keycloak at ${wellKnownUrl}. ` +
                `Check if Keycloak is running and accessible. ` +
                `Error: ${error.message}`
            );
        }
        
        throw new Error(`Failed to discover Keycloak issuer at ${wellKnownUrl}: ${error.message}`);
    }
};

exports.createClient = createClient;
exports.ISSUER = ISSUER;
exports.CLIENT_ID = CLIENT_ID;
exports.CLIENT_SECRET = CLIENT_SECRET;
