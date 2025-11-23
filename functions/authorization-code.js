/* eslint-disable @typescript-eslint/no-var-requires */
const crypto = require('crypto');
const clientContext = require('./util/client-context');

const SCOPES = [
    'openid',
    'questionnaire_create',
    'questionnaire_read',
    'questionnaire_write',
    'questionnaire_view',
].join(' ');

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
        const redirectUri = `${'http://localhost:3000'}/code`; // TODO: Real url?

        // Build authorization URL
        const authUrl = client.authorizationUrl({
            redirect_uri: redirectUri,
            scope: SCOPES,
            response_type: 'code',
            state: state,
            prompt: 'login',
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
