import React, { createContext, useCallback, useContext, useMemo, useState, ReactNode } from 'react';

type UserProfile = Record<string, unknown> & {
    name?: string;
    given_name?: string;
    family_name?: string;
    sub?: string;
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

    const login = useCallback(async () => {
        setIsAuthenticating(true);
        setLoginError(null);
        try {
            const response = await fetch('/.netlify/functions/authorization-code', {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' },
            });
            if (!response.ok) {
                throw new Error('Failed to start authentication.');
            }
            const data = (await response.json()) as { state: string; auth_url: string };
            if (!data.state || !data.auth_url) {
                throw new Error('Incomplete authorization parameters.');
            }
            setStateValue(data.state);
            window.location.assign(data.auth_url);
        } catch (error) {
            setIsAuthenticating(false);
            const message = error instanceof Error ? error.message : 'Unable to authenticate.';
            setLoginError(message);
        }
    }, []);

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
