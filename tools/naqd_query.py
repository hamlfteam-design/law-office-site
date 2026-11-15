#!/usr/bin/env python3
"""بحث في قاعدة أحكام النقض الخاصة بالمكتب (naqd-search.sqlite).
القاعدة نفسها مش في الريبو (283MB) — بتتحمّل في الجلسة من جهاز الإدارة أو من المرفقات.
الاستخدام:
  python3 -I tools/naqd_query.py DB.sqlite --appeal 3183 --year 60
  python3 -I tools/naqd_query.py DB.sqlite --text "تسليم المبيع" --text "الانتفاع" [--chamber مدني] [--limit 10]
"""
import argparse, sqlite3
a = argparse.ArgumentParser()
a.add_argument('db'); a.add_argument('--appeal'); a.add_argument('--year')
a.add_argument('--text', action='append', default=[]); a.add_argument('--chamber'); a.add_argument('--limit', type=int, default=10)
o = a.parse_args()
c = sqlite3.connect(f'file:{o.db}?mode=ro', uri=True)
w, p = [], []
if o.appeal: w.append('appeal_no=?'); p.append(o.appeal)
if o.year: w.append('year=?'); p.append(o.year)
if o.chamber: w.append('chamber LIKE ?'); p.append(f'%{o.chamber}%')
for t in o.text: w.append('rule LIKE ?'); p.append(f'%{t}%')
q = 'SELECT DISTINCT chamber, appeal_no, year, date, maktab_fanni, page, rule FROM rules'
if w: q += ' WHERE ' + ' AND '.join(w)
q += ' ORDER BY date DESC LIMIT ?'; p.append(o.limit)
for ch, no, y, d, mf, pg, r in c.execute(q, p):
    ref = f'الطعن رقم {no} لسنة {y} ق — جلسة {d}' + (f' — مكتب فني {mf} ص {pg}' if mf else '')
    print(f'■ {ref} ({ch})\n{(r or "").strip()}\n')
