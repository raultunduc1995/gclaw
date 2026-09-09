import path from "path";
import "dotenv/config";

export const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";

const PROJECT_ROOT = process.cwd();
export const STORE_DIR = path.resolve(PROJECT_ROOT, "store");
export const GROUPS_DIR = path.resolve(PROJECT_ROOT, "groups");

export const MCP_AUTH_SECRET = process.env.MCP_AUTH_SECRET || "";

export const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
export const GEMINI_MODEL = "gemini-3.8-flash";

export const TIMEZONE = ((): string => {
  const tz = process.env.TZ;
  if (tz) {
    try {
      Intl.DateTimeFormat(undefined, { timeZone: tz });
      return tz;
    } catch {
      // fall through
    }
  }
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
})();
