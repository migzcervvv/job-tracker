using JobTracker.Api.Data;
using JobTracker.Api.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;
using Pgvector.EntityFrameworkCore;
using Xunit;

namespace JobTracker.Api.Tests;

public class MultiTenantIsolationTests
{
    [Fact]
    public async Task UsersCanOnlySeeTheirOwnApplications()
    {
        var connectionString = "Host=aws-1-ap-northeast-1.pooler.supabase.com;Port=5432;Database=postgres;Username=postgres.qqpzljuqwsmjrwtmeeqh;Password=88usBoHzggSELc8I;SSL Mode=Require;Trust Server Certificate=true";

        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseNpgsql(
                connectionString,
                o => o.UseVector())
            .Options;

        var userA = Guid.NewGuid();
        var userB = Guid.NewGuid();

        var applicationAId = Guid.NewGuid();
        var applicationBId = Guid.NewGuid();

        // ------------------------------------------------------------
        // Everything inside this transaction will be rolled back.
        // Even if the test fails halfway through, the transaction is
        // disposed without CommitAsync(), so the database is restored.
        // ------------------------------------------------------------
        await using var transactionDb = new AppDbContext(
            options,
            new FakeCurrentUser(userA));

        await transactionDb.Database.OpenConnectionAsync();

        await using var transaction =
            await transactionDb.Database.BeginTransactionAsync();

        try
        {
            // --------------------------------------------------------
            // Seed User A's application
            // --------------------------------------------------------
            transactionDb.Applications.Add(new Application
            {
                Id = applicationAId,
                UserId = userA,
                Title = "User A Job",
                Company = "Company A",
                RawDescription = "Application belonging to User A",
                AppliedDate = DateTimeOffset.UtcNow
            });

            // --------------------------------------------------------
            // Seed User B's application
            //
            // We temporarily use the same DbContext for seeding.
            // The global query filter affects queries, not these inserts.
            // --------------------------------------------------------
            transactionDb.Applications.Add(new Application
            {
                Id = applicationBId,
                UserId = userB,
                Title = "User B Job",
                Company = "Company B",
                RawDescription = "Application belonging to User B",
                AppliedDate = DateTimeOffset.UtcNow
            });

            await transactionDb.SaveChangesAsync();

            // --------------------------------------------------------
            // USER A
            // --------------------------------------------------------
            await using (var dbAsUserA = new AppDbContext(
                options,
                new FakeCurrentUser(userA)))
            {
                // The second context must participate in the same
                // transaction/connection to see the uncommitted data.
                await dbAsUserA.Database.UseTransactionAsync(transaction.GetDbTransaction());

                var results =
                    await dbAsUserA.Applications
                        .AsNoTracking()
                        .ToListAsync();

                Assert.Single(results);

                Assert.Equal(
                    applicationAId,
                    results[0].Id);

                Assert.Equal(
                    userA,
                    results[0].UserId);

                Assert.DoesNotContain(
                    results,
                    a => a.UserId == userB);
            }

            // --------------------------------------------------------
            // USER B
            // --------------------------------------------------------
            await using (var dbAsUserB = new AppDbContext(
                options,
                new FakeCurrentUser(userB)))
            {
                await dbAsUserB.Database.UseTransactionAsync(transaction.GetDbTransaction());

                var results =
                    await dbAsUserB.Applications
                        .AsNoTracking()
                        .ToListAsync();

                Assert.Single(results);

                Assert.Equal(
                    applicationBId,
                    results[0].Id);

                Assert.Equal(
                    userB,
                    results[0].UserId);

                Assert.DoesNotContain(
                    results,
                    a => a.UserId == userA);
            }

            // --------------------------------------------------------
            // Explicit cross-tenant ID checks
            //
            // Even if the query filter behaves unexpectedly, these
            // assertions make the security requirement explicit.
            // --------------------------------------------------------

            await using (var dbAsUserA = new AppDbContext(
                options,
                new FakeCurrentUser(userA)))
            {
                await dbAsUserA.Database.UseTransactionAsync(transaction.GetDbTransaction());

                var userBCannotReadUserARecord =
                    await dbAsUserA.Applications
                        .AsNoTracking()
                        .AnyAsync(a => a.Id == applicationBId);

                Assert.False(userBCannotReadUserARecord);
            }

            await using (var dbAsUserB = new AppDbContext(
                options,
                new FakeCurrentUser(userB)))
            {
                await dbAsUserB.Database.UseTransactionAsync(transaction.GetDbTransaction());

                var userBCannotReadUserARecord =
                    await dbAsUserB.Applications
                        .AsNoTracking()
                        .AnyAsync(a => a.Id == applicationAId);

                Assert.False(userBCannotReadUserARecord);
            }

            // --------------------------------------------------------
            //
            // Leaving the transaction uncommitted means all inserted
            // records disappear when the transaction is disposed.
            // --------------------------------------------------------
        }
        finally
        {
            // Explicit rollback makes the cleanup obvious and
            // protects the database even if an assertion fails.
            await transaction.RollbackAsync();
        }
    }
}