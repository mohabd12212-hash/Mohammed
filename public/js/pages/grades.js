import { h, GET, PUT, toast, field, select, debounce, fmt } from '../lib.js';
import { S, subjectsOf, canEnter, isAdmin } from '../store.js';
import { classSection } from '../pickers.js';
import { COMPS, COMP_LABELS, compMaxes, subjectComps } from '/shared/calc.js';

const st = { class_id: '', section_id: '', subject_id: '', semester: '1' };

export async function render() {
  const wrap = h('div', {});
  const gridBox = h('div', {});
  const status = h('span', { class: 'status' }, 'جاهز');
  const pending = new Map();
  const setStatus = (t, cls = '') => { status.className = `status ${cls}`; status.textContent = t; };

  // للمعلم: الصفوف التي يملك فيها مواداً فقط
  const classes = isAdmin() ? S.classes : S.classes.filter((c) => subjectsOf(c.id).some((s) => canEnter(s.id)));
  if (!classes.length) return h('div', {}, h('div', { class: 'top' }, h('h1', {}, 'رصد الدرجات')), h('div', { class: 'empty' }, h('b', {}, 'لا توجد مواد متاحة للرصد'), isAdmin() ? 'أنشئ الصفوف والمواد من الإعدادات أولاً.' : 'اطلب من مدير المدرسة إسناد موادك إليك.'));

  const subjOf = () => subjectsOf(st.class_id).filter((s) => isAdmin() || canEnter(s.id));
  const subjSel = select([], '');
  const semSel = select([{ value: 1, label: 'الفصل الأول' }, { value: 2, label: 'الفصل الثاني' }], st.semester);
  const fillSubjects = () => {
    const list = subjOf();
    if (!list.find((s) => String(s.id) === String(st.subject_id))) st.subject_id = list[0] ? String(list[0].id) : '';
    subjSel.replaceChildren(...list.map((s) => h('option', { value: s.id, selected: String(s.id) === st.subject_id }, s.name)));
  };
  const flush = async () => {
    if (!pending.size) return;
    const items = [...pending.values()]; pending.clear(); setStatus('جارٍ الحفظ…', 'saving');
    try { await PUT('/api/grades', { items }); setStatus(`تم الحفظ ✓ (${new Date().toLocaleTimeString('ar-SY', { hour: '2-digit', minute: '2-digit' })})`, 'ok'); }
    catch (e) { setStatus('لم يُحفظ: ' + e.message, 'err'); toast(e.message, 'err'); items.forEach((it) => { const k = `${it.student_id}|${it.comp}`; if (!pending.has(k)) pending.set(k, it); }); }
  };
  const flushSoon = debounce(flush, 600);
  window.addEventListener('beforeunload', (e) => { if (pending.size) { e.preventDefault(); e.returnValue = ''; } });

  const loadGrid = async () => {
    await flush();
    fillSubjects();
    const subj = S.subjects.find((s) => String(s.id) === String(st.subject_id));
    if (!subj || !st.section_id) { gridBox.replaceChildren(h('div', { class: 'empty' }, 'اختر الصف والشعبة والمادة')); return; }
    const sem = Number(st.semester);
    const [students, grades] = await Promise.all([GET(`/api/students?section_id=${st.section_id}`), GET(`/api/grades?section_id=${st.section_id}&subject_id=${subj.id}`)]);
    if (!students.length) { gridBox.replaceChildren(h('div', { class: 'empty' }, h('b', {}, 'لا يوجد طلاب في هذه الشعبة'), 'أضفهم من صفحة الطلاب.')); return; }
    const vals = {};
    for (const g of grades) if (g.semester === sem) (vals[g.student_id] ??= {})[g.comp] = g.value;
    const comps = subjectComps(subj);
    const maxes = compMaxes(subj, S.settings);
    const locked = !canEnter(subj.id) || S.school.expired;
    const rowTotals = new Map();
    const inputs = [];
    const filledCount = h('span', {});
    const updateCounts = () => {
      let f = 0; inputs.forEach((r) => r.forEach((i) => { if (i.value.trim() !== '') f++; }));
      filledCount.textContent = `${f} من ${students.length * comps.length} خانة معبّأة`;
    };
    const recalc = (i) => {
      let sum = 0, any = false;
      inputs[i].forEach((inp) => { const v = inp.value.trim().replace(',', '.'); if (v !== '' && !isNaN(Number(v))) { sum += Number(v); any = true; } });
      rowTotals.get(i).textContent = any ? fmt(sum) : '';
    };
    const commit = (inp, s, comp, i) => {
      const raw = inp.value.trim().replace(',', '.').replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
      const bad = raw !== '' && (isNaN(Number(raw)) || Number(raw) < 0 || Number(raw) > maxes[comp]);
      inp.classList.toggle('bad', bad); inp.classList.remove('saved');
      inp.title = bad ? `الدرجة يجب أن تكون بين 0 و ${maxes[comp]}` : '';
      recalc(i); updateCounts();
      if (bad) { setStatus(`قيمة غير صالحة (الحد الأعلى ${maxes[comp]})`, 'err'); return; }
      pending.set(`${s.id}|${comp}`, { student_id: s.id, subject_id: subj.id, semester: sem, comp, value: raw === '' ? null : Number(raw) });
      setStatus('تعديلات غير محفوظة…', 'saving'); flushSoon();
    };
    const body = students.map((s, i) => {
      const row = comps.map((comp, j) => {
        const inp = h('input', { type: 'text', inputmode: 'decimal', autocomplete: 'off', value: vals[s.id]?.[comp] ?? '', disabled: locked, 'aria-label': `${COMP_LABELS[comp]} — ${s.name}`, 'data-r': i, 'data-c': j });
        inp.addEventListener('input', () => commit(inp, s, comp, i));
        inp.addEventListener('focus', () => inp.select());
        inp.addEventListener('keydown', (e) => {
          const move = (dr) => { const nx = inputs[i + dr]?.[j]; if (nx) { e.preventDefault(); nx.focus(); } };
          if (e.key === 'Enter' || e.key === 'ArrowDown') move(1); else if (e.key === 'ArrowUp') move(-1);
        });
        inp.addEventListener('paste', (e) => { // لصق من إكسل: صفوف بفاصل سطر، أعمدة بفاصل تبويب
          const t = (e.clipboardData || window.clipboardData).getData('text');
          if (!/[\n\t]/.test(t.trim())) return;
          e.preventDefault();
          t.trim().split(/\r?\n/).forEach((line, di) => line.split('\t').forEach((cell, dj) => {
            const target = inputs[i + di]?.[j + dj]; if (!target || target.disabled) return;
            target.value = cell.trim(); target.dispatchEvent(new Event('input'));
          }));
        });
        return inp;
      });
      inputs.push(row);
      const tot = h('td', { class: 'num tot' }); rowTotals.set(i, tot);
      return h('tr', {}, h('td', { class: 'num' }, s.no ?? i + 1), h('td', {}, s.name), row.map((inp) => h('td', { class: 'num' }, inp)), tot);
    });
    gridBox.replaceChildren(...[
      locked ? h('div', { class: 'banner' }, S.school.expired ? 'الاشتراك منتهٍ: العرض فقط.' : 'ليس لديك صلاحية تعديل هذه المادة.') : null,
      subj.fixed ? h('div', { class: 'banner' }, 'مادة تُحتسب بدرجة كاملة تلقائياً (كما في الملف الأصلي) ما لم تُرصد لها درجات فعلية.') : null,
      subj.in_total === 0 ? h('div', { class: 'banner' }, 'هذه المادة (إثرائي) لا تدخل في المجموع العام وتُطبع في كشف مستقل.') : null,
      h('div', { class: 'tbl-wrap' }, h('table', { class: 't gridin' },
        h('thead', {}, h('tr', {}, h('th', { class: 'num' }, '#'), h('th', {}, 'الطالب'),
          comps.map((k) => h('th', { class: 'num' }, `${COMP_LABELS[k]}`, h('div', { class: 'tiny muted' }, `من ${maxes[k]}`))),
          h('th', { class: 'num' }, 'المجموع', h('div', { class: 'tiny muted' }, `من ${subj.max}`)))),
        h('tbody', {}, body))),
      h('div', { class: 'row', style: { marginTop: '10px' } }, filledCount, h('span', { class: 'muted small' }, 'تلميح: Enter أو ↓ للانتقال للطالب التالي، ويمكنك لصق عمود كامل منسوخ من إكسل.'))].filter(Boolean));
    students.forEach((_, i) => recalc(i)); updateCounts();
  };

  const pickers = classSection(st, async (what) => { if (what === 'class') fillSubjects(); await loadGrid(); }, { required: true, classes });
  subjSel.onchange = () => { st.subject_id = subjSel.value; loadGrid(); };
  semSel.onchange = () => { st.semester = semSel.value; loadGrid(); };
  fillSubjects();
  wrap.append(h('div', { class: 'top' }, h('h1', {}, 'رصد الدرجات'), status),
    h('div', { class: 'card' }, h('div', { class: 'toolbar' }, ...pickers, field('المادة', subjSel), field('الفصل', semSel)), gridBox));
  await loadGrid();
  return wrap;
}
