namespace JobTracker.Api.Dtos;

public class UpdateUserProfileRequest
{
    public int ExperienceYears { get; set; }
    public int? SeniorityLevel { get; set; }
    public string? Education { get; set; }
    public string? ResumeRawText { get; set; }
    public float[]? ResumeEmbedding { get; set; } // length 1536
    public List<SkillEvidenceDto> Skills { get; set; } = new();
}

public class SkillEvidenceDto
{
    public string Name { get; set; } = string.Empty;
    public string? Evidence { get; set; }
    public double Strength { get; set; } // 0.0–1.0
}