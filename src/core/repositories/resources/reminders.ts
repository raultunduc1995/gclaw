import type { Database } from "better-sqlite3";

export type ReminderRow = {
  id: number;
  chat_jid: string;
  trigger_at: string;
  description: string;
};

export interface RemindersResource {
  createReminder(chatJid: string, triggerAt: string, description: string): ReminderRow;
  getPendingReminders(): Array<ReminderRow>;
  deleteReminder(id: number): void;
  deleteByJid(chatJid: string): void;
}

export const createRemindersResource = (db: Database): RemindersResource => {
  const createReminder = (chatJid: string, triggerAt: string, description: string): ReminderRow => {
    const stmt = db.prepare(`
      INSERT INTO reminders (chat_jid, trigger_at, description)
      VALUES (?, ?, ?)
    `);
    const result = stmt.run(chatJid, triggerAt, description);
    
    return {
      id: result.lastInsertRowid as number,
      chat_jid: chatJid,
      trigger_at: triggerAt,
      description: description,
    };
  };

  const getPendingReminders = (): Array<ReminderRow> => {
    const stmt = db.prepare(`
      SELECT id, chat_jid, trigger_at, description
      FROM reminders
      ORDER BY trigger_at ASC
    `);
    return stmt.all() as Array<ReminderRow>;
  };

  const deleteReminder = (id: number): void => {
    const stmt = db.prepare("DELETE FROM reminders WHERE id = ?");
    stmt.run(id);
  };

  const deleteByJid = (chatJid: string): void => {
    const stmt = db.prepare("DELETE FROM reminders WHERE chat_jid = ?");
    stmt.run(chatJid);
  };

  return { createReminder, getPendingReminders, deleteReminder, deleteByJid };
};
