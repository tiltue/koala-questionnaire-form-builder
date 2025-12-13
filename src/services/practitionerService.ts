const DEFAULT_BASE_URL = process.env.QUESTIONNAIRE_API_URL || '/.netlify/functions/questionnaire-response-proxy';

export interface PractitionerServiceConfig {
    baseUrl?: string;
    accessToken?: string;
}

type HttpMethod = 'GET' | 'POST' | 'DELETE';

type PractitionerPayload = Record<string, unknown>;

interface RequestOptions {
    method: HttpMethod;
    path: string;
    config?: PractitionerServiceConfig;
    body?: PractitionerPayload;
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
        throw new Error('Missing API base URL for Practitioner service');
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
        console.error('[PractitionerService] Network error while calling backend', networkError);
        throw networkError;
    }

    if (!response.ok) {
        const message = await response.text();
        console.error('[PractitionerService] Backend responded with error body', message);
        throw new Error(
            `Practitioner request failed with status ${response.status}: ${message || response.statusText}`,
        );
    }

    // Handle DELETE requests that may return 204 No Content or empty responses
    if (method === 'DELETE' && (response.status === 204 || response.status === 200)) {
        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
            return undefined as T;
        }
    }

    try {
        const text = await response.text();
        // Handle empty responses (common for DELETE with 204 No Content)
        if (!text || text.trim() === '') {
            return undefined as T;
        }
        return JSON.parse(text) as T;
    } catch {
        return undefined as T;
    }
}

export interface QuestionnaireListParams {
    offset?: number;
}

export async function listPractitionerQuestionnaires<T = unknown>(
    params?: QuestionnaireListParams,
    config?: PractitionerServiceConfig,
): Promise<T> {
    const searchParams = new URLSearchParams();
    if (typeof params?.offset === 'number') {
        searchParams.set('offset', params.offset.toString());
    }

    const query = searchParams.toString();
    const path = `/Practitioner/Me/Questionnaire${query ? `?${query}` : ''}`;

    return executeRequest<T>({
        method: 'GET',
        path,
        config,
    });
}

export interface ParticipationPayload extends PractitionerPayload {
    therapist: string;
    participant: string;
    questionnaire: string;
}

export async function getPractitionerQuestionnaireById<T = unknown>(
    id: string,
    config?: PractitionerServiceConfig,
): Promise<T> {
    if (!id) {
        throw new Error('Questionnaire id is required');
    }

    return executeRequest<T>({
        method: 'GET',
        path: `/Questionnaire/${id}`,
        config,
    });
}

export async function assignQuestionnaireToPatient<T = unknown>(
    payload: ParticipationPayload,
    config?: PractitionerServiceConfig,
): Promise<T> {
    if (!payload?.therapist || !payload?.participant || !payload?.questionnaire) {
        throw new Error('Participation payload is missing required fields');
    }

    return executeRequest<T>({
        method: 'POST',
        path: '/Participation',
        config,
        body: payload,
    });
}

export interface TaskListParams {
    offset?: number;
}

export async function listPractitionerTasks<T = unknown>(
    params?: TaskListParams,
    config?: PractitionerServiceConfig,
): Promise<T> {
    const searchParams = new URLSearchParams();
    if (typeof params?.offset === 'number') {
        searchParams.set('offset', params.offset.toString());
    }

    const query = searchParams.toString();
    const path = `/Practitioner/Me/Task${query ? `?${query}` : ''}`;

    return executeRequest<T>({
        method: 'GET',
        path,
        config,
    });
}

export async function getTaskById<T = unknown>(id: string, config?: PractitionerServiceConfig): Promise<T> {
    if (!id) {
        throw new Error('Task id is required');
    }

    return executeRequest<T>({
        method: 'GET',
        path: `/Task/${id}`,
        config,
    });
}

export async function deleteTask<T = unknown>(id: string, config?: PractitionerServiceConfig): Promise<T> {
    if (!id) {
        throw new Error('Task id is required');
    }

    return executeRequest<T>({
        method: 'DELETE',
        path: `/Task/${id}`,
        config,
    });
}
