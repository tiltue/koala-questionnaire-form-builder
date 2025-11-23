import React from 'react';
import { BrowserRouter as Router, useLocation } from 'react-router-dom';
import Routes from '../src/router/index';
import AuthOverlay from './components/AuthOverlay/AuthOverlay';
import { useAuth } from './contexts/AuthContext';

const AppContent = (): JSX.Element => {
    const location = useLocation();
    const { user } = useAuth();
    const shouldHideOverlay = location.pathname === '/code';

    return (
        <>
            <Routes />
            {!shouldHideOverlay && !user && <AuthOverlay />}
        </>
    );
};

function App(): JSX.Element {
    return (
        <Router>
            <AppContent />
        </Router>
    );
}

export default App;
