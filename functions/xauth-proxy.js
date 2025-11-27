/* eslint-disable @typescript-eslint/no-var-requires */
const axios = require('axios');
const cookie = require('cookie');
const CryptoJS = require('crypto-js');

const TARGET_BASE_URL = process.env.XAUTH_API_URL || 'https://api.koala.primbs.dev/api/xauth/v0';
const ALLOWED_METHODS = ['GET'];
const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
};
const COOKIE_NAME = 'auth_cookie';
const COOKIE_SECRET = process.env.CINCINNO || 'default-secret-key';

const extractCookieToken = (headers = {}) => {
    const rawCookie = headers.cookie || headers.Cookie;
    if (!rawCookie) {
        return null;
    }
    try {
        const parsed = cookie.parse(rawCookie);
        if (!parsed[COOKIE_NAME]) {
            return null;
        }
        const bytes = CryptoJS.AES.decrypt(parsed[COOKIE_NAME], COOKIE_SECRET);
        const decrypted = bytes.toString(CryptoJS.enc.Utf8);
        return decrypted || null;
    } catch (error) {
        console.warn('[xauth-proxy] Failed to decrypt auth cookie', error.message);
        return null;
    }
};

const normalizeBearer = (value) => {
    if (!value) return null;
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (trimmed.toLowerCase().startsWith('bearer ')) {
        return trimmed.slice(7);
    }
    return trimmed;
};

const resolveAccessToken = (event) => {
    const headers = event.headers || {};
    const authHeader = normalizeBearer(headers.authorization || headers.Authorization);
    const cookieToken = extractCookieToken(headers);

    if (authHeader) {
        return { token: authHeader, source: 'authorization-header' };
    }
    if (cookieToken) {
        return { token: cookieToken, source: 'cookie' };
    }
    return { token: null, source: 'none' };
};

exports.handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 204,
            headers: CORS_HEADERS,
            body: '',
        };
    }

    const method = event.httpMethod.toUpperCase();
    if (!ALLOWED_METHODS.includes(method)) {
        return {
            statusCode: 405,
            headers: {
                ...CORS_HEADERS,
                Allow: ALLOWED_METHODS.join(', '),
            },
            body: JSON.stringify({ error: `Method ${method} not allowed.` }),
        };
    }

    // Extract path from query parameter (e.g., ?path=/userId or ?path=/)
    const path = event.queryStringParameters?.path || '/';
    // Ensure path starts with /
    const normalizedPath = path.startsWith('/') ? path : '/' + path;
    const targetUrl = `${TARGET_BASE_URL}${normalizedPath}`;
    const { token: accessToken } = resolveAccessToken(event);

    if (!accessToken) {
        return {
            statusCode: 401,
            headers: CORS_HEADERS,
            body: JSON.stringify({ error: 'Missing access token' }),
        };
    }

    const headers = {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
    };

    try {
        const response = await axios({
            method,
            url: targetUrl,
            headers,
            timeout: 30000,
            validateStatus: () => true,
        });

        const responseBody =
            typeof response.data === 'string' ? response.data : JSON.stringify(response.data ?? undefined);

        return {
            statusCode: response.status,
            headers: {
                ...CORS_HEADERS,
                'Content-Type': 'application/json',
            },
            body: responseBody ?? '',
        };
    } catch (error) {
        console.error('[xauth-proxy] Request to XAuth server failed', error.message);
        return {
            statusCode: 502,
            headers: CORS_HEADERS,
            body: JSON.stringify({
                error: 'Failed to reach XAuth server',
                message: error.message,
            }),
        };
    }
};
