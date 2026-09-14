// Services/ISupabaseStorageService.cs
public interface ISupabaseStorageService
{
    Task UploadAsync(string path, byte[] content, string contentType);
    Task<string> CreateSignedUrlAsync(string path, int expiresInSeconds = 300);
    Task DeleteAsync(string path);
}

public class SupabaseStorageService : ISupabaseStorageService
{
    private readonly HttpClient _http;
    private const string Bucket = "resumes";

    public SupabaseStorageService(IConfiguration config, IHttpClientFactory factory)
    {
        _http = factory.CreateClient();
        _http.BaseAddress = new Uri(config["Supabase:Url"]!);
        var key = config["Supabase:ServiceRoleKey"];
        _http.DefaultRequestHeaders.Add("Authorization", $"Bearer {key}");
        _http.DefaultRequestHeaders.Add("apikey", key);
    }

    public async Task UploadAsync(string path, byte[] content, string contentType)
    {
        var req = new HttpRequestMessage(HttpMethod.Post, $"/storage/v1/object/{Bucket}/{path}")
        {
            Content = new ByteArrayContent(content)
        };
        req.Content.Headers.ContentType = new System.Net.Http.Headers.MediaTypeHeaderValue(contentType);
        var res = await _http.SendAsync(req);
        res.EnsureSuccessStatusCode();
    }

    public async Task<string> CreateSignedUrlAsync(string path, int expiresInSeconds = 300)
    {
        var res = await _http.PostAsJsonAsync($"/storage/v1/object/sign/{Bucket}/{path}", new { expiresIn = expiresInSeconds });
        res.EnsureSuccessStatusCode();
        var json = await res.Content.ReadFromJsonAsync<System.Text.Json.JsonElement>();
        var signedPath = json.GetProperty("signedURL").GetString();
        return $"{_http.BaseAddress}storage/v1{signedPath}";
    }

    public async Task DeleteAsync(string path)
    {
        var request = new HttpRequestMessage(HttpMethod.Delete, $"/storage/v1/object/{Bucket}")
        {
            Content = JsonContent.Create(new { prefixes = new[] { path } })
        };

        var res = await _http.SendAsync(request);
        if (!res.IsSuccessStatusCode && res.StatusCode != System.Net.HttpStatusCode.NotFound)
            res.EnsureSuccessStatusCode();
    }
}