import { h, GET } from '../lib.js';
import { S, isAdmin } from '../store.js';

export async function render() {
  const st = await GET('/api/stats');
  const sections = S.sections.length;
  const subjects = S.subjects.length;
  const noClasses = !S.classes.length;
  const tile = (n, label) => h('div', { class: 'card stat' }, h('b', {}, n), h('span', {}, label));
  return h('div', {},
    h('div', { class: 'top' }, h('h1', {}, `مرحباً، ${S.user.name}`), h('span', { class: 'muted' }, `${S.school.name} — ${S.settings.year || ''}`)),
    noClasses ? h('div', { class: 'banner' }, isAdmin() ? 'لم تُنشأ صفوف بعد. اذهب إلى الإعدادات ← الصفوف والمواد، وطبّق أحد القوالب الجاهزة (السابع … بكالوريا).' : 'لم تُنشأ صفوف بعد. تواصل مع مدير المدرسة.') : null,
    h('div', { class: 'grid g4' }, tile(st.students, 'طالب'), tile(S.classes.length, 'صف'), tile(sections, 'شعبة'), tile(subjects, 'مادة معرّفة')),
    h('div', { class: 'spacer' }),
    h('div', { class: 'card' }, h('h2', {}, 'اكتمال رصد الدرجات حسب الصف'),
      st.classes.length ? h('div', { class: 'tbl-wrap' }, h('table', { class: 't' },
        h('thead', {}, h('tr', {}, h('th', {}, 'الصف'), h('th', { class: 'num' }, 'الطلاب'), h('th', { class: 'num' }, 'المواد'), h('th', {}, 'اكتمال الرصد'), h('th', {}))),
        h('tbody', {}, st.classes.map((c) => h('tr', {},
          h('td', {}, c.name), h('td', { class: 'num' }, c.students), h('td', { class: 'num' }, c.subjects),
          h('td', {}, h('div', { class: 'row' }, h('div', { class: 'bar', style: { width: '160px' } }, h('i', { style: { width: `${c.percent}%` } })), h('span', { class: 'small' }, `${c.percent}%`))),
          h('td', { class: 'act' }, h('a', { class: 'btn sm', href: '#/grades' }, 'رصد'), ' ', h('a', { class: 'btn sm', href: '#/reports' }, 'تقارير')))))))
        : h('div', { class: 'empty' }, 'لا بيانات بعد')),
    S.user.role === 'teacher' ? h('div', { class: 'card' }, h('h2', {}, 'موادي'),
      (S.mySubjects || []).length ? h('div', { class: 'row' }, S.subjects.filter((s) => S.mySubjects.includes(s.id)).map((s) => h('span', { class: 'chip ok' }, `${S.classes.find((c) => c.id === s.class_id)?.name} — ${s.name}`)))
        : h('p', { class: 'muted' }, 'لم تُسنَد إليك مواد بعد. اطلب من مدير المدرسة إسناد موادك.')) : null);
}
