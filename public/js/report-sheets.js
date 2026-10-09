// مولّدات أوراق الطباعة (A4). كل دالة تُرجع مصفوفة من عناصر .sheet
import { h, fmt } from './lib.js';
import { S, classById, sectionById } from './store.js';
import { COMPS, COMP_LABELS, studentResult, rowSemester, reportRows, compMaxes, subjectComps, rankBy, commentFor } from '/shared/calc.js';
import { numToWords } from '/shared/arabic.js';

let st = S.settings;
export const sync = () => { st = S.settings; };
const chunk = (arr, n) => { const out = []; for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out.length ? out : [[]]; };
const th = (t, o = {}) => h('th', o, t);
const td = (t, o = {}) => h('td', o, t === null || t === undefined ? '' : t);
const words = (n) => (n === '' || n === null || n === undefined ? '' : numToWords(n));

function header(extraCenter = '') {
  const pos = ['right', 'center', 'left'].includes(S.settings.logo_pos) ? S.settings.logo_pos : 'center';
  const logo = (p) => (S.settings.logo && pos === p ? h('img', { src: S.settings.logo, class: 'logo', alt: '' }) : null);
  return h('div', { class: 'hdr' },
    h('div', {}, logo('right'), h('div', {}, S.settings.ministry), h('div', {}, S.settings.directorate), h('div', {}, S.school.name)),
    h('div', {}, logo('center'), h('div', {}, S.settings.stage_line), extraCenter ? h('div', {}, extraCenter) : null),
    h('div', {}, logo('left'), h('div', {}, `العام الدراسي: ${S.settings.year || ''}`)));
}
const info = (pairs) => h('div', { class: 'info' }, pairs.filter((p) => p[1] !== undefined).map(([k, v]) => h('span', {}, `${k}: `, h('b', {}, v === null || v === '' ? '      ' : v))));
const secName = (s) => sectionById(s.section_id)?.name || '';
const clsName = (s) => classById(s.class_id)?.name || '';

/** كيف نحسب نتائج صف كامل مع الترتيب */
export function computeClass(students, subjects, idx) {
  const results = new Map(students.map((s) => [s.id, studentResult(s, subjects, idx, S.settings)]));
  const ranks = rankBy(students, (s) => results.get(s.id).grandTotal);
  return { results, ranks };
}

