import { h, GET, POST, PUT, DEL, toast, modal, confirmBox, field, text, select, icon } from '../lib.js';
import { S, loadBoot, subjectsOf, sectionsOf } from '../store.js';
import { COMPS, COMP_LABELS, compMaxes, subjectComps } from '/shared/calc.js';

let tab = 'school';
let selClass = null;

export async function render() {
  const wrap = h('div', {});
  const body = h('div', {});
  const tabs = [['school', 'بيانات المدرسة والقواعد'], ['classes', 'الصفوف والمواد'], ['comments', 'ملاحظات الإدارة'], ['users', 'المستخدمون'], ['backup', 'النسخ الاحتياطي']];
  const draw = async () => {
    wrap.replaceChildren(h('div', { class: 'top' }, h('h1', {}, 'الإعدادات')),
      h('div', { class: 'tabs' }, tabs.map(([k, l]) => h('button', { class: tab === k ? 'on' : '', onclick: () => { tab = k; draw(); } }, l))), body);
    body.replaceChildren(h('div', { class: 'empty' }, '…'));
    body.replaceChildren(await ({ school: schoolTab, classes: classesTab, comments: commentsTab, users: usersTab, backup: backupTab })[tab](draw));
  };
  await draw();
  return wrap;
}

async function saveSettings(patch) {
  await PUT('/api/settings', patch);
  await loadBoot();
  toast('تم حفظ الإعدادات', 'ok');
}

