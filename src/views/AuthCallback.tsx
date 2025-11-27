import React, { useEffect, useState } from 'react';
import { useHistory } from 'react-router-dom';
import SpinnerBox from '../components/Spinner/SpinnerBox';
import Btn from '../components/Btn/Btn';
import { getStoredState, useAuth } from '../contexts/AuthContext';
import './FrontPage.css';

const AuthCallback = (): JSX.Element => {
    const history = useHistory();
    const { completeLogin } = useAuth();
    const [statusMessage, setStatusMessage] = useState('Finishing sign in…');
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const finalize = async () => {
            const params = new URLSearchParams(window.location.search);
            const authCode = params.get('code');
            const returnedState = params.get('state');
            const storedState = getStoredState();

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
                const response = await fetch(tokenUrl);

                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({}));
                    console.error('[AuthCallback] Token exchange failed', errorData);
                    throw new Error(errorData.error || 'Failed to exchange authorization code.');
                }
                const profile = await response.json();
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
