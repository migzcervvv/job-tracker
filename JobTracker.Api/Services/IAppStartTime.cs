// Services/IAppStartTime.cs
namespace JobTracker.Api.Services;

public interface IAppStartTime { DateTimeOffset StartedAt { get; } }

public class AppStartTime : IAppStartTime
{
    public DateTimeOffset StartedAt { get; } = DateTimeOffset.UtcNow;
}