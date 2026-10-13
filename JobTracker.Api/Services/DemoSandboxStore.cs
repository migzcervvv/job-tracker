using Microsoft.EntityFrameworkCore.Storage;
using Microsoft.Extensions.Caching.Memory;

namespace JobTracker.Api.Services;

public sealed class DemoSandboxStore : IDisposable
{
    private readonly MemoryCache cache = new(new MemoryCacheOptions { SizeLimit = 500 });
    public InMemoryDatabaseRoot GetRoot(string sessionId)
    {
        lock (cache)
            return cache.GetOrCreate(sessionId, entry =>
            {
                entry.AbsoluteExpirationRelativeToNow = TimeSpan.FromHours(1);
                entry.Size = 1;
                return new InMemoryDatabaseRoot();
            })!;
    }
    public void Dispose() => cache.Dispose();
}
