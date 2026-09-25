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
            var res = await client.GetAsync($"{n8nBaseUrl.TrimEnd('/')}/health");
            return res.IsSuccessStatusCode ? "healthy" : "unreachable";
        }
        catch
        {
            return "unreachable";
        }
    }
}