namespace JobTracker.Api.Dtos;

public class UpdateApplicationRequirementsRequest
{
    public int? RequiredExperienceYears { get; set; }
    public int? SeniorityLevel { get; set; } // 1=Junior,2=Mid,3=Senior,4=Lead
    public string? EducationRequirement { get; set; }
    public float[]? JobEmbedding { get; set; } // length 1536
}