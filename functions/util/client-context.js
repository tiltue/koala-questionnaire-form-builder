/* eslint-disable @typescript-eslint/no-var-requires */
const { Issuer } = require('openid-client');

// Keycloak configuration
const ISSUER = 'https://sso.koala.primbs.dev/realms/koala/';
const CLIENT_ID = 'api-debugger';
const CLIENT_SECRET = 'tmjUsGOVXLHYwXnmhdbMdXaEln3aOXii';

const createClient = async () => {
    // Construct the well-known URL properly (ISSUER already ends with /)
    // Remove trailing slash if present, then add .well-known path
    const issuerBase = ISSUER.endsWith('/') ? ISSUER.slice(0, -1) : ISSUER;
    const wellKnownUrl = `${issuerBase}/.well-known/openid-configuration`;

    try {
        const keycloakIssuer = await Issuer.discover(wellKnownUrl);

        return new keycloakIssuer.Client({
            client_id: CLIENT_ID,
            client_secret: CLIENT_SECRET,
            redirect_uris: [`${'http://localhost:3000'}/code`], // TODO: Real url?
            response_types: ['code'],
        });
    } catch (error) {
        console.error('Failed to discover Keycloak issuer:', wellKnownUrl);
        console.error('Error:', error.message);
        throw new Error(`Failed to discover Keycloak issuer at ${wellKnownUrl}: ${error.message}`);
    }
};

exports.createClient = createClient;
exports.ISSUER = ISSUER;
exports.CLIENT_ID = CLIENT_ID;
exports.CLIENT_SECRET = CLIENT_SECRET;
