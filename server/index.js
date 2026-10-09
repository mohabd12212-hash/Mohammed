import express from 'express';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db, tx, hashPassword, checkPassword, J, applyTemplates } from './db.js';
import { TEMPLATE_LIST } from './templates.js';
import { COMPS, compMaxes, subjectComps, mergeSettings } from '../shared/calc.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
export const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '15mb' }));

// ---------- أدوات ----------
const httpErr = (status, message) => Object.assign(new Error(message), { status });
const str = (v, max = 200) => (v === undefined || v === null ? '' : String(v).trim().slice(0, max));
const numOrNull = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(String(v).replace(',', '.'));
  if (!Number.isFinite(n)) throw httpErr(400, 'قيمة رقمية غير صالحة');
  return n;
};
const intId = (v) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw httpErr(400, 'معرّف غير صالح');
  return n;
};
const parseCookies = (h = '') => Object.fromEntries(h.split(';').map((p) => p.trim().split('=')).filter((p) => p[0]).map(([k, ...v]) => [k, decodeURIComponent(v.join('='))]));
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const SESSION_DAYS = 30;

// ---------- المصادقة ----------
app.use((req, res, next) => {
  req.user = null;
  const tok = parseCookies(req.headers.cookie).sid;
  if (tok) {
    const row = db.prepare(`SELECT u.*, s.name AS school_name, s.active AS school_active, s.expires_at AS school_expires
      FROM sessions se JOIN users u ON u.id=se.user_id LEFT JOIN schools s ON s.id=u.school_id
      WHERE se.token=? AND se.expires_at>?`).get(sha(tok), Date.now());
    if (row && row.active) req.user = row;
  }
  next();
});
// حماية CSRF إضافية: الطلبات المعدِّلة يجب أن تكون JSON
app.use('/api', (req, res, next) => {
  if (!['GET', 'HEAD'].includes(req.method) && req.headers['content-type']?.indexOf('application/json') !== 0) return next(httpErr(415, 'نوع الطلب غير مدعوم'));
  next();
});
const need = (...roles) => (req, res, next) => {
  if (!req.user) return next(httpErr(401, 'يرجى تسجيل الدخول'));
  if (roles.length && !roles.includes(req.user.role)) return next(httpErr(403, 'لا تملك صلاحية لهذه العملية'));
  next();
};
const isExpired = (u) => !!(u.school_expires && u.school_expires < new Date().toISOString().slice(0, 10));
/** منع الكتابة عند انتهاء الاشتراك */
const writable = (req, res, next) => {
  if (req.user.role !== 'super' && isExpired(req.user)) return next(httpErr(402, 'انتهى اشتراك المدرسة — النظام للقراءة فقط. يرجى التواصل مع مزوّد الخدمة لتجديد الاشتراك.'));
  next();
};
const SID = (req) => req.user.school_id;

const fails = new Map();
app.post('/api/login', (req, res) => {
  const username = str(req.body.username, 60).toLowerCase();
  const key = `${req.ip}|${username}`;
  const f = fails.get(key);
  if (f && f.n >= 8 && Date.now() - f.t < 15 * 60 * 1000) throw httpErr(429, 'محاولات كثيرة، حاول لاحقاً بعد 15 دقيقة');
  const u = db.prepare('SELECT u.*, s.active AS school_active FROM users u LEFT JOIN schools s ON s.id=u.school_id WHERE lower(u.username)=?').get(username);
  if (!u || !u.active || !checkPassword(String(req.body.password ?? ''), u.pass_hash)) {
    fails.set(key, { n: (f && Date.now() - f.t < 15 * 60 * 1000 ? f.n : 0) + 1, t: Date.now() });
    throw httpErr(401, 'اسم المستخدم أو كلمة المرور غير صحيحة');
  }
  if (u.role !== 'super' && !u.school_active) throw httpErr(403, 'حساب المدرسة موقوف. يرجى التواصل مع مزوّد الخدمة.');
  fails.delete(key);
  const tok = crypto.randomBytes(32).toString('hex');
  db.prepare('DELETE FROM sessions WHERE expires_at<?').run(Date.now());
  db.prepare('INSERT INTO sessions(token,user_id,expires_at) VALUES(?,?,?)').run(sha(tok), u.id, Date.now() + SESSION_DAYS * 864e5);
  const secure = process.env.COOKIE_SECURE === '1' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `sid=${tok}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_DAYS * 86400}${secure}`);
  res.json({ ok: true });
});
app.post('/api/logout', (req, res) => {
  const tok = parseCookies(req.headers.cookie).sid;
  if (tok) db.prepare('DELETE FROM sessions WHERE token=?').run(sha(tok));
  res.setHeader('Set-Cookie', 'sid=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');
  res.json({ ok: true });
});
app.post('/api/password', need(), (req, res) => {
  const { old_password, new_password } = req.body;
  if (!checkPassword(String(old_password ?? ''), req.user.pass_hash)) throw httpErr(400, 'كلمة المرور الحالية غير صحيحة');
  if (String(new_password ?? '').length < 6) throw httpErr(400, 'كلمة المرور الجديدة يجب ألا تقل عن 6 محارف');
  db.prepare('UPDATE users SET pass_hash=? WHERE id=?').run(hashPassword(String(new_password)), req.user.id);
  res.json({ ok: true });
});

