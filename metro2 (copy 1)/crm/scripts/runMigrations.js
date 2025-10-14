import { runMigrations, getDatabase } from "../db/connection.js";

async function main() {
  try {
    await runMigrations();
    await getDatabase().destroy();
    console.log("Database migrations applied successfully.");
    process.exit(0);
  } catch (err) {
    console.error("Failed to run migrations", err);
    process.exit(1);
  }
}

main();
