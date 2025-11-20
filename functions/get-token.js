/* eslint-disable @typescript-eslint/no-var-requires */
const axios = require('axios');
const clientContext = require('./util/client-context');
const qs = require('qs');
const cookie = require('cookie');
const CryptoJS = require('crypto-js');

// Manual JWT decoder (since jose v6+ is ESM only)
function decodeJwt(token) {
    if (!token) return null;
    try {
        const parts = token.split('.');
        if (parts.length !== 3) return null;

        // Decode base64url (JWT uses base64url, not standard base64)
        const payload = parts[1];
        // Replace URL-safe characters and add padding if needed
        const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
        const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
        const decoded = Buffer.from(padded, 'base64').toString('utf8');
        return JSON.parse(decoded);
    } catch (error) {
        throw new Error(`Failed to decode JWT: ${error.message}`);
    }
}

function createCookie(token) {
    const hour = 3600000;
    const eightHours = 1 * 8 * hour;
    const ciphertext = CryptoJS.AES.encrypt(token, process.env.CINCINNO || 'default-secret-key').toString();
    return cookie.serialize('auth_cookie', ciphertext, {
        secure: true,
        httpOnly: true,
        path: '/',
        maxAge: eightHours,
    });
}

// Basic Auth header
function basicAuthHeader(clientId, clientSecret) {
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    return `Basic ${credentials}`;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
exports.handler = async (event, context) => {
    const code = event.queryStringParameters.code;
    const state = event.queryStringParameters.state;
    const storedState = event.queryStringParameters.stored_state;

    if (!code) {
        return {
            statusCode: 400,
            body: JSON.stringify({
                error: 'Missing authorization code.',
            }),
            client,
        };
    }

    // Verify state matches (CSRF protection)
    if (!state || !storedState || state !== storedState) {
        return {
            statusCode: 400,
            body: JSON.stringify({
                error: 'State mismatch. Please try signing in again.',
            }),
        };
    }

    const redirectUri = `${'http://localhost:3000'}/code`; // TODO: Real url?
    const tokenEndpoint = `${clientContext.ISSUER}protocol/openid-connect/token`;

    // Token exchange using Basic Auth
    const headers = {
        Authorization: basicAuthHeader(clientContext.CLIENT_ID, clientContext.CLIENT_SECRET),
        'Content-Type': 'application/x-www-form-urlencoded',
    };

    const body = {
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: redirectUri,
    };

    try {
        const tokenResponse = await axios.post(tokenEndpoint, qs.stringify(body), { headers });
        const { access_token, id_token, refresh_token } = tokenResponse.data;

        // Decode JWT tokens to get user info (matching Flutter implementation)
        let userInfo = {};
        if (id_token) {
            try {
                const decodedIdToken = decodeJwt(id_token);
                // Extract user information from id_token claims
                userInfo = {
                    sub: decodedIdToken.sub,
                    sid: decodedIdToken.sid,
                    name: decodedIdToken.name,
                    given_name: decodedIdToken.given_name,
                    family_name: decodedIdToken.family_name,
                    email: decodedIdToken.email,
                    preferred_username: decodedIdToken.preferred_username,
                };
            } catch (decodeError) {
                console.warn('Failed to decode id_token:', decodeError.message);
            }
        }

        // If we have access_token but no user info from id_token, try to decode access_token
        if (access_token && !userInfo.sub) {
            try {
                const decodedAccessToken = decodeJwt(access_token);
                userInfo = {
                    sub: decodedAccessToken.sub || userInfo.sub,
                    sid: decodedAccessToken.sid || userInfo.sid,
                    ...userInfo,
                };
            } catch (decodeError) {
                console.warn('Failed to decode access_token:', decodeError.message);
            }
        }

        const accessCookie = createCookie(access_token);

        return {
            statusCode: 200,
            body: JSON.stringify({
                ...userInfo,
                access_token,
                id_token,
                refresh_token,
            }),
            headers: {
                'Set-Cookie': accessCookie,
                'Cache-Control': 'no-cache',
                'Content-Type': 'application/json',
            },
        };
    } catch (error) {
        console.error('Token exchange error:', error.response?.data || error.message);
        return {
            statusCode: 400,
            body: JSON.stringify({
                message: 'Token exchange failed',
                error: error.response?.data || error.message,
            }),
        };
    }
};