// ---------------- بيانات المدرسة ----------------
function schoolTab() {
  const s = S.settings;
  const f = {
    school_name: text(S.school.name), ministry: text(s.ministry), directorate: text(s.directorate), stage_line: text(s.stage_line), year: text(s.year, { placeholder: '2025 - 2026' }),
    principal: text(s.principal), principal_title: text(s.principal_title),
    days1: h('input', { type: 'number', min: 0, value: s.days1 }), days2: h('input', { type: 'number', min: 0, value: s.days2 }),
    pass_percent: h('input', { type: 'number', min: 0, max: 100, value: s.pass_percent }), behavior_max: h('input', { type: 'number', min: 0, value: s.behavior_max }),
  };
  let logo = s.logo || '';
  const logoImg = h('img', { style: { display: logo ? '' : 'none' }, src: logo, alt: '' });
  const encode = (img) => {
    // PNG أولاً (يحفظ الشفافية)، وإن كان كبيراً نصغّر أو نحوّل إلى JPEG
    for (const max of [300, 220, 160]) {
      const k = Math.min(1, max / Math.max(img.width, img.height)); const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(img.width * k)); c.height = Math.max(1, Math.round(img.height * k));
      const g = c.getContext('2d'); g.drawImage(img, 0, 0, c.width, c.height);
      let d = c.toDataURL('image/png'); if (d.length <= 300000) return d;
      g.globalCompositeOperation = 'destination-over'; g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
      d = c.toDataURL('image/jpeg', 0.85); if (d.length <= 300000) return d;
    }
    return null;
  };
  const logoFile = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp', onchange: () => {
    const file = logoFile.files[0]; if (!file) return;
    const img = new Image(); const url = URL.createObjectURL(file);
    img.onload = async () => {
      URL.revokeObjectURL(url);
      const d = encode(img); if (!d) return toast('الصورة كبيرة جداً، جرّب صورة أصغر', 'err');
      try { await saveSettings({ logo: d }); logo = d; logoImg.src = d; logoImg.style.display = ''; } catch (e) { toast(e.message, 'err'); }
    };
    img.onerror = () => toast('تعذّر قراءة الصورة', 'err'); img.src = url;
  } });
  const logoPos = select([{ value: 'right', label: 'يمين' }, { value: 'center', label: 'وسط' }, { value: 'left', label: 'يسار' }], s.logo_pos || 'center');
  logoPos.onchange = async () => { try { await saveSettings({ logo_pos: logoPos.value }); } catch (e) { toast(e.message, 'err'); } };
  const logoRemove = h('button', { class: 'btn', type: 'button', onclick: async () => { try { await saveSettings({ logo: '' }); logo = ''; logoImg.style.display = 'none'; logoFile.value = ''; } catch (e) { toast(e.message, 'err'); } } }, 'إزالة الشعار');
  const w = Object.fromEntries(COMPS.map((k) => [k, h('input', { type: 'number', step: '0.05', min: 0, max: 1, value: s.weights[k] })]));
  const sumHint = h('span', { class: 'chip' });
  const upd = () => { const t = COMPS.reduce((a, k) => a + Number(w[k].value || 0), 0); sumHint.textContent = `المجموع: ${Math.round(t * 100) / 100}`; sumHint.className = `chip ${Math.abs(t - 1) < 0.001 ? 'ok' : 'warn'}`; };
  COMPS.forEach((k) => w[k].addEventListener('input', upd)); upd();
  return h('div', {},
    h('div', { class: 'card' }, h('h2', {}, 'بيانات الترويسة (تظهر في كل التقارير)'),
      h('div', { class: 'form' }, field('اسم المدرسة', f.school_name), field('الوزارة', f.ministry), field('المديرية', f.directorate), field('سطر المرحلة', f.stage_line, 'مثال: مرحلة التعليم الأساسي - الحلقة الثانية'),
        field('العام الدراسي', f.year), field('اسم المدير/ة', f.principal), field('صفة الموقّع', f.principal_title)),
      h('h3', { style: { margin: '14px 0 8px' } }, 'شعار المدرسة'), h('div', { class: 'logo-box' }, logoImg, logoFile, logoRemove, field('مكان الشعار في الترويسة', logoPos)), h('div', { class: 'muted small', style: { marginTop: '4px' } }, 'يظهر في ترويسة الجلاءات والبيانات. يُفضّل صورة مربعة بخلفية شفافة (PNG).')),
    h('div', { class: 'card' }, h('h2', {}, 'قواعد الحساب'),
      h('div', { class: 'form' }, field('عدد أيام الدوام — الفصل الأول', f.days1), field('عدد أيام الدوام — الفصل الثاني', f.days2),
        field('نسبة النجاح %', f.pass_percent, 'النجاح عندما تبلغ النسبة المئوية للمجموع العام هذا الحد'), field('الدرجة العظمى للسلوك (لكل فصل)', f.behavior_max)),
      h('h3', { style: { margin: '16px 0 8px' } }, 'توزيع درجة المادة على المكوّنات'),
      h('div', { class: 'form' }, COMPS.map((k) => field(COMP_LABELS[k], w[k]))), h('div', { class: 'row', style: { marginTop: '8px' } }, sumHint, h('span', { class: 'muted small' }, 'الافتراضي (كما في الملف الأصلي): شفوي 0.1، وظائف 0.1، نشاط 0.2، مذاكرة 0.2، امتحان 0.4. الدرجة النهائية للمادة = متوسط الفصلين مقرّباً للأعلى.'))),
    h('button', { class: 'btn primary', style: { marginTop: '14px' }, onclick: async () => {
      const t = COMPS.reduce((a, k) => a + Number(w[k].value || 0), 0);
      if (Math.abs(t - 1) > 0.001 && !(await confirmBox('مجموع الأوزان لا يساوي 1، فلن يساوي مجموع المكوّنات الدرجة العظمى. هل تتابع؟', 'متابعة', 'primary'))) return;
      try { await saveSettings({ ...Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v.value])), logo, logo_pos: logoPos.value, weights: Object.fromEntries(COMPS.map((k) => [k, Number(w[k].value)])) }); } catch (e) { toast(e.message, 'err'); }
    } }, 'حفظ الإعدادات'));
}

