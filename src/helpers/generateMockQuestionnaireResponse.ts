import { Questionnaire, QuestionnaireItem, QuestionnaireResponse, QuestionnaireResponseItem } from '../types/fhir';
import { IQuestionnaireItemType } from '../types/IQuestionnareItemType';

/**
 * Generates sample answer value based on QuestionnaireItem type
 */
const generateSampleAnswer = (item: QuestionnaireItem): QuestionnaireResponseItem['answer'] => {
    const itemType = item.type as string;

    // Skip display items - they don't have answers
    if (itemType === IQuestionnaireItemType.display || itemType === IQuestionnaireItemType.group) {
        return undefined;
    }

    // For choice/open-choice, try to use the first answerOption if available
    if (itemType === IQuestionnaireItemType.choice || itemType === IQuestionnaireItemType.openChoice) {
        if (item.answerOption && item.answerOption.length > 0) {
            const firstOption = item.answerOption[0];
            if (firstOption.valueCoding) {
                return [
                    {
                        valueCoding: firstOption.valueCoding,
                    },
                ];
            }
            if (firstOption.valueString) {
                return [
                    {
                        valueString: firstOption.valueString,
                    },
                ];
            }
            if (firstOption.valueInteger !== undefined) {
                return [
                    {
                        valueInteger: firstOption.valueInteger,
                    },
                ];
            }
        }
        // Fallback for choice without options
        return [
            {
                valueCoding: {
                    system: 'http://example.org/codes',
                    code: 'sample',
                    display: 'Sample Answer',
                },
            },
        ];
    }

    // Generate answers based on type
    switch (itemType) {
        case IQuestionnaireItemType.boolean:
            return [
                {
                    valueBoolean: true,
                },
            ];

        case IQuestionnaireItemType.integer:
            return [
                {
                    valueInteger: 42,
                },
            ];

        case IQuestionnaireItemType.decimal:
            return [
                {
                    valueDecimal: 3.14,
                },
            ];

        case IQuestionnaireItemType.date:
            return [
                {
                    valueDate: new Date().toISOString().split('T')[0], // Today's date in YYYY-MM-DD format
                },
            ];

        case IQuestionnaireItemType.dateTime:
            return [
                {
                    valueDateTime: new Date().toISOString(),
                },
            ];

        case IQuestionnaireItemType.time:
            return [
                {
                    valueTime: '12:00:00',
                },
            ];

        case IQuestionnaireItemType.string:
        case IQuestionnaireItemType.text:
            return [
                {
                    valueString: `Sample answer for ${item.text || item.linkId}`,
                },
            ];

        case IQuestionnaireItemType.quantity:
            return [
                {
                    valueQuantity: {
                        value: 75.5,
                        unit: 'kg',
                        system: 'http://unitsofmeasure.org',
                        code: 'kg',
                    },
                },
            ];

        case IQuestionnaireItemType.url:
            return [
                {
                    valueUri: 'https://example.com',
                },
            ];

        case IQuestionnaireItemType.attachment:
            return [
                {
                    valueAttachment: {
                        title: 'Sample Attachment',
                        contentType: 'application/pdf',
                        url: 'https://example.com/sample.pdf',
                    },
                },
            ];

        default:
            // For unknown types, try string as fallback
            return [
                {
                    valueString: `Sample answer`,
                },
            ];
    }
};

/**
 * Recursively converts QuestionnaireItem to QuestionnaireResponseItem
 */
const convertItemToResponseItem = (item: QuestionnaireItem): QuestionnaireResponseItem => {
    const responseItem: QuestionnaireResponseItem = {
        linkId: item.linkId,
        text: item.text,
    };

    // Handle nested items (groups)
    if (item.item && item.item.length > 0) {
        responseItem.item = item.item.map(convertItemToResponseItem);
    }

    // Generate answer if this is not a display/group item
    const itemType = item.type as string;
    if (itemType !== IQuestionnaireItemType.display && itemType !== IQuestionnaireItemType.group) {
        const answer = generateSampleAnswer(item);
        if (answer) {
            responseItem.answer = answer;
        }
    }

    return responseItem;
};

/**
 * Generates a mock QuestionnaireResponse from a Questionnaire
 * This ensures the linkIds match exactly, which is required for proper display
 */
export const generateMockQuestionnaireResponse = (
    questionnaire: Questionnaire,
    task: { id: string; patientId?: string; patientName?: string; questionnaireId?: string },
): QuestionnaireResponse => {
    const responseItems: QuestionnaireResponseItem[] = [];

    // Convert all top-level items
    if (questionnaire.item && questionnaire.item.length > 0) {
        responseItems.push(...questionnaire.item.map(convertItemToResponseItem));
    }

    return {
        resourceType: 'QuestionnaireResponse',
        id: `mock-response-${task.id}`,
        status: 'completed',
        questionnaire: task.questionnaireId ? `Questionnaire/${task.questionnaireId}` : questionnaire.id,
        authored: new Date().toISOString(),
        author: {
            reference: task.patientId ? `Patient/${task.patientId}` : undefined,
            display: task.patientName || task.patientId || 'Mock User',
        },
        item: responseItems,
    };
};

