const DEFAULT_BASE_URL = process.env.XAUTH_API_URL || '/.netlify/functions/xauth-proxy';

export interface XAuthServiceConfig {
    baseUrl?: string;
    accessToken?: string;
}

interface RequestOptions {
    path: string;
    config?: XAuthServiceConfig;
}

class XAuthApiException extends Error {
    statusCode: number;
    errorCode?: number;
    missingScopes?: string[];
    responseBody?: string;

    constructor(
        statusCode: number,
        message: string,
        errorCode?: number,
        missingScopes?: string[],
        responseBody?: string,
    ) {
        super(message);
        this.name = 'XAuthApiException';
        this.statusCode = statusCode;
        this.errorCode = errorCode;
        this.missingScopes = missingScopes;
        this.responseBody = responseBody;
    }

    toString(): string {
        const parts = ['XAuthApiException(' + this.statusCode + ')'];
        if (this.errorCode != null) {
            parts.push('code=' + this.errorCode);
        }
        parts.push(this.message);
        return parts.join(': ');
    }
}

const isProxyUrl = (value: string): boolean => value.startsWith('/');

function normalizeBaseUrl(url: string): string {
    return url.endsWith('/') ? url.substring(0, url.length - 1) : url;
}

function buildUrl(baseUrl: string, path: string): string {
    if (isProxyUrl(baseUrl)) {
        // For proxy URLs, pass path as query parameter
        const params = new URLSearchParams({ path });
        return `${baseUrl}?${params.toString()}`;
    }
    // For direct URLs, append path normally
    const normalizedBase = normalizeBaseUrl(baseUrl);
    const normalizedPath = path.startsWith('/') ? path : '/' + path;
    return normalizedPath === '/' ? normalizedBase + '/' : normalizedBase + normalizedPath;
}

async function executeRequest<T>({ path, config }: RequestOptions): Promise<T> {
    const baseUrl = config?.baseUrl || DEFAULT_BASE_URL;

    if (!baseUrl) {
        throw new Error('Missing API base URL for XAuth service');
    }

    if (!config?.accessToken) {
        throw new Error('Access token is required for XAuth requests');
    }

    const headers: HeadersInit = {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.accessToken}`,
    };

    const url = buildUrl(baseUrl, path);

    let response: Response;
    try {
        response = await fetch(url, {
            method: 'GET',
            headers,
        });
    } catch (networkError) {
        console.error('[XAuthService] Network error while calling XAuth server', networkError);
        throw networkError;
    }

    if (!response.ok) {
        // 404 might mean user not found or no patients - treat as empty list for getTargetUsers
        if (response.status === 404) {
            return [] as T;
        }

        let message: string | undefined;
        let errorCode: number | undefined;
        let missingScopes: string[] | undefined;

        try {
            const body = await response.text();
            const decoded = JSON.parse(body);
            if (decoded && typeof decoded === 'object') {
                message = decoded.message?.toString();
                if (typeof decoded.errorCode === 'number') {
                    errorCode = decoded.errorCode;
                }
                if (Array.isArray(decoded.missing_scopes)) {
                    missingScopes = decoded.missing_scopes.map((s: unknown) => String(s));
                }
            } else {
                message = body || undefined;
            }
        } catch {
            message = response.statusText || `HTTP ${response.status}`;
        }

        throw new XAuthApiException(response.status, message || `HTTP ${response.status}`, errorCode, missingScopes);
    }

    try {
        return (await response.json()) as T;
    } catch {
        // If response is empty or not JSON, return empty array for list endpoints
        return [] as T;
    }
}

/**
 * Gets all target user IDs that the specified user (therapist) has permission to access.
 * @param permittedUserId The user ID (therapist) for which to retrieve permissions
 * @param config Service configuration with access token
 * @returns List of target user IDs (patient UIDs). Returns empty array if user not found or has no patients.
 */
export async function getTargetUsers(permittedUserId: string, config?: XAuthServiceConfig): Promise<string[]> {
    if (!permittedUserId) {
        throw new Error('Permitted user ID is required');
    }

    const result = await executeRequest<string[]>({
        path: `/${permittedUserId}`,
        config,
    });

    // Ensure we return an array of strings
    // Note: executeRequest already handles 404 by returning empty array
    if (Array.isArray(result)) {
        return result.map((item) => String(item));
    }
    return [];
}

/**
 * Gets all users (admin endpoint - requires xauth_read scope).
 * @param config Service configuration with access token
 * @returns List of all user IDs
 */
export async function getAllUsers(config?: XAuthServiceConfig): Promise<string[]> {
    const result = await executeRequest<string[]>({
        path: '/',
        config,
    });

    if (Array.isArray(result)) {
        return result.map((item) => String(item));
    }
    return [];
}

export { XAuthApiException };
