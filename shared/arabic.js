// تفقيط الأرقام بالعربية (بديل دالة NoToTxt في الإكسل) — يعمل في المتصفح والخادم
const ONES_F = ['', 'واحدة', 'اثنتان', 'ثلاث', 'أربع', 'خمس', 'ست', 'سبع', 'ثمان', 'تسع'];
const ONES_M = ['', 'واحد', 'اثنان', 'ثلاثة', 'أربعة', 'خمسة', 'ستة', 'سبعة', 'ثمانية', 'تسعة'];
const TENS = ['', 'عشرة', 'عشرون', 'ثلاثون', 'أربعون', 'خمسون', 'ستون', 'سبعون', 'ثمانون', 'تسعون'];
const HUND = ['', 'مئة', 'مئتان', 'ثلاثمئة', 'أربعمئة', 'خمسمئة', 'ستمئة', 'سبعمئة', 'ثمانمئة', 'تسعمئة'];
const TEENS_F = ['عشرة', 'إحدى عشرة', 'اثنتا عشرة', 'ثلاث عشرة', 'أربع عشرة', 'خمس عشرة', 'ست عشرة', 'سبع عشرة', 'ثماني عشرة', 'تسع عشرة'];
const TEENS_M = ['عشرة', 'أحد عشر', 'اثنا عشر', 'ثلاثة عشر', 'أربعة عشر', 'خمسة عشر', 'ستة عشر', 'سبعة عشر', 'ثمانية عشر', 'تسعة عشر'];

function below1000(n, masc) {
  const ones = masc ? ONES_M : ONES_F;
  const teens = masc ? TEENS_M : TEENS_F;
  const h = Math.floor(n / 100);
  const r = n % 100;
  const parts = [];
  if (h) parts.push(HUND[h]);
  if (r) {
    if (r < 10) parts.push(ones[r]);
    else if (r < 20) parts.push(teens[r - 10]);
    else {
      const t = Math.floor(r / 10), o = r % 10;
      parts.push(o ? `${ones[o]} و${TENS[t]}` : TENS[t]);
    }
  }
  return parts.join(' و');
}

function intToWords(n) {
  if (n === 0) return 'صفر';
  const parts = [];
  const millions = Math.floor(n / 1e6);
  const thousands = Math.floor((n % 1e6) / 1000);
  const rest = n % 1000;
  if (millions) {
    parts.push(millions === 1 ? 'مليون' : millions === 2 ? 'مليونان'
      : millions <= 10 ? `${below1000(millions, true)} ملايين` : `${below1000(millions, true)} مليوناً`);
  }
  if (thousands) {
    parts.push(thousands === 1 ? 'ألف' : thousands === 2 ? 'ألفان'
      : thousands <= 10 ? `${below1000(thousands, true)} آلاف` : `${below1000(thousands, true)} ألف`);
  }
  if (rest) parts.push(below1000(rest, false));
  return parts.join(' و');
}

/** تحويل رقم إلى كلمات عربية؛ يدعم الكسور (النصف فقط بالكلمات، والباقي أرقاماً) */
export function numToWords(value) {
  if (value === null || value === undefined || value === '' || Number.isNaN(Number(value))) return '';
  let v = Math.abs(Number(value));
  v = Math.round(v * 100) / 100;
  if (v > 999999999) return String(v);
  const whole = Math.floor(v);
  const frac = Math.round((v - whole) * 100);
  let text = intToWords(whole);
  if (frac) {
    if (frac === 50) text = whole ? `${text} ونصف` : 'نصف';
    else text = `${text} و${frac} من مئة`;
  }
  return (Number(value) < 0 ? 'سالب ' : '') + text;
}
