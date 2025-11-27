import React from 'react';
import { useTranslation } from 'react-i18next';
import { getSidebarElements, generateSectionContent } from '../../locales/referoSidebarResources';
import { Questionnaire } from '../../types/fhir';

type Props = {
    questionnaire: Questionnaire;
};

const FormFillerSidebar = ({ questionnaire }: Props): JSX.Element => {
    const { t } = useTranslation();
    const [isSidebarViewEnabled, setIsSidebarViewEnabled] = React.useState(false);
    const sidebarData = getSidebarElements(questionnaire);

    return (
        <div
            style={{
                position: 'fixed',
                top: '70px',
                bottom: 0,
                right: 0,
                padding: 8,
                backgroundColor: '#fff',
                zIndex: 90,
                transition: 'transform .5s ease,-webkit-transform .5s ease',
                width: '27.5rem',
                borderLeft: '2px #AAA solid',
                transform: isSidebarViewEnabled ? 'translateX(0)' : 'translateX(100%)',
            }}
        >
            <button className="formFillerSidebar-button" onClick={() => setIsSidebarViewEnabled(!isSidebarViewEnabled)}>
                ?
            </button>
            {isSidebarViewEnabled && (
                <div className="formFillerSidebar-content">
                    {generateSectionContent(t('Options regarding completion (SOT-1)'), sidebarData['SOT-1'])}
                    {generateSectionContent(t('Guidance and person responsible (SOT-2)'), sidebarData['SOT-2'])}
                    {generateSectionContent(t('Processing by the recipient (SOT-3)'), sidebarData['SOT-3'])}
                </div>
            )}
        </div>
    );
};

export default FormFillerSidebar;
