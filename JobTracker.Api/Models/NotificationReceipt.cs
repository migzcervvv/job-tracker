using System.ComponentModel.DataAnnotations;
namespace JobTracker.Api.Models;
public class NotificationReceipt
{
    [Key, MaxLength(200)] public string DeliveryKey { get; set; } = "";
    public Guid UserId { get; set; }
    public string Status { get; set; } = "pending";
    public Guid LeaseToken { get; set; } = Guid.NewGuid();
    public DateTimeOffset LeaseUntil { get; set; } = DateTimeOffset.UtcNow.AddMinutes(5);
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
    [ConcurrencyCheck] public Guid Version { get; set; } = Guid.NewGuid();
}
