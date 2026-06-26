import { RemindersResource, ReminderRow } from "./resources/reminders.js";
import { logger } from "../utils/index.js";

export interface RemindersRepository {
  create: (chatJid: string, triggerAt: string, description: string) => void;
  scheduleAllReminders: () => void;
}

export interface RemindersRepositoryDeps {
  remindersResource: RemindersResource;
  onReminderTrigger: (row: ReminderRow) => void;
}

export const createRemindersRepository = (deps: RemindersRepositoryDeps): RemindersRepository => {
  const { remindersResource, onReminderTrigger } = deps;
  const schedules: Record<number, NodeJS.Timeout> = {};
  const scheduleRow = (row: ReminderRow) => {
    const delay = new Date(row.trigger_at).getTime() - Date.now();

    if (delay < 0) {
      throw new Error("Cannot schedule a reminder in the past");
    }

    const MAX_DELAY_MS = 24 * 24 * 60 * 60 * 1000; // 24 days in milliseconds
    if (delay > MAX_DELAY_MS) {
      throw new Error("Cannot schedule a reminder more than 24 days in advance due to NodeJS setTimeout limit");
    }

    schedules[row.id] = setTimeout(() => {
      onReminderTrigger(row);
      remindersResource.deleteReminder(row.id);
      delete schedules[row.id];
    }, delay);
  };

  const scheduleAllReminders = (): void => {
    const pending = remindersResource.getPendingReminders();
    for (const row of pending) {
      try {
        scheduleRow(row);
      } catch (err) {
        logger.error({ err, id: row.id }, "Failed to schedule pending reminder on startup. Deleting from DB.");
        remindersResource.deleteReminder(row.id);
      }
    }
  };

  const create = (chatJid: string, triggerAt: string, description: string): void => {
    let rowId: number | undefined;
    try {
      const row = remindersResource.createReminder(chatJid, triggerAt, description);
      rowId = row.id;
      scheduleRow(row);
    } catch (err: unknown) {
      if (rowId !== undefined) remindersResource.deleteReminder(rowId);
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to schedule reminder: ${msg}`);
    }
  };

  return {
    create,
    scheduleAllReminders,
  };
};
