// محرك الحسابات المشترك بين الخادم والواجهة — يطابق منطق ملف الإكسل الأصلي:
//   علامة الفصل = شفوي + وظائف + نشاط + مذاكرة + امتحان
//   الدرجة النهائية للمادة = ROUNDUP((الفصل1 + الفصل2) / 2)
//   المجموع النهائي = مجموع المواد + السلوك (متوسط الفصلين مقرّباً للأعلى)

export const COMPS = ['oral', 'hw', 'act', 'test', 'exam'];
export const COMP_LABELS = { oral: 'شفوي', hw: 'وظائف', act: 'نشاط', test: 'مذاكرة', exam: 'امتحان' };
export const DEFAULT_WEIGHTS = { oral: 0.1, hw: 0.1, act: 0.2, test: 0.2, exam: 0.4 };

export const DEFAULT_SETTINGS = {
  ministry: 'الجمهورية العربية السورية - وزارة التربية',
  directorate: '',
  stage_line: '',
  year: '',
  principal: '',
  principal_title: 'مدير المدرسة',
  weights: DEFAULT_WEIGHTS,
  pass_percent: 50,
  behavior_max: 200,
  days1: 80,
  days2: 80,
  comments: [
    { min: 95, text: 'بوركت تلك الجهود التي أثمرت نجاحاً وتفوقاً باهراً، نبارك لك ولوالديك هذا النجاح.' },
    { min: 84, text: 'جهود مباركة، وهمة طيبة، نرجو لك المزيد من التفوق والنتائج الجيدة. نبارك لك ولوالديك هذا النجاح.' },
    { min: 70, text: 'بمزيد من الاهتمام والدراسة الجدية نستطيع أن نحقق أعلى المراتب. نبارك لك ولوالديك هذا النجاح.' },
    { min: 0, text: 'بمزيد من الإصرار والتصميم نستطيع أن نحقق أفضل النتائج. نبارك لك ولوالديك هذا النجاح والله ولي التوفيق.' },
  ],
};

export function mergeSettings(s) {
  const out = { ...DEFAULT_SETTINGS, ...(s || {}) };
  out.weights = { ...DEFAULT_WEIGHTS, ...((s && s.weights) || {}) };
  if (!Array.isArray(out.comments) || !out.comments.length) out.comments = DEFAULT_SETTINGS.comments;
  return out;
}

const r2 = (x) => Math.round(x * 100) / 100;
const num = (x) => (x === null || x === undefined || x === '' ? null : Number(x));

/** المكونات الفعّالة لمادة (قد تكون المادة مثل الإثرائي مذاكرة + امتحان فقط) */
export function subjectComps(subj) {
  const c = Array.isArray(subj.comps) && subj.comps.length ? subj.comps.filter((k) => COMPS.includes(k)) : COMPS;
  return c.length ? c : COMPS;
}

/** الدرجة العظمى لكل مكوّن من مكونات المادة (ضمن الفصل الواحد) */
export function compMaxes(subj, settings) {
  const comps = subjectComps(subj);
  const base = { ...mergeSettings(settings).weights, ...(subj.weights || {}) };
  const total = comps.reduce((a, k) => a + (base[k] || 0), 0) || 1;
  const out = {};
  for (const k of COMPS) out[k] = comps.includes(k) ? r2((subj.max * (base[k] || 0)) / total) : 0;
  return out;
}

/** فهرسة الدرجات: idx[studentId][subjectId][semester][comp] = value */
export function indexGrades(list) {
  const idx = {};
  for (const g of list) {
    ((idx[g.student_id] ??= {})[g.subject_id] ??= {})[g.semester] ??= {};
    idx[g.student_id][g.subject_id][g.semester][g.comp] = g.value;
  }
  return idx;
}

/** تجميع المواد في صفوف التقرير (المواد ذات group_name المتطابق تُجمع في صف واحد، مثل الاجتماعيات) */
export function reportRows(subjects) {
  const rows = [];
  const byGroup = new Map();
  const sorted = [...subjects].sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0) || a.id - b.id);
  for (const s of sorted) {
    const g = (s.group_name || '').trim();
    if (g) {
      if (!byGroup.has(g)) {
        const row = { name: g, subjects: [], grouped: true };
        byGroup.set(g, row);
        rows.push(row);
      }
      byGroup.get(g).subjects.push(s);
    } else rows.push({ name: s.name, subjects: [s], grouped: false });
  }
  for (const row of rows) {
    row.max = r2(row.subjects.reduce((a, s) => a + s.max, 0));
    row.in_total = row.subjects.every((s) => s.in_total !== 0);
  }
  return rows;
}

