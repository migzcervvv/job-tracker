using System.Net;
using System.Text;
using JobTracker.Api.Services;
using Microsoft.Extensions.Configuration;

namespace JobTracker.Api.Tests;

public class N8nHealthTests
{
    [Theory]
    [InlineData("application/json", "{\"status\":\"ok\"}", "healthy")]
    [InlineData("text/html", "<!DOCTYPE html><html>n8n editor</html>", "unreachable")]
    [InlineData("application/json", "{\"status\":\"error\"}", "unreachable")]
    [InlineData("application/json", "{}", "unreachable")]
    [InlineData("application/json", "null", "unreachable")]
    [InlineData("application/json", "invalid JSON", "unreachable")]
    public async Task OnlyRealReadinessResponsesAreHealthy(string contentType, string body, string expected)
    {
        var handler = new ResponseHandler(contentType, body);
        using var client = new HttpClient(handler);
        var configuration = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
            { ["N8n:BaseUrl"] = "https://automation.example.test/" }).Build();
        var checker = new N8nHealthChecker(configuration, new ClientFactory(client));
        Assert.Equal(expected, await checker.CheckAsync());
        Assert.Equal("https://automation.example.test/healthz/readiness", handler.RequestUri!.ToString());
    }

    private sealed class ClientFactory(HttpClient client) : IHttpClientFactory
    {
        public HttpClient CreateClient(string name) => client;
    }
    private sealed class ResponseHandler(string contentType, string body) : HttpMessageHandler
    {
        public Uri? RequestUri { get; private set; }
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            RequestUri = request.RequestUri;
            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK)
                { Content = new StringContent(body, Encoding.UTF8, contentType) });
        }
    }
}
