import { GET } from './lib.js';
export const S = { user: null, school: null, settings: null, classes: [], sections: [], subjects: [], mySubjects: null, teachers: {}, templates: [] };
export async function loadBoot() {
  const b = await GET('/api/bootstrap');
  Object.assign(S, b);
}
export const isAdmin = () => S.user?.role === 'admin';
export const sectionsOf = (cid) => S.sections.filter((s) => s.class_id === Number(cid));
export const subjectsOf = (cid) => S.subjects.filter((s) => s.class_id === Number(cid));
export const classById = (id) => S.classes.find((c) => c.id === Number(id));
export const sectionById = (id) => S.sections.find((s) => s.id === Number(id));
export const canEnter = (subjectId) => isAdmin() || (S.mySubjects || []).includes(subjectId);
export const classOptions = (all = false) => [...(all ? [{ value: '', label: 'كل الصفوف' }] : []), ...S.classes.map((c) => ({ value: c.id, label: c.name }))];
export const sectionOptions = (cid, all = false) => [...(all ? [{ value: '', label: 'كل الشعب' }] : []), ...sectionsOf(cid).map((s) => ({ value: s.id, label: s.name }))];
