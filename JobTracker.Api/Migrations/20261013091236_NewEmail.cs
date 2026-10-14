using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Pgvector;

#nullable disable

namespace JobTracker.Api.Migrations
{
    /// <inheritdoc />
    public partial class NewEmail : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "ActiveResumeId",
                table: "UserProfiles",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "RemindersEnabled",
                table: "UserProfiles",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<string>(
                name: "TimeZone",
                table: "UserProfiles",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<bool>(
                name: "WeeklyDigestEnabled",
                table: "UserProfiles",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<string>(
                name: "GeneratedQuestions",
                table: "StageDetails",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "QuestionRunId",
                table: "StageDetails",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "Version",
                table: "StageDetails",
                type: "uuid",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"));

            migrationBuilder.AddColumn<Vector>(
                name: "Embedding",
                table: "Resumes",
                type: "vector(1536)",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "ExtractionRunId",
                table: "Resumes",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ProfileJson",
                table: "Resumes",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ContactEmail",
                table: "Applications",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ContactName",
                table: "Applications",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "ExtractionRunId",
                table: "Applications",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "FollowUpAt",
                table: "Applications",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "LastEmployerResponseAt",
                table: "Applications",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "NextAction",
                table: "Applications",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "ResumeId",
                table: "Applications",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "SnoozedUntil",
                table: "Applications",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "Version",
                table: "Applications",
                type: "uuid",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"));

            migrationBuilder.CreateTable(
                name: "AutomationRuns",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    ApplicationId = table.Column<Guid>(type: "uuid", nullable: true),
                    ResumeId = table.Column<Guid>(type: "uuid", nullable: true),
                    StageDetailId = table.Column<Guid>(type: "uuid", nullable: true),
                    Type = table.Column<string>(type: "text", nullable: false),
                    Status = table.Column<string>(type: "text", nullable: false),
                    Attempts = table.Column<int>(type: "integer", nullable: false),
                    ErrorCode = table.Column<string>(type: "text", nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    NextAttemptAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    DeadlineAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    Version = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AutomationRuns", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "StorageDeletions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    StoragePath = table.Column<string>(type: "text", nullable: false),
                    Attempts = table.Column<int>(type: "integer", nullable: false),
                    NextAttemptAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_StorageDeletions", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Resumes_UserId_CreatedAt",
                table: "Resumes",
                columns: new[] { "UserId", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_Applications_UserId_AppliedDate",
                table: "Applications",
                columns: new[] { "UserId", "AppliedDate" });

            migrationBuilder.CreateIndex(
                name: "IX_Applications_UserId_Status",
                table: "Applications",
                columns: new[] { "UserId", "Status" });

            migrationBuilder.CreateIndex(
                name: "IX_AutomationRuns_ApplicationId_Type_CreatedAt",
                table: "AutomationRuns",
                columns: new[] { "ApplicationId", "Type", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_AutomationRuns_Status_NextAttemptAt",
                table: "AutomationRuns",
                columns: new[] { "Status", "NextAttemptAt" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "AutomationRuns");

            migrationBuilder.DropTable(
                name: "StorageDeletions");

            migrationBuilder.DropIndex(
                name: "IX_Resumes_UserId_CreatedAt",
                table: "Resumes");

            migrationBuilder.DropIndex(
                name: "IX_Applications_UserId_AppliedDate",
                table: "Applications");

            migrationBuilder.DropIndex(
                name: "IX_Applications_UserId_Status",
                table: "Applications");

            migrationBuilder.DropColumn(
                name: "ActiveResumeId",
                table: "UserProfiles");

            migrationBuilder.DropColumn(
                name: "RemindersEnabled",
                table: "UserProfiles");

            migrationBuilder.DropColumn(
                name: "TimeZone",
                table: "UserProfiles");

            migrationBuilder.DropColumn(
                name: "WeeklyDigestEnabled",
                table: "UserProfiles");

            migrationBuilder.DropColumn(
                name: "GeneratedQuestions",
                table: "StageDetails");

            migrationBuilder.DropColumn(
                name: "QuestionRunId",
                table: "StageDetails");

            migrationBuilder.DropColumn(
                name: "Version",
                table: "StageDetails");

            migrationBuilder.DropColumn(
                name: "Embedding",
                table: "Resumes");

            migrationBuilder.DropColumn(
                name: "ExtractionRunId",
                table: "Resumes");

            migrationBuilder.DropColumn(
                name: "ProfileJson",
                table: "Resumes");

            migrationBuilder.DropColumn(
                name: "ContactEmail",
                table: "Applications");

            migrationBuilder.DropColumn(
                name: "ContactName",
                table: "Applications");

            migrationBuilder.DropColumn(
                name: "ExtractionRunId",
                table: "Applications");

            migrationBuilder.DropColumn(
                name: "FollowUpAt",
                table: "Applications");

            migrationBuilder.DropColumn(
                name: "LastEmployerResponseAt",
                table: "Applications");

            migrationBuilder.DropColumn(
                name: "NextAction",
                table: "Applications");

            migrationBuilder.DropColumn(
                name: "ResumeId",
                table: "Applications");

            migrationBuilder.DropColumn(
                name: "SnoozedUntil",
                table: "Applications");

            migrationBuilder.DropColumn(
                name: "Version",
                table: "Applications");
        }
    }
}