// ---------- تحميل البيانات الأساسية ----------
const publicUser = (u) => ({ id: u.id, name: u.name, username: u.username, role: u.role, school_id: u.school_id });
app.get('/api/me', (req, res) => {
  if (!req.user) return res.json({ user: null });
  res.json({ user: publicUser(req.user), templates: TEMPLATE_LIST });
});

// معلومات المدرسة العامة (بدون مصادقة) — تُستخدم في واجهة تسجيل الدخول
app.get('/api/school-info', (req, res) => {
  // نأخذ المدرسة الأولى النشطة (للبيئات التي تخدم مدرسة واحدة)
  const school = db.prepare('SELECT id,name,settings FROM schools WHERE active=1 ORDER BY id LIMIT 1').get();
  if (!school) return res.json({ name: null, logo: null });
  const settings = J(school.settings, {});
  res.json({ name: school.name, logo: settings.logo || null });
});

app.get('/api/bootstrap', need('admin', 'teacher'), (req, res) => {
  const sid = SID(req);
  const school = db.prepare('SELECT id,name,expires_at,settings FROM schools WHERE id=?').get(sid);
  const classes = db.prepare('SELECT * FROM classes WHERE school_id=? ORDER BY sort,id').all(sid);
  const sections = db.prepare('SELECT * FROM sections WHERE school_id=? ORDER BY class_id,name').all(sid);
  const subjects = db.prepare('SELECT * FROM subjects WHERE school_id=? ORDER BY class_id,sort,id').all(sid)
    .map((s) => ({ ...s, comps: J(s.comps), weights: J(s.weights) }));
  let mySubjects = null;
  if (req.user.role === 'teacher') mySubjects = db.prepare('SELECT subject_id FROM teacher_subjects WHERE user_id=?').all(req.user.id).map((r) => r.subject_id);
  const teachers = {};
  for (const r of db.prepare('SELECT ts.subject_id sid, u.name FROM teacher_subjects ts JOIN users u ON u.id=ts.user_id WHERE u.school_id=? AND u.active=1').all(sid)) (teachers[r.sid] ??= []).push(r.name);
  res.json({
    teachers,
    user: publicUser(req.user),
    school: { id: school.id, name: school.name, expires_at: school.expires_at, expired: isExpired(req.user) },
    settings: mergeSettings(J(school.settings, {})),
    classes, sections, subjects, mySubjects, templates: TEMPLATE_LIST,
  });
});

// إحصاءات لوحة التحكم: عدد الطلاب ونسبة اكتمال الرصد لكل صف
app.get('/api/stats', need('admin', 'teacher'), (req, res) => {
  const sid = SID(req);
  const classes = db.prepare('SELECT id,name FROM classes WHERE school_id=? ORDER BY sort,id').all(sid);
  const settings = mergeSettings(J(db.prepare('SELECT settings FROM schools WHERE id=?').get(sid).settings, {}));
  const out = classes.map((c) => {
    const students = db.prepare('SELECT COUNT(*) n FROM students WHERE class_id=?').get(c.id).n;
    const subs = db.prepare('SELECT * FROM subjects WHERE class_id=? AND fixed=0').all(c.id).map((s) => ({ ...s, comps: J(s.comps) }));
    const perStudent = subs.reduce((a, s) => a + subjectComps(s).length, 0) * 2;
    const filled = db.prepare('SELECT COUNT(*) n FROM grades g JOIN students st ON st.id=g.student_id WHERE st.class_id=? AND g.value IS NOT NULL').get(c.id).n;
    const expected = students * perStudent;
    return { id: c.id, name: c.name, students, subjects: subs.length, filled, expected, percent: expected ? Math.min(100, Math.round((filled * 100) / expected)) : 0 };
  });
  res.json({ classes: out, students: out.reduce((a, c) => a + c.students, 0), pass_percent: settings.pass_percent });
});