// ===================== جلاء الطالب =====================
export function cardSheets({ students, shown, subjects, idx }) {
  const { results, ranks } = computeClass(students, subjects, idx);
  return shown.map((s) => {
    const r = results.get(s.id);
    const cls = classById(s.class_id);
    const main = r.rows.filter((x) => x.in_total);
    const extra = r.rows.filter((x) => !x.in_total);
    const bRow = r.behavior;
    const semCells = (x, k) => [...COMPS.map((c) => td(fmt(x[k].comps[c]))), td(fmt(x[k].total), { style: { fontWeight: 700 } }), td(words(x[k].total), { class: 'words' })];
    const thead = h('thead', {},
      h('tr', {}, th('المواد الدراسية', { rowspan: 2 }), th('النهاية العظمى', { rowspan: 2 }), th('الفصل الأول', { colspan: 7 }), th('الفصل الثاني', { colspan: 7 }),
        th('مجموع محصلتين', { rowspan: 2 }), th('الدرجة النهائية', { colspan: 2 })),
      h('tr', {}, ...[1, 2].flatMap(() => [...COMPS.map((c) => th(COMP_LABELS[c])), th('المجموع'), th('كتابةً')]), th('رقماً'), th('كتابةً')));
    const body = main.map((x) => h('tr', {}, td(x.name, { class: 'l' }), td(fmt(x.max)), ...semCells(x, 's1'), ...semCells(x, 's2'), td(fmt(x.sum)), td(fmt(x.final), { style: { fontWeight: 700 } }), td(words(x.final), { class: 'words' })));
    const tot = h('tr', { style: { fontWeight: 700 } }, td('المجموع العام', { class: 'l' }), td(fmt(r.subjectsMax)), td('', { colspan: 5 }), td(fmt(r.sem1.subjects)), td(words(r.sem1.subjects), { class: 'words' }),
      td('', { colspan: 5 }), td(fmt(r.sem2.subjects)), td(words(r.sem2.subjects), { class: 'words' }), td(fmt(r.sem1.subjects + r.sem2.subjects)), td(fmt(r.subjectsTotal)), td(words(r.subjectsTotal), { class: 'words' }));
    const beh = h('tr', {}, td('السلوك', { class: 'l' }), td(fmt(bRow.max)), td(fmt(bRow.b1), { colspan: 6 }), td(words(bRow.b1), { class: 'words' }), td(fmt(bRow.b2), { colspan: 6 }), td(words(bRow.b2), { class: 'words' }),
      td(fmt((bRow.b1 ?? 0) + (bRow.b2 ?? 0))), td(fmt(bRow.final)), td(words(bRow.final), { class: 'words' }));
    const grand = h('tr', { style: { fontWeight: 700, background: '#efefef' } }, td('المجموع النهائي', { class: 'l' }), td(fmt(r.grandMax)), td(fmt(r.sem1.total), { colspan: 6 }), td(words(r.sem1.total), { class: 'words' }),
      td(fmt(r.sem2.total), { colspan: 6 }), td(words(r.sem2.total), { class: 'words' }), td(fmt(r.sem1.total + r.sem2.total)), td(fmt(r.grandTotal)), td(words(r.grandTotal), { class: 'words' }));
    const d1 = Number(st.days1), d2 = Number(st.days2);
    const att = (a, e, d) => { const has = a !== null && a !== undefined; const abs = has ? d - a : ''; return [td(d), td(has ? fmt(a) : ''), td(has ? fmt(abs) : ''), td(e ?? ''), td(has ? fmt(abs - (e || 0)) : ''), td(has && d ? `${Math.ceil((a * 100) / d)}%` : '')]; };
    const attTable = h('table', { class: 'tight', style: { width: '100%' } },
      h('thead', {}, h('tr', {}, th('الفصل'), th('أيام الدوام'), th('دوام التلميذ'), th('الغياب'), th('مبرر'), th('غير مبرر'), th('النسبة'))),
      h('tbody', {}, h('tr', {}, td('الأول'), ...att(s.att1, s.exc1, d1)), h('tr', {}, td('الثاني'), ...att(s.att2, s.exc2, d2)),
        h('tr', {}, td('المجموع'), td(d1 + d2), td((s.att1 ?? 0) + (s.att2 ?? 0)), td(d1 + d2 - (s.att1 ?? 0) - (s.att2 ?? 0)), td((s.exc1 ?? 0) + (s.exc2 ?? 0)), td(d1 + d2 - (s.att1 ?? 0) - (s.att2 ?? 0) - (s.exc1 ?? 0) - (s.exc2 ?? 0)), td(d1 + d2 ? `${Math.ceil((((s.att1 ?? 0) + (s.att2 ?? 0)) * 100) / (d1 + d2))}%` : ''))));
    const res = r.passed
      ? `نجاح إلى الصف: ${cls?.next_class || '—'}` : `رسوب في الصف: ${cls?.name || ''}`;
    const extraTbl = extra.length ? h('table', { class: 'tight', style: { width: '58%', marginTop: '6px' } },
      h('thead', {}, h('tr', {}, th('مواد خارج المجموع العام'), th('النهاية العظمى'), th('الفصل الأول'), th('الفصل الثاني'), th('الدرجة النهائية'))),
      h('tbody', {}, extra.map((x) => h('tr', {}, td(x.name, { class: 'l' }), td(x.max), td(fmt(x.s1.total)), td(fmt(x.s2.total)), td(fmt(x.final)))))) : null;
    return h('section', { class: 'sheet land' }, header(cls ? `(${cls.name})` : ''),
      h('h2', {}, 'جلاء الطالب'),
      info([['الرقم', s.no], ['التلميذ/ة', s.name], ['ابن/بنت السيد', s.father], ['والدته/ها', s.mother], ['مواليد', s.birth_place], ['عام', s.birth_year], ['السجل العام', s.registry_no], ['الشعبة', secName(s)]]),
      h('table', { class: 'tight' }, thead, h('tbody', {}, body, tot, beh, grand)),
      h('div', { style: { display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: '10px', marginTop: '6px', alignItems: 'start' } },
        h('div', {}, attTable, extraTbl,
          h('div', { class: 'box', style: { marginTop: '6px' } }, h('b', {}, 'ملاحظات إدارة المدرسة: '), r.passed ? commentFor(r.percent, st) : 'بمزيد من الجد والاجتهاد نتجاوز الصعوبات ونحقق النجاح.')),
        h('div', {}, h('div', { class: 'box' }, h('div', { style: { fontWeight: 700, textAlign: 'center', marginBottom: '4px' } }, 'النتيجة النهائية'),
          h('div', { class: r.passed ? 'pass' : 'fail' }, res), h('div', {}, `النسبة المئوية: ${fmt(r.percent)}%`),
          h('div', {}, `الترتيب: ${ranks.get(s)} من ${students.length}`)),
        h('div', { class: 'box', style: { minHeight: '46px' } }, 'ملاحظات ولي أمر التلميذ وتوقيعه:'))),
      h('div', { class: 'sign' }, h('span', {}, 'توقيع الموجّه'), h('span', {}, `${st.principal_title}: ${st.principal || ''}`), h('span', {}, 'الختم'), h('span', {}, 'التاريخ:      /      /')));
  });
}

