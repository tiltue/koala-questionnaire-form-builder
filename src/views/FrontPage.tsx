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
    getPractitionerQuestionnaireById,
    ParticipationPayload,
} from '../services/practitionerService';
import { getTargetUsers, XAuthApiException } from '../services/xAuthService';

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
    const [, setPatientUid] = useState('');
    const [assignError, setAssignError] = useState<string | null>(null);
    const [isAssigning, setIsAssigning] = useState(false);
    const [assignmentFeedback, setAssignmentFeedback] = useState<string | null>(null);
    const [isDownloading, setIsDownloading] = useState(false);
    const [downloadError, setDownloadError] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [patients, setPatients] = useState<string[]>([]);
    const [isLoadingPatients, setIsLoadingPatients] = useState(false);
    const [patientsError, setPatientsError] = useState<string | null>(null);
    const [patientSearchTerm, setPatientSearchTerm] = useState('');
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
            const sorted = mapped.sort((a, b) => {
                if (!a.updatedAt && !b.updatedAt) return 0;
                if (!a.updatedAt) return 1;
                if (!b.updatedAt) return -1;
                return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
            });
            setQuestionnaires(sorted);
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
        setDownloadError(null);
        setIsDownloading(false);
        setPatients([]);
        setIsLoadingPatients(false);
        setPatientsError(null);
        setPatientSearchTerm('');
    };

    const startAssign = async (questionnaire: QuestionnaireSummary): Promise<void> => {
        setAssignmentFeedback(null);
        setSelectedQuestionnaire(questionnaire);
        setPatientUid('');
        setAssignError(null);
        setPatientsError(null);
        setPatientSearchTerm('');

        // Fetch patients when modal opens
        if (!therapistId || !accessToken) {
            setPatientsError(t('Unable to resolve therapist id from profile.'));
            return;
        }

        setIsLoadingPatients(true);
        try {
            const targetUsers = await getTargetUsers(therapistId, { accessToken });
            setPatients(targetUsers);
        } catch (error) {
            let errorMessage = t('Failed to load patients.');
            if (error instanceof XAuthApiException) {
                if (error.missingScopes && error.missingScopes.length > 0) {
                    errorMessage = t('Missing required scopes: {{scopes}}', {
                        scopes: error.missingScopes.join(', '),
                    });
                } else {
                    errorMessage = `${t('Failed to load patients')}: ${error.message}`;
                }
            } else if (error instanceof Error) {
                errorMessage = `${t('Failed to load patients')}: ${error.message}`;
            }
            setPatientsError(errorMessage);
            console.error('[FrontPage] Error loading patients:', error);
        } finally {
            setIsLoadingPatients(false);
        }
    };

    const submitAssignment = async (patientUserId: string): Promise<void> => {
        if (!selectedQuestionnaire) return;
        if (!patientUserId.trim()) {
            setAssignError(t('Please select a patient.'));
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
            participant: patientUserId.trim(),
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

    const downloadQuestionnaire = async () => {
        if (!selectedQuestionnaire) return;
        if (!accessToken) {
            setDownloadError(t('You must be logged in to download questionnaires.'));
            return;
        }

        setDownloadError(null);
        setIsDownloading(true);

        try {
            const questionnaire = await getPractitionerQuestionnaireById(selectedQuestionnaire.id, { accessToken });
            const questionnaireJson = JSON.stringify(questionnaire, null, 2);
            const filename = `${selectedQuestionnaire.name || selectedQuestionnaire.id || 'questionnaire'}.json`;
            const contentType = 'application/json;charset=utf-8;';

            /*eslint-disable */
            if (window.navigator && (window.navigator as any).msSaveOrOpenBlob) {
                const blob = new Blob([decodeURIComponent(encodeURI(questionnaireJson))], {
                    type: contentType,
                });
                (navigator as any).msSaveOrOpenBlob(blob, filename);
                /*eslint-enable */
            } else {
                const a = document.createElement('a');
                a.download = filename;
                a.href = 'data:' + contentType + ',' + encodeURIComponent(questionnaireJson);
                a.target = '_blank';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : t('Unknown error');
            setDownloadError(message);
        } finally {
            setIsDownloading(false);
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

    const filteredQuestionnaires = questionnaires.filter((item) => {
        if (!searchTerm.trim()) {
            return true;
        }
        const search = searchTerm.toLowerCase();
        return (
            item.displayName?.toLowerCase().includes(search) ||
            item.name?.toLowerCase().includes(search) ||
            item.title?.toLowerCase().includes(search) ||
            item.id?.toLowerCase().includes(search)
        );
    });

    const filteredPatients = patients.filter((patientId) => {
        if (!patientSearchTerm.trim()) {
            return true;
        }
        const search = patientSearchTerm.toLowerCase();
        return patientId.toLowerCase().includes(search);
    });

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
                    {!accessToken ? (
                        <div className="frontpage__info-message">{t('Log in to load questionnaires.')}</div>
                    ) : isQuestionnaireListLoading ? (
                        <div className="frontpage__loading">
                            <SpinnerBox />
                            <p>{t('Loading questionnaires...')}</p>
                        </div>
                    ) : (
                        <>
                            {questionnaires.length > 0 && (
                                <input
                                    type="text"
                                    className="frontpage__search-input"
                                    placeholder={t('Search questionnaires...')}
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                            )}
                            {assignmentFeedback && <div className="frontpage__info-message">{assignmentFeedback}</div>}
                            {questionnaireListError && (
                                <div className="frontpage__error">
                                    {t('Failed to load questionnaires')}: {questionnaireListError}
                                </div>
                            )}
                            {filteredQuestionnaires.length > 0 ? (
                                <ul className="frontpage__list">
                                    {filteredQuestionnaires.map((item) => (
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
                            ) : questionnaires.length > 0 ? (
                                <div className="frontpage__empty">{t('No questionnaires found')}</div>
                            ) : (
                                <div className="frontpage__empty">{t('No questionnaires available yet')}</div>
                            )}
                        </>
                    )}
                </div>
            </div>
            {selectedQuestionnaire && (
                <Modal title={t('Assign questionnaire')} close={closeAssignModal}>
                    <div className="frontpage__assign-form">
                        <p>{t('Select a patient to assign this questionnaire to.')}</p>
                        <div className="frontpage__assign-details">
                            <div>
                                <strong>{t('Questionnaire')}</strong>
                            </div>
                            <div>{selectedQuestionnaire.displayName}</div>
                        </div>
                        {isLoadingPatients ? (
                            <div className="frontpage__loading">
                                <SpinnerBox />
                                <p>{t('Loading patients...')}</p>
                            </div>
                        ) : patientsError ? (
                            <div className="frontpage__error">{patientsError}</div>
                        ) : (
                            <>
                                {patients.length > 0 && (
                                    <input
                                        type="text"
                                        className="frontpage__search-input"
                                        placeholder={t('Search patients...')}
                                        value={patientSearchTerm}
                                        onChange={(e) => setPatientSearchTerm(e.target.value)}
                                    />
                                )}
                                {filteredPatients.length > 0 ? (
                                    <ul className="frontpage__patient-list">
                                        {filteredPatients.map((patientId) => (
                                            <li key={patientId} className="frontpage__patient-item">
                                                <div className="frontpage__patient-info">
                                                    <span className="frontpage__patient-name">{patientId}</span>
                                                </div>
                                                <Btn
                                                    title={isAssigning ? t('Assigning...') : t('Assign')}
                                                    onClick={() => submitAssignment(patientId)}
                                                    disabled={isAssigning}
                                                    variant="primary"
                                                />
                                            </li>
                                        ))}
                                    </ul>
                                ) : patients.length > 0 ? (
                                    <div className="frontpage__empty">{t('No patients found')}</div>
                                ) : (
                                    <div className="frontpage__empty">{t('No patients available')}</div>
                                )}
                            </>
                        )}
                        {assignError && <div className="frontpage__error">{assignError}</div>}
                        {downloadError && <div className="frontpage__error">{downloadError}</div>}
                        <div className="frontpage__assign-actions">
                            <Btn
                                title={isDownloading ? t('Downloading...') : t('Download')}
                                variant="secondary"
                                onClick={downloadQuestionnaire}
                                disabled={isDownloading}
                            />
                            <Btn title={t('Cancel')} variant="secondary" onClick={closeAssignModal} />
                        </div>
                    </div>
                </Modal>
            )}
        </>
    );
};

export default FrontPage;
