// Models/Skill.cs
namespace JobTracker.Api.Models;

public class Skill
{
    public Guid Id { get; set; }
    public string Name { get; set; } = ""; // stored lowercased/trimmed
}

// Models/ApplicationSkill.cs
public class ApplicationSkill
{
    public Guid ApplicationId { get; set; }
    public Guid SkillId { get; set; }
    public Application? Application { get; set; }
    public Skill? Skill { get; set; }
    public int Importance { get; set; } // 3 = required, 2 = preferred, 1 = nice_to_have
}

public enum SkillLevel
{
    Unrated = 0,
    Beginner = 1,
    Intermediate = 2,
    Advanced = 3,
    Expert = 4,
}

// Models/UserSkill.cs
public class UserSkill
{
    public Guid UserId { get; set; }
    public Guid SkillId { get; set; }
    public Skill? Skill { get; set; }
    public string? EvidenceText { get; set; }
    public double EvidenceStrength { get; set; } // 0.0–1.0
    public SkillLevel Level { get; set; } = SkillLevel.Unrated;
}