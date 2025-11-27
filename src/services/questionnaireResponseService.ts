const DEFAULT_BASE_URL = process.env.QUESTIONNAIRE_API_URL || '/.netlify/functions/questionnaire-response-proxy';

export interface QuestionnaireResponseServiceConfig {
    /**
     * Optional override for the API base url. Falls back to QUESTIONNAIRE_API_URL.
     */
    baseUrl?: string;
    /**
     * Optional bearer token applied to the Authorization header.
     */
    accessToken?: string;
}

export type QuestionnaireResponsePayload = Record<string, unknown>;

interface RequestOptions {
    method: 'GET' | 'POST';
    path: string;
    config?: QuestionnaireResponseServiceConfig;
    body?: QuestionnaireResponsePayload;
}

const isProxyUrl = (value: string): boolean => value.startsWith('/');

const buildRequestUrl = (baseUrl: string, path: string): string => {
    if (isProxyUrl(baseUrl)) {
        const params = new URLSearchParams({ path });
        return `${baseUrl}?${params.toString()}`;
    }
    return `${baseUrl}${path}`;
};

async function executeRequest<T>({ method, path, config, body }: RequestOptions): Promise<T> {
    const baseUrl = config?.baseUrl || DEFAULT_BASE_URL;

    if (!baseUrl) {
        throw new Error('Missing API base URL for QuestionnaireResponse service');
    }

    const headers: HeadersInit = {
        'Content-Type': 'application/fhir+json',
    };

    if (config?.accessToken) {
        headers.Authorization = `Bearer ${config.accessToken}`;
        headers['X-Koala-Access-Token'] = config.accessToken;
    }

    const requestUrl = buildRequestUrl(baseUrl, path);

    let response: Response;
    try {
        response = await fetch(requestUrl, {
            method,
            headers,
            body: body ? JSON.stringify(body) : undefined,
        });
    } catch (networkError) {
        console.error('[QuestionnaireResponseService] Network error while calling backend', networkError);
        throw networkError;
    }

    if (!response.ok) {
        const message = await response.text();
        console.error('[QuestionnaireResponseService] Backend responded with error body', message);
        throw new Error(
            `QuestionnaireResponse request failed with status ${response.status}: ${message || response.statusText}`,
        );
    }

    // API 200 responses may or may not contain JSON.
    try {
        return (await response.json()) as T;
    } catch {
        return undefined as T;
    }
}

export async function listMyQuestionnaireResponses<T = unknown>(
    config?: QuestionnaireResponseServiceConfig,
): Promise<T> {
    return executeRequest<T>({
        method: 'GET',
        path: '/Patient/Me/QuestionnaireResponse',
        config,
    });
}

export async function getQuestionnaireResponseById<T = unknown>(
    id: string,
    config?: QuestionnaireResponseServiceConfig,
): Promise<T> {
    if (!id) {
        throw new Error('QuestionnaireResponse id is required');
    }

    return executeRequest<T>({
        method: 'GET',
        path: `/QuestionnaireResponse/${id}`,
        config,
    });
}

export async function createQuestionnaireResponse<T = unknown>(
    payload: QuestionnaireResponsePayload,
    config?: QuestionnaireResponseServiceConfig,
): Promise<T> {
    if (!payload) {
        throw new Error('QuestionnaireResponse payload is required');
    }

    return executeRequest<T>({
        method: 'POST',
        path: '/QuestionnaireResponse',
        config,
        body: payload,
    });
}
