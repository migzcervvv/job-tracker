using JobTracker.Api.Models;
namespace JobTracker.Api.Dtos;
public record UpdateStatusRequest(ApplicationStatus Status, Guid? Version = null);
public record UpsertStageDetailRequest(ApplicationStatus Stage, Dictionary<string, object?> Fields, Guid? StageDetailId = null, Guid? Version = null);
public record SetSkillsRequest(List<string> SkillNames, Guid? RunId = null);
public record SkillGapItem(string Name, int Frequency, bool IHaveIt, int Trend, double AvgImportance);
