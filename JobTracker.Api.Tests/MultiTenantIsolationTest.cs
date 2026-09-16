using JobTracker.Api.Data;
using JobTracker.Api.Models;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using Pgvector.EntityFrameworkCore;
using Xunit;

namespace JobTracker.Api.Tests;

public class MultiTenantIsolationTests
{
    [Fact]
    public async Task UsersCanOnlySeeTheirOwnApplications()
    {
        var connectionString = "Host=aws-1-ap-northeast-1.pooler.supabase.com;Port=5432;Database=postgres;Username=postgres.qqpzljuqwsmjrwtmeeqh;Password=88usBoHzggSELc8I;SSL Mode=Require;Trust Server Certificate=true";

        var userA = Guid.NewGuid();
        var userB = Guid.NewGuid();

        var applicationAId = Guid.NewGuid();
        var applicationBId = Guid.NewGuid();

        // ------------------------------------------------------------
        // ONE physical PostgreSQL connection.
        //
        // Every DbContext below uses this same connection, which means
        // they can all participate in the same transaction.
        // ------------------------------------------------------------
        await using var connection = new NpgsqlConnection(connectionString);
        await connection.OpenAsync();

        // ------------------------------------------------------------
        // Start ONE transaction.
        //
        // Nothing committed inside this transaction survives the test.
        // ------------------------------------------------------------
        await using var transaction =
            await connection.BeginTransactionAsync();

        try
        {
            // ========================================================
            // SEED DATA
            // ========================================================

            var seedOptions = new DbContextOptionsBuilder<AppDbContext>()
                .UseNpgsql(
                    connection,
                    o => o.UseVector())
                .Options;

            await using (var seedDb = new AppDbContext(
                seedOptions,
                new FakeCurrentUser(userA)))
            {
                await seedDb.Database.UseTransactionAsync(transaction);

                seedDb.Applications.AddRange(
                    new Application
                    {
                        Id = applicationAId,
                        UserId = userA,
                        Title = "User A Job",
                        Company = "Company A",
                        RawDescription = "Application belonging to User A",
                        AppliedDate = DateTimeOffset.UtcNow
                    },
                    new Application
                    {
                        Id = applicationBId,
                        UserId = userB,
                        Title = "User B Job",
                        Company = "Company B",
                        RawDescription = "Application belonging to User B",
                        AppliedDate = DateTimeOffset.UtcNow
                    });

                await seedDb.SaveChangesAsync();
            }

            // ========================================================
            // USER A
            // ========================================================

            var userAOptions = new DbContextOptionsBuilder<AppDbContext>()
                .UseNpgsql(
                    connection,
                    o => o.UseVector())
                .Options;

            await using (var dbAsUserA = new AppDbContext(
                userAOptions,
                new FakeCurrentUser(userA)))
            {
                await dbAsUserA.Database.UseTransactionAsync(transaction);

                var results = await dbAsUserA.Applications
                    .AsNoTracking()
                    .ToListAsync();

                Assert.Single(results);

                Assert.Equal(
                    applicationAId,
                    results[0].Id);

                Assert.Equal(
                    userA,
                    results[0].UserId);

                Assert.Equal(
                    "User A Job",
                    results[0].Title);

                // Explicitly make sure User A cannot see User B.
                Assert.DoesNotContain(
                    results,
                    application => application.UserId == userB);

                // Direct cross-tenant lookup must also be blocked.
                var canUserASeeUserB =
                    await dbAsUserA.Applications
                        .AsNoTracking()
                        .AnyAsync(a => a.Id == applicationBId);

                Assert.False(canUserASeeUserB);
            }

            // ========================================================
            // USER B
            // ========================================================

            var userBOptions = new DbContextOptionsBuilder<AppDbContext>()
                .UseNpgsql(
                    connection,
                    o => o.UseVector())
                .Options;

            await using (var dbAsUserB = new AppDbContext(
                userBOptions,
                new FakeCurrentUser(userB)))
            {
                await dbAsUserB.Database.UseTransactionAsync(transaction);

                var results = await dbAsUserB.Applications
                    .AsNoTracking()
                    .ToListAsync();

                Assert.Single(results);

                Assert.Equal(
                    applicationBId,
                    results[0].Id);

                Assert.Equal(
                    userB,
                    results[0].UserId);

                Assert.Equal(
                    "User B Job",
                    results[0].Title);

                // Explicitly make sure User B cannot see User A.
                Assert.DoesNotContain(
                    results,
                    application => application.UserId == userA);

                // Direct cross-tenant lookup must also be blocked.
                var canUserBSeeUserA =
                    await dbAsUserB.Applications
                        .AsNoTracking()
                        .AnyAsync(a => a.Id == applicationAId);

                Assert.False(canUserBSeeUserA);
            }

            // ========================================================
            // NO COMMIT.
            //
            // The finally block rolls the transaction back.
            // ========================================================
        }
        finally
        {
            await transaction.RollbackAsync();
        }
    }
}