/* eslint-disable @typescript-eslint/no-var-requires */
/**
 * Express server to run Netlify functions in Docker
 * This allows the functions to work outside of Netlify's environment
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const qs = require('qs');

// Import Netlify functions
const authorizationCode = require('../functions/authorization-code');
const getToken = require('../functions/get-token');
const endSession = require('../functions/end-session');
const xauthProxy = require('../functions/xauth-proxy');
const questionnaireResponseProxy = require('../functions/questionnaire-response-proxy');

const app = express();
const PORT = process.env.FUNCTIONS_PORT || 9000;

// Middleware
app.use(
    cors({
        origin: true,
        credentials: true,
    }),
);

// Body parsing - handle both JSON and form data
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.text({ type: '*/*', limit: '10mb' }));

// Request logging middleware
app.use((req, res, next) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${req.method} ${req.path}`, {
        query: req.query,
        headers: {
            origin: req.headers.origin,
            referer: req.headers.referer,
        },
    });
    next();
});

// Convert Express request to Netlify function event format
function expressToNetlifyEvent(req) {
    // Handle body - could be JSON, form data, or raw text
    let body = null;
    if (req.body) {
        if (typeof req.body === 'string') {
            body = req.body;
        } else if (req.is('application/x-www-form-urlencoded')) {
            // Form data - convert to string
            body = qs.stringify(req.body);
        } else {
            // JSON or other - stringify
            body = JSON.stringify(req.body);
        }
    }

    return {
        httpMethod: req.method,
        path: req.path,
        pathParameters: req.params,
        queryStringParameters: req.query,
        headers: req.headers,
        body: body,
        isBase64Encoded: false,
    };
}

// Convert Netlify function response to Express response
async function handleNetlifyFunction(handler, req, res) {
    try {
        const event = expressToNetlifyEvent(req);
        const context = {}; // Netlify context (not used in our functions)

        console.log(`[Functions Server] Calling handler for ${req.method} ${req.path}`);
        const result = await handler(event, context);

        if (!result) {
            console.error(`[Functions Server] Handler returned undefined for ${req.method} ${req.path}`);
            return res.status(500).json({
                error: 'Internal server error',
                message: 'Handler returned undefined',
            });
        }

        // Set headers
        if (result.headers) {
            Object.keys(result.headers).forEach((key) => {
                res.setHeader(key, result.headers[key]);
            });
        }

        // Prevent caching of API responses
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');

        // Ensure Content-Type is set for JSON responses
        if (result.body && typeof result.body === 'string') {
            try {
                JSON.parse(result.body);
                if (!res.getHeader('Content-Type')) {
                    res.setHeader('Content-Type', 'application/json');
                }
            } catch {
                // Not JSON, that's fine
            }
        }

        // Set status and send body
        const statusCode = result.statusCode || 200;
        res.status(statusCode);

        if (result.body) {
            // Try to parse as JSON to pretty print in logs
            try {
                const jsonBody = JSON.parse(result.body);
                console.log(`[Functions Server] Response ${req.method} ${req.path}`, {
                    status: statusCode,
                    body: jsonBody,
                });
                res.json(jsonBody);
            } catch {
                // Not JSON, send as text
                console.log(`[Functions Server] Response ${req.method} ${req.path}`, {
                    status: statusCode,
                    bodyLength: result.body.length,
                    bodyPreview: result.body.substring(0, 200),
                });
                res.send(result.body);
            }
        } else {
            console.log(`[Functions Server] Response ${req.method} ${req.path}`, {
                status: statusCode,
                body: 'empty',
            });
            res.end();
        }
    } catch (error) {
        console.error(`[Functions Server] Error handling ${req.method} ${req.path}`, {
            error: error.message,
            stack: error.stack,
        });
        res.status(500).json({
            error: 'Internal server error',
            message: error.message,
            path: req.path,
        });
    }
}

// Handle OPTIONS requests for CORS
app.options('/.netlify/functions/*', (req, res) => {
    res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Koala-Access-Token');
    res.header('Access-Control-Allow-Credentials', 'true');
    res.sendStatus(204);
});

// Netlify functions routes
app.get('/.netlify/functions/authorization-code', (req, res) => {
    handleNetlifyFunction(authorizationCode.handler, req, res);
});

app.get('/.netlify/functions/get-token', (req, res) => {
    handleNetlifyFunction(getToken.handler, req, res);
});

app.get('/.netlify/functions/end-session', (req, res) => {
    handleNetlifyFunction(endSession.handler, req, res);
});

app.post('/.netlify/functions/end-session', (req, res) => {
    handleNetlifyFunction(endSession.handler, req, res);
});

// xauth-proxy routes (GET and POST)
app.get('/.netlify/functions/xauth-proxy', (req, res) => {
    handleNetlifyFunction(xauthProxy.handler, req, res);
});

app.post('/.netlify/functions/xauth-proxy', (req, res) => {
    handleNetlifyFunction(xauthProxy.handler, req, res);
});

// questionnaire-response-proxy routes (GET, POST, DELETE)
app.get('/.netlify/functions/questionnaire-response-proxy', (req, res) => {
    handleNetlifyFunction(questionnaireResponseProxy.handler, req, res);
});

app.post('/.netlify/functions/questionnaire-response-proxy', (req, res) => {
    handleNetlifyFunction(questionnaireResponseProxy.handler, req, res);
});

app.delete('/.netlify/functions/questionnaire-response-proxy', (req, res) => {
    handleNetlifyFunction(questionnaireResponseProxy.handler, req, res);
});

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', service: 'functions-server' });
});

// Test endpoint to verify functions server is accessible
app.get('/.netlify/functions/test', (req, res) => {
    res.json({
        status: 'ok',
        message: 'Functions server is running',
        timestamp: new Date().toISOString(),
        path: req.path,
    });
});

// Diagnostic endpoint to check Keycloak configuration
app.get('/.netlify/functions/diagnose', async (req, res) => {
    try {
        const clientContext = require('../functions/util/client-context');
        const { DEFAULT_REDIRECT_ORIGIN } = require('../functions/util/redirect-origin');

        const diagnostics = {
            timestamp: new Date().toISOString(),
            keycloak: {
                issuer: clientContext.ISSUER,
                clientId: clientContext.CLIENT_ID,
                hasSecret: Boolean(process.env.KEYCLOAK_CLIENT_SECRET || 'tmjUsGOVXLHYwXnmhdbMdXaEln3aOXii'),
            },
            redirect: {
                defaultOrigin: DEFAULT_REDIRECT_ORIGIN,
                redirectUri: `${DEFAULT_REDIRECT_ORIGIN}/code`,
            },
            environment: {
                nodeEnv: process.env.NODE_ENV,
                functionsPort: process.env.FUNCTIONS_PORT || 9000,
            },
        };

        // Try to discover Keycloak
        try {
            const client = await clientContext.createClient();
            diagnostics.keycloak.discovery = 'success';
            diagnostics.keycloak.clientCreated = true;
        } catch (error) {
            diagnostics.keycloak.discovery = 'failed';
            diagnostics.keycloak.error = error.message;
        }

        res.json(diagnostics);
    } catch (error) {
        res.status(500).json({
            error: 'Diagnostic failed',
            message: error.message,
        });
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`[Functions Server] Started on port ${PORT}`);
    console.log(`[Functions Server] Environment:`, {
        NODE_ENV: process.env.NODE_ENV,
        QUESTIONNAIRE_API_URL: process.env.QUESTIONNAIRE_API_URL,
        XAUTH_API_URL: process.env.XAUTH_API_URL,
        APP_REDIRECT_FALLBACK: process.env.APP_REDIRECT_FALLBACK,
        APP_REDIRECT_ORIGINS: process.env.APP_REDIRECT_ORIGINS,
    });
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('[Functions Server] SIGTERM received, shutting down gracefully');
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('[Functions Server] SIGINT received, shutting down gracefully');
    process.exit(0);
});