// ---------- الإعدادات (مدير المدرسة) ----------
function cleanLogo(v) {
  if (!v) return '';
  if (typeof v !== 'string' || !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(v) || v.length > 400000) throw httpErr(400, 'الشعار يجب أن يكون صورة PNG أو JPG أو WebP أصغر من 300 كيلوبايت');
  return v;
}
app.put('/api/settings', need('admin'), writable, (req, res) => {
  const b = req.body || {};
  const cur = mergeSettings(J(db.prepare('SELECT settings FROM schools WHERE id=?').get(SID(req)).settings, {}));
  const w = {};
  for (const k of COMPS) {
    const v = Number(b.weights?.[k] ?? cur.weights[k]);
    if (!(v >= 0 && v <= 1)) throw httpErr(400, 'أوزان المكونات يجب أن تكون بين 0 و 1');
    w[k] = v;
  }
  const comments = Array.isArray(b.comments) ? b.comments.map((c) => ({ min: Number(c.min) || 0, text: str(c.text, 400) })).filter((c) => c.text) : cur.comments;
  const next = {
    ...cur,
    ministry: str(b.ministry ?? cur.ministry), directorate: str(b.directorate ?? cur.directorate),
    stage_line: str(b.stage_line ?? cur.stage_line), year: str(b.year ?? cur.year, 40),
    principal: str(b.principal ?? cur.principal), principal_title: str(b.principal_title ?? cur.principal_title),
    logo_pos: ['right', 'center', 'left'].includes(b.logo_pos) ? b.logo_pos : (cur.logo_pos || 'center'),
    logo: b.logo === undefined ? (cur.logo || '') : cleanLogo(b.logo),
    weights: w, pass_percent: Math.min(100, Math.max(0, Number(b.pass_percent ?? cur.pass_percent))),
    behavior_max: Math.max(0, Number(b.behavior_max ?? cur.behavior_max)),
    days1: Math.max(0, Number(b.days1 ?? cur.days1)), days2: Math.max(0, Number(b.days2 ?? cur.days2)), comments,
  };
  const name = str(b.school_name, 120);
  if (name) db.prepare('UPDATE schools SET name=? WHERE id=?').run(name, SID(req));
  db.prepare('UPDATE schools SET settings=? WHERE id=?').run(JSON.stringify(next), SID(req));
  res.json({ ok: true });
});

// ---------- الصفوف والشعب والمواد ----------
const ownClass = (sid, id) => { const c = db.prepare('SELECT * FROM classes WHERE id=? AND school_id=?').get(id, sid); if (!c) throw httpErr(404, 'الصف غير موجود'); return c; };
app.post('/api/classes', need('admin'), writable, (req, res) => {
  const sid = SID(req);
  const name = str(req.body.name, 80);
  if (!name) throw httpErr(400, 'اسم الصف مطلوب');
  const sort = db.prepare('SELECT COALESCE(MAX(sort),0)+1 n FROM classes WHERE school_id=?').get(sid).n;
  const r = db.prepare('INSERT INTO classes(school_id,name,sort,next_class) VALUES(?,?,?,?)').run(sid, name, sort, str(req.body.next_class, 80));
  db.prepare('INSERT INTO sections(school_id,class_id,name) VALUES(?,?,?)').run(sid, r.lastInsertRowid, 'الأولى');
  res.json({ id: Number(r.lastInsertRowid) });
});
app.put('/api/classes/:id', need('admin'), writable, (req, res) => {
  const c = ownClass(SID(req), intId(req.params.id));
  db.prepare('UPDATE classes SET name=?, next_class=? WHERE id=?').run(str(req.body.name ?? c.name, 80) || c.name, str(req.body.next_class ?? c.next_class, 80), c.id);
  res.json({ ok: true });
});
app.delete('/api/classes/:id', need('admin'), writable, (req, res) => {
  const c = ownClass(SID(req), intId(req.params.id));
  db.prepare('DELETE FROM classes WHERE id=?').run(c.id);
  res.json({ ok: true });
});
app.post('/api/templates/apply', need('admin'), writable, (req, res) => {
  const keys = (Array.isArray(req.body.keys) ? req.body.keys : []).map(String);
  const ids = applyTemplates(SID(req), keys);
  res.json({ created: ids.length });
});
app.post('/api/sections', need('admin'), writable, (req, res) => {
  const c = ownClass(SID(req), intId(req.body.class_id));
  const name = str(req.body.name, 60);
  if (!name) throw httpErr(400, 'اسم الشعبة مطلوب');
  const r = db.prepare('INSERT INTO sections(school_id,class_id,name) VALUES(?,?,?)').run(SID(req), c.id, name);
  res.json({ id: Number(r.lastInsertRowid) });
});
app.put('/api/sections/:id', need('admin'), writable, (req, res) => {
  const r = db.prepare('UPDATE sections SET name=? WHERE id=? AND school_id=?').run(str(req.body.name, 60), intId(req.params.id), SID(req));
  if (!r.changes) throw httpErr(404, 'الشعبة غير موجودة');
  res.json({ ok: true });
});
app.delete('/api/sections/:id', need('admin'), writable, (req, res) => {
  db.prepare('DELETE FROM sections WHERE id=? AND school_id=?').run(intId(req.params.id), SID(req));
  res.json({ ok: true });
});

