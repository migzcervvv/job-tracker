namespace JobTracker.Api.Services;

public interface IN8nHealthChecker
{
    // Returns "healthy" | "unreachable" | "not_configured"
    Task<string> CheckAsync();
}

public class N8nHealthChecker(IConfiguration config, IHttpClientFactory httpFactory) : IN8nHealthChecker
{
    public async Task<string> CheckAsync()
    {
        var n8nBaseUrl = config["N8n:BaseUrl"];
        if (string.IsNullOrEmpty(n8nBaseUrl))
            return "not_configured";

        try
        {
            // Named client registered in Program.cs — was already there, just unused until now.
            var client = httpFactory.CreateClient("n8n");
            client.Timeout = TimeSpan.FromSeconds(5);
            using var res = await client.GetAsync($"{n8nBaseUrl.TrimEnd('/')}/healthz/readiness");
            if (!res.IsSuccessStatusCode ||
                res.Content.Headers.ContentType?.MediaType is not "application/json")
                return "unreachable";
            using var body = await System.Text.Json.JsonDocument.ParseAsync(await res.Content.ReadAsStreamAsync());
            return body.RootElement.ValueKind == System.Text.Json.JsonValueKind.Object &&
                body.RootElement.TryGetProperty("status", out var status) &&
                status.ValueKind == System.Text.Json.JsonValueKind.String && status.GetString() == "ok"
                ? "healthy" : "unreachable";
        }
        catch
        {
            return "unreachable";
        }
    }
}