// ---------------- الصفوف والمواد ----------------
function classesTab(redraw) {
  if (!S.classes.find((c) => c.id === selClass)) selClass = S.classes[0]?.id ?? null;
  const reload = async () => { await loadBoot(); redraw(); };
  const addClass = async () => {
    const n = text(''), nx = text('');
    const ok = await modal({ title: 'صف جديد', body: h('div', { class: 'grid' }, field('اسم الصف', n), field('الصف التالي عند النجاح', nx)), actions: [{ label: 'إضافة', kind: 'primary', onclick: async () => { const r = await POST('/api/classes', { name: n.value, next_class: nx.value }); selClass = r.id; } }, { label: 'إلغاء' }] });
    if (ok) reload();
  };
  const applyTpl = async () => {
    const boxes = S.templates.map((t) => h('label', { class: 'row small' }, h('input', { type: 'checkbox', value: t.key }), t.name));
    const ok = await modal({ title: 'تطبيق قوالب جاهزة', body: h('div', { class: 'grid' }, h('p', { class: 'muted small' }, 'تنشئ الصف وشعبتين ومواده بدرجاتها العظمى المستخرجة من ملف الإكسل الأصلي، وكلها قابلة للتعديل بعد ذلك.'), boxes),
      actions: [{ label: 'تطبيق', kind: 'primary', onclick: async () => { const keys = boxes.map((b) => b.querySelector('input')).filter((i) => i.checked).map((i) => i.value); if (!keys.length) throw new Error('اختر قالباً واحداً على الأقل'); await POST('/api/templates/apply', { keys }); } }, { label: 'إلغاء' }] });
    if (ok) reload();
  };
  const left = h('div', { class: 'card' }, h('h2', {}, 'الصفوف'),
    h('div', { class: 'grid', style: { gap: '6px' } }, S.classes.map((c) => h('button', { class: `btn ${c.id === selClass ? 'primary' : ''}`, style: { justifyContent: 'space-between' }, onclick: () => { selClass = c.id; redraw(); } }, c.name, h('span', { class: 'tiny' }, `${subjectsOf(c.id).length} مادة`)))),
    h('div', { class: 'row', style: { marginTop: '12px' } }, h('button', { class: 'btn', onclick: addClass }, icon('plus'), 'صف'), h('button', { class: 'btn', onclick: applyTpl }, 'قوالب جاهزة')));
  const cls = S.classes.find((c) => c.id === selClass);
  if (!cls) return h('div', { class: 'grid', style: { gridTemplateColumns: '260px 1fr' } }, left, h('div', { class: 'card empty' }, h('b', {}, 'ابدأ بتطبيق قالب جاهز'), 'اضغط «قوالب جاهزة» لإنشاء الصفوف والمواد بسرعة.'));

  const renameClass = async () => {
    const n = text(cls.name), nx = text(cls.next_class);
    const ok = await modal({ title: 'تعديل الصف', body: h('div', { class: 'grid' }, field('اسم الصف', n), field('الصف التالي عند النجاح', nx, 'يظهر في الجلاء: نجاح إلى الصف …')), actions: [{ label: 'حفظ', kind: 'primary', onclick: () => PUT(`/api/classes/${cls.id}`, { name: n.value, next_class: nx.value }) }, { label: 'إلغاء' }] });
    if (ok) reload();
  };
  const delClass = async () => { if (await confirmBox(`حذف الصف «${cls.name}» مع شعبه ومواده ودرجات طلابه؟`, 'حذف')) { await DEL(`/api/classes/${cls.id}`); selClass = null; reload(); } };
  const secBox = h('div', { class: 'row' }, sectionsOf(cls.id).map((s) => h('span', { class: 'chip' }, s.name, ' ',
    h('a', { href: '#', onclick: async (e) => { e.preventDefault(); const n = text(s.name); const ok = await modal({ title: 'اسم الشعبة', body: n, actions: [{ label: 'حفظ', kind: 'primary', onclick: () => PUT(`/api/sections/${s.id}`, { name: n.value }) }, { label: 'إلغاء' }] }); if (ok) reload(); } }, '✎'), ' ',
    h('a', { href: '#', onclick: async (e) => { e.preventDefault(); if (await confirmBox(`حذف الشعبة «${s.name}»؟ سيبقى طلابها بلا شعبة.`, 'حذف')) { await DEL(`/api/sections/${s.id}`); reload(); } } }, '✕'))),
  h('button', { class: 'btn sm', onclick: async () => { const n = text(''); const ok = await modal({ title: 'شعبة جديدة', body: n, actions: [{ label: 'إضافة', kind: 'primary', onclick: () => POST('/api/sections', { class_id: cls.id, name: n.value }) }, { label: 'إلغاء' }] }); if (ok) reload(); } }, icon('plus'), 'شعبة'));

  const subs = subjectsOf(cls.id);
  const move = async (i, d) => { const a = subs[i], b = subs[i + d]; if (!b) return; await PUT(`/api/subjects/${a.id}`, { ...a, sort: b.sort }); await PUT(`/api/subjects/${b.id}`, { ...b, sort: a.sort }); reload(); };
  const tbl = h('div', { class: 'tbl-wrap' }, h('table', { class: 't' },
    h('thead', {}, h('tr', {}, ['#', 'المادة', 'المجموعة في الجلاء', 'الدرجة العظمى', 'المكوّنات', 'خصائص', ''].map((t) => h('th', {}, t)))),
    h('tbody', {}, subs.map((s, i) => h('tr', {}, h('td', { class: 'num' }, i + 1), h('td', {}, s.name), h('td', {}, s.group_name || '—'), h('td', { class: 'num' }, s.max),
      h('td', { class: 'small' }, subjectComps(s).map((k) => `${COMP_LABELS[k]} ${compMaxes(s, S.settings)[k]}`).join(' • ')),
      h('td', {}, s.fixed ? h('span', { class: 'chip warn' }, 'درجة كاملة تلقائياً') : null, ' ', s.in_total === 0 ? h('span', { class: 'chip' }, 'خارج المجموع') : null),
      h('td', { class: 'act' }, h('button', { class: 'btn sm ghost', title: 'أعلى', onclick: () => move(i, -1) }, '↑'), h('button', { class: 'btn sm ghost', title: 'أسفل', onclick: () => move(i, 1) }, '↓'), ' ',
        h('button', { class: 'btn sm', onclick: () => subjectModal(cls, s, reload) }, 'تعديل'), ' ', h('button', { class: 'btn sm danger', onclick: async () => { if (await confirmBox(`حذف مادة «${s.name}» ودرجاتها؟`, 'حذف')) { await DEL(`/api/subjects/${s.id}`); reload(); } } }, 'حذف')))))));
  const right = h('div', {}, h('div', { class: 'card' }, h('div', { class: 'row' }, h('h2', { style: { margin: 0 } }, cls.name), h('span', { class: 'muted small' }, cls.next_class ? `← ${cls.next_class}` : ''), h('span', { class: 'grow' }),
    h('button', { class: 'btn sm', onclick: renameClass }, 'تعديل الصف'), h('button', { class: 'btn sm danger', onclick: delClass }, 'حذف الصف')),
  h('h3', { style: { margin: '14px 0 8px' } }, 'الشعب'), secBox),
  h('div', { class: 'card' }, h('div', { class: 'row', style: { marginBottom: '10px' } }, h('h2', { style: { margin: 0 } }, 'المواد'), h('span', { class: 'grow' }), h('button', { class: 'btn primary sm', onclick: () => subjectModal(cls, null, reload) }, icon('plus'), 'مادة')), subs.length ? tbl : h('div', { class: 'empty' }, 'لا مواد بعد'),
    h('p', { class: 'muted small' }, 'المواد التي تشترك في «المجموعة» نفسها (مثل المواد الاجتماعية) تُجمع في سطر واحد في الجلاء، ويُقرَّب متوسطها مرة واحدة كما في الملف الأصلي.')));
  return h('div', { class: 'grid', style: { gridTemplateColumns: 'minmax(220px,260px) 1fr', alignItems: 'start' } }, left, right);
}

