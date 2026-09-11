using System.Security.Claims;

namespace JobTracker.Api.Services;

public interface ICurrentUserAccessor
{
    Guid? UserId { get; }
}

public class CurrentUserAccessor : ICurrentUserAccessor
{
    public Guid? UserId { get; }

    public CurrentUserAccessor(IHttpContextAccessor accessor)
    {
        var sub = accessor.HttpContext?.User?.FindFirstValue(ClaimTypes.NameIdentifier);
        UserId = Guid.TryParse(sub, out var id) ? id : null;
    }
}