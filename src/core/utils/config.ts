import path from "path";
import "dotenv/config";

export const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";

const PROJECT_ROOT = process.cwd();
export const STORE_DIR = path.resolve(PROJECT_ROOT, "store");
export const GROUPS_DIR = path.resolve(PROJECT_ROOT, "groups");

export const MCP_AUTH_SECRET = process.env.MCP_AUTH_SECRET || "";

export const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
export const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.1-pro-preview";

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

export const ENABLED_TOOLS = (process.env.ENABLED_TOOLS || "bash,text_editor,fetch_url_context").split(",").map((t) => t.trim().toLowerCase().replace(/-/g, "_"));