async function subjectModal(cls, s, reload) {
  const f = { name: text(s?.name), group_name: text(s?.group_name, { placeholder: 'اختياري، مثل: المواد الاجتماعية' }), max: h('input', { type: 'number', min: 1, value: s?.max ?? 200 }) };
  const comps = Object.fromEntries(COMPS.map((k) => [k, h('input', { type: 'checkbox', checked: s ? subjectComps(s).includes(k) : true })]));
  const fixed = h('input', { type: 'checkbox', checked: !!s?.fixed }), inTotal = h('input', { type: 'checkbox', checked: s ? s.in_total !== 0 : true });
  const ok = await modal({ title: s ? 'تعديل مادة' : 'مادة جديدة', wide: true,
    body: h('div', { class: 'grid' }, h('div', { class: 'form' }, field('اسم المادة', f.name), field('الدرجة العظمى (لكل فصل)', f.max), field('مجموعة الجلاء', f.group_name)),
      h('div', {}, h('b', { class: 'small' }, 'المكوّنات المفعّلة'), h('div', { class: 'row', style: { marginTop: '6px' } }, COMPS.map((k) => h('label', { class: 'row small' }, comps[k], COMP_LABELS[k])))),
      h('label', { class: 'row small' }, fixed, 'تُحتسب بدرجة كاملة تلقائياً (مثل الفنية والرياضية والمشروع في الملف الأصلي)'),
      h('label', { class: 'row small' }, inTotal, 'تدخل في المجموع العام (أزل التحديد للإثرائي)')),
    actions: [{ label: 'حفظ', kind: 'primary', onclick: async () => {
      const payload = { name: f.name.value, group_name: f.group_name.value, max: Number(f.max.value), comps: COMPS.filter((k) => comps[k].checked), fixed: fixed.checked, in_total: inTotal.checked ? 1 : 0, weights: s?.weights || null, class_id: cls.id };
      if (!payload.comps.length) throw new Error('فعّل مكوّناً واحداً على الأقل');
      if (s) await PUT(`/api/subjects/${s.id}`, payload); else await POST('/api/subjects', payload);
    } }, { label: 'إلغاء' }] });
  if (ok) reload();
}

