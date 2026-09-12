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
}

// Models/UserSkill.cs
public class UserSkill
{
    public Guid UserId { get; set; }
    public Guid SkillId { get; set; }
    public Skill? Skill { get; set; }
}