using JobTracker.Api.Data;
using JobTracker.Api.Models;
using JobTracker.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
namespace JobTracker.Api.Controllers;
[ApiController, Route("api/internal/notifications"), AllowAnonymous, ServiceFilter(typeof(AutomationKeyFilter))]
public class NotificationController(AppDbContext db) : ControllerBase
{
    [HttpPost("claim")]
    public async Task<IActionResult> Claim(ClaimRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.DeliveryKey) || req.DeliveryKey.Length > 200 || !await db.Users.AnyAsync(u => u.Id == req.UserId)) return BadRequest("Invalid notification recipient or key.");
        var profile = await db.UserProfiles.IgnoreQueryFilters().FirstOrDefaultAsync(p => p.UserId == req.UserId);
        if (profile == null || (req.DeliveryKey.StartsWith("weekly:") ? !profile.WeeklyDigestEnabled : !profile.RemindersEnabled)) return Conflict("Notifications disabled.");
        if (!req.DeliveryKey.StartsWith("weekly:") && !req.DeliveryKey.StartsWith("stale:") && !req.DeliveryKey.StartsWith("deadline:")) return BadRequest("Unknown delivery type.");
        if (db.Database.IsNpgsql()) {
            var id = req.DeliveryKey; var user = req.UserId; var token = Guid.NewGuid(); var version = Guid.NewGuid(); var now = DateTimeOffset.UtcNow;
            await db.Database.ExecuteSqlInterpolatedAsync($"INSERT INTO \"NotificationReceipts\" (\"DeliveryKey\", \"UserId\", \"Status\", \"LeaseToken\", \"LeaseUntil\", \"UpdatedAt\", \"Version\") VALUES ({id}, {user}, 'pending', {token}, {now}, {now}, {version}) ON CONFLICT (\"DeliveryKey\") DO NOTHING");
        }
        var receipt = await db.NotificationReceipts.IgnoreQueryFilters().SingleOrDefaultAsync(r => r.DeliveryKey == req.DeliveryKey);
        if (receipt != null && (receipt.UserId != req.UserId || receipt.Status == "delivered" || receipt.LeaseUntil > DateTimeOffset.UtcNow)) return Conflict("Delivery already claimed or completed.");
        if (receipt == null) { receipt = new NotificationReceipt { DeliveryKey = req.DeliveryKey, UserId = req.UserId }; db.NotificationReceipts.Add(receipt); }
        receipt.LeaseToken = Guid.NewGuid(); receipt.LeaseUntil = DateTimeOffset.UtcNow.AddMinutes(5); receipt.UpdatedAt = DateTimeOffset.UtcNow; receipt.Version = Guid.NewGuid();
        await db.SaveChangesAsync();
        return Ok(new { receipt.DeliveryKey, receipt.LeaseToken, receipt.LeaseUntil });
    }
    [HttpPost("complete")]
    public async Task<IActionResult> Complete(CompleteRequest req)
    {
        var receipt = await db.NotificationReceipts.IgnoreQueryFilters().SingleOrDefaultAsync(r => r.DeliveryKey == req.DeliveryKey);
        if (receipt == null) return NotFound();
        if (receipt.LeaseToken != req.LeaseToken) return Conflict("Delivery lease replaced.");
        if (receipt.Status == "delivered") return Ok();
        receipt.Status = "delivered"; receipt.UpdatedAt = DateTimeOffset.UtcNow; receipt.Version = Guid.NewGuid(); await db.SaveChangesAsync(); return Ok();
    }
    public record ClaimRequest(string DeliveryKey, Guid UserId);
    public record CompleteRequest(string DeliveryKey, Guid LeaseToken);
}