// ---------------- ملاحظات الإدارة ----------------
function commentsTab() {
  const rows = S.settings.comments.map((c) => ({ ...c }));
  const box = h('div', { class: 'grid' });
  const draw = () => box.replaceChildren(...rows.map((r, i) => {
    const m = h('input', { type: 'number', min: 0, max: 100, value: r.min, style: { width: '90px' } }), t = h('textarea', {}, r.text);
    m.oninput = () => { r.min = Number(m.value); }; t.oninput = () => { r.text = t.value; };
    return h('div', { class: 'row', style: { alignItems: 'flex-start' } }, field('من نسبة %', m), h('div', { class: 'grow' }, field('نص الملاحظة', t)), h('button', { class: 'btn sm danger', style: { marginTop: '22px' }, onclick: () => { rows.splice(i, 1); draw(); } }, 'حذف'));
  }));
  draw();
  return h('div', { class: 'card' }, h('h2', {}, 'ملاحظات إدارة المدرسة على الجلاء'), h('p', { class: 'muted small' }, 'تُختار الملاحظة حسب النسبة المئوية للمجموع النهائي: أعلى عتبة تحققها نسبة الطالب (للناجحين).'), box,
    h('div', { class: 'row', style: { marginTop: '12px' } }, h('button', { class: 'btn', onclick: () => { rows.push({ min: 0, text: '' }); draw(); } }, icon('plus'), 'إضافة عتبة'),
      h('button', { class: 'btn primary', onclick: async () => { try { await saveSettings({ comments: rows }); } catch (e) { toast(e.message, 'err'); } } }, 'حفظ')));
}

