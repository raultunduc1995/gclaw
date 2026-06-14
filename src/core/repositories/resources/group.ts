import type { Database } from "better-sqlite3";

export interface RegisteredGroup {
  jid: string;
  name: string;
  folder: string;
  addedAt: string;
}

export interface GroupResource {
  registerGroup(jid: string, name: string, folder: string): RegisteredGroup;
  getGroups(): Record<string, RegisteredGroup>;
}

export const createGroupResource = (db: Database): GroupResource => {
  const registerGroup = (jid: string, name: string, folder: string): RegisteredGroup => {
    const addedAt = new Date().toISOString();
    const stmt = db.prepare(`
      INSERT INTO groups (jid, name, folder, added_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(jid) DO UPDATE SET
        name = excluded.name,
        folder = excluded.folder
    `);
    stmt.run(jid, name, folder, addedAt);

    return { jid, name, folder, addedAt } as RegisteredGroup;
  };

  const getGroups = (): Record<string, RegisteredGroup> => {
    const stmt = db.prepare("SELECT jid, name, folder, added_at as addedAt FROM groups");
    const rows = stmt.all() as RegisteredGroup[];
    const groups: Record<string, RegisteredGroup> = {};
    for (const row of rows) {
      groups[row.jid] = row;
    }
    return groups;
  };

  return { registerGroup, getGroups };
};
