using JobTracker.Api.Models;
using JobTracker.Api.Services;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;

namespace JobTracker.Api.Data;

public class AppDbContext : IdentityDbContext<IdentityUser<Guid>, IdentityRole<Guid>, Guid>
{
    private readonly Guid? _currentUserId;

    public AppDbContext(DbContextOptions<AppDbContext> options, ICurrentUserAccessor? currentUser = null)
        : base(options)
    {
        _currentUserId = currentUser?.UserId;
    }

    public DbSet<Application> Applications => Set<Application>();
    public DbSet<StageDetail> StageDetails => Set<StageDetail>();
    public DbSet<TimelineEvent> TimelineEvents => Set<TimelineEvent>();

    protected override void OnModelCreating(ModelBuilder builder)
    {
        base.OnModelCreating(builder);

        builder.Entity<Application>()
            .HasQueryFilter(a => _currentUserId == null || a.UserId == _currentUserId);

        builder.Entity<Application>()
            .HasMany(a => a.StageDetails)
            .WithOne(s => s.Application!)
            .HasForeignKey(s => s.ApplicationId);

        builder.Entity<Application>()
            .HasMany(a => a.TimelineEvents)
            .WithOne(t => t.Application!)
            .HasForeignKey(t => t.ApplicationId);

        builder.Entity<TimelineEvent>()
            .HasQueryFilter(t => _currentUserId == null || t.Application!.UserId == _currentUserId);

        builder.Entity<StageDetail>()
            .HasQueryFilter(s => _currentUserId == null || s.Application!.UserId == _currentUserId);
    }
}