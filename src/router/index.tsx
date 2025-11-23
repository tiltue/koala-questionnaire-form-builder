import React from 'react';
import { Route, Switch } from 'react-router-dom';
import FrontPage from '../views/FrontPage';
import AuthCallback from '../views/AuthCallback';
import FormBuilder from '../views/FormBuilder';
import { TreeContextProvider } from '../store/treeStore/treeStore';

export default function Routes(): JSX.Element {
    return (
        <Switch>
            <Route path="/code" exact>
                <AuthCallback />
            </Route>
            <Route path="/editor" exact>
                <TreeContextProvider>
                    <FormBuilder />
                </TreeContextProvider>
            </Route>
            <Route path="/" exact>
                <TreeContextProvider>
                    <FrontPage />
                </TreeContextProvider>
            </Route>
        </Switch>
    );
}
