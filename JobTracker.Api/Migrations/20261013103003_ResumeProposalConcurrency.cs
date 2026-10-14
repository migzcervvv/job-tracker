using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace JobTracker.Api.Migrations
{
    /// <inheritdoc />
    public partial class ResumeProposalConcurrency : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("UPDATE \"UserProfiles\" SET \"TimeZone\" = 'UTC' WHERE \"TimeZone\" = ''");
            migrationBuilder.Sql("UPDATE \"Resumes\" SET \"ExtractionStatus\" = 'failed' WHERE \"ExtractionRunId\" IS NULL AND \"ExtractionStatus\" = 'triggered'");
            migrationBuilder.Sql("UPDATE \"AutomationLogEntries\" SET \"Message\" = NULL");
            migrationBuilder.AddColumn<Guid>(
                name: "Version",
                table: "Resumes",
                type: "uuid",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"));
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Version",
                table: "Resumes");
        }
    }
}
