import React, { useEffect, useState } from 'react';
import { useHistory } from 'react-router-dom';
import SpinnerBox from '../components/Spinner/SpinnerBox';
import Btn from '../components/Btn/Btn';
import { getStoredState, useAuth } from '../contexts/AuthContext';
import './FrontPage.css';

const describeToken = (token?: string | null): string => {
    if (!token) {
        return 'n/a';
    }
    return `${token.slice(0, 10)}…${token.slice(-6)} (${token.length} chars)`;
};

const logAuthCallback = (message: string, payload?: Record<string, unknown>): void => {
    console.log(`[AuthCallback] ${message}`, payload ?? {});
};

const AuthCallback = (): JSX.Element => {
    const history = useHistory();
    const { completeLogin } = useAuth();
    const [statusMessage, setStatusMessage] = useState('Finishing sign in…');
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const finalize = async () => {
            const params = new URLSearchParams(window.location.search);
            console.log(params.toString());
            const authCode = params.get('code');
            const returnedState = params.get('state');
            const storedState = getStoredState();
            logAuthCallback('Loaded query parameters', {
                hasAuthCode: Boolean(authCode),
                returnedState,
                storedStateExists: Boolean(storedState),
            });

            if (!authCode || !returnedState || !storedState) {
                setError('Missing authorization information. Please try signing in again.');
                setStatusMessage('Unable to sign in.');
                console.error('[AuthCallback] Missing required OAuth values', {
                    hasAuthCode: Boolean(authCode),
                    returnedState,
                    storedStateExists: Boolean(storedState),
                });
                return;
            }

            // Verify state matches (CSRF protection)
            if (returnedState !== storedState) {
                setError('Security verification failed. Please try signing in again.');
                setStatusMessage('Unable to sign in.');
                console.error('[AuthCallback] State mismatch detected', { returnedState, storedState });
                return;
            }

            try {
                const redirectOrigin = window.location.origin;
                const params = new URLSearchParams({
                    code: authCode,
                    state: returnedState,
                    stored_state: storedState,
                });
                if (redirectOrigin) {
                    params.set('redirect_origin', redirectOrigin);
                }
                const tokenUrl = `/.netlify/functions/get-token?${params.toString()}`;
                logAuthCallback('Exchanging authorization code for tokens', { tokenUrl, redirectOrigin });
                const response = await fetch(tokenUrl);

                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({}));
                    console.error('[AuthCallback] Token exchange failed', errorData);
                    throw new Error(errorData.error || 'Failed to exchange authorization code.');
                }
                const profile = await response.json();
                logAuthCallback('Received profile from Keycloak', {
                    userId: profile.sub,
                    name: profile.name,
                    scope: profile.scope,
                    expiresIn: profile.expires_in,
                    tokenType: profile.token_type,
                    accessToken: describeToken(profile.access_token),
                    refreshToken: describeToken(profile.refresh_token),
                    idToken: describeToken(profile.id_token),
                });
                completeLogin(profile);
                history.replace('/');
            } catch (err) {
                const message = err instanceof Error ? err.message : 'Unable to finish sign in.';
                setError(message);
                setStatusMessage('Unable to sign in.');
                console.error('[AuthCallback] Unexpected error while completing login', err);
            }
        };

        finalize();
    }, [completeLogin, history]);

    return (
        <div className="align-everything" style={{ minHeight: '100vh' }}>
            {!error ? (
                <>
                    <SpinnerBox />
                    <p className="center-text">{statusMessage}</p>
                </>
            ) : (
                <div className="center-text" style={{ marginTop: '1rem' }}>
                    <p>{statusMessage}</p>
                    <p>{error}</p>
                    <Btn title="Back to start" variant="secondary" type="button" onClick={() => history.replace('/')} />
                </div>
            )}
        </div>
    );
};

export default AuthCallback;
