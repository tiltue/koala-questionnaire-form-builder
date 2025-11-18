using System;
using System.Net.Http;
using System.Net.Http.Json;
using System.Threading;
using System.Threading.Tasks;

namespace Koala.QuestionnaireFormBuilder.Server.Clients
{
    /// <summary>
    /// Typed HttpClient that exposes the QuestionnaireResponse endpoints used by the frontend.
    /// Register this client with the desired base address and authentication headers in the Startup/Program class.
    /// </summary>
    public class QuestionnaireResponseClient
    {
        private readonly HttpClient _httpClient;

        public QuestionnaireResponseClient(HttpClient httpClient)
        {
            _httpClient = httpClient ?? throw new ArgumentNullException(nameof(httpClient));
        }

        public Task<HttpResponseMessage> GetMyQuestionnaireResponsesAsync(
            CancellationToken cancellationToken = default)
        {
            return _httpClient.GetAsync("/Patient/Me/QuestionnaireResponse", cancellationToken);
        }

        public Task<HttpResponseMessage> GetQuestionnaireResponseAsync(
            string id,
            CancellationToken cancellationToken = default)
        {
            if (string.IsNullOrWhiteSpace(id))
            {
                throw new ArgumentException("QuestionnaireResponse id must be provided", nameof(id));
            }

            return _httpClient.GetAsync($"/QuestionnaireResponse/{id}", cancellationToken);
        }

        public Task<HttpResponseMessage> CreateQuestionnaireResponseAsync<TPayload>(
            TPayload payload,
            CancellationToken cancellationToken = default)
        {
            if (payload == null)
            {
                throw new ArgumentNullException(nameof(payload));
            }

            return _httpClient.PostAsJsonAsync("/QuestionnaireResponse", payload, cancellationToken);
        }
    }
}

