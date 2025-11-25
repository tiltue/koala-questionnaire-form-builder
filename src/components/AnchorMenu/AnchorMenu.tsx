import './AnchorMenu.css';
import { DndProvider, DragSource, DragSourceConnector, ConnectDragSource } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';

import React from 'react';
import { useTranslation } from 'react-i18next';
import { ActionType, Items, MarkedItem, OrderItem } from '../../store/treeStore/treeStore';
import { IQuestionnaireItemType } from '../../types/IQuestionnareItemType';
import {
    moveItemAction,
    newItemAction,
    reorderItemAction,
    updateMarkedLinkIdAction,
} from '../../store/treeStore/treeActions';
import { ValidationErrors } from '../../helpers/orphanValidation';
import { SortableTreeWithoutDndContext as SortableTree } from '@nosferatu500/react-sortable-tree';
import '@nosferatu500/react-sortable-tree/style.css';
import { isIgnorableItem } from '../../helpers/itemControl';
import { generateItemButtons } from './ItemButtons/ItemButtons';
import { canTypeHaveChildren, getInitialItemConfig } from '../../helpers/questionTypeFeatures';
import Btn from '../Btn/Btn';
import { createQuestionnaire, QuestionnaireServiceConfig } from '../../services/questionnaireService';
import { useAuth } from '../../contexts/AuthContext';

export interface AnchorMenuProps {
    qOrder: OrderItem[];
    qItems: Items;
    qCurrentItem: MarkedItem | undefined;
    validationErrors: ValidationErrors[];
    dispatch: React.Dispatch<ActionType>;
    questionnaireJson?: string;
}

interface Node {
    title: string;
    hierarchy?: string;
    nodeType?: IQuestionnaireItemType;
    nodeReadableType?: string;
    children: Node[];
}

interface ExtendedNode {
    node: Node;
    path: string[];
}

interface NodeMoveEvent {
    treeData: Node[];
    nextParentNode: Node;
    node: Node;
    nextPath: string[];
    prevPath: string[];
}

interface NodeVisibilityToggleEvent {
    node: Node;
    expanded: boolean;
}

const newNodeLinkId = 'NEW';
const externalNodeType = 'yourNodeType';

const externalNodeSpec = {
    // This needs to return an object with a property `node` in it.
    // Object rest spread is recommended to avoid side effects of
    // referencing the same object in different trees.
    beginDrag: (componentProps: { node: Node }) => ({ node: { ...componentProps.node } }),
};
const externalNodeCollect = (connect: DragSourceConnector) => ({
    connectDragSource: connect.dragSource(),
    // Add props via react-dnd APIs to enable more visual
    // customization of your component
    // isDragging: monitor.isDragging(),
    // didDrop: monitor.didDrop(),
});

const ExternalNodeBaseComponent = (props: { connectDragSource: ConnectDragSource; node: Node }): JSX.Element | null => {
    return props.connectDragSource(<div className="anchor-menu__dragcomponent">{props.node.nodeReadableType}</div>, {
        dropEffect: 'copy',
    });
};

const YourExternalNodeComponent = DragSource(
    externalNodeType,
    externalNodeSpec,
    externalNodeCollect,
)(ExternalNodeBaseComponent);

const describeToken = (token?: string): string => {
    if (!token) {
        return 'n/a';
    }
    const head = token.slice(0, 8);
    const tail = token.slice(-6);
    return `${head}…${tail} (${token.length} chars)`;
};

