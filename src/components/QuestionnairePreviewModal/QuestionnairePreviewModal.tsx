import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Provider } from 'react-redux';
import { Store, createStore, applyMiddleware } from 'redux';
import thunk from 'redux-thunk';
import Modal from '../Modal/Modal';
import SpinnerBox from '../Spinner/SpinnerBox';
import { Questionnaire } from '../../types/fhir';
import { ReferoContainer } from '@helsenorge/refero/components';
import { getResources } from '../../locales/referoResources';
import rootReducer from '@helsenorge/refero/reducers';
import FormFillerSidebar from '../Refero/FormFillerSidebar';
import './QuestionnairePreviewModal.css';

type Props = {
    questionnaire: Questionnaire | null;
    isLoading: boolean;
    error: string | null;
    onClose: () => void;
    language?: string;
};

const QuestionnairePreviewModal = ({ questionnaire, isLoading, error, onClose, language }: Props): JSX.Element => {
    const { t, i18n } = useTranslation();
    const store: Store = createStore(rootReducer, applyMiddleware(thunk));
    const [referoKey] = useState<string>(Math.random().toString());
    const currentLanguage = language || i18n.language || 'en-US';

    useEffect(() => {
        // Reset refero key when questionnaire changes
        if (questionnaire) {
            // Key is already set in useState, but we could regenerate if needed
        }
    }, [questionnaire]);

    return (
        <Modal title={t('Questionnaire Preview')} close={onClose} size="large">
            <div className="questionnaire-preview">
                {/* Loading State */}
                {isLoading && (
                    <div className="questionnaire-preview__loading">
                        <SpinnerBox />
                        <p>{t('Loading questionnaire...')}</p>
                    </div>
                )}

                {/* Error State */}
                {error && !isLoading && (
                    <div className="questionnaire-preview__error">
                        <p>
                            {t('Failed to load questionnaire')}: {error}
                        </p>
                    </div>
                )}

                {/* Questionnaire Preview */}
                {questionnaire && !isLoading && !error && (
                    <div className="questionnaire-preview__container">
                        <FormFillerSidebar questionnaire={questionnaire} />
                        <div className="questionnaire-preview__refero-container">
                            <Provider store={store}>
                                <div className="page_refero">
                                    <ReferoContainer
                                        key={referoKey}
                                        store={store}
                                        questionnaire={questionnaire}
                                        onCancel={onClose}
                                        onSave={(): void => {
                                            // Disabled in preview mode
                                        }}
                                        onPause={(): void => {
                                            // Disabled in preview mode
                                        }}
                                        onSubmit={(): void => {
                                            // Disabled in preview mode
                                        }}
                                        authorized={true}
                                        resources={getResources(currentLanguage)}
                                        sticky={false}
                                        saveButtonDisabled={true}
                                        readOnly={true}
                                        syncQuestionnaireResponse={false}
                                        validateScriptInjection
                                    />
                                </div>
                            </Provider>
                        </div>
                    </div>
                )}
            </div>
        </Modal>
    );
};

export default QuestionnairePreviewModal;