// ===================== بيان درجات =====================
export function statementSheets({ shown, subjects, idx, sem, comp }) {
  const label = comp === 'total' ? 'مجموع الفصل' : COMP_LABELS[comp];
  return shown.map((s) => {
    const gs = idx[s.id] || {};
    const leaf = [...subjects].sort((a, b) => a.sort - b.sort || a.id - b.id).map((sj) => {
      const rr = rowSemester({ subjects: [sj] }, gs, sem, st);
      return { sj, value: comp === 'total' ? rr.total : rr.comps[comp], max: comp === 'total' ? sj.max : rr.maxes[comp], entered: rr.entered };
    }).filter((x) => comp === 'total' || subjectComps(x.sj).includes(comp));
    const main = leaf.filter((x) => x.sj.in_total !== 0), extra = leaf.filter((x) => x.sj.in_total === 0);
    const sum = (a, k) => Math.round(a.reduce((t, x) => t + (x[k] || 0), 0) * 100) / 100;
    const row = (x) => h('tr', {}, td(x.sj.name, { class: 'l' }), td(fmt(x.max)), td(x.entered ? fmt(x.value) : ''), td(x.entered ? words(x.value) : '', { class: 'words' }));
    return h('section', { class: 'sheet' }, header(),
      h('h2', {}, `بيان درجات ${label} — ${sem === 1 ? 'الفصل الأول' : 'الفصل الثاني'}`),
      info([['الطالب', s.name], ['الصف', clsName(s)], ['الشعبة', secName(s)], ['السجل العام', s.registry_no]]),
      h('table', {}, h('thead', {}, h('tr', {}, th('المادة', { rowspan: 2 }), th('الدرجة العليا', { rowspan: 2 }), th('العلامة المستحقة', { colspan: 2 })), h('tr', {}, th('رقماً'), th('كتابةً'))),
        h('tbody', {}, main.map(row),
          h('tr', { style: { fontWeight: 700 } }, td('المجموع النهائي', { class: 'l' }), td(fmt(sum(main, 'max'))), td(fmt(sum(main, 'value'))), td(words(sum(main, 'value')), { class: 'words' })),
          extra.map(row))),
      h('div', { class: 'sign', style: { marginTop: '40px' } }, h('span', {}, 'توقيع ولي الأمر:'), h('span', {}, `${st.principal_title}: ${st.principal || ''}`), h('span', {}, 'الختم')));
  });
}

