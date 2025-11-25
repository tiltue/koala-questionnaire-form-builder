import React, { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useHistory } from 'react-router-dom';
import { TreeContext, TreeState } from '../store/treeStore/treeStore';
import { getStateFromDb } from '../store/treeStore/indexedDbHelper';
import { resetQuestionnaireAction } from '../store/treeStore/treeActions';
import { mapToTreeState } from '../helpers/FhirToTreeStateMapper';
import Modal from '../components/Modal/Modal';
import SpinnerBox from '../components/Spinner/SpinnerBox';
import { useTranslation } from 'react-i18next';
import Btn from '../components/Btn/Btn';
import './FrontPage.css';
import { useAuth } from '../contexts/AuthContext';
import {
    assignQuestionnaireToPatient,
    listPractitionerQuestionnaires,
    ParticipationPayload,
} from '../services/practitionerService';

type QuestionnaireResource = {
    id?: string;
    title?: string;
    name?: string;
    status?: string;
    meta?: {
        lastUpdated?: string;
    };
};

type PractitionerQuestionnaireBundle = {
    entry?: Array<{
        resource?: QuestionnaireResource;
    }>;
};

type QuestionnaireSummary = {
    id: string;
    displayName: string;
    status?: string;
    updatedAt?: string;
    title?: string;
    name?: string;
};

const toQuestionnaireSummaries = (
    bundle: PractitionerQuestionnaireBundle | undefined,
    fallbackTitle: string,
): QuestionnaireSummary[] => {
    if (!bundle?.entry?.length) {
        return [];
    }

    return bundle.entry
        .map((entry) => entry.resource)
        .filter((resource): resource is QuestionnaireResource => Boolean(resource?.id))
        .map((resource) => {
            const displayName = resource?.name?.trim() || resource?.title?.trim() || resource?.id || fallbackTitle;
            return {
                id: resource.id as string,
                displayName,
                status: resource.status,
                updatedAt: resource.meta?.lastUpdated,
                title: resource.title,
                name: resource.name,
            };
        });
};

