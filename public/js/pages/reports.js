import { h, GET, field, select, icon, loadScript, downloadXlsx, debounce } from '../lib.js';
import { S, subjectsOf, canEnter, isAdmin, sectionById, classById } from '../store.js';
import { classSection } from '../pickers.js';
import { indexGrades, COMP_LABELS } from '/shared/calc.js';
import * as R from '../report-sheets.js';

const TYPES = [
  { key: 'card', title: 'جلاء الطالب', desc: 'الوثيقة الرسمية الكاملة بالفصلين والنتيجة', needs: ['student'] },
  { key: 'statement', title: 'بيان درجات (مذاكرة/امتحان)', desc: 'للطالب وولي أمره، رقماً وكتابة', needs: ['student', 'sem', 'comp'] },
  { key: 'recap', title: 'محصّلة المعلّم', desc: 'محصلة الطلاب لكل مادة', needs: ['subject', 'sem2'] },
  { key: 'entry', title: 'ورقة رصد', desc: 'فارغة للتعبئة اليدوية أو مليئة', needs: ['subject', 'sem', 'comp', 'blank'] },
  { key: 'register', title: 'سجل الأعمال', desc: 'جدول نتائج الشعبة بكل المواد', needs: ['export'] },
  { key: 'results', title: 'كشف النتائج والترتيب', desc: 'ترتيب الطلاب والناجحون والراسبون', needs: ['top', 'export'] },
];
// ضبط الطباعة على A4: نُصغّر محتوى كل ورقة تلقائياً إن زاد عن مساحة الصفحة
const MM = 96 / 25.4;
function fitSheetsForPrint() {
  const prev = document.querySelector('.preview');
  const saved = prev ? [prev.style.getPropertyValue('--fit-p'), prev.style.getPropertyValue('--fit-l')] : null;
  if (prev) { prev.style.setProperty('--fit-p', 1); prev.style.setProperty('--fit-l', 1); }
  document.querySelectorAll('.sheet').forEach((sh) => {
    const kids = [...sh.children]; if (!kids.length) return;
    kids.forEach((k) => { k.style.zoom = ''; });
    const land = sh.classList.contains('land');
    const avail = ((land ? 209 : 296) - 12) * MM * 0.97;
    const top = kids[0].getBoundingClientRect().top, bottom = kids[kids.length - 1].getBoundingClientRect().bottom;
    const need = bottom - top;
    if (need > avail) { const f = Math.max(0.4, avail / need); kids.forEach((k) => { k.style.zoom = f; }); }
  });
  return () => { document.querySelectorAll('.sheet').forEach((sh) => [...sh.children].forEach((k) => { k.style.zoom = ''; })); if (prev && saved) { prev.style.setProperty('--fit-p', saved[0]); prev.style.setProperty('--fit-l', saved[1]); } };
}
let undoFit = null;
window.addEventListener('beforeprint', () => { undoFit = fitSheetsForPrint(); });
window.addEventListener('afterprint', () => { if (undoFit) { undoFit(); undoFit = null; } });

const rs = { type: 'card', class_id: '', section_id: '', student_id: '', subject_id: '', sem: '1', comp: 'test', blank: false, top: '' };
let lastData = null;