// ===================== محصلة المعلم / ورقة الرصد =====================
function listSheets({ title, subj, section, rows, cols, perPage = 30, land = false, extraInfo = [] }) {
  const pages = chunk(rows, perPage);
  return pages.map((pg, pi) => h('section', { class: `sheet${land ? ' land' : ''}` }, header(),
    h('h2', {}, title),
    info([['الصف', clsName({ class_id: section?.class_id })], ['الشعبة', section?.name || ''], ...extraInfo, ...(pages.length > 1 ? [['صفحة', `${pi + 1}/${pages.length}`]] : [])]),
    h('table', { class: 'zebra' }, h('thead', {}, h('tr', {}, th('#'), th('اسم الطالب'), cols.map((c) => th(c.label)))),
      h('tbody', {}, pg.map((r) => h('tr', {}, td(r.no, { style: { width: '8mm' } }), td(r.name, { class: 'l' }), cols.map((c) => td(c.get(r))))))),
    h('div', { class: 'sign', style: { marginTop: '26px' } }, h('span', {}, `المدرّس: ${(S.teachers[subj?.id] || []).join('، ') || '................................'}`), h('span', {}, 'التوقيع: ............'), h('span', {}, `${st.principal_title}: ${st.principal || ''}`))));
}

export function recapSheets({ shown, subjects, idx, sem, section }) {
  const out = [];
  for (const sj of subjects) {
    const comps = subjectComps(sj), maxes = compMaxes(sj, st);
    const calc = (s, k) => rowSemester({ subjects: [sj] }, idx[s.id] || {}, k, st);
    const rows = shown.map((s) => ({ no: s.no, name: s.name, s1: calc(s, 1), s2: calc(s, 2) }));
    const cols = [];
    const addSem = (k) => { comps.forEach((c) => cols.push({ label: `${COMP_LABELS[c]} (${maxes[c]})`, get: (r) => (r[`s${k}`].entered ? fmt(r[`s${k}`].comps[c]) : '') })); cols.push({ label: `المجموع ف${k} (${sj.max})`, get: (r) => (r[`s${k}`].entered ? fmt(r[`s${k}`].total) : '') }); };
    if (sem === 'both') { cols.push({ label: `محصلة ف1 (${sj.max})`, get: (r) => fmt(r.s1.total) }, { label: `محصلة ف2 (${sj.max})`, get: (r) => fmt(r.s2.total) }, { label: `النهائية (${sj.max})`, get: (r) => fmt(Math.ceil((r.s1.total + r.s2.total) / 2 - 1e-9) + 0) }); } else addSem(Number(sem));
    out.push(...listSheets({ title: `محصلة الطلاب — ${sem === 'both' ? 'الفصلان' : Number(sem) === 1 ? 'الفصل الأول' : 'الفصل الثاني'}`, section, rows, cols, perPage: 28, land: false, subj: sj, extraInfo: [['المادة', sj.name], ['النهاية العظمى', sj.max]] }));
  }
  return out;
}

export function entrySheets({ shown, subjects, idx, sem, comp, blank, section }) {
  const out = [];
  for (const sj of subjects) {
    if (comp !== 'total' && !subjectComps(sj).includes(comp)) continue;
    const maxes = compMaxes(sj, st);
    const rows = shown.map((s) => { const rr = rowSemester({ subjects: [sj] }, idx[s.id] || {}, sem, st); return { no: s.no, name: s.name, v: rr.entered ? (comp === 'total' ? rr.total : rr.comps[comp]) : '' }; });
    out.push(...listSheets({ title: `ورقة رصد ${comp === 'total' ? 'مجموع الفصل' : COMP_LABELS[comp]} — ${sem === 1 ? 'الفصل الأول' : 'الفصل الثاني'}`, section, rows,
      cols: [{ label: `الدرجة (من ${comp === 'total' ? sj.max : maxes[comp]})`, get: (r) => (blank ? '' : fmt(r.v)) }, { label: 'ملاحظات', get: () => '' }], perPage: 28, subj: sj, extraInfo: [['المادة', sj.name]] }));
  }
  return out;
}

