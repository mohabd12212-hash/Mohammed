import { h, GET, POST, PUT, PATCH, DEL, toast, modal, confirmBox, field, text, select, icon, loadScript, downloadXlsx, debounce, fmt } from '../lib.js';
import { S, isAdmin, classOptions, sectionOptions, classById, sectionById } from '../store.js';
import { classSection } from '../pickers.js';

let tab = 'list';
const state = { class_id: '', section_id: '', q: '' };

export async function render() {
  const wrap = h('div', {});
  const draw = () => {
    wrap.replaceChildren(
      h('div', { class: 'top' }, h('h1', {}, 'الطلاب')),
      h('div', { class: 'tabs' },
        h('button', { class: tab === 'list' ? 'on' : '', onclick: () => { tab = 'list'; draw(); } }, 'قائمة الطلاب'),
        isAdmin() ? h('button', { class: tab === 'meta' ? 'on' : '', onclick: () => { tab = 'meta'; draw(); } }, 'الدوام والسلوك') : null),
      h('div', { id: 'tab' }));
    (tab === 'list' ? renderList : renderMeta)(wrap.querySelector('#tab'));
  };
  draw();
  return wrap;
}

const filters = (onChange, needClass = false) => classSection(state, onChange, { required: needClass });

async function renderList(box) {
  const tableBox = h('div', {});
  let students = [];
  const load = async () => {
    const q = new URLSearchParams();
    if (state.class_id) q.set('class_id', state.class_id);
    if (state.section_id) q.set('section_id', state.section_id);
    students = await GET('/api/students?' + q);
    draw();
  };
  const draw = () => {
    const term = state.q.trim();
    const list = term ? students.filter((s) => [s.name, s.father, s.mother, s.registry_no].some((v) => (v || '').includes(term))) : students;
    if (!list.length) { tableBox.replaceChildren(h('div', { class: 'empty' }, h('b', {}, 'لا يوجد طلاب'), isAdmin() ? 'أضف طالباً أو استورد القائمة من ملف إكسل.' : '')); return; }
    tableBox.replaceChildren(h('div', { class: 'tbl-wrap' }, h('table', { class: 't' },
      h('thead', {}, h('tr', {}, ['الرقم', 'الاسم', 'الأب', 'الأم', 'الصف', 'الشعبة', 'السجل العام', ''].map((t) => h('th', {}, t)))),
      h('tbody', {}, list.map((s) => h('tr', {},
        h('td', { class: 'num' }, s.no), h('td', {}, s.name), h('td', {}, s.father), h('td', {}, s.mother),
        h('td', {}, classById(s.class_id)?.name || '—'), h('td', {}, sectionById(s.section_id)?.name || '—'), h('td', {}, s.registry_no),
        h('td', { class: 'act' }, isAdmin() ? [h('button', { class: 'btn sm', onclick: () => edit(s) }, 'تعديل'), ' ',
          h('button', { class: 'btn sm danger', onclick: () => remove(s) }, 'حذف')] : null)))))),
    h('p', { class: 'muted small' }, `${list.length} طالب`));
  };
  const edit = async (s) => {
    const f = { name: text(s?.name), father: text(s?.father), mother: text(s?.mother), birth_place: text(s?.birth_place), birth_year: text(s?.birth_year), registry_no: text(s?.registry_no), no: text(s?.no ?? '') };
    const c = select(classOptions(false), s?.class_id ?? state.class_id);
    const sec = select(sectionOptions(c.value || S.classes[0]?.id), s?.section_id ?? '');
    c.onchange = () => sec.replaceChildren(...sectionOptions(c.value).map((o) => h('option', { value: o.value }, o.label)));
    const body = h('div', { class: 'form' }, field('الاسم الكامل', f.name), field('رقم الطالب (تسلسلي)', f.no, 'اتركه فارغاً للترقيم التلقائي'),
      field('اسم الأب', f.father), field('اسم الأم', f.mother), field('مكان الولادة', f.birth_place), field('سنة الولادة', f.birth_year),
      field('رقم السجل العام', f.registry_no), field('الصف', c), field('الشعبة', sec));
    const ok = await modal({ title: s ? 'تعديل طالب' : 'إضافة طالب', body, wide: true, actions: [{ label: 'حفظ', kind: 'primary', onclick: async () => {
      const payload = Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v.value]));
      Object.assign(payload, { class_id: c.value || null, section_id: sec.value || null });
      if (s) await PUT(`/api/students/${s.id}`, payload); else await POST('/api/students', payload);
    } }, { label: 'إلغاء' }] });
    if (ok) { toast('تم الحفظ', 'ok'); load(); }
  };
  const remove = async (s) => { if (await confirmBox(`حذف الطالب «${s.name}» وجميع درجاته؟ لا يمكن التراجع.`, 'حذف')) { await DEL(`/api/students/${s.id}`); toast('تم الحذف', 'ok'); load(); } };
  const search = h('input', { type: 'search', placeholder: 'بحث بالاسم أو السجل…', value: state.q });
  search.oninput = debounce(() => { state.q = search.value; draw(); }, 150);
  box.replaceChildren(
    h('div', { class: 'toolbar' }, ...filters(load), field('بحث', search), h('span', { class: 'grow' }),
      isAdmin() ? [h('button', { class: 'btn primary', onclick: () => edit(null) }, icon('plus'), 'إضافة طالب'),
        h('button', { class: 'btn', onclick: () => importModal(load) }, icon('upload'), 'استيراد من إكسل')] : null,
      h('button', { class: 'btn', onclick: () => exportXlsx(students) }, icon('download'), 'تصدير إلى إكسل')),
    tableBox);
  await load();
}

