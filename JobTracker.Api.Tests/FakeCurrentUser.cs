using JobTracker.Api.Data;
using JobTracker.Api.Services;

namespace JobTracker.Api.Tests;

public class FakeCurrentUser : ICurrentUserAccessor
{
    public Guid? UserId { get; }
    public FakeCurrentUser(Guid userId) => UserId = userId;
}