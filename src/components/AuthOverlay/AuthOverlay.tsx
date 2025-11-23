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
                {loginError && <p className="auth-error">{loginError}</p>}
            </div>
        </div>
    );
};

export default AuthOverlay;
