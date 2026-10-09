// بيانات تجريبية (أسماء وهمية) لعرض النظام — تشغيل: npm run seed
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { db, tx, hashPassword, applyTemplates, J } from './db.js';
import { COMPS, compMaxes, subjectComps, mergeSettings } from '../shared/calc.js';

let seed = 42;
const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const pick = (a) => a[Math.floor(rnd() * a.length)];
const FIRST_M = ['أحمد', 'محمد', 'عمر', 'خالد', 'يوسف', 'سامر', 'كريم', 'ياسر', 'هادي', 'زياد', 'مازن', 'رامي', 'ليث', 'باسل'];
const FIRST_F = ['سلمى', 'دانة', 'لينا', 'ريما', 'هبة', 'جود', 'تالا', 'مريم', 'نور', 'ياسمين', 'رنا', 'لمى', 'سارة', 'رهف'];
const FAM = ['الحسن', 'العلي', 'المصري', 'الشامي', 'الخطيب', 'النجار', 'الحلبي', 'القاسم', 'الأحمد', 'سعيد', 'درويش', 'منصور'];
const FATHERS = ['عبدالله', 'محمود', 'علي', 'حسان', 'فراس', 'نزار', 'وليد', 'بشير'];
const MOTHERS = ['ميادة', 'رغداء', 'ريم', 'تهاني', 'سوسن', 'هالة', 'لمى', 'نادية'];
const PLACES = ['دمشق', 'الصبورة', 'الديماس', 'جديدة عرطوز', 'قدسيا'];

export function seedDemo() {
  if (db.prepare("SELECT 1 FROM users WHERE username='admin'").get()) return console.log('البيانات التجريبية موجودة مسبقاً');
  const exp = new Date(); exp.setMonth(exp.getMonth() + 12);
  const sid = Number(db.prepare('INSERT INTO schools(name,expires_at,settings) VALUES(?,?,?)').run('مدرسة النور النموذجية', exp.toISOString().slice(0, 10), JSON.stringify({
    directorate: 'مديرية التربية - ريف دمشق', stage_line: 'مرحلة التعليم الأساسي - الحلقة الثانية', year: '2025 - 2026', principal: 'السيدة منى العلي', days1: 80, days2: 74,
  })).lastInsertRowid);
  db.prepare('INSERT INTO users(school_id,username,pass_hash,name,role) VALUES(?,?,?,?,?)').run(sid, 'admin', hashPassword('admin123'), 'مدير المدرسة', 'admin');
  const classIds = applyTemplates(sid, ['7', '8', '9', '10', '11', '12']);
  const settings = mergeSettings(J(db.prepare('SELECT settings FROM schools WHERE id=?').get(sid).settings, {}));
  const teacher = Number(db.prepare('INSERT INTO users(school_id,username,pass_hash,name,role) VALUES(?,?,?,?,?)').run(sid, 'teacher1', hashPassword('teacher123'), 'الأستاذ سامر (عربي - السابع)', 'teacher').lastInsertRowid);
  tx(() => {
    let no = 1;
    classIds.forEach((cid, ci) => {
      const sections = db.prepare('SELECT id FROM sections WHERE class_id=?').all(cid);
      const subjects = db.prepare('SELECT * FROM subjects WHERE class_id=?').all(cid).map((s) => ({ ...s, comps: J(s.comps), weights: J(s.weights) }));
      if (ci === 0) {
        const ar = subjects.find((s) => s.name === 'اللغة العربية');
        db.prepare('INSERT INTO teacher_subjects(user_id,subject_id) VALUES(?,?)').run(teacher, ar.id);
      }
      for (const sec of sections) {
        for (let i = 0; i < 9; i++) {
          const female = rnd() > 0.5;
          const name = `${pick(female ? FIRST_F : FIRST_M)} ${pick(FATHERS)} ${pick(FAM)}`;
          const att1 = 66 + Math.floor(rnd() * 15), att2 = 60 + Math.floor(rnd() * 15);
          const r = db.prepare('INSERT INTO students(school_id,no,name,father,mother,birth_place,birth_year,registry_no,class_id,section_id,att1,att2,exc1,exc2,beh1,beh2) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
            .run(sid, no, name, pick(FATHERS), pick(MOTHERS), pick(PLACES), String(2012 - ci), String(100 + no), cid, sec.id, att1, att2, Math.floor(rnd() * 3), Math.floor(rnd() * 3),
              170 + Math.floor(rnd() * 31), 170 + Math.floor(rnd() * 31));
          no++;
          const ability = 0.45 + rnd() * 0.5;
          const stuId = Number(r.lastInsertRowid);
          for (const s of subjects) {
            if (s.fixed) continue;
            const cm = compMaxes(s, settings);
            for (const sem of [1, 2]) for (const k of subjectComps(s)) {
              if (ci === 5 && sem === 2 && k === 'exam') continue; // البكالوريا: امتحان الفصل الثاني لم يُرصد بعد
              const v = Math.max(0, Math.min(cm[k], Math.round(cm[k] * (ability + (rnd() - 0.5) * 0.3) * 2) / 2));
              db.prepare('INSERT INTO grades(school_id,student_id,subject_id,semester,comp,value) VALUES(?,?,?,?,?,?)').run(sid, stuId, s.id, sem, k, v);
            }
          }
        }
      }
    });
  });
  console.log('تم إنشاء مدرسة تجريبية: admin / admin123 — معلم: teacher1 / teacher123');
}
if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) seedDemo();
