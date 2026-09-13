using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace JobTracker.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddAdminProfileAutomationLog : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "AutomationLogEntries",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Type = table.Column<string>(type: "text", nullable: false),
                    ApplicationId = table.Column<Guid>(type: "uuid", nullable: true),
                    Status = table.Column<string>(type: "text", nullable: false),
                    Message = table.Column<string>(type: "text", nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AutomationLogEntries", x => x.Id);
                });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "AutomationLogEntries");
        }
    }
}
