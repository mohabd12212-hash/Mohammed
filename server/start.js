import { app, ensureSuper } from './index.js';
const port = Number(process.env.PORT || 3000);
const s = ensureSuper();
if (s) console.log(`\n=== تم إنشاء حساب المزوّد ===\nالمستخدم: ${s.username}\nكلمة المرور: ${s.password}${s.generated ? '  (احفظها الآن — لن تظهر ثانية)' : ''}\n`);
app.listen(port, () => console.log(`درجات يعمل على http://localhost:${port}`));
