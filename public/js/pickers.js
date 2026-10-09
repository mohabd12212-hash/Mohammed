import { h, field, select } from './lib.js';
import { S, sectionsOf } from './store.js';

/** منتقي الصف/الشعبة مرتبط بكائن حالة st = {class_id, section_id}. required: بلا خيار «الكل» */
export function classSection(st, onChange, { required = false, classes = S.classes } = {}) {
  const cls = classes;
  if (required) {
    if (!cls.find((c) => String(c.id) === String(st.class_id))) st.class_id = cls[0] ? String(cls[0].id) : '';
    const secs = sectionsOf(st.class_id);
    if (!secs.find((s) => String(s.id) === String(st.section_id))) st.section_id = secs[0] ? String(secs[0].id) : '';
  }
  const c = select([...(required ? [] : [{ value: '', label: 'كل الصفوف' }]), ...cls.map((x) => ({ value: x.id, label: x.name }))], st.class_id);
  const secOpts = () => [...(required ? [] : [{ value: '', label: 'كل الشعب' }]), ...sectionsOf(st.class_id).map((x) => ({ value: x.id, label: x.name }))];
  const s = select(secOpts(), st.section_id);
  c.onchange = () => {
    st.class_id = c.value;
    st.section_id = required ? String(sectionsOf(c.value)[0]?.id ?? '') : '';
    s.replaceChildren(...secOpts().map((o) => h('option', { value: o.value, selected: String(o.value) === st.section_id }, o.label)));
    onChange('class');
  };
  s.onchange = () => { st.section_id = s.value; onChange('section'); };
  return [field('الصف', c), field('الشعبة', s)];
}
