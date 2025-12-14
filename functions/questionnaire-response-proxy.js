/* eslint-disable @typescript-eslint/no-var-requires */
const axios = require('axios');
const cookie = require('cookie');
const CryptoJS = require('crypto-js');

const TARGET_BASE_URL = process.env.QUESTIONNAIRE_API_URL || 'http://172.22.0.27:8080';
const ALLOWED_METHODS = ['GET', 'POST', 'DELETE'];
const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Koala-Access-Token',
    'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
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
    const { token: accessToken } = resolveAccessToken(event);

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
            data: method === 'GET' || method === 'DELETE' ? undefined : bodyString,
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
