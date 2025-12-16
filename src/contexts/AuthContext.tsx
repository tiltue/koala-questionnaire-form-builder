import React, { createContext, useCallback, useContext, useMemo, useState, ReactNode } from 'react';

type UserProfile = Record<string, unknown> & {
    name?: string;
    given_name?: string;
    family_name?: string;
    sub?: string;
    access_token?: string;
    refresh_token?: string;
    id_token?: string;
    expires_in?: number;
    token_type?: string;
    scope?: string;
};

type AuthContextValue = {
    user: UserProfile | null;
    isAuthenticating: boolean;
    loginError: string | null;
    login: () => Promise<void>;
    completeLogin: (profile: UserProfile) => void;
    logout: () => Promise<void>;
};

const AUTH_USER_STORAGE_KEY = 'koala.sso.user';
export const STATE_STORAGE_KEY = 'koala.sso.state';

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const isBrowser = typeof window !== 'undefined';

const getStoredUser = (): UserProfile | null => {
    if (!isBrowser) return null;
    const raw = sessionStorage.getItem(AUTH_USER_STORAGE_KEY);
    if (!raw) return null;
    try {
        return JSON.parse(raw) as UserProfile;
    } catch {
        sessionStorage.removeItem(AUTH_USER_STORAGE_KEY);
        return null;
    }
};

const setStateValue = (value: string): void => {
    if (!isBrowser) return;
    try {
        sessionStorage.setItem(STATE_STORAGE_KEY, value);
    } catch {
        // ignore
    }
    try {
        localStorage.setItem(STATE_STORAGE_KEY, value);
    } catch {
        // ignore
    }
};

const getStateValue = (): string | null => {
    if (!isBrowser) return null;
    try {
        const sessionValue = sessionStorage.getItem(STATE_STORAGE_KEY);
        if (sessionValue) {
            return sessionValue;
        }
    } catch {
        // ignore
    }
    try {
        return localStorage.getItem(STATE_STORAGE_KEY);
    } catch {
        return null;
    }
};

const clearStateValue = (): void => {
    if (!isBrowser) return;
    try {
        sessionStorage.removeItem(STATE_STORAGE_KEY);
    } catch {
        // ignore
    }
    try {
        localStorage.removeItem(STATE_STORAGE_KEY);
    } catch {
        // ignore
    }
};

export const getStoredState = (): string | null => getStateValue();

type Props = {
    children: ReactNode;
};

