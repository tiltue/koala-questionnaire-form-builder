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
    listPractitionerTasks,
    getTaskById,
    deleteTask,
    ParticipationPayload,
} from '../services/practitionerService';
import { getQuestionnaireResponseById } from '../services/questionnaireResponseService';
import TaskResponseModal from '../components/TaskResponseModal/TaskResponseModal';
import QuestionnairePreviewModal from '../components/QuestionnairePreviewModal/QuestionnairePreviewModal';
import { QuestionnaireResponse, Questionnaire } from '../types/fhir';
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

type TaskResource = {
    id?: string;
    resourceType?: string;
    status?: string;
    for?: {
        reference?: string;
        display?: string;
    };
    focus?: {
        reference?: string;
        display?: string;
    };
    meta?: {
        lastUpdated?: string;
    };
};

type TaskBundle = {
    entry?: Array<{
        resource?: TaskResource;
    }>;
};

type TaskSummary = {
    id: string;
    patientId?: string;
    patientName?: string;
    questionnaireId?: string;
    questionnaireName?: string;
    status?: string;
    updatedAt?: string;
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

const toTaskSummaries = (bundle: TaskBundle | undefined): TaskSummary[] => {
    if (!bundle?.entry?.length) {
        return [];
    }

    return bundle.entry
        .map((entry) => entry.resource)
        .filter((resource): resource is TaskResource => Boolean(resource?.id))
        .map((resource) => {
            const patientRef = resource.for?.reference || '';
            const questionnaireRef = resource.focus?.reference || '';
            const patientId = patientRef.includes('/') ? patientRef.split('/').pop() : patientRef;
            const questionnaireId = questionnaireRef.includes('/')
                ? questionnaireRef.split('/').pop()
                : questionnaireRef;

            return {
                id: resource.id as string,
                patientId,
                patientName: resource.for?.display || patientId || '',
                questionnaireId,
                questionnaireName: resource.focus?.display || questionnaireId || '',
                status: resource.status,
                updatedAt: resource.meta?.lastUpdated,
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
    const [viewMode, setViewMode] = useState<'questionnaires' | 'tasks'>('questionnaires');
    const [tasks, setTasks] = useState<TaskSummary[]>([]);
    const [taskListError, setTaskListError] = useState<string | null>(null);
    const [isTaskListLoading, setIsTaskListLoading] = useState(false);
    const [taskSearchTerm, setTaskSearchTerm] = useState('');
    const [taskToDelete, setTaskToDelete] = useState<TaskSummary | null>(null);
    const [isDeletingTask, setIsDeletingTask] = useState(false);
    const [deleteTaskError, setDeleteTaskError] = useState<string | null>(null);
    const [selectedTask, setSelectedTask] = useState<TaskSummary | null>(null);
    const [questionnaireResponse, setQuestionnaireResponse] = useState<QuestionnaireResponse | null>(null);
    const [isLoadingResponse, setIsLoadingResponse] = useState(false);
    const [responseError, setResponseError] = useState<string | null>(null);
    const [previewQuestionnaire, setPreviewQuestionnaire] = useState<Questionnaire | null>(null);
    const [isLoadingPreview, setIsLoadingPreview] = useState(false);
    const [previewError, setPreviewError] = useState<string | null>(null);
    const [questionnaireToPreview, setQuestionnaireToPreview] = useState<QuestionnaireSummary | null>(null);
    const [selectedPatients, setSelectedPatients] = useState<Set<string>>(new Set());
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

    const fetchTasks = useCallback(async () => {
        if (!accessToken) {
            setTasks([]);
            setTaskListError(null);
            setIsTaskListLoading(false);
            return;
        }

        setTaskListError(null);
        setIsTaskListLoading(true);

        try {
            const response = await listPractitionerTasks<TaskBundle>(undefined, {
                accessToken,
            });
            const mapped = toTaskSummaries(response);
            const sorted = mapped.sort((a, b) => {
                if (!a.updatedAt && !b.updatedAt) return 0;
                if (!a.updatedAt) return 1;
                if (!b.updatedAt) return -1;
                return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
            });
            setTasks(sorted);
        } catch (error) {
            const message = error instanceof Error ? error.message : t('Unknown error');
            setTaskListError(message);
        } finally {
            setIsTaskListLoading(false);
        }
    }, [accessToken, t]);

    useEffect(() => {
        if (viewMode === 'tasks') {
            fetchTasks();
        }
    }, [viewMode, fetchTasks]);

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
        setSelectedPatients(new Set());
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

    const handlePatientToggle = (patientId: string): void => {
        setSelectedPatients((prev) => {
            const newSet = new Set(prev);
            if (newSet.has(patientId)) {
                newSet.delete(patientId);
            } else {
                newSet.add(patientId);
            }
            return newSet;
        });
    };

    const submitAssignment = async (): Promise<void> => {
        if (!selectedQuestionnaire) return;
        if (selectedPatients.size === 0) {
            setAssignError(t('Please select at least one patient.'));
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

        setAssignError(null);
        setIsAssigning(true);

        const patientIds = Array.from(selectedPatients);
        const errors: string[] = [];
        let successCount = 0;

        try {
            // Assign questionnaire to each selected patient sequentially
            for (const patientId of patientIds) {
                try {
                    const payload: ParticipationPayload = {
                        therapist: therapistId,
                        participant: patientId.trim(),
                        questionnaire: selectedQuestionnaire.id,
                    };
                    await assignQuestionnaireToPatient(payload, { accessToken });
                    successCount++;
                } catch (error) {
                    const message = error instanceof Error ? error.message : t('Unknown error');
                    errors.push(`${patientId}: ${message}`);
                }
            }

            if (errors.length === 0) {
                setAssignmentFeedback(t('Questionnaire assigned to {{count}} patient(s).', { count: successCount }));
                closeAssignModal();
            } else if (successCount > 0) {
                setAssignError(
                    t('Partially assigned: {{success}} succeeded, {{failed}} failed.', {
                        success: successCount,
                        failed: errors.length,
                    }) +
                        ' ' +
                        errors.join('; '),
                );
            } else {
                setAssignError(t('Failed to assign questionnaire.') + ' ' + errors.join('; '));
            }
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

    const filteredTasks = tasks.filter((task) => {
        if (!taskSearchTerm.trim()) {
            return true;
        }
        const search = taskSearchTerm.toLowerCase();
        return (
            task.patientName?.toLowerCase().includes(search) ||
            task.patientId?.toLowerCase().includes(search) ||
            task.questionnaireName?.toLowerCase().includes(search) ||
            task.questionnaireId?.toLowerCase().includes(search)
        );
    });

    const handleDeleteTask = async (): Promise<void> => {
        if (!taskToDelete) return;
        if (!accessToken) {
            setDeleteTaskError(t('You must be logged in to delete tasks.'));
            return;
        }

        setDeleteTaskError(null);
        setIsDeletingTask(true);

        try {
            await deleteTask(taskToDelete.id, { accessToken });
            setTaskToDelete(null);
            await fetchTasks();
        } catch (error) {
            const message = error instanceof Error ? error.message : t('Unknown error');
            setDeleteTaskError(message);
        } finally {
            setIsDeletingTask(false);
        }
    };

    const closeDeleteTaskModal = (): void => {
        setTaskToDelete(null);
        setDeleteTaskError(null);
    };

    // TODO REMOVE MOCK: Create mock QuestionnaireResponse data for testing frontend
    const createMockQuestionnaireResponse = (task: TaskSummary): QuestionnaireResponse => {
        return {
            resourceType: 'QuestionnaireResponse',
            id: `mock-response-${task.id}`,
            status: 'completed',
            questionnaire: task.questionnaireId ? `Questionnaire/${task.questionnaireId}` : undefined,
            authored: new Date().toISOString(),
            author: {
                reference: task.patientId ? `Patient/${task.patientId}` : undefined,
                display: task.patientName || task.patientId,
            },
            item: [
                {
                    linkId: 'q1',
                    text: 'What is your current age?',
                    answer: [
                        {
                            valueInteger: 35,
                        },
                    ],
                },
                {
                    linkId: 'q2',
                    text: 'How would you rate your overall health?',
                    answer: [
                        {
                            valueCoding: {
                                system: 'http://example.org/health-rating',
                                code: 'good',
                                display: 'Good',
                            },
                        },
                    ],
                },
                {
                    linkId: 'q3',
                    text: 'Do you have any chronic conditions?',
                    answer: [
                        {
                            valueBoolean: true,
                        },
                    ],
                },
                {
                    linkId: 'q4',
                    text: 'If yes, please specify:',
                    answer: [
                        {
                            valueString: 'Hypertension and Type 2 Diabetes',
                        },
                    ],
                },
                {
                    linkId: 'q5',
                    text: 'When did you last visit a doctor?',
                    answer: [
                        {
                            valueDate: '2024-01-15',
                        },
                    ],
                },
                {
                    linkId: 'q6',
                    text: 'How many medications do you take daily?',
                    answer: [
                        {
                            valueInteger: 3,
                        },
                    ],
                },
                {
                    linkId: 'q7',
                    text: 'Any additional comments or concerns?',
                    answer: [
                        {
                            valueString: 'I would like to discuss my medication schedule during the next appointment.',
                        },
                    ],
                },
                {
                    linkId: 'group1',
                    text: 'Lifestyle Information',
                    item: [
                        {
                            linkId: 'q8',
                            text: 'Do you exercise regularly?',
                            answer: [
                                {
                                    valueBoolean: true,
                                },
                            ],
                        },
                        {
                            linkId: 'q9',
                            text: 'How many times per week?',
                            answer: [
                                {
                                    valueInteger: 4,
                                },
                            ],
                        },
                        {
                            linkId: 'q10',
                            text: 'What is your weight in kilograms?',
                            answer: [
                                {
                                    valueQuantity: {
                                        value: 75.5,
                                        unit: 'kg',
                                        system: 'http://unitsofmeasure.org',
                                        code: 'kg',
                                    },
                                },
                            ],
                        },
                    ],
                },
            ],
        };
    };

    const handleTaskClick = async (task: TaskSummary): Promise<void> => {
        setSelectedTask(task);
        setQuestionnaireResponse(null);
        setResponseError(null);

        if (!accessToken) {
            setResponseError(t('You must be logged in to view responses.'));
            return;
        }

        // // TODO REMOVE MOCK: For testing - use mock data for ALL tasks
        // // Remove this block once backend has real QuestionnaireResponse data
        // const mockResponse = createMockQuestionnaireResponse(task);
        // setQuestionnaireResponse(mockResponse);
        // setIsLoadingResponse(false);
        // return;
        // // END TODO REMOVE MOCK

        // If task is still requested (not yet answered), show modal with no response
        if (task.status === 'requested') {
            return;
        }

        // For tasks that are not 'requested', try to fetch the response
        setIsLoadingResponse(true);

        try {
            // First, get the full Task resource to find the QuestionnaireResponse reference
            const taskResource = await getTaskById<any>(task.id, { accessToken });

            // Extract QuestionnaireResponse ID from Task.output
            let responseId: string | null = null;

            if (taskResource?.output && Array.isArray(taskResource.output) && taskResource.output.length > 0) {
                const firstOutput = taskResource.output[0];
                // The backend sets the value as a FhirString, which could be in valueString or value field
                const outputValue =
                    firstOutput?.valueString || firstOutput?.valueReference?.reference || (firstOutput as any)?.value;

                if (outputValue) {
                    // The value might be a string like "QuestionnaireResponse/{id}" or just "{id}"
                    const valueStr = typeof outputValue === 'string' ? outputValue : outputValue.toString();
                    if (valueStr.includes('QuestionnaireResponse/')) {
                        responseId = valueStr.split('QuestionnaireResponse/').pop() || null;
                    } else if (valueStr.includes('/')) {
                        responseId = valueStr.split('/').pop() || null;
                    } else {
                        responseId = valueStr;
                    }
                }
            }

            if (!responseId) {
                setResponseError(t('No response found for this task.'));
                setIsLoadingResponse(false);
                return;
            }

            // Fetch the QuestionnaireResponse
            const response = await getQuestionnaireResponseById<QuestionnaireResponse>(responseId, {
                accessToken,
            });

            setQuestionnaireResponse(response);
        } catch (error) {
            const message = error instanceof Error ? error.message : t('Unknown error');
            setResponseError(message);
            console.error('[FrontPage] Error loading QuestionnaireResponse:', error);
        } finally {
            setIsLoadingResponse(false);
        }
    };

    const closeTaskResponseModal = (): void => {
        setSelectedTask(null);
        setQuestionnaireResponse(null);
        setResponseError(null);
    };

    const handlePreviewQuestionnaire = async (questionnaire: QuestionnaireSummary): Promise<void> => {
        setQuestionnaireToPreview(questionnaire);
        setPreviewQuestionnaire(null);
        setPreviewError(null);

        if (!accessToken) {
            setPreviewError(t('You must be logged in to preview questionnaires.'));
            return;
        }

        setIsLoadingPreview(true);

        try {
            const fetchedQuestionnaire = await getPractitionerQuestionnaireById<Questionnaire>(questionnaire.id, {
                accessToken,
            });
            setPreviewQuestionnaire(fetchedQuestionnaire);
        } catch (error) {
            const message = error instanceof Error ? error.message : t('Unknown error');
            setPreviewError(message);
            console.error('[FrontPage] Error loading Questionnaire for preview:', error);
        } finally {
            setIsLoadingPreview(false);
        }
    };

    const closePreviewModal = (): void => {
        setQuestionnaireToPreview(null);
        setPreviewQuestionnaire(null);
        setPreviewError(null);
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
                        <h3>{viewMode === 'questionnaires' ? t('Available questionnaires') : t('Assigned Tasks')}</h3>
                        <div className="frontpage__view-toggle">
                            <button
                                type="button"
                                className={`frontpage__toggle-button ${viewMode === 'questionnaires' ? 'active' : ''}`}
                                onClick={() => setViewMode('questionnaires')}
                            >
                                {t('Available Questionnaires')}
                            </button>
                            <button
                                type="button"
                                className={`frontpage__toggle-button ${viewMode === 'tasks' ? 'active' : ''}`}
                                onClick={() => setViewMode('tasks')}
                            >
                                {t('Assigned Tasks')}
                            </button>
                        </div>
                    </div>
                    {viewMode === 'questionnaires' ? (
                        <>
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
                                            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                                                setSearchTerm(e.target.value)
                                            }
                                        />
                                    )}
                                    {assignmentFeedback && (
                                        <div className="frontpage__info-message">{assignmentFeedback}</div>
                                    )}
                                    {questionnaireListError && (
                                        <div className="frontpage__error">
                                            {t('Failed to load questionnaires')}: {questionnaireListError}
                                        </div>
                                    )}
                                    {filteredQuestionnaires.length > 0 ? (
                                        <ul className="frontpage__list">
                                            {filteredQuestionnaires.map((item) => (
                                                <li key={item.id} className="frontpage__questionnaire-item">
                                                    <div
                                                        className="frontpage__task-content frontpage__task-content--clickable"
                                                        onClick={() => startAssign(item)}
                                                        role="button"
                                                        tabIndex={0}
                                                        onKeyDown={(e) => {
                                                            if (e.key === 'Enter' || e.key === ' ') {
                                                                e.preventDefault();
                                                                startAssign(item);
                                                            }
                                                        }}
                                                    >
                                                        <span className="frontpage__list-title">
                                                            {item.displayName}
                                                        </span>
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
                                                                {t('Updated at')}:{' '}
                                                                {new Date(item.updatedAt).toLocaleString()}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <Btn
                                                        title={t('Preview')}
                                                        variant="secondary"
                                                        onClick={() => {
                                                            handlePreviewQuestionnaire(item);
                                                        }}
                                                    />
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
                        </>
                    ) : (
                        <>
                            {!accessToken ? (
                                <div className="frontpage__info-message">{t('Log in to load tasks.')}</div>
                            ) : isTaskListLoading ? (
                                <div className="frontpage__loading">
                                    <SpinnerBox />
                                    <p>{t('Loading tasks...')}</p>
                                </div>
                            ) : (
                                <>
                                    {tasks.length > 0 && (
                                        <input
                                            type="text"
                                            className="frontpage__search-input"
                                            placeholder={t('Search tasks...')}
                                            value={taskSearchTerm}
                                            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                                                setTaskSearchTerm(e.target.value)
                                            }
                                        />
                                    )}
                                    {taskListError && (
                                        <div className="frontpage__error">
                                            {t('Failed to load tasks')}: {taskListError}
                                        </div>
                                    )}
                                    {filteredTasks.length > 0 ? (
                                        <ul className="frontpage__list">
                                            {filteredTasks.map((task) => (
                                                <li key={task.id} className="frontpage__task-item">
                                                    <div
                                                        className="frontpage__task-content frontpage__task-content--clickable"
                                                        onClick={() => handleTaskClick(task)}
                                                        role="button"
                                                        tabIndex={0}
                                                        onKeyDown={(e) => {
                                                            if (e.key === 'Enter' || e.key === ' ') {
                                                                e.preventDefault();
                                                                handleTaskClick(task);
                                                            }
                                                        }}
                                                    >
                                                        <span className="frontpage__list-title">
                                                            {t('Patient')}:{' '}
                                                            {task.patientName || task.patientId || t('Unknown')}
                                                        </span>
                                                        <span className="frontpage__list-meta">
                                                            {t('Questionnaire')}:{' '}
                                                            {task.questionnaireName ||
                                                                task.questionnaireId ||
                                                                t('Unknown')}
                                                        </span>
                                                        {task.status && (
                                                            <span className="frontpage__list-meta">
                                                                {t('Status')}: {task.status}
                                                            </span>
                                                        )}
                                                        {task.updatedAt && (
                                                            <span className="frontpage__list-meta">
                                                                {t('Updated at')}:{' '}
                                                                {new Date(task.updatedAt).toLocaleString()}
                                                            </span>
                                                        )}
                                                        {task.status === 'completed' && (
                                                            <span className="frontpage__list-meta frontpage__list-meta--hint">
                                                                {t('Click to view response')}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <Btn
                                                        title={t('Delete')}
                                                        variant="secondary"
                                                        onClick={() => {
                                                            setTaskToDelete(task);
                                                        }}
                                                    />
                                                </li>
                                            ))}
                                        </ul>
                                    ) : tasks.length > 0 ? (
                                        <div className="frontpage__empty">{t('No tasks found')}</div>
                                    ) : (
                                        <div className="frontpage__empty">{t('No tasks available yet')}</div>
                                    )}
                                </>
                            )}
                        </>
                    )}
                </div>
            </div>
            {selectedQuestionnaire && (
                <Modal title={t('Assign questionnaire')} close={closeAssignModal}>
                    <div className="frontpage__assign-form">
                        <p>{t('Select one or more patients to assign this questionnaire to.')}</p>
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
                                            <li
                                                key={patientId}
                                                className={`frontpage__patient-item ${
                                                    selectedPatients.has(patientId)
                                                        ? 'frontpage__patient-item--selected'
                                                        : ''
                                                }`}
                                                onClick={() => !isAssigning && handlePatientToggle(patientId)}
                                                role="button"
                                                tabIndex={0}
                                                onKeyDown={(e: React.KeyboardEvent) => {
                                                    if (!isAssigning && (e.key === 'Enter' || e.key === ' ')) {
                                                        e.preventDefault();
                                                        handlePatientToggle(patientId);
                                                    }
                                                }}
                                            >
                                                <span className="frontpage__patient-name">{patientId}</span>
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
                                title={
                                    isAssigning
                                        ? t('Assigning...')
                                        : selectedPatients.size > 0
                                        ? t('Assign to {{count}} selected', { count: selectedPatients.size })
                                        : t('Assign')
                                }
                                variant="primary"
                                onClick={submitAssignment}
                                disabled={isAssigning || selectedPatients.size === 0}
                            />
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
            {taskToDelete && (
                <Modal title={t('Delete Task')} close={closeDeleteTaskModal}>
                    <div className="frontpage__delete-task-form">
                        <p>{t('Are you sure you want to delete this task?')}</p>
                        <div className="frontpage__assign-details">
                            <div>
                                <strong>{t('Patient')}</strong>
                            </div>
                            <div>{taskToDelete.patientName || taskToDelete.patientId || t('Unknown')}</div>
                        </div>
                        <div className="frontpage__assign-details">
                            <div>
                                <strong>{t('Questionnaire')}</strong>
                            </div>
                            <div>{taskToDelete.questionnaireName || taskToDelete.questionnaireId || t('Unknown')}</div>
                        </div>
                        {deleteTaskError && <div className="frontpage__error">{deleteTaskError}</div>}
                        <div className="frontpage__assign-actions">
                            <Btn
                                title={isDeletingTask ? t('Deleting...') : t('Delete')}
                                variant="primary"
                                onClick={handleDeleteTask}
                                disabled={isDeletingTask}
                            />
                            <Btn title={t('Cancel')} variant="secondary" onClick={closeDeleteTaskModal} />
                        </div>
                    </div>
                </Modal>
            )}
            {selectedTask && (
                <TaskResponseModal
                    task={selectedTask}
                    questionnaireResponse={questionnaireResponse}
                    isLoading={isLoadingResponse}
                    error={responseError}
                    onClose={closeTaskResponseModal}
                    accessToken={accessToken}
                />
            )}
            {questionnaireToPreview && (
                <QuestionnairePreviewModal
                    questionnaire={previewQuestionnaire}
                    isLoading={isLoadingPreview}
                    error={previewError}
                    onClose={closePreviewModal}
                />
            )}
        </>
    );
};

export default FrontPage;