export async function render() {
  const wrap = h('div', {});
  R.sync();
  const preview = h('div', { class: 'preview' }, h('div', { class: 'empty' }, 'جارٍ التحضير…'));
  const fit = () => {
    const w = preview.clientWidth - 32; if (w <= 0) return;
    preview.style.setProperty('--fit-p', Math.min(1, w / 794));
    preview.style.setProperty('--fit-l', Math.min(1, w / 1123));
  };
  if (window.ResizeObserver) new ResizeObserver(fit).observe(preview); window.addEventListener('resize', fit);
  const controls = h('div', { class: 'toolbar rep-controls' });
  const typesBox = h('div', { class: 'rep-types' });
  const msg = h('div', { class: 'muted small no-print' });
  let students = [];

  const classes = S.classes;
  if (!classes.length) return h('div', {}, h('div', { class: 'top' }, h('h1', {}, 'التقارير والطباعة')), h('div', { class: 'empty' }, h('b', {}, 'لا توجد صفوف'), 'أنشئ الصفوف من الإعدادات.'));

  const drawTypes = () => typesBox.replaceChildren(...TYPES.map((t) => h('button', { class: rs.type === t.key ? 'on' : '', onclick: () => { rs.type = t.key; drawTypes(); drawControls(); build(); } }, h('b', {}, t.title), h('span', {}, t.desc))));

  const drawControls = () => {
    const t = TYPES.find((x) => x.key === rs.type);
    const items = [...classSection(rs, async (what) => { rs.student_id = ''; await loadStudents(); drawControls(); build(); }, { required: true })];
    if (t.needs.includes('student')) {
      const sel = select([{ value: '', label: 'كل طلاب الشعبة' }, ...students.map((s) => ({ value: s.id, label: s.name }))], rs.student_id);
      sel.onchange = () => { rs.student_id = sel.value; build(); };
      items.push(field('الطالب', sel));
    }
    if (t.needs.includes('subject')) {
      const subs = subjectsOf(rs.class_id).filter((s) => isAdmin() || canEnter(s.id));
      const sel = select([{ value: '', label: 'كل المواد' }, ...subs.map((s) => ({ value: s.id, label: s.name }))], rs.subject_id);
      sel.onchange = () => { rs.subject_id = sel.value; build(); };
      items.push(field('المادة', sel));
    }
    if (t.needs.includes('sem') || t.needs.includes('sem2')) {
      const sel = select([{ value: 1, label: 'الفصل الأول' }, { value: 2, label: 'الفصل الثاني' }, ...(t.needs.includes('sem2') ? [{ value: 'both', label: 'الفصلان معاً' }] : [])], rs.sem);
      sel.onchange = () => { rs.sem = sel.value; build(); };
      items.push(field('الفصل', sel));
    }
    if (t.needs.includes('comp')) {
      const sel = select([...['test', 'exam', 'oral', 'hw', 'act'].map((k) => ({ value: k, label: COMP_LABELS[k] })), { value: 'total', label: 'مجموع الفصل' }], rs.comp);
      sel.onchange = () => { rs.comp = sel.value; build(); };
      items.push(field('المكوّن', sel));
    }
    if (t.needs.includes('blank')) {
      const cb = h('input', { type: 'checkbox', checked: rs.blank, onchange: () => { rs.blank = cb.checked; build(); } });
      items.push(h('label', { class: 'f', style: { flexDirection: 'row', alignItems: 'center', gap: '8px', paddingBottom: '9px' } }, cb, 'ورقة فارغة (بدون درجات)'));
    }
    if (t.needs.includes('top')) {
      const sel = select([{ value: '', label: 'كل الطلاب' }, { value: 3, label: 'أول 3' }, { value: 5, label: 'أول 5' }, { value: 10, label: 'أول 10' }], rs.top);
      sel.onchange = () => { rs.top = sel.value; build(); };
      items.push(field('عرض', sel));
    }
    items.push(h('span', { class: 'grow' }), h('button', { class: 'btn primary', onclick: () => window.print() }, icon('print'), 'طباعة'));
    if (t.needs.includes('export')) items.push(h('button', { class: 'btn', onclick: exportXlsx }, icon('download'), 'تصدير إكسل'));
    controls.replaceChildren(...items);
  };

  const loadStudents = async () => {
    if (!rs.class_id) { students = []; return; }
    // الصف كاملاً (للترتيب)، ثم نعرض الشعبة المختارة
    const [stu, gr] = await Promise.all([GET(`/api/students?class_id=${rs.class_id}`), GET(`/api/grades?class_id=${rs.class_id}`)]);
    lastData = { all: stu, idx: indexGrades(gr) };
    students = stu.filter((s) => String(s.section_id) === String(rs.section_id));
  };

  const ctx = () => {
    const subjects = subjectsOf(rs.class_id);
    const shown = rs.student_id ? students.filter((s) => String(s.id) === String(rs.student_id)) : students;
    return { students: lastData.all, shown, subjects, idx: lastData.idx, section: sectionById(rs.section_id) };
  };

  const build = debounce(() => {
    if (!lastData) return;
    const c = ctx();
    const sub = rs.subject_id ? c.subjects.filter((s) => String(s.id) === String(rs.subject_id)) : c.subjects.filter((s) => s.in_total !== 0 || rs.type === 'entry');
    let sheets = [];
    msg.textContent = '';
    if (!c.shown.length) { preview.replaceChildren(h('div', { class: 'empty' }, h('b', {}, 'لا يوجد طلاب'), 'اختر شعبة تحتوي طلاباً.')); return; }
    if (!c.subjects.length) { preview.replaceChildren(h('div', { class: 'empty' }, h('b', {}, 'لا توجد مواد لهذا الصف'), 'عرّف المواد من الإعدادات.')); return; }
    try {
      switch (rs.type) {
        case 'card': sheets = R.cardSheets(c); break;
        case 'statement': sheets = R.statementSheets({ ...c, sem: Number(rs.sem === 'both' ? 1 : rs.sem), comp: rs.comp }); break;
        case 'recap': sheets = R.recapSheets({ ...c, subjects: sub, sem: rs.sem }); break;
        case 'entry': sheets = R.entrySheets({ ...c, subjects: sub, sem: Number(rs.sem === 'both' ? 1 : rs.sem), comp: rs.comp, blank: rs.blank }); break;
        case 'register': sheets = R.registerSheets(c); break;
        case 'results': sheets = R.resultsSheets({ ...c, topN: Number(rs.top) || 0 }); break;
      }
    } catch (e) { console.error(e); preview.replaceChildren(h('div', { class: 'banner bad' }, 'خطأ في إنشاء التقرير: ' + e.message)); return; }
    if (['card', 'register', 'results'].includes(rs.type)) {
      const { results } = R.computeClass(c.students, c.subjects, c.idx);
      const incomplete = c.shown.filter((s) => results.get(s.id).missing > 0).length;
      if (incomplete) msg.textContent = `تنبيه: ${incomplete} طالب لديهم درجات غير مكتملة (تُحتسب الخانات الفارغة صفراً).`;
    }
    preview.replaceChildren(...(sheets.length ? sheets : [h('div', { class: 'empty' }, 'لا شيء لعرضه')]));
  }, 60);

  const exportXlsx = async () => {
    await loadScript('/vendor/xlsx.js');
    const rows = R.exportRows(rs.type, ctx());
    const ws = XLSX.utils.json_to_sheet(rows); ws['!rtl'] = true;
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'النتائج');
    downloadXlsx(wb, `${rs.type === 'register' ? 'register' : 'results'}-${rs.class_id || 'all'}.xlsx`);
  };

  // تهيئة المنتقيات (تُنشئ الصف/الشعبة الافتراضيين)
  classSection(rs, () => {}, { required: true });
  await loadStudents();
  drawTypes(); drawControls();
  wrap.append(h('div', { class: 'top' }, h('h1', {}, 'التقارير والطباعة')),
    h('div', { class: 'rep-layout' }, typesBox, h('div', {}, h('div', { class: 'card rep-controls', style: { marginBottom: '14px' } }, controls, msg), preview)));
  build();
  return wrap;
}
