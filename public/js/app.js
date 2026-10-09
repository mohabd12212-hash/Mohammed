import { h, $, GET, POST, icon, toast, modal, field, text, loadScript } from './lib.js';
import { S, loadBoot, isAdmin } from './store.js';

const root = document.getElementById('app');
const routes = {
  '/dashboard': () => import('./pages/dashboard.js'),
  '/students': () => import('./pages/students.js'),
  '/grades': () => import('./pages/grades.js'),
  '/reports': () => import('./pages/reports.js'),
  '/settings': () => import('./pages/settings.js'),
  '/schools': () => import('./pages/schools.js'),
};
const NAV = {
  admin: [['/dashboard', 'الرئيسية', 'home'], ['/students', 'الطلاب', 'users'], ['/grades', 'رصد الدرجات', 'edit'], ['/reports', 'التقارير والطباعة', 'print'], ['/settings', 'الإعدادات', 'cog']],
  teacher: [['/dashboard', 'الرئيسية', 'home'], ['/grades', 'رصد الدرجات', 'edit'], ['/reports', 'التقارير والطباعة', 'print']],
  super: [['/schools', 'المدارس والاشتراكات', 'school']],
};

async function boot() {
  const { user } = await GET('/api/me');
  if (!user) return await renderLogin();
  S.user = user;
  if (user.role !== 'super') await loadBoot();
  renderShell();
}

async function renderLogin() {
  const u = text('', { autocomplete: 'username', dir: 'ltr', style: { textAlign: 'right' }, required: true });
  const p = h('input', { type: 'password', autocomplete: 'current-password', dir: 'ltr', style: { textAlign: 'right' }, required: true });
  const err = h('div', { class: 'chip bad', style: { display: 'none', marginBottom: '10px' } });
  const form = h('form', { onsubmit: async (e) => {
    e.preventDefault(); err.style.display = 'none';
    const btn = form.querySelector('button'); btn.disabled = true;
    try { await POST('/api/login', { username: u.value, password: p.value }); location.hash = ''; await boot(); }
    catch (ex) { err.textContent = ex.message; err.style.display = 'inline-block'; btn.disabled = false; }
  } },
  err, h('div', { class: 'grid' }, field('اسم المستخدم', u), field('كلمة المرور', p),
    h('button', { class: 'btn primary', style: { justifyContent: 'center', padding: '11px' } }, 'تسجيل الدخول')));

  // جلب اسم المدرسة وشعارها
  let schoolName = 'درجات';
  let logoEl = null;
  try {
    const info = await GET('/api/school-info');
    if (info.name) schoolName = info.name;
    if (info.logo) {
      logoEl = h('img', {
        src: info.logo, alt: 'شعار المدرسة',
        style: { display: 'block', margin: '0 auto 10px', maxHeight: '90px', maxWidth: '120px', objectFit: 'contain' }
      });
    }
  } catch (_) { /* تجاهل الخطأ */ }

  const brandEl = logoEl
    ? h('div', { class: 'login-brand' }, logoEl, h('div', { class: 'login-school-name' }, schoolName))
    : h('div', { class: 'brand', style: { justifyContent: 'center' } }, h('i', {}, '✓'), schoolName);

  root.replaceChildren(h('div', { class: 'login' }, h('div', { class: 'card' },
    brandEl,
    h('p', { style: { textAlign: 'center', color: 'var(--muted)', margin: '0 0 20px' } }, 'نظام إدارة علامات المدارس'),
    form)));
  u.focus();
}

function renderShell() {
  const nav = NAV[S.user.role];
  const main = h('main', { class: 'main', id: 'main' });
  const links = nav.map(([path, label, ic]) => h('a', { href: `#${path}`, 'data-path': path }, icon(ic), label));
  const side = h('aside', { class: 'side' },
    h('div', { class: 'brand' }, h('i', {}, '✓'), 'درجات'),
    h('nav', { class: 'nav' }, links),
    h('div', { class: 'user' }, h('b', {}, S.user.name), h('span', { class: 'tiny' }, S.school?.name || 'لوحة المزوّد'),
      h('div', { class: 'row', style: { marginTop: '8px' } },
        h('button', { class: 'btn sm', onclick: changePassword }, 'كلمة المرور'),
        h('button', { class: 'btn sm', onclick: async () => { await POST('/api/logout'); location.hash = ''; location.reload(); } }, icon('logout'), 'خروج'))));
  root.replaceChildren(h('div', { class: 'shell' }, side, main));
  window.onhashchange = route;
  route();
}

async function route() {
  const main = $('#main'); if (!main) return;
  let path = location.hash.replace('#', '') || '/dashboard';
  const allowed = NAV[S.user.role].map((n) => n[0]);
  if (!allowed.includes(path)) path = allowed[0];
  document.querySelectorAll('.nav a').forEach((a) => a.classList.toggle('on', a.dataset.path === path));
  main.replaceChildren(h('div', { class: 'empty' }, 'جارٍ التحميل…'));
  try {
    const mod = await routes[path]();
    const view = await mod.render();
    const banners = [];
    if (S.school?.expired) banners.push(h('div', { class: 'banner bad' }, `انتهى اشتراك المدرسة بتاريخ ${S.school.expires_at} — النظام بوضع القراءة والطباعة فقط. للتجديد تواصل مع مزوّد الخدمة.`));
    else if (S.school?.expires_at) {
      const days = Math.ceil((new Date(S.school.expires_at) - new Date()) / 864e5);
      if (days <= 30) banners.push(h('div', { class: 'banner' }, `ينتهي الاشتراك خلال ${days} يوماً (${S.school.expires_at}).`));
    }
    main.replaceChildren(...banners, view);
    window.scrollTo(0, 0);
  } catch (e) {
    console.error(e);
    main.replaceChildren(h('div', { class: 'banner bad' }, 'تعذّر تحميل الصفحة: ' + e.message));
  }
}

function changePassword() {
  const o = h('input', { type: 'password' }), n = h('input', { type: 'password' });
  modal({ title: 'تغيير كلمة المرور', body: h('div', { class: 'grid' }, field('كلمة المرور الحالية', o), field('كلمة المرور الجديدة', n, '6 محارف على الأقل')),
    actions: [{ label: 'حفظ', kind: 'primary', onclick: async () => { await POST('/api/password', { old_password: o.value, new_password: n.value }); toast('تم تغيير كلمة المرور', 'ok'); } }, { label: 'إلغاء' }] });
}

boot().catch((e) => { root.replaceChildren(h('div', { class: 'banner bad' }, e.message)); });