const FrontPage = (): JSX.Element => {
    const { t, i18n } = useTranslation();
    const { dispatch } = useContext(TreeContext);
    const { logout, user } = useAuth();
    const history = useHistory();
    const [stateFromStorage, setStateFromStorage] = useState<TreeState>();
    const [isLoading, setIsLoading] = useState(false);
    const uploadRef = useRef<HTMLInputElement>(null);
    const [questionnaires, setQuestionnaires] = useState<QuestionnaireSummary[]>([]);
    const [questionnaireListError, setQuestionnaireListError] = useState<string | null>(null);
    const [isQuestionnaireListLoading, setIsQuestionnaireListLoading] = useState(false);
    const [selectedQuestionnaire, setSelectedQuestionnaire] = useState<QuestionnaireSummary | null>(null);
    const [patientUid, setPatientUid] = useState('');
    const [assignError, setAssignError] = useState<string | null>(null);
    const [isAssigning, setIsAssigning] = useState(false);
    const [assignmentFeedback, setAssignmentFeedback] = useState<string | null>(null);
    const accessToken = user?.access_token as string | undefined;
    const therapistId = user?.sub as string | undefined;

    useEffect(() => {
        getStoredQuestionnaire();
    }, []);

    const fetchQuestionnaires = useCallback(async () => {
        if (!accessToken) {
            setQuestionnaires([]);
            setQuestionnaireListError(null);
            setIsQuestionnaireListLoading(false);
            return;
        }

        setAssignmentFeedback(null);
        setQuestionnaireListError(null);
        setIsQuestionnaireListLoading(true);

        try {
            const response = await listPractitionerQuestionnaires<PractitionerQuestionnaireBundle>(undefined, {
                accessToken,
            });
            const mapped = toQuestionnaireSummaries(response, t('Untitled questionnaire'));
            setQuestionnaires(mapped);
        } catch (error) {
            const message = error instanceof Error ? error.message : t('Unknown error');
            setQuestionnaireListError(message);
        } finally {
            setIsQuestionnaireListLoading(false);
        }
    }, [accessToken, t]);

    useEffect(() => {
        fetchQuestionnaires();
    }, [fetchQuestionnaires]);

    const getStoredQuestionnaire = async () => {
        const indexedDbState = await getStateFromDb();
        setStateFromStorage(indexedDbState);
    };

    const onReaderLoad = (event: ProgressEvent<FileReader>) => {
        if (event.target?.result) {
            const questionnaireObj = JSON.parse(event.target.result as string);
            const importedState = mapToTreeState(questionnaireObj);
            dispatch(resetQuestionnaireAction(importedState));
            setIsLoading(false);
            // Reset file input
            if (uploadRef.current) {
                uploadRef.current.value = '';
            }
            // Navigate to editor
            history.push('/editor');
        }
    };

    const uploadQuestionnaire = (event: React.ChangeEvent<HTMLInputElement>) => {
        setIsLoading(true);
        const reader = new FileReader();
        reader.onload = onReaderLoad;
        if (event.target.files && event.target.files[0]) reader.readAsText(event.target.files[0]);
    };
    const suggestRestore: boolean = stateFromStorage?.qItems ? Object.keys(stateFromStorage.qItems).length > 0 : false;

    const onDenyRestoreModal = (): void => {
        dispatch(resetQuestionnaireAction());
        setStateFromStorage(undefined);
    };

    const onConfirmRestoreModal = (): void => {
        dispatch(resetQuestionnaireAction(stateFromStorage));
        setStateFromStorage(undefined);
        // Navigate to editor
        history.push('/editor');
    };

    const closeAssignModal = (): void => {
        setSelectedQuestionnaire(null);
        setPatientUid('');
        setAssignError(null);
        setIsAssigning(false);
    };

    const startAssign = (questionnaire: QuestionnaireSummary): void => {
        setAssignmentFeedback(null);
        setSelectedQuestionnaire(questionnaire);
        setPatientUid('');
        setAssignError(null);
    };

    const submitAssignment = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!selectedQuestionnaire) return;
        if (!patientUid.trim()) {
            setAssignError(t('Please enter a patient UID.'));
            return;
        }
        if (!therapistId) {
            setAssignError(t('Unable to resolve therapist id from profile.'));
            return;
        }
        if (!accessToken) {
            setAssignError(t('You must be logged in to assign questionnaires.'));
            return;
        }

        const payload: ParticipationPayload = {
            therapist: therapistId,
            participant: patientUid.trim(),
            questionnaire: selectedQuestionnaire.id,
        };

        setAssignError(null);
        setIsAssigning(true);

        try {
            await assignQuestionnaireToPatient(payload, { accessToken });
            setAssignmentFeedback(t('Questionnaire assigned to patient.'));
            closeAssignModal();
        } catch (error) {
            const message = error instanceof Error ? error.message : t('Unknown error');
            setAssignError(message);
        } finally {
            setIsAssigning(false);
        }
    };

    const toggleLanguage = (): void => {
        const newLanguage = i18n.language === 'en-US' ? 'de-DE' : 'en-US';
        i18n.changeLanguage(newLanguage);
        localStorage.setItem('editor_language', newLanguage);
    };

    const getCurrentFlag = (): string => {
        return i18n.language === 'en-US' ? '🇬🇧' : '🇩🇪';
    };

    return (
        <>
            {suggestRestore && (
                <Modal title={t('Restore questionnaire...')} close={onDenyRestoreModal}>
                    <div>
                        <p>{t('It looks like you have previously worked with a questionnaire:')}</p>
                        <div className="key-value">
                            <div>{t('Title')}</div>
                            <div>{stateFromStorage?.qMetadata.title}</div>
                        </div>
                        <div className="key-value">
                            <div>{t('Technical name')}</div>
                            <div>{stateFromStorage?.qMetadata.name}</div>
                        </div>
                        <div className="key-value">
                            <div>{t('Version')}</div>
                            <div>{stateFromStorage?.qMetadata.version}</div>
                        </div>
                        <p>{t('Do you wish to open this questionnaire?')}</p>
                        <div className="modal-btn-bottom">
                            <div className="center-text">
                                <Btn title={t('Yes')} type="button" variant="primary" onClick={onConfirmRestoreModal} />{' '}
                                <Btn title={t('No')} type="button" variant="secondary" onClick={onDenyRestoreModal} />
                            </div>
                        </div>
                    </div>
                </Modal>
            )}
            {isLoading && (
                <Modal>
                    <div className="align-everything">
                        <SpinnerBox />
                    </div>
                    <p className="center-text">{t('Loading questionnaire...')}</p>
                </Modal>
            )}
            <header>
                <div className="lang-wrapper">
                    <button
                        type="button"
                        className="language-flag-button"
                        onClick={toggleLanguage}
                        aria-label={t('Change language')}
                        title={i18n.language === 'en-US' ? t('Change to German') : t('Change to English')}
                    >
                        {getCurrentFlag()}
                    </button>
                </div>
                <div className="form-title">
                    <h1>{t('Koala Questionnaire Builder')}</h1>
                </div>
                <div className="header-actions">
                    <Btn title={t('Logout')} onClick={logout} />
                </div>
            </header>
            <div className="frontpage">
                <div className="frontpage__infotext">
                    {t(
                        'You can create a new questionnaire, upload an existing one, or assign questionnaires to patients.',
                    )}
                </div>
                <input
                    type="file"
                    ref={uploadRef}
                    onChange={uploadQuestionnaire}
                    accept="application/JSON"
                    style={{ display: 'none' }}
                />
                <Btn
                    onClick={() => {
                        history.push('/editor');
                    }}
                    title={t('New questionnaire')}
                    variant="primary"
                />
                {` `}
                <Btn
                    onClick={() => {
                        uploadRef.current?.click();
                    }}
                    title={t('Upload questionnaire')}
                    variant="secondary"
                />
                <div className="frontpage__questionnaires">
                    <div className="frontpage__section-header">
                        <h3>{t('Available questionnaires')}</h3>
                    </div>
                    {assignmentFeedback && <div className="frontpage__info-message">{assignmentFeedback}</div>}
                    {questionnaireListError && (
                        <div className="frontpage__error">
                            {t('Failed to load questionnaires')}: {questionnaireListError}
                        </div>
                    )}
                    {!accessToken ? (
                        <div className="frontpage__info-message">{t('Log in to load questionnaires.')}</div>
                    ) : isQuestionnaireListLoading ? (
                        <div className="frontpage__loading">
                            <SpinnerBox />
                            <p>{t('Loading questionnaires...')}</p>
                        </div>
                    ) : questionnaires.length > 0 ? (
                        <ul className="frontpage__list">
                            {questionnaires.map((item) => (
                                <li key={item.id}>
                                    <button
                                        type="button"
                                        className="frontpage__list-button"
                                        onClick={() => startAssign(item)}
                                    >
                                        <span className="frontpage__list-title">{item.displayName}</span>
                                        <span className="frontpage__list-meta">
                                            {t('Questionnaire ID')}: {item.id}
                                        </span>
                                        {item.title && item.title !== item.displayName && (
                                            <span className="frontpage__list-meta">
                                                {t('Title')}: {item.title}
                                            </span>
                                        )}
                                        {item.status && (
                                            <span className="frontpage__list-meta">
                                                {t('Status')}: {item.status}
                                            </span>
                                        )}
                                        {item.updatedAt && (
                                            <span className="frontpage__list-meta">
                                                {t('Updated at')}: {new Date(item.updatedAt).toLocaleString()}
                                            </span>
                                        )}
                                    </button>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <div className="frontpage__empty">{t('No questionnaires available yet')}</div>
                    )}
                </div>
            </div>
            {selectedQuestionnaire && (
                <Modal title={t('Assign questionnaire')} close={closeAssignModal}>
                    <form onSubmit={submitAssignment} className="frontpage__assign-form">
                        <p>{t('Assign this questionnaire to a patient by providing their UID.')}</p>
                        <div className="frontpage__assign-details">
                            <div>
                                <strong>{t('Questionnaire')}</strong>
                            </div>
                            <div>{selectedQuestionnaire.displayName}</div>
                        </div>
                        <label className="frontpage__assign-label" htmlFor="patient-uid">
                            {t('Patient UID')}
                        </label>
                        <input
                            type="text"
                            id="patient-uid"
                            value={patientUid}
                            onChange={(event) => setPatientUid(event.target.value)}
                            placeholder={t('Enter patient UID')}
                        />
                        {assignError && <div className="frontpage__error">{assignError}</div>}
                        <div className="frontpage__assign-actions">
                            <Btn title={t('Cancel')} variant="secondary" onClick={closeAssignModal} />
                            <Btn
                                title={isAssigning ? t('Assigning...') : t('Assign')}
                                type="submit"
                                disabled={isAssigning}
                            />
                        </div>
                    </form>
                </Modal>
            )}
        </>
    );
};

export default FrontPage;
