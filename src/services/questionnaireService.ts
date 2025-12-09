const DEFAULT_BASE_URL = process.env.QUESTIONNAIRE_API_URL || '/.netlify/functions/questionnaire-response-proxy';

export interface QuestionnaireServiceConfig {
    baseUrl?: string;
    accessToken?: string;
}

export type QuestionnairePayload = Record<string, unknown>;

const isProxyUrl = (value: string): boolean => value.startsWith('/');

const buildRequestUrl = (baseUrl: string, path: string): string => {
    if (isProxyUrl(baseUrl)) {
        const params = new URLSearchParams({ path });
        return `${baseUrl}?${params.toString()}`;
    }
    return `${baseUrl}${path}`;
};

export async function createQuestionnaire<T = unknown>(
    payload: QuestionnairePayload,
    config?: QuestionnaireServiceConfig,
): Promise<T | undefined> {
    if (!payload) {
        throw new Error('Questionnaire payload is required');
    }

    const baseUrl = config?.baseUrl || DEFAULT_BASE_URL;
    if (!baseUrl) {
        throw new Error('Missing API base URL for Questionnaire service');
    }

    const headers: HeadersInit = {
        'Content-Type': 'application/fhir+json',
    };

    if (config?.accessToken) {
        headers.Authorization = `Bearer ${config.accessToken}`;
        headers['X-Koala-Access-Token'] = config.accessToken;
    }

    const requestUrl = buildRequestUrl(baseUrl, '/Questionnaire');

    let response: Response;
    try {
        response = await fetch(requestUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify(payload),
        });
    } catch (networkError) {
        console.error('[QuestionnaireService] Network error while calling backend', networkError);
        throw networkError;
    }

    if (!response.ok) {
        const message = await response.text();
        console.error('[QuestionnaireService] Backend responded with error body', message);
        throw new Error(
            `Questionnaire request failed with status ${response.status}: ${message || response.statusText}`,
        );
    }

    try {
        return (await response.json()) as T;
    } catch {
        return undefined;
    }
}

