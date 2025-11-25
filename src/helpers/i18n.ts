import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import translationEN from '../locales/en-US/translation.json';
import translationDE from '../locales/de-DE/translation.json';

// the translations
const resources = {
    'en-US': {
        translation: translationEN,
    },
    'de-DE': {
        translation: translationDE,
    },
};

i18n.use(initReactI18next) // passes i18n down to react-i18next
    .init({
        resources,
        lng: localStorage.getItem('editor_language') || 'en-US',
        nsSeparator: false, // allow colon in strings (language file is flat JSON)
        keySeparator: false, // we do not use keys in form messages.welcome

        interpolation: {
            escapeValue: false, // react already safes from xss
        },
    });

export default i18n;
