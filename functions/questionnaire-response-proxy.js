/* eslint-disable @typescript-eslint/no-var-requires */
const axios = require('axios');
const cookie = require('cookie');
const CryptoJS = require('crypto-js');

const TARGET_BASE_URL = process.env.QUESTIONNAIRE_API_URL;
const ALLOWED_METHODS = ['GET', 'POST'];
const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Koala-Access-Token',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
};
const COOKIE_NAME = 'auth_cookie';
const COOKIE_SECRET = process.env.CINCINNO || 'default-secret-key';

const describeToken = (value) => {
    if (!value) return 'n/a';
    if (value.length <= 10) return value;
    return `${value.slice(0, 6)}…${value.slice(-4)} (${value.length} chars)`;
};

// Decode JWT to inspect claims (for debugging)
const decodeJwt = (token) => {
    if (!token) return null;
    try {
        const parts = token.split('.');
        if (parts.length !== 3) return null;
        const payload = parts[1];
        const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
        const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
        const decoded = Buffer.from(padded, 'base64').toString('utf8');
        return JSON.parse(decoded);
    } catch (error) {
        console.warn('[questionnaire-response-proxy] Failed to decode JWT', error.message);
        return null;
    }
};

const inspectToken = (token) => {
    if (!token) return { valid: false, reason: 'missing' };
    const decoded = decodeJwt(token);
    if (!decoded) return { valid: false, reason: 'decode-failed' };

    const now = Math.floor(Date.now() / 1000);
    const exp = decoded.exp;
    const isExpired = exp && exp < now;

    return {
        valid: !isExpired,
        reason: isExpired ? 'expired' : 'valid',
        claims: {
            sub: decoded.sub,
            iss: decoded.iss,
            aud: decoded.aud,
            exp: exp ? new Date(exp * 1000).toISOString() : 'n/a',
            scope: decoded.scope,
            azp: decoded.azp,
        },
        isExpired,
        expiresIn: exp ? Math.max(0, exp - now) : null,
    };
};

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
        console.warn('[questionnaire-response-proxy] Failed to decrypt auth cookie', error.message);
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
    const customHeader = normalizeBearer(headers['x-koala-access-token'] || headers['X-Koala-Access-Token']);
    const cookieToken = extractCookieToken(headers);

    if (authHeader) {
        return { token: authHeader, source: 'authorization-header' };
    }
    if (customHeader) {
        return { token: customHeader, source: 'x-koala-access-token' };
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

    const path = event.queryStringParameters?.path || '/QuestionnaireResponse';
    const targetUrl = `${TARGET_BASE_URL}${path}`;
    const { token: accessToken, source: tokenSource } = resolveAccessToken(event);

    // Inspect token for debugging
    const tokenInfo = inspectToken(accessToken);

    const headers = {
        'Content-Type': 'application/fhir+json',
        Accept: 'application/fhir+json',
    };

    if (accessToken) {
        headers.Authorization = `Bearer ${accessToken}`;
    }

    const bodyString = event.isBase64Encoded ? Buffer.from(event.body || '', 'base64').toString('utf8') : event.body;

    try {
        const response = await axios({
            method,
            url: targetUrl,
            headers,
            data: method === 'GET' ? undefined : bodyString,
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
        console.error('[questionnaire-response-proxy] Request to backend failed', error.message);
        return {
            statusCode: 502,
            headers: CORS_HEADERS,
            body: JSON.stringify({
                error: 'Failed to reach Questionnaire backend',
                message: error.message,
            }),
        };
    }
};
