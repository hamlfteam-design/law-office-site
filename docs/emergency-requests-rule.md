# قاعدة Firestore المطلوبة لفورم «عاجل – طوارئ» (emergency.html)

الفورم بيكتب في `emergencyRequests/{id}` (مستوى أعلى في Firestore). القواعد الحالية في ملف `firestore.rules` بمستودع Hamlf بتمنع أي مسار مش مذكور، فالإرسال هيفشل لحد ما القاعدة دي تتضاف. لحد ساعتها الصفحة بتفتح واتساب المكتب برسالة فيها ملخص الطلب.

القاعدة دي إضافة على القواعد الموجودة، وما بتشيلش منها حاجة. تتحط قبل `match /{document=**}`:

```
    // ---------- طلبات الطوارئ من hamlf.com: إنشاء بس من غير تسجيل دخول، والقراءة للمدير ----------
    match /emergencyRequests/{reqId} {
      allow create: if request.resource.data.get("status", "") == "new"
        && request.resource.data.get("source", "") == "hamlf.com"
        && request.resource.data.get("officeId", "") is string
        && request.resource.data.keys().size() <= 40
        && request.resource.data.get("detaineeName", "") is string
        && request.resource.data.get("detaineeName", "").size() > 1
        && request.resource.data.get("phone", "") is string
        && request.resource.data.get("phone", "").size() >= 7;
      allow read, update: if isOwner(resource.data.officeId);
      allow delete: if false;
    }
```

- محدش من غير تسجيل دخول يقدر يقرا أو يعدّل أي طلب. المسموح له إنشاء طلب جديد بس.
- النشر على Firebase بيعمله مدير المكتب بنفسه بعد المراجعة (ملف CLAUDE.md في Hamlf بيمنع Claude يعدّل القواعد).
- رفع صور الهوية وإيصال InstaPay محتاج قواعد Firebase Storage كمان، ولسه ما اتعملش: الفورم دلوقتي بيسجل عدد الملفات المرفقة بس.
