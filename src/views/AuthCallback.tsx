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
                console.log('[AuthCallback] Starting token exchange', {
                    redirectOrigin,
                    currentUrl: window.location.href,
                    hasAuthCode: Boolean(authCode),
                    stateLength: returnedState?.length,
                });
                
                const params = new URLSearchParams({
                    code: authCode,
                    state: returnedState,
                    stored_state: storedState,
                });
                if (redirectOrigin) {
                    params.set('redirect_origin', redirectOrigin);
                }
                const tokenUrl = `/.netlify/functions/get-token?${params.toString()}`;
                console.log('[AuthCallback] Calling token endpoint', { tokenUrl });
                
                const response = await fetch(tokenUrl);
                
                console.log('[AuthCallback] Token exchange response received', {
                    status: response.status,
                    statusText: response.statusText,
                    ok: response.ok,
                    contentType: response.headers.get('content-type'),
                    url: response.url,
                });

                if (!response.ok) {
                    const contentType = response.headers.get('content-type');
                    let errorData: Record<string, unknown> = {};
                    
                    if (contentType && contentType.includes('application/json')) {
                        try {
                            const responseText = await response.text();
                            console.log('[AuthCallback] Parsing error response JSON', {
                                responseLength: responseText.length,
                                preview: responseText.substring(0, 200),
                            });
                            errorData = JSON.parse(responseText);
                        } catch (parseError) {
                            console.error('[AuthCallback] Failed to parse error response as JSON', {
                                error: parseError instanceof Error ? parseError.message : String(parseError),
                                contentType,
                            });
                        }
                    } else {
                        const responseText = await response.text();
                        console.error('[AuthCallback] Error response is not JSON', {
                            contentType,
                            status: response.status,
                            responseText: responseText.substring(0, 500),
                        });
                        errorData = { error: `Server returned ${response.status}: ${response.statusText}` };
                    }
                    
                    console.error('[AuthCallback] Token exchange failed', {
                        status: response.status,
                        errorData,
                    });
                    throw new Error(errorData.error?.toString() || `Failed to exchange authorization code (${response.status}).`);
                }
                
                const contentType = response.headers.get('content-type');
                if (!contentType || !contentType.includes('application/json')) {
                    const responseText = await response.text();
                    console.error('[AuthCallback] Token response is not JSON', {
                        contentType,
                        responseText: responseText.substring(0, 500),
                    });
                    throw new Error('Server returned non-JSON response. Check if backend functions are running.');
                }
                
                let profile: Record<string, unknown> & {
                    access_token?: string;
                    id_token?: string;
                    refresh_token?: string;
                    sub?: string;
                };
                try {
                    const responseText = await response.text();
                    console.log('[AuthCallback] Parsing token response JSON', {
                        responseLength: responseText.length,
                        preview: responseText.substring(0, 200),
                    });
                    profile = JSON.parse(responseText) as typeof profile;
                } catch (parseError) {
                    const responseText = await response.text();
                    console.error('[AuthCallback] JSON parse error in token response', {
                        error: parseError instanceof Error ? parseError.message : String(parseError),
                        responseText: responseText.substring(0, 500),
                    });
                    throw new Error(`Failed to parse token response: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`);
                }
                
                console.log('[AuthCallback] Token exchange successful', {
                    hasAccessToken: Boolean(profile.access_token),
                    hasIdToken: Boolean(profile.id_token),
                    userId: profile.sub,
                });
                completeLogin(profile);
                history.replace('/');
            } catch (err) {
                const message = err instanceof Error ? err.message : 'Unable to finish sign in.';
                setError(message);
                setStatusMessage('Unable to sign in.');
                console.error('[AuthCallback] Unexpected error while completing login', {
                    error: err,
                    message,
                    stack: err instanceof Error ? err.stack : undefined,
                });
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
