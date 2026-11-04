/*
 * روابط الدفع الثابتة لغير المصريين — المصدر الوحيد لروابط OPay وأسعارها.
 * العميل بياخد دايماً الرابط القصير (hamlf.com/pay/<الخدمة>/) — مش رابط OPay.
 *
 * لما سعر يتغير:
 *   1) اعمل ShareLink جديد على OPay بالسعر الجديد (روابط OPay ماتتعدلش).
 *   2) غيّر هنا: url + usd + egp (egp = المبلغ بالجنيه اللي OPay حسبه للرابط، من صفحة الرابط في اللوحة).
 *   3) غيّر السعر المكتوب في booking.html و en/booking.html (data-usd-pay و data-usd-price).
 * كل الرسايل اللي اتبعتت قبل كده بالرابط القصير هتفضل شغالة وتوصّل للسعر الجديد.
 *
 * url: null  ← لسه مفيش رابط خاص؛ صفحة الدفع بتستخدم الرابط العام (الكمية = المبلغ بالدولار).
 */
window.HB_PAY = {
  office:    { usd: 150, egp: 8417.85,  ar: 'استشارة بالمكتب',                 en: 'Office consultation',
               url: 'https://cashier.opaycheckout.com/shareableLink?vid=6eea23cc42324ae4afcf9beb61de88dc&vidToken=8cb5918064457787a77d912daceb33ff1ae80b71c8e72ab182882a2995ced8c0' },
  felony:    { usd: 500, egp: 27707.30, ar: 'جناية — فحص مستندي ورأي',          en: 'Felony case — document review & legal opinion',
               url: 'https://cashier.opaycheckout.com/shareableLink?vid=26e7b5f7ee9d4e59b5d01e60953ace68&vidToken=68b4fe7739e9937ab154b39265334da3a55ea7373d620023c4495c7ab00253e0' },
  cassation: { usd: 500, egp: 27707.30, ar: 'نقض — فحص مستندي ورأي مكتوب',      en: 'Cassation appeal — document review & written opinion',
               url: 'https://cashier.opaycheckout.com/shareableLink?vid=f1962d2ed2d44a25afa1595de23c9f35&vidToken=aa78ae626b79465d5dd6a2eb975342921fb301c8e37720a3487b510cd10f2134' },
  urgent:    { usd: 500, egp: 28059.50, ar: 'جناية — استشارة عاجلة',             en: 'Criminal case (felony) — urgent consultation',
               url: 'https://cashier.opaycheckout.com/shareableLink?vid=5c2e8db08b6c44e19c2029ab1e603a3e&vidToken=1a5a740e0aa2fb7ee9ad4528db6e822c06d66fabc3545cbfb9ae053101d6b067' },
  written:   { usd: 300, egp: 16835.70, ar: 'رد مكتوب في قضية مدنية + بحث مستندي', en: 'Written consultation (civil case) with document research',
               url: 'https://cashier.opaycheckout.com/shareableLink?vid=8c52c8a58c1b4670a341732b508313c6&vidToken=4150fea8f61e4b5ae524b6c65e3d6062f8965f27ba17dfdbb683287fa06035df' },
  video15:   { usd: 60,  egp: 3367.14,  ar: 'فيديو كونفرانس — 15 دقيقة',          en: 'Video consultation — 15 minutes',
               url: 'https://cashier.opaycheckout.com/shareableLink?vid=a729488ea79c433882397d5357d16993&vidToken=fe2837b8a455eda466da410faeba5910119230d217cf37a22d0dcbb1590d887d' },
  video30:   { usd: 180, egp: 10101.42,  ar: 'فيديو كونفرانس — 30 دقيقة',          en: 'Video consultation — 30 minutes',
               url: 'https://cashier.opaycheckout.com/shareableLink?vid=babe300e1e694246bf2560c6119d3b60&vidToken=2ed73c5d3d9a9a9ef9a6ac00fa0204b850a6b3b1754b062739d614114bbff493' },
  general:   { usd: null, egp: null,    ar: 'أتعاب متفق عليها',                   en: 'Agreed legal fees',
               url: 'https://cashier.opaycheckout.com/shareableLink?vid=a354a96b4e9f459288821a5d82c55938&vidToken=5483d578f0a35375dc8d71a35c5b762c570fb602d5b0c36800a8ba6a21fd89bd' }
};
/* سعر الصرف التقريبي اللي OPay استخدمه وقت عمل الروابط (جنيه لكل دولار) — للعرض بس لما egp مش موجود */
window.HB_PAY_RATE = 56.12;
