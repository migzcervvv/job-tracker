using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace JobTracker.Api.Services;

public record RequestFailure(int Status, string Code, string Message)
{
    public static RequestFailure Classify(Exception error)
    {
        var cause = error is DbUpdateException { InnerException: not null } ? error.InnerException : error;
        return cause switch
        {
            PostgresException { SqlState: "42P01" or "42703" or "42883" } =>
                new(503, "database_schema_outdated", "The database requires an update."),
            NpgsqlException { IsTransient: true } =>
                new(503, "database_unavailable", "The database is temporarily unavailable."),
            _ => new(500, "internal_error", "Internal server error")
        };
    }
}