/** علامة صف (مادة أو مجموعة) في فصل لطالب */
export function rowSemester(row, gradesOfStudent, sem, settings) {
  const comps = { oral: 0, hw: 0, act: 0, test: 0, exam: 0 };
  let entered = false;
  let missing = 0;
  const maxes = { oral: 0, hw: 0, act: 0, test: 0, exam: 0 };
  for (const s of row.subjects) {
    const cm = compMaxes(s, settings);
    const g = gradesOfStudent?.[s.id]?.[sem] || {};
    const any = subjectComps(s).some((k) => num(g[k]) !== null);
    for (const k of COMPS) {
      maxes[k] += cm[k];
      const v = num(g[k]);
      if (v !== null) { comps[k] += v; entered = true; }
      else if (s.fixed && !any) comps[k] += cm[k]; // مواد بدرجة كاملة تلقائياً (فنية/رياضية/مشروع)
      else if (subjectComps(s).includes(k)) missing++;
    }
    if (s.fixed && !any) entered = true;
  }
  for (const k of COMPS) comps[k] = r2(comps[k]);
  const total = r2(COMPS.reduce((a, k) => a + comps[k], 0));
  return { comps, maxes, total, entered, missing };
}

/** نتيجة طالب كاملة */
export function studentResult(student, subjects, gradesIdx, settingsIn) {
  const settings = mergeSettings(settingsIn);
  const gs = gradesIdx?.[student.id] || {};
  const rows = reportRows(subjects).map((row) => {
    const s1 = rowSemester(row, gs, 1, settings);
    const s2 = rowSemester(row, gs, 2, settings);
    const final = Math.ceil(r2((s1.total + s2.total) / 2) - 1e-9) + 0;
    return { ...row, s1, s2, sum: r2(s1.total + s2.total), final };
  });
  const counted = rows.filter((r) => r.in_total);
  const sumRows = (f) => r2(counted.reduce((a, r) => a + f(r), 0));
  const bMax = Number(settings.behavior_max) || 0;
  const b1 = num(student.beh1), b2 = num(student.beh2);
  const bFinal = b1 === null && b2 === null ? 0 : Math.ceil(r2(((b1 ?? 0) + (b2 ?? 0)) / 2) - 1e-9) + 0;
  const rowsMax = sumRows((r) => r.max);
  const total1 = r2(sumRows((r) => r.s1.total) + (b1 ?? 0));
  const total2 = r2(sumRows((r) => r.s2.total) + (b2 ?? 0));
  const subjectsTotal = sumRows((r) => r.final);
  const grandTotal = r2(subjectsTotal + bFinal);
  const grandMax = r2(rowsMax + bMax);
  const percent = grandMax ? r2((grandTotal * 100) / grandMax) : 0;
  const missing = rows.reduce((a, r) => a + r.s1.missing + r.s2.missing, 0);
  return {
    rows, behavior: { b1, b2, final: bFinal, max: bMax },
    sem1: { subjects: sumRows((r) => r.s1.total), total: total1 },
    sem2: { subjects: sumRows((r) => r.s2.total), total: total2 },
    subjectsTotal, subjectsMax: rowsMax, grandTotal, grandMax, percent,
    passed: percent >= Number(settings.pass_percent),
    missing,
  };
}

/** ترتيب (تنافسي: المتساوون بنفس المرتبة) */
export function rankBy(items, key) {
  const sorted = [...items].sort((a, b) => key(b) - key(a));
  const ranks = new Map();
  let rank = 0, prev = null;
  sorted.forEach((it, i) => {
    if (prev === null || key(it) !== prev) rank = i + 1;
    ranks.set(it, rank);
    prev = key(it);
  });
  return ranks;
}

export function commentFor(percent, settingsIn) {
  const s = mergeSettings(settingsIn);
  const list = [...s.comments].sort((a, b) => b.min - a.min);
  return (list.find((c) => percent >= c.min) || list[list.length - 1]).text;
}