const HEAD = {
  name: ['الاسم', 'اسم الطالب', 'الاسم الكامل', 'الطالب', 'name'], father: ['الأب', 'الاب', 'اسم الأب', 'اسم الاب', 'father'], mother: ['الأم', 'الام', 'اسم الأم', 'اسم الام', 'mother'],
  birth_place: ['مكان الولادة', 'مكان الميلاد'], birth_year: ['سنة الولادة', 'سنة الميلاد', 'المواليد'], registry_no: ['رقم السجل العام', 'رقم السجل', 'السجل العام', 'السجل'],
  class: ['الصف', 'class'], section: ['الشعبة', 'section'],
};
const norm = (s) => String(s ?? '').replace(/[ً-ٟـ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/\s+/g, ' ').trim();

async function importModal(reload) {
  await loadScript('/vendor/xlsx.js');
  let rows = [];
  const info = h('div', { class: 'muted small' }, 'اختر ملف إكسل (.xlsx / .xls / .csv). يجب أن يحوي الصف الأول عناوين الأعمدة: الاسم، الأب، الأم، مكان الولادة، سنة الولادة، رقم السجل العام، الصف، الشعبة (يكفي عمود الاسم).');
  const preview = h('div', {});
  const file = h('input', { type: 'file', accept: '.xlsx,.xls,.csv' });
  const defCls = select([{ value: '', label: '— حسب عمود «الصف» في الملف —' }, ...classOptions()], '');
  const defSec = h('input', { type: 'text', placeholder: 'اسم الشعبة (اختياري)' });
  file.onchange = async () => {
    const f = file.files[0]; if (!f) return;
    const wb = XLSX.read(await f.arrayBuffer(), { type: 'array' });
    const data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
    const map = {};
    if (data.length) for (const key of Object.keys(data[0])) for (const [field_, names] of Object.entries(HEAD)) if (names.map(norm).includes(norm(key))) map[field_] = key;
    if (!map.name) { rows = []; preview.replaceChildren(h('div', { class: 'banner bad' }, 'لم أجد عمود «الاسم» في الصف الأول من الملف.')); return; }
    rows = data.map((r) => Object.fromEntries(Object.entries(map).map(([k, col]) => [k, String(r[col]).trim()]))).filter((r) => r.name);
    preview.replaceChildren(h('p', {}, `تم العثور على ${rows.length} طالب. أعمدة معروفة: ${Object.keys(map).length}.`),
      h('div', { class: 'tbl-wrap' }, h('table', { class: 't' }, h('thead', {}, h('tr', {}, ['الاسم', 'الأب', 'الأم', 'الصف', 'الشعبة'].map((x) => h('th', {}, x)))),
        h('tbody', {}, rows.slice(0, 6).map((r) => h('tr', {}, [r.name, r.father, r.mother, r.class, r.section].map((v) => h('td', {}, v ?? ''))))))));
  };
  const dl = () => {
    const ws = XLSX.utils.aoa_to_sheet([['الاسم', 'الأب', 'الأم', 'مكان الولادة', 'سنة الولادة', 'رقم السجل العام', 'الصف', 'الشعبة'], ['اسم الطالب مثال', 'اسم الأب', 'اسم الأم', 'دمشق', '2012', '100', S.classes[0]?.name || 'السابع', 'الأولى']]);
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'الطلاب'); downloadXlsx(wb, 'قالب-استيراد-الطلاب.xlsx');
  };
  const ok = await modal({ title: 'استيراد الطلاب من إكسل', wide: true,
    body: h('div', { class: 'grid' }, info, h('div', {}, h('button', { class: 'btn sm', onclick: dl }, icon('download'), 'تنزيل قالب جاهز')), field('الملف', file),
      h('div', { class: 'form' }, field('صف افتراضي (إن لم يوجد عمود الصف)', defCls), field('شعبة افتراضية', defSec)), preview),
    actions: [{ label: 'استيراد', kind: 'primary', onclick: async () => {
      if (!rows.length) throw new Error('اختر ملفاً صالحاً أولاً');
      const payload = rows.map((r) => ({ ...r, class_id: !r.class && defCls.value ? Number(defCls.value) : undefined, section: r.section || (defCls.value ? defSec.value : '') }));
      const res = await POST('/api/students/import', { rows: payload });
      toast(`تمت إضافة ${res.added} طالب${res.skipped ? ` — تخطّي ${res.skipped}` : ''}`, 'ok');
      if (res.errors.length) alert(res.errors.join('\n'));
    } }, { label: 'إلغاء' }] });
  if (ok) reload();
}