export const AuthProvider = ({ children }: Props): JSX.Element => {
    const [user, setUser] = useState<UserProfile | null>(() => getStoredUser());
    const [isAuthenticating, setIsAuthenticating] = useState(false);
    const [loginError, setLoginError] = useState<string | null>(null);

    // Helper function to process authentication response
    const processAuthResponse = useCallback(async (response: Response, responseText: string) => {
        console.log('[AuthContext] Authorization response received', {
            status: response.status,
            statusText: response.statusText,
            ok: response.ok,
            contentType: response.headers.get('content-type'),
            url: response.url,
            responseLength: responseText.length,
            responsePreview: responseText.substring(0, 200),
        });

        if (!response.ok) {
            console.error('[AuthContext] Authorization request failed', {
                status: response.status,
                statusText: response.statusText,
                responseText: responseText.substring(0, 500), // First 500 chars
            });
            // Show the actual error in the UI
            const errorMessage =
                responseText.length > 0
                    ? `Failed to start authentication (${response.status}): ${responseText.substring(0, 200)}`
                    : `Failed to start authentication (${response.status}: ${response.statusText})`;
            throw new Error(errorMessage);
        }

        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
            console.error('[AuthContext] Response is not JSON', {
                contentType,
                responseText: responseText.substring(0, 500),
            });
            throw new Error(
                `Server returned non-JSON response (${contentType || 'unknown'}). ` +
                    `Check if backend functions are running. Response: ${responseText.substring(0, 200)}`,
            );
        }

        let data: { state: string; auth_url: string };
        try {
            console.log('[AuthContext] Parsing JSON response', {
                responseLength: responseText.length,
                preview: responseText.substring(0, 200),
            });
            data = JSON.parse(responseText) as { state: string; auth_url: string };
        } catch (parseError) {
            console.error('[AuthContext] JSON parse error', {
                error: parseError instanceof Error ? parseError.message : String(parseError),
                responseText: responseText.substring(0, 500),
                fullResponse: responseText, // Log full response for debugging
            });
            // Show the actual response in the error message
            const errorDetails =
                responseText.length > 0 ? ` Response: ${responseText.substring(0, 300)}` : ' (empty response)';
            throw new Error(
                `Failed to parse server response: ${
                    parseError instanceof Error ? parseError.message : 'Unknown error'
                }${errorDetails}`,
            );
        }

        if (!data.state || !data.auth_url) {
            console.error('[AuthContext] Incomplete authorization data', { data });
            throw new Error('Incomplete authorization parameters.');
        }

        console.log('[AuthContext] Authorization successful, redirecting to Keycloak', {
            authUrl: data.auth_url,
            stateLength: data.state.length,
        });

        // Validate auth_url before redirecting
        if (!data.auth_url || typeof data.auth_url !== 'string') {
            console.error('[AuthContext] Invalid auth_url in response', { data });
            throw new Error('Invalid authorization URL received from server');
        }

        // Check if URL is valid
        try {
            const url = new URL(data.auth_url);
            console.log('[AuthContext] Validated auth URL', {
                protocol: url.protocol,
                host: url.host,
                pathname: url.pathname,
            });
        } catch (urlError) {
            console.error('[AuthContext] Invalid URL format', {
                authUrl: data.auth_url,
                error: urlError,
            });
            throw new Error(`Invalid authorization URL format: ${data.auth_url}`);
        }

        setStateValue(data.state);

        // Use window.location.href instead of assign for better compatibility
        console.log('[AuthContext] Executing redirect to Keycloak...');
        window.location.href = data.auth_url;
    }, []);

    const login = useCallback(async () => {
        setIsAuthenticating(true);
        setLoginError(null);
        try {
            const redirectOrigin = isBrowser ? window.location.origin : '';
            console.log('[AuthContext] Starting login flow', {
                redirectOrigin,
                currentUrl: isBrowser ? window.location.href : 'N/A',
            });

            const params = new URLSearchParams();
            if (redirectOrigin) {
                params.set('redirect_origin', redirectOrigin);
            }
            const query = params.toString();
            const authUrl = `/.netlify/functions/authorization-code${query ? `?${query}` : ''}`;
            console.log('[AuthContext] Calling authorization endpoint', { authUrl });

            const response = await fetch(authUrl, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'Cache-Control': 'no-cache, no-store, must-revalidate',
                    Pragma: 'no-cache',
                },
                cache: 'no-store', // Prevent browser caching
            });

            // Handle 304 Not Modified - browser cached response, need to force refresh
            if (response.status === 304) {
                console.warn('[AuthContext] Received 304 Not Modified - cached response, forcing refresh');
                // Force a fresh request by adding a cache-busting parameter
                const separator = authUrl.includes('?') ? '&' : '?';
                const freshAuthUrl = `${authUrl}${separator}_t=${Date.now()}`;
                const freshResponse = await fetch(freshAuthUrl, {
                    method: 'GET',
                    headers: {
                        'Content-Type': 'application/json',
                        'Cache-Control': 'no-cache, no-store, must-revalidate',
                        Pragma: 'no-cache',
                    },
                    cache: 'no-store',
                });
                // Process the fresh response
                const freshResponseText = await freshResponse.text();
                await processAuthResponse(freshResponse, freshResponseText);
                return;
            }

            // Read response body ONCE - can only be read once!
            const responseText = await response.text();

            // Process the response
            await processAuthResponse(response, responseText);
        } catch (error) {
            setIsAuthenticating(false);
            const message = error instanceof Error ? error.message : 'Unable to authenticate.';
            // Always log to console - even in production
            console.error('[AuthContext] Login error', {
                error,
                message,
                stack: error instanceof Error ? error.stack : undefined,
            });
            // Also log to window for debugging
            if (typeof window !== 'undefined') {
                (window as any).__AUTH_ERROR__ = {
                    message,
                    error: error instanceof Error ? error.toString() : String(error),
                    timestamp: new Date().toISOString(),
                };
            }
            setLoginError(message);
        }
    }, [processAuthResponse]);

    const completeLogin = useCallback((profile: UserProfile) => {
        clearStateValue();
        sessionStorage.setItem(AUTH_USER_STORAGE_KEY, JSON.stringify(profile));
        setUser(profile);
        setIsAuthenticating(false);
        setLoginError(null);
    }, []);

    const logout = useCallback(async () => {
        setLoginError(null);
        setIsAuthenticating(true);
        try {
            // Call backend to clear cookies/session, but ignore returned url to stay on the app
            await fetch('/.netlify/functions/end-session').catch(() => undefined);
        } finally {
            sessionStorage.removeItem(AUTH_USER_STORAGE_KEY);
            clearStateValue();
            setUser(null);
            setIsAuthenticating(false);
        }
    }, []);

    const value = useMemo(
        () => ({
            user,
            isAuthenticating,
            loginError,
            login,
            completeLogin,
            logout,
        }),
        [user, isAuthenticating, loginError, login, completeLogin, logout],
    );

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextValue => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};