// ---------------- المستخدمون ----------------
async function usersTab(redraw) {
  const users = await GET('/api/users');
  const edit = async (u) => {
    const f = { name: text(u?.name), username: text(u?.username, { dir: 'ltr', disabled: !!u, style: { textAlign: 'right' } }), password: h('input', { type: 'password', autocomplete: 'new-password' }) };
    const role = select([{ value: 'teacher', label: 'معلّم (يرصد مواده فقط)' }, { value: 'admin', label: 'مدير (صلاحيات كاملة)' }], u?.role || 'teacher');
    const active = h('input', { type: 'checkbox', checked: u ? !!u.active : true });
    const picked = new Set(u?.subjects || []);
    const subjBox = h('div', { class: 'grid', style: { gap: '10px' } }, S.classes.map((c) => h('div', {}, h('b', { class: 'small' }, c.name),
      h('div', { class: 'row' }, subjectsOf(c.id).map((s) => h('label', { class: 'row small' }, h('input', { type: 'checkbox', checked: picked.has(s.id), onchange: (e) => (e.target.checked ? picked.add(s.id) : picked.delete(s.id)) }), s.name))))));
    const sync = () => { subjWrap.style.display = role.value === 'teacher' ? '' : 'none'; };
    const subjWrap = h('div', { class: 'full' }, h('h3', { style: { margin: '6px 0' } }, 'المواد المسموح له برصدها'), subjBox);
    role.onchange = sync; sync();
    const ok = await modal({ title: u ? 'تعديل مستخدم' : 'مستخدم جديد', wide: true,
      body: h('div', { class: 'form' }, field('الاسم', f.name), field('اسم المستخدم (إنكليزي)', f.username), field(u ? 'كلمة مرور جديدة (اختياري)' : 'كلمة المرور', f.password), field('الدور', role),
        h('label', { class: 'row small' }, active, 'الحساب فعّال'), subjWrap),
      actions: [{ label: 'حفظ', kind: 'primary', onclick: async () => {
        if (u) await PUT(`/api/users/${u.id}`, { name: f.name.value, role: role.value, active: active.checked, password: f.password.value || undefined, subjects: [...picked] });
        else { const r = await POST('/api/users', { name: f.name.value, username: f.username.value, password: f.password.value, role: role.value }); if (role.value === 'teacher') await PUT(`/api/users/${r.id}`, { name: f.name.value, role: 'teacher', active: true, subjects: [...picked] }); }
      } }, { label: 'إلغاء' }] });
    if (ok) { toast('تم الحفظ', 'ok'); redraw(); }
  };
  return h('div', { class: 'card' }, h('div', { class: 'row', style: { marginBottom: '10px' } }, h('h2', { style: { margin: 0 } }, 'المستخدمون'), h('span', { class: 'grow' }), h('button', { class: 'btn primary', onclick: () => edit(null) }, icon('plus'), 'مستخدم جديد')),
    h('div', { class: 'tbl-wrap' }, h('table', { class: 't' }, h('thead', {}, h('tr', {}, ['الاسم', 'اسم المستخدم', 'الدور', 'عدد المواد', 'الحالة', ''].map((t) => h('th', {}, t)))),
      h('tbody', {}, users.map((u) => h('tr', {}, h('td', {}, u.name), h('td', { dir: 'ltr', style: { textAlign: 'right' } }, u.username), h('td', {}, u.role === 'admin' ? 'مدير' : 'معلّم'), h('td', { class: 'num' }, u.role === 'admin' ? 'الكل' : u.subjects.length),
        h('td', {}, h('span', { class: `chip ${u.active ? 'ok' : 'bad'}` }, u.active ? 'فعّال' : 'موقوف')),
        h('td', { class: 'act' }, h('button', { class: 'btn sm', onclick: () => edit(u) }, 'تعديل'), ' ', u.username !== S.user.username ? h('button', { class: 'btn sm danger', onclick: async () => { if (await confirmBox(`حذف المستخدم «${u.name}»؟`, 'حذف')) { await DEL(`/api/users/${u.id}`); redraw(); } } }, 'حذف') : null)))))));
}

// ---------------- النسخ الاحتياطي ----------------
function backupTab() {
  return h('div', { class: 'card' }, h('h2', {}, 'النسخ الاحتياطي'),
    h('p', {}, 'نزّل نسخة كاملة من بيانات مدرستك (الصفوف، المواد، الطلاب، الدرجات) بصيغة JSON واحتفظ بها في مكان آمن بشكل دوري، خصوصاً قبل نهاية العام الدراسي.'),
    h('a', { class: 'btn primary', href: '/api/backup', download: '' }, icon('download'), 'تنزيل نسخة احتياطية'));
}
