/* eslint-disable @typescript-eslint/no-var-requires */
const { URL } = require('url');

const DEFAULT_REDIRECT_ORIGIN = process.env.APP_REDIRECT_FALLBACK || 'http://localhost:3000';
const DEV_ORIGIN_REGEX = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i;
const ALLOWED_ORIGINS = (process.env.APP_REDIRECT_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

function normalizeOrigin(value) {
    if (!value) return null;
    try {
        const parsed = new URL(value);
        return `${parsed.protocol}//${parsed.host}`;
    } catch {
        return null;
    }
}

function isAllowedOrigin(origin) {
    if (!origin) return false;
    if (ALLOWED_ORIGINS.length > 0) {
        return ALLOWED_ORIGINS.includes(origin);
    }
    return DEV_ORIGIN_REGEX.test(origin);
}

function getHeader(headers = {}, key) {
    if (!headers) return null;
    return headers[key] || headers[key?.toLowerCase()] || headers[key?.toUpperCase()];
}

function resolveRedirectOrigin(event = {}) {
    const queryOrigin = normalizeOrigin(event.queryStringParameters?.redirect_origin);
    if (isAllowedOrigin(queryOrigin)) {
        return queryOrigin;
    }

    const headerOrigin = normalizeOrigin(getHeader(event.headers, 'origin'));
    if (isAllowedOrigin(headerOrigin)) {
        return headerOrigin;
    }

    const refererOrigin = normalizeOrigin(getHeader(event.headers, 'referer'));
    if (isAllowedOrigin(refererOrigin)) {
        return refererOrigin;
    }

    return DEFAULT_REDIRECT_ORIGIN;
}

module.exports = {
    DEFAULT_REDIRECT_ORIGIN,
    resolveRedirectOrigin,
};
