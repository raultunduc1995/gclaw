import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { STORE_DIR } from "../utils/index.js";
import { createGroupResource } from "./resources/group.js";
import { createHistoryResource } from "./resources/history.js";
import { createRemindersResource } from "./resources/reminders.js";
import { createGroupsRepository, type GroupsRepository } from "./groups-repository.js";
import { createHistoryRepository, type HistoryRepository } from "./history-repository.js";
import { createRemindersRepository, type RemindersRepository } from "./reminders-repository.js";
import { type ReminderRow } from "./resources/reminders.js";

export { type GroupsRepository } from "./groups-repository.js";
export { type HistoryRepository } from "./history-repository.js";
export { type RemindersRepository } from "./reminders-repository.js";
export { type RegisteredGroup } from "./resources/group.js";
export { type HistoryEntry } from "./resources/history.js";
export { type ReminderRow } from "./resources/reminders.js";

export interface SqliteRepository {
  groups: GroupsRepository;
  history: HistoryRepository;
  reminders: RemindersRepository;
  close(): void;
}

export interface SqliteRepositoryDeps {
  onReminderTrigger: (row: ReminderRow) => void;
}

export const createSqliteRepository = (deps: SqliteRepositoryDeps): SqliteRepository => {
  if (!fs.existsSync(STORE_DIR)) {
    fs.mkdirSync(STORE_DIR, { recursive: true });
  }

  const dbPath = path.resolve(STORE_DIR, "gclaw.db");
  const db = new Database(dbPath);

  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");

  db.exec(`
    CREATE TABLE IF NOT EXISTS groups (
      jid TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      folder TEXT NOT NULL,
      added_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS chat_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_jid TEXT NOT NULL,
      role TEXT NOT NULL,
      parts_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(chat_jid) REFERENCES groups(jid) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_chat_history_jid ON chat_history(chat_jid);

    CREATE TABLE IF NOT EXISTS reminders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_jid TEXT NOT NULL,
      trigger_at TEXT NOT NULL,
      description TEXT NOT NULL,
      FOREIGN KEY(chat_jid) REFERENCES groups(jid) ON DELETE CASCADE
    );
  `);

  const groupsResource = createGroupResource(db);
  const historyResource = createHistoryResource(db);
  const remindersResource = createRemindersResource(db);

  const groups = createGroupsRepository({ groupsResource });
  const history = createHistoryRepository({ historyResource });
  const reminders = createRemindersRepository({ remindersResource, onReminderTrigger: deps.onReminderTrigger });

  const close = (): void => {
    db.close();
  };

  return {
    groups,
    history,
    reminders,
    close,
  };
};