function subjectFields(b) {
  const max = numOrNull(b.max);
  if (!(max > 0)) throw httpErr(400, 'الدرجة العظمى للمادة يجب أن تكون أكبر من صفر');
  const comps = Array.isArray(b.comps) ? b.comps.filter((k) => COMPS.includes(k)) : null;
  let weights = null;
  if (b.weights && typeof b.weights === 'object') {
    weights = {};
    for (const k of COMPS) if (b.weights[k] !== undefined && b.weights[k] !== '') weights[k] = Number(b.weights[k]);
    if (!Object.keys(weights).length) weights = null;
  }
  return {
    name: str(b.name, 100), max, group: str(b.group_name, 100),
    comps: comps && comps.length && comps.length < 5 ? JSON.stringify(comps) : null,
    weights: weights ? JSON.stringify(weights) : null,
    in_total: b.in_total === 0 || b.in_total === false ? 0 : 1, fixed: b.fixed ? 1 : 0,
  };
}
app.post('/api/subjects', need('admin'), writable, (req, res) => {
  const c = ownClass(SID(req), intId(req.body.class_id));
  const f = subjectFields(req.body);
  if (!f.name) throw httpErr(400, 'اسم المادة مطلوب');
  const sort = db.prepare('SELECT COALESCE(MAX(sort),0)+1 n FROM subjects WHERE class_id=?').get(c.id).n;
  const r = db.prepare('INSERT INTO subjects(school_id,class_id,name,max,group_name,sort,comps,weights,in_total,fixed) VALUES(?,?,?,?,?,?,?,?,?,?)')
    .run(SID(req), c.id, f.name, f.max, f.group, sort, f.comps, f.weights, f.in_total, f.fixed);
  res.json({ id: Number(r.lastInsertRowid) });
});
app.put('/api/subjects/:id', need('admin'), writable, (req, res) => {
  const f = subjectFields(req.body);
  if (!f.name) throw httpErr(400, 'اسم المادة مطلوب');
  const sort = req.body.sort !== undefined ? Number(req.body.sort) : null;
  const r = db.prepare('UPDATE subjects SET name=?,max=?,group_name=?,comps=?,weights=?,in_total=?,fixed=?,sort=COALESCE(?,sort) WHERE id=? AND school_id=?')
    .run(f.name, f.max, f.group, f.comps, f.weights, f.in_total, f.fixed, sort, intId(req.params.id), SID(req));
  if (!r.changes) throw httpErr(404, 'المادة غير موجودة');
  res.json({ ok: true });
});
app.delete('/api/subjects/:id', need('admin'), writable, (req, res) => {
  db.prepare('DELETE FROM subjects WHERE id=? AND school_id=?').run(intId(req.params.id), SID(req));
  res.json({ ok: true });
});

