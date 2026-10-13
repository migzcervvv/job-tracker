using Microsoft.Extensions.Caching.Memory;
using System.Net;
public interface ISupabaseStorageService
{
    Task UploadAsync(string path, byte[] content, string contentType);
    Task<string> CreateSignedUrlAsync(string path, int expiresInSeconds = 300);
    Task DeleteAsync(string path);
}
public sealed class DemoFileStore : IDisposable
{
    private readonly MemoryCache cache = new(new MemoryCacheOptions { SizeLimit = 50_000_000 });
    public void Put(string key, byte[] bytes) => cache.Set(key, bytes, new MemoryCacheEntryOptions { Size = bytes.Length, AbsoluteExpirationRelativeToNow = TimeSpan.FromHours(1) });
    public byte[]? Get(string key) => cache.Get<byte[]>(key);
    public void Delete(string key) => cache.Remove(key);
    public void Dispose() => cache.Dispose();
}
public class SupabaseStorageService(IConfiguration config, IHttpClientFactory factory) : ISupabaseStorageService
{
    private const string Bucket = "resumes";
    private HttpClient Client()
    {
        var client = factory.CreateClient();
        client.Timeout = TimeSpan.FromSeconds(30);
        client.BaseAddress = new Uri(config["Supabase:Url"] ?? throw new InvalidOperationException("Storage is not configured."));
        client.DefaultRequestHeaders.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", config["Supabase:ServiceRoleKey"]);
        client.DefaultRequestHeaders.Add("apikey", config["Supabase:ServiceRoleKey"]);
        return client;
    }
    private static string Encoded(string path) => string.Join("/", path.Split('/').Select(Uri.EscapeDataString));
    public async Task UploadAsync(string path, byte[] content, string contentType)
    {
        using var client = Client();
        using var request = new HttpRequestMessage(HttpMethod.Post, $"/storage/v1/object/{Bucket}/{Encoded(path)}") { Content = new ByteArrayContent(content) };
        request.Content.Headers.ContentType = new System.Net.Http.Headers.MediaTypeHeaderValue(contentType);
        using var response = await client.SendAsync(request); response.EnsureSuccessStatusCode();
    }
    public async Task<string> CreateSignedUrlAsync(string path, int expiresInSeconds = 300)
    {
        using var client = Client();
        using var response = await client.PostAsJsonAsync($"/storage/v1/object/sign/{Bucket}/{Encoded(path)}", new { expiresIn = expiresInSeconds });
        response.EnsureSuccessStatusCode();
        var json = await response.Content.ReadFromJsonAsync<System.Text.Json.JsonElement>();
        return new Uri(client.BaseAddress!, "storage/v1" + json.GetProperty("signedURL").GetString()).ToString();
    }
    public async Task DeleteAsync(string path)
    {
        using var client = Client();
        using var request = new HttpRequestMessage(HttpMethod.Delete, $"/storage/v1/object/{Bucket}") { Content = JsonContent.Create(new { prefixes = new[] { path } }) };
        using var response = await client.SendAsync(request);
        if (response.StatusCode != HttpStatusCode.NotFound) response.EnsureSuccessStatusCode();
    }
}
