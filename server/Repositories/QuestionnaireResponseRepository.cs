using System;
using System.Net.Http;
using System.Net.Http.Json;
using System.Threading;
using System.Threading.Tasks;
using Koala.QuestionnaireFormBuilder.Server.Clients;

namespace Koala.QuestionnaireFormBuilder.Server.Repositories
{
    /// <summary>
    /// Simple repository abstraction that coordinates QuestionnaireResponse API operations.
    /// Replace the placeholders with domain models that fit your server architecture.
    /// </summary>
    public class QuestionnaireResponseRepository
    {
        private readonly QuestionnaireResponseClient _client;

        public QuestionnaireResponseRepository(QuestionnaireResponseClient client)
        {
            _client = client ?? throw new ArgumentNullException(nameof(client));
        }

        public Task<HttpResponseMessage> GetForCurrentPatientAsync(
            CancellationToken cancellationToken = default)
        {
            return _client.GetMyQuestionnaireResponsesAsync(cancellationToken);
        }

        public Task<HttpResponseMessage> GetByIdAsync(
            string id,
            CancellationToken cancellationToken = default)
        {
            return _client.GetQuestionnaireResponseAsync(id, cancellationToken);
        }

        public async Task<TResponse?> UploadAsync<TPayload, TResponse>(
            TPayload payload,
            CancellationToken cancellationToken = default)
        {
            var response = await _client.CreateQuestionnaireResponseAsync(payload, cancellationToken);

            response.EnsureSuccessStatusCode();

            if (response.Content.Headers.ContentLength is 0)
            {
                return default;
            }

            return await response.Content.ReadFromJsonAsync<TResponse>(cancellationToken: cancellationToken);
        }
    }
}

