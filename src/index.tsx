// Fix for "process is not defined" error in Webpack 5 / CRA 5
window.process = window.process || { env: { NODE_ENV: 'development' } };

import './index.css';
import './components/Refero/styles/refero.scss';

import * as serviceWorker from './serviceWorker';

import App from './App';
import React from 'react';
import ReactDOM from 'react-dom';
import { AuthProvider } from './contexts/AuthContext';
import { UserProvider } from './contexts/UserContext';
import './helpers/i18n';
//import { debugContextDevtool } from 'react-context-devtool';

const container = document.getElementById('root');
container?.classList.add('root');

ReactDOM.render(
    <React.StrictMode>
        <AuthProvider>
            <UserProvider>
                <App />
            </UserProvider>
        </AuthProvider>
    </React.StrictMode>,
    container,
);

// If you want your app to work offline and load faster, you can change
// unregister() to register() below. Note this comes with some pitfalls.
// Learn more about service workers: https://bit.ly/CRA-PWA
serviceWorker.unregister();
