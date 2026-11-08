/* =============================================================================
   المحادثات — طبقة Firebase (Auth + Firestore)

   ⚠️ يعمل فقط بعد ملء apk-build/assets/assets/firebase-config.js بمفاتيح
      مشروع Firebase حقيقي (راجع التعليق أعلى ذلك الملف). طالما فاضٍ، كل
      دوال هذا الملف ترجع أخطاء واضحة بدل ما تكسر الصفحة.

   لا علاقة لهذا الملف بـ team.js أو localStorage الحالي لبيانات المكتب —
   طبقة اتصال مستقلة تماماً، فقط تقرأ Team.data.users للمطابقة بالإيميل/الرقم.
   ============================================================================= */
(function (w) {
  "use strict";

  var CLIENTS_KEY = "proflawyer.clientcontacts.v1";   // دفتر جهات اتصال الموكلين (محلي)
  var LINK_KEY     = "proflawyer.chatlink.v1";          // ربط هذا الجهاز بحساب Firebase

  var app = null, auth = null, db = null;
  var presenceTimer = null;

  function ready() { return !!(w.FIREBASE_READY && w.firebase); }

  function ensureInit() {
    if (!ready()) return false;
    if (app) return true;
    app  = w.firebase.initializeApp(w.FIREBASE_CONFIG);
    auth = w.firebase.auth();
    db   = w.firebase.firestore();
    return true;
  }

  /* --------------------------------------------------------- جهات اتصال الموكلين */

  function loadClients() {
    try { return JSON.parse(localStorage.getItem(CLIENTS_KEY)) || []; }
    catch (e) { return []; }
  }
  function saveClients(list) {
    try { localStorage.setItem(CLIENTS_KEY, JSON.stringify(list)); return true; }
    catch (e) { return false; }
  }
  function addClientContact(name, email, phone) {
    var list = loadClients();
    list.push({ id: "c" + Date.now(), name: name, email: email || "", phone: phone || "" });
    saveClients(list);
    return list;
  }
  function removeClientContact(id) {
    saveClients(loadClients().filter(function (x) { return x.id !== id; }));
  }

  /* -------------------------------------------------------------- الربط المحلي */

  /** يبحث عن إيميل/رقم في فريق المكتب ثم في دفتر جهات اتصال الموكلين. */
  function findLocalMatch(emailOrPhone) {
    var v = (emailOrPhone || "").trim().toLowerCase();
    var digits = v.replace(/[^0-9]/g, "");
    if (!v) return null;

    if (w.Team && w.Team.data && w.Team.data.users) {
      var u = w.Team.data.users.filter(function (x) {
        return (x.email && x.email.toLowerCase() === v) ||
               (digits && x.phone && x.phone.replace(/[^0-9]/g, "") === digits);
      })[0];
      if (u) return { type: "team", id: u.id, name: u.name, role: u.role };
    }

    var c = loadClients().filter(function (x) {
      return (x.email && x.email.toLowerCase() === v) ||
             (digits && x.phone && x.phone.replace(/[^0-9]/g, "") === digits);
    })[0];
    if (c) return { type: "client", id: c.id, name: c.name, role: "موكل" };

    return null;
  }

  function saveLink(uid, match) {
    var rec = { uid: uid, localType: match.type, localId: match.id,
                name: match.name, role: match.role, at: new Date().toISOString() };
    try { localStorage.setItem(LINK_KEY, JSON.stringify(rec)); } catch (e) {}
    return rec;
  }

  function myLink() {
    try { return JSON.parse(localStorage.getItem(LINK_KEY)) || null; }
    catch (e) { return null; }
  }

  function clearLink() {
    try { localStorage.removeItem(LINK_KEY); } catch (e) {}
  }

  /* ------------------------------------------------------------------- Auth */

  function signIn(email, password) {
    if (!ensureInit()) return Promise.reject(new Error("NOT_CONFIGURED"));
    return auth.signInWithEmailAndPassword(email, password)
      .catch(function (err) {
        if (err.code === "auth/user-not-found") {
          return auth.createUserWithEmailAndPassword(email, password);
        }
        throw err;
      })
      .then(function (cred) {
        var match = findLocalMatch(email);
        if (!match) throw new Error("NO_LOCAL_MATCH");
        var link = saveLink(cred.user.uid, match);
        return db.collection("users").doc(cred.user.uid).set({
          name: link.name, email: email, role: link.role,
          lastSeen: w.firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true }).then(function () { return link; });
      });
  }

  function signOut() {
    clearLink();
    if (auth) return auth.signOut();
    return Promise.resolve();
  }

  /* -------------------------------------------------------------- المحادثات */

  function threadId(uidA, uidB) {
    return [uidA, uidB].sort().join("_");
  }

  function ensureThread(myUid, otherUid, otherName) {
    var id = threadId(myUid, otherUid);
    return db.collection("threads").doc(id).set({
      participantUids: [myUid, otherUid],
      participantNames: {},
      updatedAt: w.firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true }).then(function () { return id; });
  }

  function listenMyThreads(myUid, cb) {
    if (!ensureInit()) { cb([]); return function () {}; }
    return db.collection("threads")
      .where("participantUids", "array-contains", myUid)
      .orderBy("updatedAt", "desc")
      .onSnapshot(function (snap) {
        var out = [];
        snap.forEach(function (doc) { out.push(Object.assign({ id: doc.id }, doc.data())); });
        cb(out);
      });
  }

  function listenMessages(tid, cb) {
    if (!ensureInit()) { cb([]); return function () {}; }
    return db.collection("threads").doc(tid).collection("messages")
      .orderBy("sentAt", "asc")
      .onSnapshot(function (snap) {
        var out = [];
        snap.forEach(function (doc) { out.push(Object.assign({ id: doc.id }, doc.data())); });
        cb(out);
      });
  }

  function sendMessage(tid, myUid, text) {
    if (!text || !text.trim()) return Promise.resolve();
    var batch = db.batch();
    var msgRef = db.collection("threads").doc(tid).collection("messages").doc();
    batch.set(msgRef, {
      senderUid: myUid, text: text.trim(),
      sentAt: w.firebase.firestore.FieldValue.serverTimestamp()
    });
    batch.set(db.collection("threads").doc(tid), {
      lastMessage: text.trim(),
      updatedAt: w.firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    return batch.commit();
  }

  /* ------------------------------------------------------------------ Presence */

  function startPresence(myUid) {
    if (!ensureInit() || presenceTimer) return;
    function touch() {
      db.collection("users").doc(myUid).set({
        lastSeen: w.firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true }).catch(function () {});
    }
    touch();
    presenceTimer = setInterval(touch, 45000);
  }
  function stopPresence() {
    if (presenceTimer) { clearInterval(presenceTimer); presenceTimer = null; }
  }
  function isOnline(lastSeen) {
    if (!lastSeen || !lastSeen.toMillis) return false;
    return (Date.now() - lastSeen.toMillis()) < 120000;
  }

  w.Chat = {
    ready: ready, ensureInit: ensureInit,
    loadClients: loadClients, addClientContact: addClientContact,
    removeClientContact: removeClientContact,
    findLocalMatch: findLocalMatch, myLink: myLink, clearLink: clearLink,
    signIn: signIn, signOut: signOut,
    threadId: threadId, ensureThread: ensureThread,
    listenMyThreads: listenMyThreads, listenMessages: listenMessages,
    sendMessage: sendMessage, startPresence: startPresence, stopPresence: stopPresence,
    isOnline: isOnline,
    auth: function () { ensureInit(); return auth; }
  };

})(window);
