import React from 'react';
import { useAuth } from '../../contexts/AuthContext';
import './AuthOverlay.css';

const AuthOverlay = (): JSX.Element => {
    const { login, isAuthenticating, loginError } = useAuth();

    const handleSignIn = () => {
        login();
    };

    return (
        <div className="auth-overlay" role="dialog" aria-modal="true" aria-label="Koala sign in">
            <div className="auth-card">
                <h1>Sign in to Koala</h1>
                <button type="button" className="auth-submit" onClick={handleSignIn} disabled={isAuthenticating}>
                    {isAuthenticating ? 'Redirecting…' : 'Sign in'}
                </button>
                <p className="auth-helper">You will be redirected to finish signing in securely.</p>
                {loginError && (
                    <div className="auth-error">
                        <p>{loginError}</p>
                        {typeof window !== 'undefined' && (window as any).__AUTH_ERROR__ && (
                            <details style={{ marginTop: '10px', fontSize: '12px', opacity: 0.8 }}>
                                <summary>Technical Details</summary>
                                <pre style={{ marginTop: '5px', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                                    {JSON.stringify((window as any).__AUTH_ERROR__, null, 2)}
                                </pre>
                            </details>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default AuthOverlay;
