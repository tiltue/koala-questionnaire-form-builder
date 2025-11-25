# This repository is archived

For further updates to form builder (structor), see https://github.com/helsenorge/structor-export/

# Structor - FHIR form builder

Structor form builder is an open source tool for building FHIR Questionnaire forms. A live demo could be found at [formdesigner.helsenorgelab.no/](https://formdesigner.helsenorgelab.no/).

## FHIR Questionnaires

The FHIR specification defines [Questionnaires](https://www.hl7.org/fhir/questionnaire.html):

> A structured set of questions intended to guide the collection of answers from end-users. Questionnaires provide detailed control over order, presentation, phraseology and grouping to allow coherent, consistent data collection.

## Quickstart

Either open the demo at [formdesigner.helsenorgelab.no/](https://formdesigner.helsenorgelab.no/) or clone this repo, install Typescript, run `npm install` and run `npm start`.

## Koala backend connection

The questionnaire upload button integrates with the Koala backend API. To connect:

1. Set `QUESTIONNAIRE_API_URL=http://localhost:8080` for the Netlify function proxy
2. Start the frontend and Netlify functions: `netlify dev`
3. Sign in and use the upload button

The backend expects tokens with an `aud` claim matching the configured audience. Ensure Keycloak is configured with an Audience Mapper for the `api-debugger` client.

## Netlify functions

Run `npm install -g netlify-cli` before running npm run functions :)

## Docker

See [Dockerfile](Dockerfile) for info.
