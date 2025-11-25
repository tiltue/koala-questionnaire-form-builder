const DEFAULT_SCOPES = [
    'openid',
    'questionnaire_create',
    'questionnaire_read',
    'questionnaire_write',
    'questionnaire_view',
    'user_roles',
];

const AUDIENCE_SCOPES = ['aud_questionnaire', 'aud_streaming'];
const KEYCLOAK_AUDIENCE = 'questionnaire';

const SCOPES = Array.from(new Set([...DEFAULT_SCOPES, ...AUDIENCE_SCOPES])).join(' ');

module.exports = {
    SCOPES,
    DEFAULT_SCOPES,
    AUDIENCE_SCOPES,
    KEYCLOAK_AUDIENCE,
};
