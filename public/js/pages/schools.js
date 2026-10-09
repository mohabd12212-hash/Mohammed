import { h, GET, POST, PATCH, DEL, toast, modal, confirmBox, field, text, icon } from '../lib.js';

export async function render() {
  const wrap = h('div', {});
  const draw = async () => {
    const [schools, me] = await Promise.all([GET('/api/admin/schools'), GET('/api/me')]);
    const today = new Date().toISOString().slice(0, 10);
    const stat = (s) => (!s.active ? ['موقوفة', 'bad'] : s.expires_at && s.expires_at < today ? ['منتهية', 'bad'] : s.expires_at && s.expires_at < new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10) ? ['تنتهي قريباً', 'warn'] : ['فعّالة', 'ok']);
    const create = async () => {
      const f = { name: text(''), admin_name: text('مدير المدرسة'), admin_username: text('', { dir: 'ltr', style: { textAlign: 'right' }, placeholder: 'مثال: alnoor' }), admin_password: text(Math.random().toString(36).slice(2, 10), { dir: 'ltr', style: { textAlign: 'right' } }), months: h('input', { type: 'number', min: 0, value: 12 }) };
      const tpl = me.templates.map((t) => h('label', { class: 'row small' }, h('input', { type: 'checkbox', value: t.key, checked: true }), t.name));
      const ok = await modal({ title: 'مدرسة جديدة', wide: true, body: h('div', { class: 'grid' },
        h('div', { class: 'form' }, field('اسم المدرسة', f.name), field('اسم مدير المدرسة', f.admin_name), field('اسم المستخدم للمدير', f.admin_username), field('كلمة المرور المؤقتة', f.admin_password, 'سلّمها للمدرسة ليغيّرها بعد أول دخول'), field('مدة الاشتراك (أشهر)', f.months, '0 = بلا انتهاء')),
        h('div', {}, h('b', { class: 'small' }, 'الصفوف التي تُنشأ تلقائياً من القوالب'), h('div', { class: 'row', style: { marginTop: '6px' } }, tpl))),
      actions: [{ label: 'إنشاء المدرسة', kind: 'primary', onclick: async () => {
        await POST('/api/admin/schools', { name: f.name.value, admin_name: f.admin_name.value, admin_username: f.admin_username.value, admin_password: f.admin_password.value, months: Number(f.months.value), templates: tpl.map((t) => t.querySelector('input')).filter((i) => i.checked).map((i) => i.value) });
      } }, { label: 'إلغاء' }] });
      if (ok) { toast(`تم إنشاء المدرسة. بيانات الدخول: ${f.admin_username.value} / ${f.admin_password.value}`, 'ok'); draw(); }
    };
    const act = (label, fn, kind = '') => h('button', { class: `btn sm ${kind}`, onclick: async () => { try { await fn(); draw(); } catch (e) { toast(e.message, 'err'); } } }, label);
    wrap.replaceChildren(
      h('div', { class: 'top' }, h('h1', {}, 'المدارس والاشتراكات'), h('button', { class: 'btn primary', onclick: create }, icon('plus'), 'مدرسة جديدة')),
      h('div', { class: 'grid g4', style: { marginBottom: '16px' } },
        h('div', { class: 'card stat' }, h('b', {}, schools.length), h('span', {}, 'مدرسة')),
        h('div', { class: 'card stat' }, h('b', {}, schools.filter((s) => stat(s)[1] === 'ok').length), h('span', {}, 'اشتراك فعّال')),
        h('div', { class: 'card stat' }, h('b', {}, schools.filter((s) => stat(s)[1] !== 'ok').length), h('span', {}, 'تحتاج متابعة')),
        h('div', { class: 'card stat' }, h('b', {}, schools.reduce((a, s) => a + s.students, 0)), h('span', {}, 'طالب إجمالاً'))),
      schools.length ? h('div', { class: 'tbl-wrap' }, h('table', { class: 't' }, h('thead', {}, h('tr', {}, ['المدرسة', 'مدير المدرسة (دخول)', 'الطلاب', 'المستخدمون', 'ينتهي في', 'الحالة', ''].map((t) => h('th', {}, t)))),
        h('tbody', {}, schools.map((s) => { const [lbl, cls] = stat(s); return h('tr', {}, h('td', {}, s.name), h('td', { dir: 'ltr', style: { textAlign: 'right' } }, s.admin_username), h('td', { class: 'num' }, s.students), h('td', { class: 'num' }, s.users),
          h('td', {}, s.expires_at || 'مفتوح'), h('td', {}, h('span', { class: `chip ${cls}` }, lbl)),
          h('td', { class: 'act' }, act('+6 أشهر', () => PATCH(`/api/admin/schools/${s.id}`, { extend_months: 6 })), ' ', act('+12 شهر', () => PATCH(`/api/admin/schools/${s.id}`, { extend_months: 12 })), ' ',
            act(s.active ? 'إيقاف' : 'تفعيل', () => PATCH(`/api/admin/schools/${s.id}`, { active: !s.active })), ' ',
            h('button', { class: 'btn sm', onclick: async () => { const p = text(Math.random().toString(36).slice(2, 10), { dir: 'ltr' }); if (await modal({ title: `كلمة مرور جديدة — ${s.name}`, body: field('كلمة المرور', p), actions: [{ label: 'تعيين', kind: 'primary', onclick: () => POST(`/api/admin/schools/${s.id}/reset-password`, { password: p.value }) }, { label: 'إلغاء' }] })) toast(`كلمة المرور الجديدة: ${p.value}`, 'ok'); } }, 'كلمة المرور'), ' ',
            act('حذف', async () => { if (!(await confirmBox(`حذف مدرسة «${s.name}» نهائياً مع كل بياناتها؟`, 'حذف نهائي'))) throw new Error('أُلغي'); await DEL(`/api/admin/schools/${s.id}`, { confirm: 'DELETE' }); }, 'danger'))); })))) : h('div', { class: 'empty' }, h('b', {}, 'لا توجد مدارس بعد'), 'أنشئ أول مدرسة وسلّم مديرها بيانات الدخول.'));
  };
  await draw();
  return wrap;
}
