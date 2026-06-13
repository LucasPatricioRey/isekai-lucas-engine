try {
  require("dotenv").config({ quiet: true });
} catch {
  // dotenv is optional; MONGODB_URI can come from the host environment.
}

const mongoose = require("mongoose");

const connectDB = require("../config/db");
const { buildStateAudit } = require("../services/stateAuditService");

async function main() {
  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI is required for audit:state-hygiene.");
  }

  await connectDB();

  const gameId = process.env.AUDIT_GAME_ID || "isekai_lucas_main";
  const audit = await buildStateAudit({ gameId });
  const criticalIssues = audit.issues.filter((issue) => ["critical", "error"].includes(issue.severity));

  console.log("State hygiene audit");
  console.log(`GameId: ${gameId}`);
  console.log(`Issues: ${audit.summary.total}`);
  console.log(`By severity: ${JSON.stringify(audit.summary.bySeverity)}`);

  for (const issue of audit.issues) {
    console.log(`${issue.severity.toUpperCase()} ${issue.code}: ${issue.message}`);
    if (issue.evidence && Object.keys(issue.evidence).length > 0) {
      console.log(`  evidence=${JSON.stringify(issue.evidence)}`);
    }
  }

  await mongoose.disconnect();

  if (criticalIssues.length > 0) {
    process.exit(1);
  }

  console.log("State hygiene audit OK.");
}

main().catch(async (error) => {
  console.error("State hygiene audit failed:", error.message);
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  process.exit(1);
});
