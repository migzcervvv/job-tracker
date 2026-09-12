using JobTracker.Api.Models;

namespace JobTracker.Api.Dtos;

public record UpdateStatusRequest(ApplicationStatus Status);

public record ApplicationResponse(
    Guid Id,
    string Title,
    string Company,
    string? JobUrl,
    string RawDescription,
    ApplicationStatus Status,
    DateTimeOffset AppliedDate,
    DateTimeOffset UpdatedAt
);

public record TimelineEventResponse(Guid Id, string Type, string Body, DateTimeOffset CreatedAt);

public record ApplicationDetailResponse(
    Guid Id,
    string Title,
    string Company,
    string? JobUrl,
    string RawDescription,
    ApplicationStatus Status,
    DateTimeOffset AppliedDate,
    DateTimeOffset UpdatedAt,
    List<TimelineEventResponse> Timeline,
    List<StageDetailResponse> StageDetails
);

public record UpsertStageDetailRequest(ApplicationStatus Stage, Dictionary<string, object?> Fields);
public record StageDetailResponse(Guid Id, ApplicationStatus Stage, string FieldsJson, DateTimeOffset CreatedAt);
public record SetSkillsRequest(List<string> SkillNames);
public record SkillGapItem(string Name, int Frequency, bool IHaveIt);
public record SkillsGapResponse(List<SkillGapItem> Skills);