async function exportXlsx(list) {
  await loadScript('/vendor/xlsx.js');
  const rows = list.map((s) => ({ 'الرقم': s.no, 'الاسم': s.name, 'الأب': s.father, 'الأم': s.mother, 'مكان الولادة': s.birth_place, 'سنة الولادة': s.birth_year, 'رقم السجل العام': s.registry_no, 'الصف': classById(s.class_id)?.name || '', 'الشعبة': sectionById(s.section_id)?.name || '' }));
  const wb = XLSX.utils.book_new(); const ws = XLSX.utils.json_to_sheet(rows); ws['!rtl'] = true;
  XLSX.utils.book_append_sheet(wb, ws, 'الطلاب'); downloadXlsx(wb, 'الطلاب.xlsx');
}

// ---- الدوام والسلوك ----
async function renderMeta(box) {
  const gridBox = h('div', {});
  const status = h('span', { class: 'status' }, '');
  let students = []; const dirty = new Map();
  const set = (t, cls) => { status.className = `status ${cls}`; status.textContent = t; };
  const flush = async () => {
    if (!dirty.size) return;
    const items = [...dirty.values()]; dirty.clear(); set('جارٍ الحفظ…', 'saving');
    try { await PATCH('/api/students/meta', { items }); set('تم الحفظ ✓', 'ok'); } catch (e) { set(e.message, 'err'); items.forEach((it) => dirty.set(it.id, { ...it, ...(dirty.get(it.id) || {}) })); }
  };
  const flushSoon = debounce(flush, 700);
  const load = async () => {
    if (!state.section_id) { gridBox.replaceChildren(h('div', { class: 'empty' }, 'اختر الصف والشعبة لإدخال الدوام والسلوك')); return; }
    students = await GET(`/api/students?section_id=${state.section_id}`);
    const bm = S.settings.behavior_max;
    const cols = [['att1', `دوام ف1 (من ${S.settings.days1})`, S.settings.days1], ['exc1', 'غياب مبرر ف1', S.settings.days1], ['beh1', `سلوك ف1 (من ${bm})`, bm],
      ['att2', `دوام ف2 (من ${S.settings.days2})`, S.settings.days2], ['exc2', 'غياب مبرر ف2', S.settings.days2], ['beh2', `سلوك ف2 (من ${bm})`, bm]];
    gridBox.replaceChildren(h('div', { class: 'tbl-wrap' }, h('table', { class: 't gridin' },
      h('thead', {}, h('tr', {}, h('th', {}, 'الطالب'), cols.map((c) => h('th', { class: 'num' }, c[1])))),
      h('tbody', {}, students.map((s) => h('tr', {}, h('td', {}, s.name), cols.map(([k, , max]) => {
        const inp = h('input', { type: 'text', inputmode: 'decimal', value: s[k] ?? '', 'aria-label': `${k} ${s.name}` });
        inp.oninput = () => {
          const v = inp.value.trim().replace(',', '.');
          const bad = v !== '' && (isNaN(Number(v)) || Number(v) < 0 || Number(v) > max);
          inp.classList.toggle('bad', bad); if (bad) return;
          const cur = dirty.get(s.id) || { id: s.id }; cur[k] = v === '' ? null : Number(v); dirty.set(s.id, cur); set('تعديلات غير محفوظة…', 'saving'); flushSoon();
        };
        return h('td', { class: 'num' }, inp);
      })))))));
  };
  box.replaceChildren(h('div', { class: 'toolbar' }, ...filters(load, true), h('span', { class: 'grow' }), status),
    h('p', { class: 'muted small' }, 'تُحفظ التعديلات تلقائياً. غياب الطالب = أيام الدوام الرسمية − أيام حضوره.'), gridBox);
  await load();
}