// ===================== سجل الأعمال (مرايا) =====================
export function registerSheets({ students, shown, subjects, idx, section }) {
  const { results, ranks } = computeClass(students, subjects, idx);
  const mainRows = reportRows(subjects).filter((r) => r.in_total);
  const pages = chunk(shown, 20);
  return pages.map((pg, pi) => h('section', { class: 'sheet land' }, header(),
    h('h2', {}, 'سجل أعمال الصف'),
    info([['الصف', clsName({ class_id: section?.class_id })], ['الشعبة', section?.name || ''], ...(pages.length > 1 ? [['صفحة', `${pi + 1}/${pages.length}`]] : [])]),
    h('table', { class: 'tight zebra' }, h('thead', {}, h('tr', {}, th('#'), th('اسم الطالب'), mainRows.map((r) => th(`${r.name} (${fmt(r.max)})`)), th('المجموع العام'), th(`السلوك (${st.behavior_max})`), th('المجموع النهائي'), th('%'), th('الترتيب'), th('النتيجة'))),
      h('tbody', {}, pg.map((s) => { const r = results.get(s.id); return h('tr', {}, td(s.no), td(s.name, { class: 'l', style: { whiteSpace: 'nowrap' } }), r.rows.filter((x) => x.in_total).map((x) => td(fmt(x.final))),
        td(fmt(r.subjectsTotal)), td(fmt(r.behavior.final)), td(fmt(r.grandTotal), { style: { fontWeight: 700 } }), td(fmt(r.percent)), td(ranks.get(s)), td(r.passed ? 'ناجح' : 'راسب', { class: r.passed ? 'pass' : 'fail' })); })))));
}

// ===================== كشف النتائج والترتيب =====================
export function resultsSheets({ students, shown, subjects, idx, topN }) {
  const { results, ranks } = computeClass(students, subjects, idx);
  let list = [...shown].sort((a, b) => ranks.get(a) - ranks.get(b) || a.name.localeCompare(b.name, 'ar'));
  if (topN) list = list.filter((s) => ranks.get(s) <= topN);
  const passed = shown.filter((s) => results.get(s.id).passed).length;
  const avg = shown.length ? shown.reduce((a, s) => a + results.get(s.id).percent, 0) / shown.length : 0;
  const pages = chunk(list, 30);
  return pages.map((pg, pi) => h('section', { class: 'sheet' }, header(),
    h('h2', {}, topN ? `قائمة الأوائل (أول ${topN} مراتب)` : 'كشف النتائج والترتيب'),
    info([['الصف', clsName(shown[0] || {})], ['عدد الطلاب', shown.length], ['الناجحون', passed], ['الراسبون', shown.length - passed], ['نسبة النجاح', shown.length ? `${fmt((passed * 100) / shown.length)}%` : ''], ['متوسط النسب', `${fmt(avg)}%`]]),
    h('table', { class: 'zebra' }, h('thead', {}, h('tr', {}, ['الترتيب', 'اسم الطالب', 'الشعبة', 'المجموع', 'من', 'النسبة %', 'النتيجة'].map((t) => th(t)))),
      h('tbody', {}, pg.map((s) => { const r = results.get(s.id); return h('tr', {}, td(ranks.get(s)), td(s.name, { class: 'l' }), td(secName(s)), td(fmt(r.grandTotal), { style: { fontWeight: 700 } }), td(fmt(r.grandMax)), td(fmt(r.percent)), td(r.passed ? 'ناجح' : 'راسب', { class: r.passed ? 'pass' : 'fail' })); }))),
    h('div', { class: 'sign', style: { marginTop: '24px' } }, h('span', {}, `${st.principal_title}: ${st.principal || ''}`), h('span', {}, 'الختم'))));
}

/** صفوف للتصدير إلى إكسل */
export function exportRows(kind, { students, shown, subjects, idx }) {
  const { results, ranks } = computeClass(students, subjects, idx);
  const rows = [...shown].sort((a, b) => ranks.get(a) - ranks.get(b));
  const main = reportRows(subjects).filter((r) => r.in_total);
  return rows.map((s) => {
    const r = results.get(s.id);
    const o = { 'الرقم': s.no, 'الاسم': s.name, 'الشعبة': secName(s) };
    if (kind === 'register') r.rows.filter((x) => x.in_total).forEach((x) => { o[x.name] = x.final; });
    o['السلوك'] = r.behavior.final; o['المجموع النهائي'] = r.grandTotal; o['من'] = r.grandMax; o['النسبة %'] = r.percent; o['الترتيب'] = ranks.get(s); o['النتيجة'] = r.passed ? 'ناجح' : 'راسب';
    return o;
  });
}
