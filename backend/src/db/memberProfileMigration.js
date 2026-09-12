import { db } from './connection.js';

function hasColumn(table, column) {
  return db.prepare(`PRAGMA table_info(${table})`).all()
    .some((row) => row.name === column);
}

export function ensureMemberProfileColumns() {
  const exists = db.prepare(`
    SELECT name FROM sqlite_master
    WHERE type = 'table' AND name = 'members'
  `).get();

  if (!exists) return;

  if (!hasColumn('members', 'username')) {
    db.exec(`ALTER TABLE members ADD COLUMN username TEXT`);
  }

  if (!hasColumn('members', 'birthdate')) {
    db.exec(`ALTER TABLE members ADD COLUMN birthdate TEXT`);
  }
}
