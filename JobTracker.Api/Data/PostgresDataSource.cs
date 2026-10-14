using Npgsql;
using Pgvector.Npgsql;

namespace JobTracker.Api.Data;

public static class PostgresDataSource
{
    public static NpgsqlDataSource Create(string connectionString)
    {
        var builder = new NpgsqlDataSourceBuilder(connectionString);
        // EF's buffered/split readers inspect column metadata and read values
        // as object, so vector must be registered with Npgsql as well as EF.
        builder.UseVector();
        return builder.Build();
    }
}