const AnchorMenu = (props: AnchorMenuProps): JSX.Element => {
    const { t } = useTranslation();
    const { user } = useAuth();
    const [collapsedNodes, setCollapsedNodes] = React.useState<string[]>([]);
    const [uploadStatus, setUploadStatus] = React.useState<'idle' | 'loading' | 'success' | 'error'>('idle');
    const [uploadError, setUploadError] = React.useState<string | null>(null);

    const questionnaireApiConfig = React.useMemo<QuestionnaireServiceConfig>(() => {
        return {
            baseUrl: process.env.REACT_APP_QUESTIONNAIRE_API_URL || process.env.QUESTIONNAIRE_API_URL || undefined,
            accessToken: typeof user?.access_token === 'string' ? user.access_token : undefined,
        };
    }, [user]);

    React.useEffect(() => {
        console.log('[AnchorMenu] Questionnaire API config updated', {
            baseUrl: questionnaireApiConfig.baseUrl || 'n/a',
            accessToken: describeToken(questionnaireApiConfig.accessToken),
            hasUser: Boolean(user),
            userId: user?.sub,
        });
    }, [questionnaireApiConfig.baseUrl, questionnaireApiConfig.accessToken, user]);

    const handleUploadQuestionnaire = async () => {
        if (!props.questionnaireJson) {
            console.warn('[AnchorMenu] Tried to upload questionnaire without JSON data');
            return;
        }

        setUploadStatus('loading');
        setUploadError(null);
        console.groupCollapsed('[AnchorMenu] Upload questionnaire triggered');
        console.log('Questionnaire length', props.questionnaireJson.length);
        console.log('API base URL', questionnaireApiConfig.baseUrl);
        console.log('Access token', describeToken(questionnaireApiConfig.accessToken));
        console.groupEnd();

        try {
            const parsedQuestionnaire = JSON.parse(props.questionnaireJson);
            console.log('[AnchorMenu] Prepared Questionnaire payload', {
                resourceType: parsedQuestionnaire?.resourceType,
                questionnaireId: parsedQuestionnaire?.id,
                hasItems: Boolean(parsedQuestionnaire?.item?.length),
            });

            const response = await createQuestionnaire(parsedQuestionnaire, questionnaireApiConfig);
            setUploadStatus('success');
            console.log('[AnchorMenu] Questionnaire uploaded successfully', {
                questionnaireId: parsedQuestionnaire?.id,
                backendResponse: response || 'No response body',
            });
        } catch (error) {
            console.error('Failed to upload questionnaire', error);
            setUploadStatus('error');
            setUploadError(error instanceof Error ? error.message : t('Unknown error'));
        }
    };

    const mapToTreeData = (item: OrderItem[], hierarchy: string, parentLinkId?: string): Node[] => {
        return item
            .filter((x) => {
                const parentItem = parentLinkId ? props.qItems[parentLinkId] : undefined;
                return !isIgnorableItem(props.qItems[x.linkId], parentItem);
            })
            .map((x, index) => {
                const newHierarchy = `${hierarchy}${index + 1}.`;
                return {
                    title: x.linkId,
                    hierarchy: newHierarchy,
                    children: mapToTreeData(x.items, newHierarchy, x.linkId),
                    expanded: collapsedNodes.indexOf(x.linkId) === -1,
                };
            });
    };

    const getNodeKey = (extendedNode: ExtendedNode): string => {
        return extendedNode.node.title;
    };

    const treePathToOrderArray = (treePath: string[]): string[] => {
        const newPath = [...treePath];
        newPath.splice(-1);
        return newPath;
    };

    const hasValidationError = (linkId: string): boolean => {
        return props.validationErrors.some((error) => error.linkId === linkId);
    };

    const isSelectedItem = (linkId: string): boolean => {
        return props.qCurrentItem?.linkId === linkId;
    };

    const getRelevantIcon = (type?: string) => {
        switch (type) {
            case IQuestionnaireItemType.group:
                return 'folder-icon';
            case IQuestionnaireItemType.display:
                return 'message-icon';
            default:
                return 'question-icon';
        }
    };

    const createTypeComponent = (type: IQuestionnaireItemType, text: string): JSX.Element => {
        return (
            <YourExternalNodeComponent
                node={{
                    title: newNodeLinkId,
                    nodeType: type,
                    nodeReadableType: text,
                    children: [],
                }}
            />
        );
    };

    const orderTreeData = mapToTreeData(props.qOrder, '');
    return (
        <DndProvider backend={HTML5Backend}>
            <div className="questionnaire-overview">
                <div className="questionnaire-overview__toolbox">
                    <strong>{t('Components')}</strong>
                    {createTypeComponent(IQuestionnaireItemType.group, t('Group'))}
                    {createTypeComponent(IQuestionnaireItemType.string, t('Text answer'))}
                    {createTypeComponent(IQuestionnaireItemType.display, t('Information text'))}
                    {createTypeComponent(IQuestionnaireItemType.attachment, t('Attachment'))}
                    {createTypeComponent(IQuestionnaireItemType.receiver, t('Recipient list'))}
                    {createTypeComponent(IQuestionnaireItemType.receiverComponent, t('Recipient component'))}
                    {createTypeComponent(IQuestionnaireItemType.boolean, t('Confirmation'))}
                    {createTypeComponent(IQuestionnaireItemType.choice, t('Choice'))}
                    {createTypeComponent(IQuestionnaireItemType.date, t('Date'))}
                    {createTypeComponent(IQuestionnaireItemType.time, t('Time'))}
                    {createTypeComponent(IQuestionnaireItemType.integer, t('Number'))}
                    {createTypeComponent(IQuestionnaireItemType.quantity, t('Quantity'))}
                </div>
                <SortableTree
                    className="questionnaire-overview__treeview"
                    dndType={externalNodeType}
                    treeData={orderTreeData}
                    onChange={() => {
                        /* dummy */
                    }}
                    getNodeKey={getNodeKey}
                    onMoveNode={({ treeData, nextParentNode, node, nextPath, prevPath }: NodeMoveEvent) => {
                        const newPath = treePathToOrderArray(nextPath);
                        // find parent node:
                        const moveIndex = nextParentNode
                            ? nextParentNode.children.findIndex((x: Node) => x.title === node.title)
                            : treeData.findIndex((x: Node) => x.title === node.title);

                        if (node.title === newNodeLinkId && node.nodeType) {
                            props.dispatch(
                                newItemAction(
                                    getInitialItemConfig(node.nodeType, t('Recipient component')),
                                    newPath,
                                    moveIndex,
                                ),
                            );
                        } else {
                            const oldPath = treePathToOrderArray(prevPath);
                            // reorder within same parent
                            if (JSON.stringify(newPath) === JSON.stringify(oldPath)) {
                                props.dispatch(reorderItemAction(node.title, newPath, moveIndex));
                            } else {
                                props.dispatch(moveItemAction(node.title, newPath, oldPath, moveIndex));
                            }
                        }
                    }}
                    onVisibilityToggle={({ node, expanded }: NodeVisibilityToggleEvent) => {
                        const filteredNodes = collapsedNodes.filter((x) => x !== node.title);
                        if (!expanded) {
                            filteredNodes.push(node.title);
                        }
                        setCollapsedNodes(filteredNodes);
                    }}
                    canNodeHaveChildren={(node: Node): boolean => {
                        const item = props.qItems[node.title];
                        return item ? canTypeHaveChildren(item) : false;
                    }}
                    generateNodeProps={(extendedNode: ExtendedNode) => ({
                        className: `anchor-menu__item 
                            ${hasValidationError(extendedNode.node.title) ? 'validation-error' : ''} 
                            ${extendedNode.path.length === 1 ? 'anchor-menu__topitem' : ''} 
                            ${isSelectedItem(extendedNode.node.title) ? 'anchor-menu__item--selected' : ''}
                        `,
                        title: (
                            <span
                                className="anchor-menu__inneritem"
                                onClick={() => {
                                    props.dispatch(
                                        updateMarkedLinkIdAction(
                                            extendedNode.node.title,
                                            treePathToOrderArray(extendedNode.path),
                                        ),
                                    );
                                }}
                            >
                                <span className={getRelevantIcon(props.qItems[extendedNode.node.title]?.type)} />
                                <span className="anchor-menu__title">
                                    {extendedNode.node.hierarchy}
                                    {` `}
                                    {props.qItems[extendedNode.node.title]?.text}
                                </span>
                            </span>
                        ),
                        buttons: generateItemButtons(
                            t,
                            props.qItems[extendedNode.node.title],
                            treePathToOrderArray(extendedNode.path),
                            false,
                            props.dispatch,
                        ),
                    })}
                />
                {props.qOrder.length > 0 && (
                    <div className="questionnaire-overview__actions">
                        <Btn
                            title={
                                uploadStatus === 'loading' ? t('Creating questionnaire...') : t('Creat questionnaire')
                            }
                            onClick={handleUploadQuestionnaire}
                            disabled={uploadStatus === 'loading'}
                        />
                        {uploadStatus === 'success' && (
                            <span className="questionnaire-overview__upload-status questionnaire-overview__upload-status--success">
                                {t('Questionnaire uploaded')}
                            </span>
                        )}
                        {uploadStatus === 'error' && (
                            <span className="questionnaire-overview__upload-status questionnaire-overview__upload-status--error">
                                {uploadError || t('Failed to create questionnaire')}
                            </span>
                        )}
                    </div>
                )}
                {props.qOrder.length === 0 && (
                    <p className="anchor-menu__placeholder">
                        {t(
                            'Here you will find a summary of questionnaire elements. Drag a component here to start building this Questionnaire',
                        )}
                    </p>
                )}
            </div>
        </DndProvider>
    );
};

export default AnchorMenu;
