import { runMigrations, closeDatabase } from "../db/connection.ts";

async function main() {
  try {
    await runMigrations();
    console.log("Database migrations applied successfully.");
    await closeDatabase();
    process.exit(0);
  } catch (err) {
    console.error("Failed to run migrations", err);
    process.exit(1);
  }
}

main();
