// أدوات الواجهة: بناء DOM آمن، طلبات API، نوافذ، تنبيهات
export function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'value') el.value = v;
    else if (k === 'checked' || k === 'disabled' || k === 'selected' || k === 'readOnly') el[k] = !!v;
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  const add = (c) => {
    if (c === null || c === undefined || c === false) return;
    if (Array.isArray(c)) return c.forEach(add);
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  };
  kids.forEach(add);
  return el;
}
export const $ = (sel, root = document) => root.querySelector(sel);

export async function api(method, url, body) {
  const opt = { method, headers: {} };
  if (body !== undefined) { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body); }
  else if (method !== 'GET') opt.headers['Content-Type'] = 'application/json';
  let res;
  try { res = await fetch(url, opt); } catch { throw new Error('تعذّر الاتصال بالخادم، تحقق من الاتصال بالشبكة'); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && !url.includes('/login') && !url.includes('/me')) { location.hash = '#/login'; location.reload(); }
    const e = new Error(data.error || 'حدث خطأ'); e.status = res.status; throw e;
  }
  return data;
}
export const GET = (u) => api('GET', u);
export const POST = (u, b) => api('POST', u, b ?? {});
export const PUT = (u, b) => api('PUT', u, b ?? {});
export const PATCH = (u, b) => api('PATCH', u, b ?? {});
export const DEL = (u, b) => api('DELETE', u, b ?? {});

export function toast(msg, type = '') {
  const t = h('div', { class: `toast ${type}`, role: 'status' }, msg);
  document.getElementById('toasts').append(t);
  setTimeout(() => t.remove(), type === 'err' ? 6000 : 3000);
}

export function modal({ title, body, actions = [], wide = false, onClose }) {
  return new Promise((resolve) => {
    const close = (v) => { ov.remove(); document.removeEventListener('keydown', esc); onClose?.(); resolve(v); };
    const esc = (e) => { if (e.key === 'Escape') close(null); };
    const foot = h('footer', {}, actions.map((a) => h('button', {
      class: `btn ${a.kind || ''}`, type: 'button',
      onclick: async (e) => {
        if (a.onclick) {
          const btn = e.currentTarget;
          btn.disabled = true;
          try { const r = await a.onclick(); if (r !== false) close(r ?? true); } catch (err) { toast(err.message, 'err'); } finally { btn.disabled = false; }
        } else close(a.value ?? null);
      },
    }, a.label)));
    const ov = h('div', { class: 'overlay', onmousedown: (e) => { if (e.target === ov) close(null); } },
      h('div', { class: `modal${wide ? ' wide' : ''}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
        h('header', {}, h('h2', {}, title), h('button', { class: 'btn ghost sm', type: 'button', 'aria-label': 'إغلاق', onclick: () => close(null) }, '✕')),
        h('div', { class: 'body' }, body), actions.length ? foot : null));
    document.body.append(ov);
    document.addEventListener('keydown', esc);
    ov.querySelector('input,select,textarea')?.focus();
  });
}
export const confirmBox = (msg, label = 'تأكيد', kind = 'danger') =>
  modal({ title: 'تأكيد', body: h('p', {}, msg), actions: [{ label, kind, value: true }, { label: 'إلغاء', value: false }] }).then((v) => v === true);

// عناصر نماذج
export const field = (label, input, hint) => h('label', { class: 'f' }, label, input, hint ? h('span', { class: 'hint' }, hint) : null);
export const text = (v = '', attrs = {}) => h('input', { type: 'text', value: v ?? '', ...attrs });
export const select = (options, value, attrs = {}) => {
  const s = h('select', attrs, options.map((o) => h('option', { value: o.value, selected: String(o.value) === String(value) }, o.label)));
  return s;
};
export const fmt = (n) => (n === null || n === undefined || Number.isNaN(n) ? '' : String(Math.round(n * 100) / 100));

export const ICONS = {
  home: '<path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18.5 14.9c1.8.7 3 2.4 3.4 5.1"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
  print: '<path d="M7 9V3h10v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M7 14h10v7H7z"/>',
  cog: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  school: '<path d="M3 10l9-6 9 6"/><path d="M5 10v9h14v-9"/><path d="M10 19v-5h4v5"/>',
  logout: '<path d="M9 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h4"/><path d="M16 8l4 4-4 4M20 12H9"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  download: '<path d="M12 4v11M7 11l5 5 5-5M5 20h14"/>',
  upload: '<path d="M12 16V5M7 9l5-5 5 5M5 20h14"/>',
};
export const icon = (name) => { const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor'); s.setAttribute('stroke-width', '1.8'); s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round'); s.innerHTML = ICONS[name] || ''; return s; };

export function loadScript(src) {
  return new Promise((res, rej) => {
    if (document.querySelector(`script[src="${src}"]`)) return res();
    const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('تعذّر تحميل المكتبة')); document.head.append(s);
  });
}
export const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

/** تنزيل مصنّف إكسل بدون الاعتماد على writeFile (أسماء عربية آمنة) */
export function downloadXlsx(wb, name) {
  const data = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name; document.body.append(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
