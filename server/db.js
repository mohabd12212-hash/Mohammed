import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { TEMPLATES } from './templates.js';

const dir = process.env.DATA_DIR || path.join(process.cwd(), 'data');
fs.mkdirSync(dir, { recursive: true });
export const db = new DatabaseSync(path.join(dir, process.env.DB_FILE || 'darajat.db'));
db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS schools(
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1,
  expires_at TEXT, settings TEXT NOT NULL DEFAULT '{}', created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS users(
  id INTEGER PRIMARY KEY, school_id INTEGER REFERENCES schools(id) ON DELETE CASCADE,
  username TEXT NOT NULL UNIQUE, pass_hash TEXT NOT NULL, name TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('super','admin','teacher')), active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS classes(
  id INTEGER PRIMARY KEY, school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name TEXT NOT NULL, sort INTEGER NOT NULL DEFAULT 0, next_class TEXT NOT NULL DEFAULT '');
CREATE TABLE IF NOT EXISTS sections(
  id INTEGER PRIMARY KEY, school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE, name TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS subjects(
  id INTEGER PRIMARY KEY, school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE, name TEXT NOT NULL,
  max REAL NOT NULL DEFAULT 100, group_name TEXT NOT NULL DEFAULT '', sort INTEGER NOT NULL DEFAULT 0,
  comps TEXT, weights TEXT, in_total INTEGER NOT NULL DEFAULT 1, fixed INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS students(
  id INTEGER PRIMARY KEY, school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  no INTEGER, name TEXT NOT NULL, father TEXT DEFAULT '', mother TEXT DEFAULT '', birth_place TEXT DEFAULT '',
  birth_year TEXT DEFAULT '', registry_no TEXT DEFAULT '',
  class_id INTEGER REFERENCES classes(id) ON DELETE SET NULL, section_id INTEGER REFERENCES sections(id) ON DELETE SET NULL,
  att1 REAL, att2 REAL, exc1 REAL, exc2 REAL, beh1 REAL, beh2 REAL, notes TEXT DEFAULT '');
CREATE TABLE IF NOT EXISTS grades(
  school_id INTEGER NOT NULL, student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  semester INTEGER NOT NULL, comp TEXT NOT NULL, value REAL,
  PRIMARY KEY(student_id, subject_id, semester, comp));
CREATE TABLE IF NOT EXISTS teacher_subjects(
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE, PRIMARY KEY(user_id, subject_id));
CREATE INDEX IF NOT EXISTS idx_students_school ON students(school_id, class_id, section_id);
CREATE INDEX IF NOT EXISTS idx_grades_school ON grades(school_id);
`);

let txDepth = 0;
/** معاملة قابلة للتداخل (SAVEPOINT للمستويات الداخلية) */
export function tx(fn) {
  const name = `sp${txDepth}`;
  db.exec(txDepth === 0 ? 'BEGIN' : `SAVEPOINT ${name}`);
  txDepth++;
  try {
    const r = fn();
    txDepth--;
    db.exec(txDepth === 0 ? 'COMMIT' : `RELEASE ${name}`);
    return r;
  } catch (e) {
    txDepth--;
    db.exec(txDepth === 0 ? 'ROLLBACK' : `ROLLBACK TO ${name}; RELEASE ${name}`);
    throw e;
  }
}

// ---- كلمات المرور ----
export function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const h = crypto.scryptSync(pw, salt, 32);
  return `${salt.toString('hex')}:${h.toString('hex')}`;
}
export function checkPassword(pw, stored) {
  const [s, h] = String(stored).split(':');
  if (!s || !h) return false;
  const calc = crypto.scryptSync(pw, Buffer.from(s, 'hex'), 32);
  return crypto.timingSafeEqual(calc, Buffer.from(h, 'hex'));
}

export const J = (s, d = null) => { try { return s ? JSON.parse(s) : d; } catch { return d; } };

/** إنشاء صفوف ومواد من القوالب الجاهزة داخل مدرسة */
export function applyTemplates(schoolId, keys, sections = ['الأولى', 'الثانية']) {
  const created = [];
  tx(() => {
    for (const key of keys) {
      const t = TEMPLATES[key];
      if (!t) continue;
      const maxSort = db.prepare('SELECT COALESCE(MAX(sort),0) m FROM classes WHERE school_id=?').get(schoolId).m;
      const c = db.prepare('INSERT INTO classes(school_id,name,sort,next_class) VALUES(?,?,?,?)').run(schoolId, t.name, maxSort + 1, t.next_class || '');
      const cid = Number(c.lastInsertRowid);
      for (const sn of sections) db.prepare('INSERT INTO sections(school_id,class_id,name) VALUES(?,?,?)').run(schoolId, cid, sn);
      t.subjects.forEach((s, i) => {
        db.prepare('INSERT INTO subjects(school_id,class_id,name,max,group_name,sort,comps,weights,in_total,fixed) VALUES(?,?,?,?,?,?,?,?,?,?)')
          .run(schoolId, cid, s.name, s.max, s.group || '', i + 1, s.comps ? JSON.stringify(s.comps) : null,
            s.weights ? JSON.stringify(s.weights) : null, s.in_total ?? 1, s.fixed ?? 0);
      });
      created.push(cid);
    }
  });
  return created;
}
