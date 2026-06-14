import type { Database } from "better-sqlite3";
import { ContentBlockParam } from "../../../google-genai/index.js";

export type HistoryEntry = {
  role: "user" | "model";
  parts: Array<ContentBlockParam>;
};

export interface HistoryResource {
  addMessage(chatJid: string, role: string, parts: Array<ContentBlockParam>): void;
  getHistory(chatJid: string, limit?: number): Array<HistoryEntry>;
  clearHistory(chatJid: string): void;
}

export const createHistoryResource = (db: Database): HistoryResource => {
  const addMessage = (chatJid: string, role: string, parts: Array<ContentBlockParam>): void => {
    const stmt = db.prepare(`
      INSERT INTO chat_history (chat_jid, role, parts_json, created_at)
      VALUES (?, ?, ?, ?)
    `);
    stmt.run(chatJid, role, JSON.stringify(parts), new Date().toISOString());
  };

  const getHistory = (chatJid: string, limit?: number): Array<HistoryEntry> => {
    let rows: Array<{ role: string; parts_json: string }>;
    if (limit !== undefined) {
      const stmt = db.prepare(`
        SELECT role, parts_json
        FROM chat_history
        WHERE chat_jid = ?
        ORDER BY id ASC
        LIMIT ?
      `);
      rows = stmt.all(chatJid, limit) as Array<{ role: string; parts_json: string }>;
    } else {
      const stmt = db.prepare(`
        SELECT role, parts_json
        FROM chat_history
        WHERE chat_jid = ?
        ORDER BY id ASC
      `);
      rows = stmt.all(chatJid) as Array<{ role: string; parts_json: string }>;
    }
    return rows.map(
      (row): HistoryEntry => ({
        role: row.role === "user" ? "user" : "model",
        parts: JSON.parse(row.parts_json) as Array<ContentBlockParam>,
      }),
    );
  };

  const clearHistory = (chatJid: string): void => {
    const stmt = db.prepare("DELETE FROM chat_history WHERE chat_jid = ?");
    stmt.run(chatJid);
  };

  return { addMessage, getHistory, clearHistory };
};
