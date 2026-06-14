import "dotenv/config";
import { logger } from "./core/utils/index.js";
import main from "./main.js";

// Guard: only run when executed directly, not when imported by tests
const isDirectRun = process.argv[1] && new URL(import.meta.url).pathname === new URL(`file://${process.argv[1]}`).pathname;

if (isDirectRun) {
  main().catch((err) => {
    logger.fatal({ err }, "Application failed to start");
    process.exit(1);
  });
}