// ---------- الطلاب ----------
const STUDENT_COLS = 'id,no,name,father,mother,birth_place,birth_year,registry_no,class_id,section_id,att1,att2,exc1,exc2,beh1,beh2,notes';
function studentFields(sid, b) {
  const name = str(b.name, 120);
  if (!name) throw httpErr(400, 'اسم الطالب مطلوب');
  let class_id = b.class_id ? intId(b.class_id) : null;
  let section_id = b.section_id ? intId(b.section_id) : null;
  if (class_id) ownClass(sid, class_id);
  if (section_id) {
    const s = db.prepare('SELECT class_id FROM sections WHERE id=? AND school_id=?').get(section_id, sid);
    if (!s || (class_id && s.class_id !== class_id)) throw httpErr(400, 'الشعبة لا تتبع الصف المحدد');
    class_id = class_id || s.class_id;
  }
  return {
    name, father: str(b.father), mother: str(b.mother), birth_place: str(b.birth_place), birth_year: str(b.birth_year, 20),
    registry_no: str(b.registry_no, 40), class_id, section_id, notes: str(b.notes, 500),
  };
}
app.get('/api/students', need('admin', 'teacher'), (req, res) => {
  const sid = SID(req);
  const where = ['school_id=?']; const args = [sid];
  if (req.query.class_id) { where.push('class_id=?'); args.push(intId(req.query.class_id)); }
  if (req.query.section_id) { where.push('section_id=?'); args.push(intId(req.query.section_id)); }
  res.json(db.prepare(`SELECT ${STUDENT_COLS} FROM students WHERE ${where.join(' AND ')} ORDER BY class_id,section_id,no,id`).all(...args));
});
const nextNo = (sid) => db.prepare('SELECT COALESCE(MAX(no),0)+1 n FROM students WHERE school_id=?').get(sid).n;
app.post('/api/students', need('admin'), writable, (req, res) => {
  const sid = SID(req);
  const f = studentFields(sid, req.body);
  const no = req.body.no ? intId(req.body.no) : nextNo(sid);
  const r = db.prepare('INSERT INTO students(school_id,no,name,father,mother,birth_place,birth_year,registry_no,class_id,section_id,notes) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
    .run(sid, no, f.name, f.father, f.mother, f.birth_place, f.birth_year, f.registry_no, f.class_id, f.section_id, f.notes);
  res.json({ id: Number(r.lastInsertRowid) });
});
app.put('/api/students/:id', need('admin'), writable, (req, res) => {
  const sid = SID(req);
  const f = studentFields(sid, req.body);
  const no = req.body.no ? intId(req.body.no) : null;
  const r = db.prepare('UPDATE students SET no=COALESCE(?,no),name=?,father=?,mother=?,birth_place=?,birth_year=?,registry_no=?,class_id=?,section_id=?,notes=? WHERE id=? AND school_id=?')
    .run(no, f.name, f.father, f.mother, f.birth_place, f.birth_year, f.registry_no, f.class_id, f.section_id, f.notes, intId(req.params.id), sid);
  if (!r.changes) throw httpErr(404, 'الطالب غير موجود');
  res.json({ ok: true });
});
app.delete('/api/students/:id', need('admin'), writable, (req, res) => {
  db.prepare('DELETE FROM students WHERE id=? AND school_id=?').run(intId(req.params.id), SID(req));
  res.json({ ok: true });
});
// حذف جماعي لشعبة/صف (نهاية العام)
app.post('/api/students/delete-many', need('admin'), writable, (req, res) => {
  const ids = (Array.isArray(req.body.ids) ? req.body.ids : []).map(intId);
  tx(() => ids.forEach((id) => db.prepare('DELETE FROM students WHERE id=? AND school_id=?').run(id, SID(req))));
  res.json({ deleted: ids.length });
});
// استيراد من إكسل: rows = [{name,father,mother,birth_place,birth_year,registry_no,class,section}]
app.post('/api/students/import', need('admin'), writable, (req, res) => {
  const sid = SID(req);
  const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
  if (rows.length > 5000) throw httpErr(400, 'الحد الأقصى 5000 صف في كل عملية استيراد');
  const classes = new Map(db.prepare('SELECT id,name FROM classes WHERE school_id=?').all(sid).map((c) => [c.name.trim(), c.id]));
  const secs = new Map(db.prepare('SELECT id,class_id,name FROM sections WHERE school_id=?').all(sid).map((s) => [`${s.class_id}|${s.name.trim()}`, s.id]));
  let added = 0, skipped = 0;
  const errors = [];
  tx(() => {
    let no = nextNo(sid);
    rows.forEach((r, i) => {
      const name = str(r.name, 120);
      if (!name) { skipped++; return; }
      let cid = r.class_id ? Number(r.class_id) : classes.get(str(r.class, 80)) || null;
      if (!cid && str(r.class)) { errors.push(`السطر ${i + 1}: الصف «${r.class}» غير موجود`); skipped++; return; }
      let secId = null;
      if (cid && str(r.section)) {
        const k = `${cid}|${str(r.section, 60)}`;
        if (!secs.has(k)) secs.set(k, Number(db.prepare('INSERT INTO sections(school_id,class_id,name) VALUES(?,?,?)').run(sid, cid, str(r.section, 60)).lastInsertRowid));
        secId = secs.get(k);
      }
      db.prepare('INSERT INTO students(school_id,no,name,father,mother,birth_place,birth_year,registry_no,class_id,section_id) VALUES(?,?,?,?,?,?,?,?,?,?)')
        .run(sid, no++, name, str(r.father), str(r.mother), str(r.birth_place), str(r.birth_year, 20), str(r.registry_no, 40), cid, secId);
      added++;
    });
  });
  res.json({ added, skipped, errors: errors.slice(0, 20) });
});
// الدوام والسلوك
app.patch('/api/students/meta', need('admin'), writable, (req, res) => {
  const sid = SID(req);
  const settings = mergeSettings(J(db.prepare('SELECT settings FROM schools WHERE id=?').get(sid).settings, {}));
  const items = Array.isArray(req.body.items) ? req.body.items : [];
  tx(() => {
    for (const it of items) {
      const id = intId(it.id);
      const vals = {};
      for (const k of ['att1', 'att2', 'exc1', 'exc2', 'beh1', 'beh2']) if (k in it) vals[k] = numOrNull(it[k]);
      if (vals.beh1 > settings.behavior_max || vals.beh2 > settings.behavior_max) throw httpErr(400, `علامة السلوك لا تتجاوز ${settings.behavior_max}`);
      for (const [k, v] of Object.entries(vals)) {
        if (v !== null && v < 0) throw httpErr(400, 'القيم لا يمكن أن تكون سالبة');
        db.prepare(`UPDATE students SET ${k}=? WHERE id=? AND school_id=?`).run(v, id, sid);
      }
      if ('notes' in it) db.prepare('UPDATE students SET notes=? WHERE id=? AND school_id=?').run(str(it.notes, 500), id, sid);
    }
  });
  res.json({ ok: true });
});

// ---------- الدرجات ----------
app.get('/api/grades', need('admin', 'teacher'), (req, res) => {
  const sid = SID(req);
  const where = ['g.school_id=?']; const args = [sid];
  if (req.query.class_id) { where.push('st.class_id=?'); args.push(intId(req.query.class_id)); }
  if (req.query.section_id) { where.push('st.section_id=?'); args.push(intId(req.query.section_id)); }
  if (req.query.subject_id) { where.push('g.subject_id=?'); args.push(intId(req.query.subject_id)); }
  res.json(db.prepare(`SELECT g.student_id,g.subject_id,g.semester,g.comp,g.value FROM grades g JOIN students st ON st.id=g.student_id WHERE ${where.join(' AND ')} AND g.value IS NOT NULL`).all(...args));
});
app.put('/api/grades', need('admin', 'teacher'), writable, (req, res) => {
  const sid = SID(req);
  const items = Array.isArray(req.body.items) ? req.body.items : [];
  if (items.length > 3000) throw httpErr(400, 'عدد كبير من التعديلات دفعة واحدة');
  const settings = mergeSettings(J(db.prepare('SELECT settings FROM schools WHERE id=?').get(sid).settings, {}));
  const allowed = req.user.role === 'teacher' ? new Set(db.prepare('SELECT subject_id FROM teacher_subjects WHERE user_id=?').all(req.user.id).map((r) => r.subject_id)) : null;
  const subjCache = new Map(); const stuCache = new Map();
  const getSubj = (id) => { if (!subjCache.has(id)) { const s = db.prepare('SELECT * FROM subjects WHERE id=? AND school_id=?').get(id, sid); subjCache.set(id, s && { ...s, comps: J(s.comps), weights: J(s.weights) }); } return subjCache.get(id); };
  const getStu = (id) => { if (!stuCache.has(id)) stuCache.set(id, db.prepare('SELECT id,class_id FROM students WHERE id=? AND school_id=?').get(id, sid)); return stuCache.get(id); };
  tx(() => {
    for (const it of items) {
      const subj = getSubj(intId(it.subject_id)); const stu = getStu(intId(it.student_id));
      if (!subj || !stu) throw httpErr(404, 'طالب أو مادة غير موجودة');
      if (stu.class_id !== subj.class_id) throw httpErr(400, 'المادة لا تتبع صف الطالب');
      if (allowed && !allowed.has(subj.id)) throw httpErr(403, `غير مخوّل برصد درجات مادة «${subj.name}»`);
      const semester = Number(it.semester);
      if (![1, 2].includes(semester)) throw httpErr(400, 'الفصل يجب أن يكون 1 أو 2');
      if (!subjectComps(subj).includes(it.comp)) throw httpErr(400, 'مكوّن غير مفعّل لهذه المادة');
      const v = numOrNull(it.value);
      if (v === null) { db.prepare('DELETE FROM grades WHERE student_id=? AND subject_id=? AND semester=? AND comp=?').run(stu.id, subj.id, semester, it.comp); continue; }
      const max = compMaxes(subj, settings)[it.comp];
      if (v < 0 || v > max + 1e-9) throw httpErr(400, `الدرجة ${v} خارج المجال (0 – ${max}) في «${subj.name}»`);
      db.prepare(`INSERT INTO grades(school_id,student_id,subject_id,semester,comp,value) VALUES(?,?,?,?,?,?)
        ON CONFLICT(student_id,subject_id,semester,comp) DO UPDATE SET value=excluded.value`).run(sid, stu.id, subj.id, semester, it.comp, v);
    }
  });
  res.json({ saved: items.length });
});

// ---------- المستخدمون (مدير المدرسة) ----------
app.get('/api/users', need('admin'), (req, res) => {
  const users = db.prepare('SELECT id,username,name,role,active FROM users WHERE school_id=? ORDER BY role,id').all(SID(req));
  const ts = db.prepare('SELECT user_id,subject_id FROM teacher_subjects WHERE user_id IN (SELECT id FROM users WHERE school_id=?)').all(SID(req));
  res.json(users.map((u) => ({ ...u, subjects: ts.filter((t) => t.user_id === u.id).map((t) => t.subject_id) })));
});
const validUsername = (u) => /^[a-z0-9._-]{3,40}$/.test(u);
app.post('/api/users', need('admin'), writable, (req, res) => {
  const username = str(req.body.username, 40).toLowerCase();
  if (!validUsername(username)) throw httpErr(400, 'اسم المستخدم: 3–40 محرفاً إنكليزياً صغيراً أو أرقاماً أو . _ -');
  if (String(req.body.password ?? '').length < 6) throw httpErr(400, 'كلمة المرور يجب ألا تقل عن 6 محارف');
  if (db.prepare('SELECT 1 FROM users WHERE lower(username)=?').get(username)) throw httpErr(409, 'اسم المستخدم مستخدم مسبقاً');
  const role = req.body.role === 'admin' ? 'admin' : 'teacher';
  const r = db.prepare('INSERT INTO users(school_id,username,pass_hash,name,role) VALUES(?,?,?,?,?)').run(SID(req), username, hashPassword(String(req.body.password)), str(req.body.name, 100) || username, role);
  res.json({ id: Number(r.lastInsertRowid) });
});
const ownUser = (req) => { const u = db.prepare('SELECT * FROM users WHERE id=? AND school_id=?').get(intId(req.params.id), SID(req)); if (!u) throw httpErr(404, 'المستخدم غير موجود'); return u; };
app.put('/api/users/:id', need('admin'), writable, (req, res) => {
  const u = ownUser(req);
  const role = req.body.role === 'admin' ? 'admin' : 'teacher';
  const active = req.body.active === false || req.body.active === 0 ? 0 : 1;
  if (u.id === req.user.id && (role !== 'admin' || !active)) throw httpErr(400, 'لا يمكنك تقييد حسابك الخاص');
  tx(() => {
    db.prepare('UPDATE users SET name=?, role=?, active=? WHERE id=?').run(str(req.body.name ?? u.name, 100), role, active, u.id);
    if (req.body.password) {
      if (String(req.body.password).length < 6) throw httpErr(400, 'كلمة المرور يجب ألا تقل عن 6 محارف');
      db.prepare('UPDATE users SET pass_hash=? WHERE id=?').run(hashPassword(String(req.body.password)), u.id);
    }
    if (Array.isArray(req.body.subjects)) {
      db.prepare('DELETE FROM teacher_subjects WHERE user_id=?').run(u.id);
      for (const sj of req.body.subjects.map(Number)) {
        if (db.prepare('SELECT 1 FROM subjects WHERE id=? AND school_id=?').get(sj, SID(req))) db.prepare('INSERT OR IGNORE INTO teacher_subjects(user_id,subject_id) VALUES(?,?)').run(u.id, sj);
      }
    }
  });
  res.json({ ok: true });
});
app.delete('/api/users/:id', need('admin'), writable, (req, res) => {
  const u = ownUser(req);
  if (u.id === req.user.id) throw httpErr(400, 'لا يمكنك حذف حسابك الخاص');
  db.prepare('DELETE FROM users WHERE id=?').run(u.id);
  res.json({ ok: true });
});

// ---------- نسخة احتياطية ----------
app.get('/api/backup', need('admin'), (req, res) => {
  const sid = SID(req);
  const q = (sql) => db.prepare(sql).all(sid);
  const data = {
    version: 1, exported_at: new Date().toISOString(),
    school: db.prepare('SELECT name,settings,expires_at FROM schools WHERE id=?').get(sid),
    classes: q('SELECT * FROM classes WHERE school_id=?'), sections: q('SELECT * FROM sections WHERE school_id=?'),
    subjects: q('SELECT * FROM subjects WHERE school_id=?'), students: q('SELECT * FROM students WHERE school_id=?'),
    grades: q('SELECT * FROM grades WHERE school_id=?'),
  };
  res.setHeader('Content-Disposition', `attachment; filename="backup-${new Date().toISOString().slice(0, 10)}.json"`);
  res.json(data);
});

// ---------- لوحة المزوّد (Super) ----------
app.get('/api/admin/schools', need('super'), (req, res) => {
  const rows = db.prepare(`SELECT s.id,s.name,s.active,s.expires_at,s.created_at,
    (SELECT COUNT(*) FROM students WHERE school_id=s.id) AS students,
    (SELECT COUNT(*) FROM users WHERE school_id=s.id) AS users,
    (SELECT username FROM users WHERE school_id=s.id AND role='admin' ORDER BY id LIMIT 1) AS admin_username
    FROM schools s ORDER BY s.id DESC`).all();
  res.json(rows);
});
const addMonths = (months) => { const d = new Date(); d.setMonth(d.getMonth() + months); return d.toISOString().slice(0, 10); };
app.post('/api/admin/schools', need('super'), (req, res) => {
  const name = str(req.body.name, 120);
  const username = str(req.body.admin_username, 40).toLowerCase();
  const password = String(req.body.admin_password ?? '');
  if (!name) throw httpErr(400, 'اسم المدرسة مطلوب');
  if (!validUsername(username)) throw httpErr(400, 'اسم مستخدم المدير غير صالح (إنكليزي، 3 محارف على الأقل)');
  if (password.length < 6) throw httpErr(400, 'كلمة مرور المدير يجب ألا تقل عن 6 محارف');
  if (db.prepare('SELECT 1 FROM users WHERE lower(username)=?').get(username)) throw httpErr(409, 'اسم المستخدم مستخدم مسبقاً');
  const months = Number(req.body.months);
  const expires = req.body.expires_at ? str(req.body.expires_at, 10) : months > 0 ? addMonths(months) : null;
  const year = new Date().getMonth() >= 8 ? `${new Date().getFullYear()} - ${new Date().getFullYear() + 1}` : `${new Date().getFullYear() - 1} - ${new Date().getFullYear()}`;
  const id = tx(() => {
    const r = db.prepare('INSERT INTO schools(name,expires_at,settings) VALUES(?,?,?)').run(name, expires, JSON.stringify({ year }));
    const sid = Number(r.lastInsertRowid);
    db.prepare('INSERT INTO users(school_id,username,pass_hash,name,role) VALUES(?,?,?,?,?)').run(sid, username, hashPassword(password), str(req.body.admin_name, 100) || 'مدير المدرسة', 'admin');
    if (Array.isArray(req.body.templates) && req.body.templates.length) applyTemplates(sid, req.body.templates.map(String));
    return sid;
  });
  res.json({ id });
});
app.patch('/api/admin/schools/:id', need('super'), (req, res) => {
  const id = intId(req.params.id);
  const s = db.prepare('SELECT * FROM schools WHERE id=?').get(id);
  if (!s) throw httpErr(404, 'المدرسة غير موجودة');
  const b = req.body;
  let expires = s.expires_at;
  if ('expires_at' in b) expires = b.expires_at ? str(b.expires_at, 10) : null;
  if (b.extend_months) {
    const base = expires && expires > new Date().toISOString().slice(0, 10) ? new Date(expires) : new Date();
    base.setMonth(base.getMonth() + Number(b.extend_months));
    expires = base.toISOString().slice(0, 10);
  }
  db.prepare('UPDATE schools SET name=?, active=?, expires_at=? WHERE id=?').run(str(b.name ?? s.name, 120), 'active' in b ? (b.active ? 1 : 0) : s.active, expires, id);
  res.json({ ok: true, expires_at: expires });
});
app.post('/api/admin/schools/:id/reset-password', need('super'), (req, res) => {
  const id = intId(req.params.id);
  const pw = String(req.body.password ?? '');
  if (pw.length < 6) throw httpErr(400, 'كلمة المرور يجب ألا تقل عن 6 محارف');
  const u = db.prepare("SELECT id FROM users WHERE school_id=? AND role='admin' ORDER BY id LIMIT 1").get(id);
  if (!u) throw httpErr(404, 'لا يوجد مدير لهذه المدرسة');
  db.prepare('UPDATE users SET pass_hash=? WHERE id=?').run(hashPassword(pw), u.id);
  db.prepare('DELETE FROM sessions WHERE user_id=?').run(u.id);
  res.json({ ok: true });
});
app.delete('/api/admin/schools/:id', need('super'), (req, res) => {
  const id = intId(req.params.id);
  if (str(req.body.confirm) !== 'DELETE') throw httpErr(400, 'تأكيد الحذف مطلوب');
  db.prepare('DELETE FROM schools WHERE id=?').run(id);
  res.json({ ok: true });
});

// ---------- الملفات الثابتة ----------
app.use('/shared', express.static(path.join(ROOT, 'shared')));
app.use('/vendor/xlsx.js', (req, res) => res.sendFile(path.join(ROOT, 'node_modules/xlsx/dist/xlsx.full.min.js')));
app.use(express.static(path.join(ROOT, 'public'), { extensions: ['html'] }));

app.use('/api', (req, res, next) => next(httpErr(404, 'المسار غير موجود')));
app.use((err, req, res, next) => { // eslint-disable-line
  const status = err.status || 500;
  if (status === 500) console.error(err);
  res.status(status).json({ error: status === 500 ? 'حدث خطأ غير متوقع في الخادم' : err.message });
});

// ---------- حساب المزوّد الأول ----------
export function ensureSuper() {
  if (db.prepare("SELECT 1 FROM users WHERE role='super'").get()) return null;
  const username = process.env.SUPER_USER || 'owner';
  const password = process.env.SUPER_PASS || crypto.randomBytes(6).toString('base64url');
  db.prepare("INSERT INTO users(school_id,username,pass_hash,name,role) VALUES(NULL,?,?,?,'super')").run(username, hashPassword(password), 'مزوّد الخدمة');
  return { username, password, generated: !process.env.SUPER_PASS };
}
