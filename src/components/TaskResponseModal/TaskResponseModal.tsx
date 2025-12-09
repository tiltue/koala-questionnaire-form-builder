import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Provider } from 'react-redux';
import { Store, createStore, applyMiddleware } from 'redux';
import thunk from 'redux-thunk';
import Modal from '../Modal/Modal';
import SpinnerBox from '../Spinner/SpinnerBox';
import { QuestionnaireResponse, QuestionnaireResponseItem, Questionnaire } from '../../types/fhir';
import { ReferoContainer } from '@helsenorge/refero/components';
import { getResources } from '../../locales/referoResources';
import rootReducer from '@helsenorge/refero/reducers';
import { getPractitionerQuestionnaireById } from '../../services/practitionerService';
import './TaskResponseModal.css';

type TaskInfo = {
    id: string;
    patientName?: string;
    patientId?: string;
    questionnaireName?: string;
    questionnaireId?: string;
    status?: string;
    updatedAt?: string;
};

type Props = {
    task: TaskInfo;
    questionnaireResponse: QuestionnaireResponse | null;
    isLoading: boolean;
    error: string | null;
    onClose: () => void;
    accessToken?: string;
};

const TaskResponseModal = ({
    task,
    questionnaireResponse,
    isLoading,
    error,
    onClose,
    accessToken,
}: Props): JSX.Element => {
    const { t, i18n } = useTranslation();
    const store: Store = createStore(rootReducer, applyMiddleware(thunk));
    const [questionnaire, setQuestionnaire] = useState<Questionnaire | null>(null);
    const [isLoadingQuestionnaire, setIsLoadingQuestionnaire] = useState(false);
    const [questionnaireError, setQuestionnaireError] = useState<string | null>(null);
    const [referoKey] = useState<string>(Math.random().toString());

    const formatAnswer = (answer: QuestionnaireResponseItem['answer']): string => {
        if (!answer || answer.length === 0) {
            return t('No answer provided');
        }

        return answer
            .map((a) => {
                if (a.valueString) return a.valueString;
                if (a.valueInteger !== undefined) return a.valueInteger.toString();
                if (a.valueDecimal !== undefined) return a.valueDecimal.toString();
                if (a.valueBoolean !== undefined) return a.valueBoolean ? t('Yes') : t('No');
                if (a.valueDate) return a.valueDate;
                if (a.valueDateTime) return a.valueDateTime;
                if (a.valueTime) return a.valueTime;
                if (a.valueUri) return a.valueUri;
                if (a.valueCoding) {
                    return a.valueCoding.display || a.valueCoding.code || '';
                }
                if (a.valueReference) {
                    return a.valueReference.display || a.valueReference.reference || '';
                }
                if (a.valueQuantity) {
                    const qty = a.valueQuantity;
                    return `${qty.value || ''} ${qty.unit || qty.code || ''}`.trim();
                }
                if (a.valueAttachment) {
                    return a.valueAttachment.title || a.valueAttachment.url || t('Attachment');
                }
                return t('Unknown value type');
            })
            .join(', ');
    };

    const renderResponseItems = (items: QuestionnaireResponseItem[] | undefined, level = 0): JSX.Element[] => {
        if (!items || items.length === 0) {
            return [];
        }

        return items.map((item, index) => {
            const hasAnswers = item.answer && item.answer.length > 0;
            const hasNestedItems = item.item && item.item.length > 0;
            const indentClass = level > 0 ? `task-response__item--nested task-response__item--level-${level}` : '';

            return (
                <div key={`${item.linkId || index}-${level}`} className={`task-response__item ${indentClass}`}>
                    {item.linkId && (
                        <div className="task-response__question">
                            <span className="task-response__link-id">{item.linkId}</span>
                            {item.text && <span className="task-response__text">{item.text}</span>}
                        </div>
                    )}
                    {hasAnswers && (
                        <div className="task-response__answer">
                            <strong>{t('Answer')}:</strong> {formatAnswer(item.answer)}
                        </div>
                    )}
                    {hasNestedItems && (
                        <div className="task-response__nested">{renderResponseItems(item.item, level + 1)}</div>
                    )}
                    {!hasAnswers && !hasNestedItems && item.linkId && (
                        <div className="task-response__answer task-response__answer--empty">
                            {t('No answer provided')}
                        </div>
                    )}
                </div>
            );
        });
    };

    const getStatusBadgeClass = (status?: string): string => {
        switch (status?.toLowerCase()) {
            case 'completed':
                return 'task-response__badge--completed';
            case 'in-progress':
                return 'task-response__badge--in-progress';
            case 'amended':
                return 'task-response__badge--amended';
            case 'entered-in-error':
                return 'task-response__badge--error';
            default:
                return 'task-response__badge--default';
        }
    };

    // Fetch Questionnaire to get name/title for display
    useEffect(() => {
        const fetchQuestionnaire = async () => {
            // Fetch questionnaire if we have questionnaireId and accessToken, regardless of questionnaireResponse
            if (!task.questionnaireId || !accessToken) {
                return;
            }

            // Only fetch if we don't already have it
            if (questionnaire) {
                return;
            }

            setIsLoadingQuestionnaire(true);
            setQuestionnaireError(null);

            try {
                const fetchedQuestionnaire = await getPractitionerQuestionnaireById<Questionnaire>(
                    task.questionnaireId,
                    { accessToken },
                );
                setQuestionnaire(fetchedQuestionnaire);
            } catch (err) {
                const message = err instanceof Error ? err.message : t('Unknown error');
                setQuestionnaireError(message);
                console.error('[TaskResponseModal] Error loading Questionnaire:', err);
            } finally {
                setIsLoadingQuestionnaire(false);
            }
        };

        fetchQuestionnaire();
    }, [task.questionnaireId, accessToken, questionnaire, t]);

    const currentLanguage = i18n.language || 'en-US';

    return (
        <Modal title={t('Task Response Details')} close={onClose} size="large">
            <div className={`task-response ${questionnaire ? 'task-response--with-refero' : ''}`}>
                {/* Task Information Section */}
                <div className="task-response__section">
                    <h3 className="task-response__section-title">{t('Task Information')}</h3>
                    <div className="task-response__info-grid">
                        <div className="task-response__info-item">
                            <span className="task-response__info-label">{t('Patient')}:</span>
                            <span className="task-response__info-value">
                                {task.patientName || task.patientId || t('Unknown')}
                            </span>
                        </div>
                        <div className="task-response__info-item">
                            <span className="task-response__info-label">{t('Questionnaire')}:</span>
                            <span className="task-response__info-value">
                                {questionnaire?.name?.trim() ||
                                    questionnaire?.title?.trim() ||
                                    task.questionnaireName ||
                                    task.questionnaireId ||
                                    t('Unknown')}
                            </span>
                        </div>
                        <div className="task-response__info-item">
                            <span className="task-response__info-label">{t('Task Status')}:</span>
                            <span className={`task-response__badge ${getStatusBadgeClass(task.status)}`}>
                                {task.status || t('Unknown')}
                            </span>
                        </div>
                        {task.updatedAt && (
                            <div className="task-response__info-item">
                                <span className="task-response__info-label">{t('Last Updated')}:</span>
                                <span className="task-response__info-value">
                                    {new Date(task.updatedAt).toLocaleString()}
                                </span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Loading State */}
                {isLoading && (
                    <div className="task-response__loading">
                        <SpinnerBox />
                        <p>{t('Loading response...')}</p>
                    </div>
                )}

                {/* Error State */}
                {error && !isLoading && (
                    <div className="task-response__error">
                        <p>
                            {t('Failed to load response')}: {error}
                        </p>
                        {task.status === 'requested' && (
                            <p className="task-response__error-hint">
                                {t('This task has not been completed yet. No response is available.')}
                            </p>
                        )}
                    </div>
                )}

                {/* Response Content */}
                {questionnaireResponse && !isLoading && !error && (
                    <>
                        {/* Response Metadata */}
                        <div className="task-response__section">
                            <h3 className="task-response__section-title">{t('Response Information')}</h3>
                            <div className="task-response__info-grid">
                                {questionnaireResponse.id && (
                                    <div className="task-response__info-item">
                                        <span className="task-response__info-label">{t('Response ID')}:</span>
                                        <span className="task-response__info-value">{questionnaireResponse.id}</span>
                                    </div>
                                )}
                                {questionnaireResponse.status && (
                                    <div className="task-response__info-item">
                                        <span className="task-response__info-label">{t('Response Status')}:</span>
                                        <span
                                            className={`task-response__badge ${getStatusBadgeClass(
                                                questionnaireResponse.status,
                                            )}`}
                                        >
                                            {questionnaireResponse.status}
                                        </span>
                                    </div>
                                )}
                                {questionnaireResponse.authored && (
                                    <div className="task-response__info-item">
                                        <span className="task-response__info-label">{t('Submitted')}:</span>
                                        <span className="task-response__info-value">
                                            {new Date(questionnaireResponse.authored).toLocaleString()}
                                        </span>
                                    </div>
                                )}
                                {questionnaireResponse.author?.display && (
                                    <div className="task-response__info-item">
                                        <span className="task-response__info-label">{t('Author')}:</span>
                                        <span className="task-response__info-value">
                                            {questionnaireResponse.author.display}
                                        </span>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Answers Section - Use ReferoContainer if we have Questionnaire, otherwise fallback to custom render */}
                        {questionnaireResponse.item && questionnaireResponse.item.length > 0 ? (
                            <div className="task-response__section">
                                <h3 className="task-response__section-title">{t('Answers')}</h3>
                                {isLoadingQuestionnaire ? (
                                    <div className="task-response__loading">
                                        <SpinnerBox />
                                        <p>{t('Loading questionnaire...')}</p>
                                    </div>
                                ) : questionnaireError ? (
                                    <div className="task-response__error">
                                        <p>
                                            {t('Failed to load questionnaire')}: {questionnaireError}
                                        </p>
                                        <p className="task-response__error-hint">
                                            {t('Displaying answers in simplified format.')}
                                        </p>
                                        {/* Fallback to custom render */}
                                        <div className="task-response__answers">
                                            {renderResponseItems(questionnaireResponse.item)}
                                        </div>
                                    </div>
                                ) : questionnaire ? (
                                    <div className="task-response__refero-container">
                                        <Provider store={store}>
                                            <div className="page_refero">
                                                <ReferoContainer
                                                    key={referoKey}
                                                    store={store}
                                                    questionnaire={questionnaire}
                                                    questionnaireResponse={questionnaireResponse}
                                                    onCancel={onClose}
                                                    onSave={(): void => {
                                                        // Disabled in read-only mode
                                                    }}
                                                    onPause={(): void => {
                                                        // Disabled in read-only mode
                                                    }}
                                                    onSubmit={(): void => {
                                                        // Disabled in read-only mode
                                                    }}
                                                    authorized={true}
                                                    resources={getResources(currentLanguage)}
                                                    sticky={false}
                                                    saveButtonDisabled={true}
                                                    readOnly={true}
                                                    syncQuestionnaireResponse={true}
                                                    validateScriptInjection
                                                />
                                            </div>
                                        </Provider>
                                    </div>
                                ) : (
                                    // Fallback to custom render if no questionnaire yet
                                    <div className="task-response__answers">
                                        {renderResponseItems(questionnaireResponse.item)}
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="task-response__section">
                                <div className="task-response__empty">{t('No answers provided in this response.')}</div>
                            </div>
                        )}
                    </>
                )}

                {/* No Response State - Task not yet answered */}
                {!questionnaireResponse && !isLoading && !error && task.status === 'requested' && (
                    <div className="task-response__section">
                        <div className="task-response__empty task-response__empty--hint">
                            <p>{t('This questionnaire has not been answered yet.')}</p>
                            <p className="task-response__hint-text">
                                {t(
                                    'The task status is "requested" which means it is waiting for the patient to complete the questionnaire.',
                                )}
                            </p>
                        </div>
                    </div>
                )}

                {/* No Response State - Other statuses */}
                {!questionnaireResponse && !isLoading && !error && task.status !== 'requested' && (
                    <div className="task-response__section">
                        <div className="task-response__empty">{t('No response available for this task.')}</div>
                    </div>
                )}
            </div>
        </Modal>
    );
};

export default TaskResponseModal;
