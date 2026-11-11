import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signInAnonymously, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { getFirestore, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, collection, query, where, onSnapshot, serverTimestamp, writeBatch } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

/* ============ Firebase ============ */
const firebaseConfig = {
  apiKey: "AIzaSyD2R84zOkQ3N4vAfmXt8J9ie5_Y_HHW87k",
  authDomain: "tanya-aja-8864c.firebaseapp.com",
  projectId: "tanya-aja-8864c",
  storageBucket: "tanya-aja-8864c.firebasestorage.app",
  messagingSenderId: "889939225012",
  appId: "1:889939225012:web:1fef362fef58cc9a166ae1"
};
// Who may host. This list only drives the UI — the real check lives in the Firestore security rules.
const HOSTS = ["saefulbakhri60@gmail.com"];

const fbApp = initializeApp(firebaseConfig);
const auth = getAuth(fbApp);
const db = getFirestore(fbApp);
const authReady = new Promise(res => { const un = onAuthStateChanged(auth, u => { un(); res(u); }); });
const isHostUser = u => !!u && !u.isAnonymous && u.emailVerified && HOSTS.includes((u.email || "").toLowerCase());
const roomRef = code => doc(db, "rooms", code);
const qCol = code => collection(db, "rooms", code, "questions");
const vCol = code => collection(db, "rooms", code, "votes");
async function loginGoogle(){
  try { await signInWithPopup(auth, new GoogleAuthProvider()); location.reload(); }
  catch (e) { if (e && e.code !== "auth/popup-closed-by-user" && e.code !== "auth/cancelled-popup-request") toast("Gagal login: " + (e.code || e.message), true); }
}
async function logout(){ try { await signOut(auth); } catch (e) {} location.href = location.pathname; }
const fbErr = e => { console.error(e); toast("⚠️ " + (e && e.code === "permission-denied" ? "Akses ditolak" : (e && (e.code || e.message)) || "Gagal"), true); };

/* ============ utils ============ */
const $ = s => document.querySelector(s);
const params = new URLSearchParams(location.search);
const store = {
  get(k, d){ try{ const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); }catch(e){ return d; } },
  set(k, v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){} }
};
const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const randCode = n => Array.from({length:n}, () => CODE_CHARS[Math.floor(Math.random()*CODE_CHARS.length)]).join("");
const hash = s => { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
const COLORS = ["#C6FF3D","#FF5FA2","#B79CFF","#5CE1E6","#FFB443","#FFE94A","#FF8A65","#7CFFB2"];
const ANIMALS = [["🦫","Kapibara"],["🐸","Kodok"],["🦊","Rubah"],["🐼","Panda"],["🐙","Gurita"],["🦄","Unicorn"],["👽","Alien"],["🐧","Pinguin"],["🦖","Dino"],["🐱","Kucing"],["🦉","Burung Hantu"],["🐨","Koala"]];
function persona(q){
  const h = hash(q.id);
  if (q.anon || !q.name.trim()) { const a = ANIMALS[(h >>> 7) % ANIMALS.length]; return {av: a[0], name: "Anon " + a[1], anon: true}; }
  return {av: q.name.trim()[0].toUpperCase(), name: q.name.trim(), anon: false};
}
const voteCount = (votes, id) => votes.has(id) ? votes.get(id).size : 0;
const timeAgo = ts => { const s = Math.max(0, (Date.now() - ts) / 1000); if (s < 45) return "baru aja"; if (s < 3600) return Math.round(s/60) + " mnt lalu"; return Math.round(s/3600) + " jam lalu"; };
const cleanCode = s => (s || "").toUpperCase().replace(/[^A-Z0-9-]/g, "").replace(/^-+|-+$/g, "").slice(0, 12);
function show(id){ document.querySelectorAll(".view").forEach(v => v.classList.toggle("on", v.id === id)); }
let toastT;
function toast(msg, err){ const t = $("#toast"); t.textContent = msg; t.classList.toggle("err", !!err); t.classList.add("on"); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("on"), 3200); }
function parseDoc(d){
  const x = d.data() || {};
  return { id: d.id, text: String(x.text || "").slice(0, 280), name: String(x.name || "").slice(0, 40), anon: !!x.anon,
           ts: Number(x.ts) || Date.now(), status: x.status || "antre", votes: Number(x.votes) || 0, at: Number(x.at) || 0 };
}
function votesFromSnap(s){
  const m = new Map();
  s.forEach(d => { const v = d.data(); if (!v || !v.q) return; if (!m.has(v.q)) m.set(v.q, new Set()); m.get(v.q).add(v.uid); });
  return m;
}
// Shows a warning only while the device is offline.
function netWatch(el){
  const upd = () => { el.innerHTML = navigator.onLine ? "" : '<div class="conn-warn">⚠️ Internet terputus — menunggu tersambung lagi…</div>'; };
  addEventListener("online", upd); addEventListener("offline", upd); upd();
}

/* ============ rekap (shared by host + admin) ============ */
const STATUS_LABEL = {antre:"⏳ Antre", tampil:"🎤 Tampil", dijawab:"✅ Dijawab", dihapus:"🗑 Dihapus"};
function rekapRows(active, hist, votes, liveId){
  const rows = [];
  active.forEach(q => rows.push({q, status: q.id === liveId ? "tampil" : "antre", votes: voteCount(votes, q.id), at: null}));
  hist.forEach(h => { if (!active.has(h.id)) rows.push({q: h, status: h.status === "dihapus" ? "dihapus" : "dijawab", votes: h.votes || 0, at: h.at}); });
  return rows.sort((a, b) => a.q.ts - b.q.ts);
}
const fmtTime = ts => { try { return new Date(ts).toLocaleTimeString("id-ID", {hour:"2-digit", minute:"2-digit"}); } catch (e) { return ""; } };
const realName = q => q.anon || !q.name.trim() ? "Anonim" : q.name.trim();
function renderRekap(el, rows){
  el.innerHTML = "";
  const c = {antre:0, tampil:0, dijawab:0, dihapus:0}; rows.forEach(r => c[r.status]++);
  const sum = document.createElement("div"); sum.className = "rk-sum";
  sum.innerHTML = `<span>Total ${rows.length}</span><span class="pill dijawab">✅ Dijawab ${c.dijawab}</span><span class="pill antre">⏳ Antre ${c.antre + c.tampil}</span><span class="pill dihapus">🗑 Dihapus ${c.dihapus}</span>`;
  el.append(sum);
  if (!rows.length) { const e = document.createElement("div"); e.className = "rk-empty"; e.textContent = "Belum ada pertanyaan masuk."; el.append(e); return; }
  const t = document.createElement("table"); t.className = "rk";
  t.innerHTML = "<thead><tr><th>#</th><th>Jam</th><th>Nama</th><th>Pertanyaan</th><th>🔥</th><th>Status</th></tr></thead>";
  const tb = document.createElement("tbody");
  rows.forEach((r, i) => {
    const tr = document.createElement("tr");
    [String(i + 1), fmtTime(r.q.ts), realName(r.q)].forEach(v => { const td = document.createElement("td"); td.className = "n"; td.textContent = v; tr.append(td); });
    const tq = document.createElement("td"); tq.className = "q"; tq.textContent = r.q.text; tr.append(tq);
    const tv = document.createElement("td"); tv.className = "n"; tv.textContent = r.votes; tr.append(tv);
    const ts = document.createElement("td"); ts.innerHTML = `<span class="pill ${r.status}">${STATUS_LABEL[r.status]}</span>`; tr.append(ts);
    tb.append(tr);
  });
  t.append(tb); el.append(t);
}
function rekapCSV(rows){
  const esc = v => '"' + String(v).replace(/"/g, '""') + '"';
  const lines = [["No","Tanggal","Jam","Nama","Pertanyaan","Vote","Status"].join(",")];
  rows.forEach((r, i) => lines.push([i + 1, new Date(r.q.ts).toLocaleDateString("id-ID"), fmtTime(r.q.ts), realName(r.q), r.q.text, r.votes, STATUS_LABEL[r.status].replace(/^\S+ /, "")].map(esc).join(",")));
  return "﻿" + lines.join("\r\n");
}
function rekapText(rows, room){
  return `Rekap Q&A — Ruang ${room}\n` + rows.map((r, i) => `${i + 1}. [${fmtTime(r.q.ts)}] ${realName(r.q)}: ${r.q.text}  (🔥${r.votes}, ${STATUS_LABEL[r.status].replace(/^\S+ /, "")})`).join("\n");
}
function downloadFile(name, content, type){
  try {
    const url = URL.createObjectURL(new Blob([content], {type}));
    const a = document.createElement("a"); a.href = url; a.download = name; document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  } catch (e) { toast("Gagal download, coba Salin teks", true); }
}
async function copyText(txt){
  try { await navigator.clipboard.writeText(txt); toast("Tersalin ✅"); }
  catch (e) { toast("Gagal menyalin otomatis", true); }
}

/* ============ sound ============ */
let actx = null, soundOn = store.get("qna-sound", true);
function popSound(){
  if (!soundOn) return;
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    const t = actx.currentTime, len = 0.5;
    const buf = actx.createBuffer(1, actx.sampleRate * len, actx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3);
    const n = actx.createBufferSource(); n.buffer = buf;
    const f = actx.createBiquadFilter(); f.type = "lowpass"; f.frequency.setValueAtTime(3000, t); f.frequency.exponentialRampToValueAtTime(200, t + len);
    const g = actx.createGain(); g.gain.setValueAtTime(0.9, t); g.gain.exponentialRampToValueAtTime(0.001, t + len);
    n.connect(f).connect(g).connect(actx.destination); n.start(t);
    const o = actx.createOscillator(), og = actx.createGain();
    o.type = "square"; o.frequency.setValueAtTime(900, t); o.frequency.exponentialRampToValueAtTime(80, t + 0.18);
    og.gain.setValueAtTime(0.25, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    o.connect(og).connect(actx.destination); o.start(t); o.stop(t + 0.22);
  } catch (e) {}
}
function dingSound(){
  if (!soundOn || !actx) return;
  try {
    const t = actx.currentTime;
    [880, 1320].forEach((fr, i) => { const o = actx.createOscillator(), g = actx.createGain(); o.type = "sine"; o.frequency.value = fr;
      g.gain.setValueAtTime(0.0001, t + i*0.09); g.gain.exponentialRampToValueAtTime(0.18, t + i*0.09 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + i*0.09 + 0.3);
      o.connect(g).connect(actx.destination); o.start(t + i*0.09); o.stop(t + i*0.09 + 0.32); });
  } catch (e) {}
}

/* ============ explosion fx ============ */
function explode(el, color){
  const r = el.getBoundingClientRect(), cx = r.left + r.width/2, cy = r.top + r.height/2;
  const fx = $("#fx"), pal = [color, ...COLORS];
  popSound();
  document.body.classList.remove("quake"); void document.body.offsetWidth; document.body.classList.add("quake");
  $("#flash").animate([{opacity:.55},{opacity:0}], {duration:260, easing:"ease-out"});
  [0, 120].forEach((delay, i) => {
    const ring = document.createElement("div"); ring.className = "ring";
    const s = Math.max(r.width, r.height) * .6;
    Object.assign(ring.style, {width:s+"px", height:s+"px", left:(cx - s/2)+"px", top:(cy - s/2)+"px", borderColor: i ? "#FF5FA2" : "#FFE94A"});
    fx.append(ring);
    ring.animate([{transform:"scale(.3)", opacity:1},{transform:"scale(4)", opacity:0}], {duration:700, delay, easing:"cubic-bezier(.1,.8,.3,1)", fill:"both"}).onfinish = () => ring.remove();
  });
  for (let i = 0; i < 46; i++) {
    const p = document.createElement("div"); p.className = "shard";
    const w = 10 + Math.random()*34, h = 8 + Math.random()*26;
    const sx = r.left + Math.random()*r.width, sy = r.top + Math.random()*r.height;
    const shapes = ["50%", "6px", "50% 50% 50% 4px", "0"];
    Object.assign(p.style, {width:w+"px", height:h+"px", left:sx+"px", top:sy+"px", background: pal[Math.floor(Math.random()*pal.length)], borderRadius: shapes[i % 4]});
    if (i % 4 === 3) p.style.clipPath = "polygon(50% 0,100% 100%,0 100%)";
    fx.append(p);
    const ang = Math.atan2(sy - cy, sx - cx) + (Math.random() - .5) * .8, dist = 260 + Math.random() * 520;
    const dx = Math.cos(ang) * dist, dy = Math.sin(ang) * dist;
    p.animate([
      {transform:"translate(0,0) rotate(0deg) scale(1)", opacity:1},
      {transform:`translate(${dx*.7}px,${dy*.7 - 60}px) rotate(${(Math.random()-.5)*540}deg) scale(1)`, opacity:1, offset:.6},
      {transform:`translate(${dx}px,${dy + 220}px) rotate(${(Math.random()-.5)*900}deg) scale(.3)`, opacity:0}
    ], {duration:1100 + Math.random()*600, easing:"cubic-bezier(.15,.75,.35,1)", fill:"forwards"}).onfinish = () => p.remove();
  }
  const EM = ["💥","✨","🎉","💬","⭐","🔥","🫧","💖"];
  for (let i = 0; i < 14; i++) {
    const e = document.createElement("div"); e.className = "emo"; e.textContent = EM[i % EM.length];
    Object.assign(e.style, {left:(cx - 19)+"px", top:(cy - 19)+"px", fontSize:(28 + Math.random()*30)+"px"});
    fx.append(e);
    const ang = Math.random()*Math.PI*2, dist = 180 + Math.random()*380;
    e.animate([
      {transform:"translate(0,0) scale(.2)", opacity:1},
      {transform:`translate(${Math.cos(ang)*dist}px,${Math.sin(ang)*dist}px) scale(1.2) rotate(${(Math.random()-.5)*90}deg)`, opacity:1, offset:.55},
      {transform:`translate(${Math.cos(ang)*dist*1.2}px,${Math.sin(ang)*dist*1.2 + 160}px) scale(.6)`, opacity:0}
    ], {duration:1400, easing:"cubic-bezier(.2,.8,.3,1)", fill:"forwards"}).onfinish = () => e.remove();
  }
  const pow = document.createElement("div"); pow.className = "pow";
  pow.textContent = ["POP!","BOOM!","DONE!","SLAY!"][Math.floor(Math.random()*4)];
  fx.append(pow);
  const pw = pow.offsetWidth, ph = pow.offsetHeight;
  Object.assign(pow.style, {left:(cx - pw/2)+"px", top:(cy - ph/2)+"px"});
  pow.animate([
    {transform:"scale(.2) rotate(-20deg)", opacity:0},
    {transform:"scale(1.25) rotate(-8deg)", opacity:1, offset:.25},
    {transform:"scale(1) rotate(-6deg)", opacity:1, offset:.6},
    {transform:"scale(1.5) rotate(-6deg)", opacity:0}
  ], {duration:1200, easing:"ease-out", fill:"forwards"}).onfinish = () => pow.remove();
}

/* ============ host-only gate ============ */
function gate(msg, user){
  show("gate");
  $("#gateMsg").textContent = msg;
  const loggedOther = user && !user.isAnonymous;
  $("#gateLogin").textContent = loggedOther ? "🔄 Ganti akun Google" : "🔐 Masuk dengan Google";
  $("#gateLogin").onclick = async () => { if (loggedOther) { try { await signOut(auth); } catch (e) {} } loginGoogle(); };
}
// Resolves to the signed-in host if they own this room; otherwise shows the gate and resolves null.
async function requireOwner(room){
  const u = await authReady;
  if (!isHostUser(u)) {
    gate(u && !u.isAnonymous ? `Akun ${u.email} bukan host. Halaman ini khusus host.` : "Halaman ini khusus host. Masuk dengan akun Google host dulu ya.", u);
    return null;
  }
  let s;
  try { s = await getDoc(roomRef(room)); } catch (e) { gate("Gagal memuat ruang: " + (e.code || e.message), u); return null; }
  if (!s.exists()) { gate(`Ruang ${room} belum dibuat. Buat dulu dari halaman depan.`, u); return null; }
  if (s.data().owner !== u.uid) { gate(`Ruang ${room} milik host lain.`, u); return null; }
  return u;
}
async function createRoom(code){
  const u = auth.currentUser;
  if (!isHostUser(u)) { toast("Masuk sebagai host dulu", true); return; }
  try {
    const s = await getDoc(roomRef(code));
    if (s.exists()) {
      if (s.data().owner === u.uid) { location.href = location.pathname + "?host=" + code; return; }
      toast(`Kode ${code} sudah dipakai, coba kode lain 🙏`, true); return;
    }
    await setDoc(roomRef(code), {owner: u.uid, ownerEmail: u.email, createdAt: serverTimestamp(), live: null});
    location.href = location.pathname + "?host=" + code;
  } catch (e) { fbErr(e); }
}

/* ============ LANDING ============ */
async function startLanding(){
  show("landing");
  const typed = () => { const c = cleanCode($("#joinCode").value); if (c.replace(/-/g, "").length < 4) { toast("Kode minimal 4 huruf/angka 🤔", true); return null; } return c; };
  const join = () => { const c = typed(); if (c) location.href = location.pathname + "?room=" + c; };
  $("#btnJoin").onclick = join;
  $("#joinCode").onkeydown = e => { if (e.key === "Enter") join(); };
  $("#btnLogin").onclick = loginGoogle;
  const u = await authReady;
  if (isHostUser(u)) {
    $("#lGuest").style.display = "none"; $("#lHost").style.display = "flex";
    $("#lHello").textContent = "Halo, " + (u.displayName || u.email).split(" ")[0] + " 👋";
    $("#btnLogout").onclick = logout;
    $("#btnHost").onclick = () => createRoom(randCode(6));
    const own = () => { const c = cleanCode($("#hostCode").value); if (c.replace(/-/g, "").length < 4) { toast("Kode minimal 4 huruf/angka 🤔", true); return; } createRoom(c); };
    $("#btnCreate").onclick = own;
    $("#hostCode").onkeydown = e => { if (e.key === "Enter") own(); };
    try {
      const s = await getDocs(query(collection(db, "rooms"), where("owner", "==", u.uid)));
      const rooms = s.docs.map(d => ({code: d.id, at: d.data().createdAt ? d.data().createdAt.toMillis() : 0})).sort((a, b) => b.at - a.at);
      const box = $("#myRooms"); box.innerHTML = "";
      if (rooms.length) {
        const h = document.createElement("div"); h.className = "my-h"; h.textContent = "Sesi kamu"; box.append(h);
        rooms.slice(0, 8).forEach(r => {
          const row = document.createElement("div"); row.className = "my-room";
          const c = document.createElement("b"); c.textContent = r.code;
          const d = document.createElement("span"); d.textContent = r.at ? new Date(r.at).toLocaleDateString("id-ID", {day:"numeric", month:"short", year:"numeric"}) : "";
          const a1 = document.createElement("a"); a1.className = "btn paper"; a1.href = "?host=" + r.code; a1.textContent = "🖥️ Layar";
          const a2 = document.createElement("a"); a2.className = "btn lav"; a2.href = "?admin=" + r.code; a2.textContent = "🛠 Admin";
          row.append(c, d, a1, a2); box.append(row);
        });
      }
    } catch (e) { console.warn(e); }
  } else if (u && !u.isAnonymous) {
    $("#lNotHost").style.display = "block";
    $("#lNotHostMsg").textContent = `Akun ${u.email} bukan host.`;
    $("#btnLogout2").onclick = logout;
  }
}

/* ============ HOST (projector) ============ */
async function startHost(room){
  const me = await requireOwner(room); if (!me) return;
  show("host");
  const joinURL = location.origin + location.pathname + "?room=" + room;
  const adminURL = location.origin + location.pathname + "?admin=" + room;
  $("#roomCode").textContent = room;
  try { new QRCode($("#qr"), {text: joinURL, width: 500, height: 500, colorDark:"#0E0C14", colorLight:"#FFF8EC", correctLevel: QRCode.CorrectLevel.M}); }
  catch (e) { $("#qr").innerHTML = '<div style="padding:30px 0;font-weight:800">QR gagal dimuat — pakai kode di bawah 👇</div>'; }
  const titleKey = "qna-title-" + room, savedTitle = store.get(titleKey, null);
  if (savedTitle) $("#eventTitle").firstChild.textContent = savedTitle;
  $("#eventTitle").addEventListener("input", () => store.set(titleKey, $("#eventTitle").firstChild.textContent));
  netWatch($("#hostConn"));

  const qs = new Map();      // id -> ball {q, el, ...} for questions still waiting
  const hist = new Map();    // id -> answered / deleted question
  let votes = new Map();
  let spotId = null, busy = false, firstLoad = true, pendingLive = null;
  const board = $("#board");
  const qDoc = id => doc(db, "rooms", room, "questions", id);
  const setLive = id => updateDoc(roomRef(room), {live: id}).catch(fbErr);
  const finish = (id, status) => updateDoc(qDoc(id), {status, votes: voteCount(votes, id), at: Date.now()}).catch(fbErr);

  function updateStats(){
    const empty = board.querySelector(".empty");
    if (!qs.size && !empty) board.insertAdjacentHTML("afterbegin", '<div class="empty"><div class="big">💬</div><h3>Belum ada pertanyaan</h3><p>Scan QR di samping, terus tanya aja!</p></div>');
    if (qs.size && empty) empty.remove();
  }
  function bubbleEl(q){
    const h = hash(q.id), color = COLORS[h % COLORS.length];
    const el = document.createElement("div");
    el.className = "bubble";
    el.style.background = color;
    const who = document.createElement("div"); who.className = "who";
    const av = document.createElement("div"); av.className = "av";
    const pz = persona(q);
    av.textContent = pz.av; if (pz.anon) av.style.background = "#fff";
    const meta = document.createElement("div");
    const n = document.createElement("div"); n.className = "name"; n.textContent = pz.name;
    const tm = document.createElement("div"); tm.className = "time"; tm.dataset.ts = q.ts; tm.textContent = timeAgo(q.ts);
    meta.append(n, tm); who.append(av, meta);
    const tx = document.createElement("div"); tx.className = "txt"; tx.textContent = q.text;
    const vb = document.createElement("div"); vb.className = "votes";
    el.append(who, tx, vb);
    el._color = color; el._votes = vb;
    setVotesBadge(el, voteCount(votes, q.id), false);
    return el;
  }
  function setVotesBadge(el, n, bump){
    const vb = el._votes; if (!vb) return;
    const old = +(vb.dataset.n || 0);
    vb.dataset.n = n; vb.textContent = "🔥 " + n; vb.classList.toggle("on", n > 0);
    if (bump && n > old) { vb.classList.remove("bump"); void vb.offsetWidth; vb.classList.add("bump"); }
  }
  const ordered = () => [...qs.values()].sort((a, b) => (voteCount(votes, b.q.id) - voteCount(votes, a.q.id)) || (a.q.ts - b.q.ts));

  /* ---------- floating balls ---------- */
  let W = board.clientWidth, H = board.clientHeight;
  new ResizeObserver(() => { W = board.clientWidth; H = board.clientHeight; }).observe(board);
  const baseR = () => Math.max(34, Math.min(62, Math.sqrt((W * H) / Math.max(qs.size, 1)) * 0.24));
  function sortBoard(){
    const list = ordered(), br = baseR();
    list.forEach((o, i) => {
      const n = voteCount(votes, o.q.id);
      o.tr = br + Math.min(n, 12) * br * 0.09;
      o.el.classList.toggle("top", i === 0 && n > 0 && list.length > 1);
    });
  }
  function ballBadge(o, bump){
    const n = voteCount(votes, o.q.id), v = o.v, old = +(v.dataset.n || 0);
    v.dataset.n = n; v.textContent = "🔥 " + n; v.classList.toggle("on", n > 0);
    if (bump && n > old) { v.classList.remove("bump"); void v.offsetWidth; v.classList.add("bump"); }
  }
  function addQ(q){
    if (qs.has(q.id)) return;
    const h = hash(q.id), color = COLORS[h % COLORS.length];
    const el = document.createElement("div"); el.className = "ball";
    const orb = document.createElement("div"); orb.className = "orb"; orb.style.background = color;
    orb.style.setProperty("--bd", -((h >>> 5) % 32) / 10 + "s");
    orb.innerHTML = '<span class="crown">👑</span><span class="qm">?</span><span class="v"></span>';
    el.append(orb);
    el.addEventListener("click", () => openSpot(q.id));
    const r = baseR();
    const ang = Math.random() * Math.PI * 2, sp = 45 + Math.random() * 45;
    const o = {q, el, v: orb.querySelector(".v"), r, tr: r,
      x: r + Math.random() * Math.max(1, W - 2 * r), y: r + 16 + Math.random() * Math.max(1, H - 2 * r - 22),
      vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp};
    if (!firstLoad) { el.classList.add("new"); setTimeout(() => el.classList.remove("new"), 6000); dingSound(); }
    board.append(el);
    qs.set(q.id, o);
    ballBadge(o, false);
    updateStats();
    sortBoard();
    if (pendingLive === q.id) { pendingLive = null; openSpot(q.id, true); }
  }
  function removeQ(id, exploded){
    const o = qs.get(id); if (!o) return;
    qs.delete(id);
    sortBoard();
    if (spotId === id && !exploded) closeSpot(false);
    if (exploded) o.el.remove();
    else { o.el.classList.add("leaving"); setTimeout(() => o.el.remove(), 350); }
    updateStats();
  }
  let last = performance.now();
  function tick(now){
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    const arr = [...qs.values()];
    for (const o of arr) {
      o.r += (o.tr - o.r) * Math.min(1, dt * 4);
      o.vx += (Math.random() - .5) * 30 * dt; o.vy += (Math.random() - .5) * 30 * dt;
      const sp = Math.hypot(o.vx, o.vy), min = 35, max = 110;
      if (sp > max) { o.vx *= max / sp; o.vy *= max / sp; } else if (sp < min && sp > 0) { o.vx *= min / sp; o.vy *= min / sp; }
      o.x += o.vx * dt; o.y += o.vy * dt;
      if (o.x < o.r) { o.x = o.r; o.vx = Math.abs(o.vx); } else if (o.x > W - o.r) { o.x = W - o.r; o.vx = -Math.abs(o.vx); }
      if (o.y < o.r + 16) { o.y = o.r + 16; o.vy = Math.abs(o.vy); } else if (o.y > H - o.r - 6) { o.y = H - o.r - 6; o.vy = -Math.abs(o.vy); }
    }
    for (let i = 0; i < arr.length; i++) for (let j = i + 1; j < arr.length; j++) {
      const a = arr[i], b = arr[j], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 0.01, minD = a.r + b.r;
      if (d < minD) {
        const nx = dx / d, ny = dy / d, push = (minD - d) / 2;
        a.x -= nx * push; a.y -= ny * push; b.x += nx * push; b.y += ny * push;
        const rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
        if (rel < 0) { a.vx += rel * nx; a.vy += rel * ny; b.vx -= rel * nx; b.vy -= rel * ny; }
      }
    }
    for (const o of arr) {
      o.el.style.width = o.el.style.height = (o.r * 2) + "px";
      o.el.style.setProperty("--r", o.r.toFixed(1));
      o.el.style.transform = `translate(${(o.x - o.r).toFixed(1)}px,${(o.y - o.r).toFixed(1)}px)`;
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  /* ---------- spotlight / pop ---------- */
  function openSpot(id, remote){
    const o = qs.get(id); if (!o || busy) return;
    if (spotId && spotId !== id && qs.get(spotId)) qs.get(spotId).el.style.visibility = "";
    spotId = id;
    const slot = $("#spotSlot"); slot.innerHTML = "";
    slot.append(bubbleEl(o.q));
    $("#spot").classList.add("on");
    o.el.style.visibility = "hidden";
    if (!remote) setLive(id);
    try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {}
  }
  function closeSpot(remote){
    if (spotId && qs.get(spotId)) qs.get(spotId).el.style.visibility = "";
    const was = spotId;
    spotId = null; $("#spot").classList.remove("on"); $("#spotSlot").innerHTML = "";
    if (!remote && was) setLive(null);
  }
  function popSpot(remote){
    if (!spotId || busy) return;
    busy = true;
    const id = spotId, b = $("#spotSlot .bubble");
    if (!remote) finish(id, "dijawab");
    b.classList.add("shake");
    setTimeout(() => {
      explode(b, b._color);
      b.style.visibility = "hidden";
      $("#spot").animate([{opacity:1},{opacity:0}], {duration:350, delay:150, fill:"forwards"}).onfinish = a => {
        $("#spot").classList.remove("on"); a.target.cancel();
        $("#spotSlot").innerHTML = ""; busy = false;
      };
      const o = qs.get(id);
      if (o && !hist.has(id)) hist.set(id, Object.assign({}, o.q, {status: "dijawab", votes: voteCount(votes, id), at: Date.now()}));
      spotId = null;
      removeQ(id, true);
      updateLast();
      setLive(null);
    }, 430);
  }
  function deleteQ(id){ if (qs.has(id)) finish(id, "dihapus"); }

  $("#btnDel").onclick = () => { if (spotId && !busy) deleteQ(spotId); };
  $("#spotSlot").addEventListener("click", () => popSpot(false));
  $("#btnBack").onclick = () => closeSpot(false);
  $("#spot").addEventListener("click", e => { if (e.target.id === "spot") closeSpot(false); });
  document.addEventListener("keydown", e => {
    if (document.activeElement && (document.activeElement.isContentEditable || /INPUT|TEXTAREA/.test(document.activeElement.tagName))) return;
    if (e.code === "Space" && spotId) { e.preventDefault(); popSpot(false); }
    else if (e.code === "Escape" && spotId) closeSpot(false);
    else if (e.code === "Space" && !spotId && qs.size) { e.preventDefault(); openSpot(ordered()[0].q.id); }
  });

  /* ---------- last answered bar ---------- */
  let lastShownId = null, lastHidden = store.get("qna-last-hidden", false);
  const setLastHidden = v => { lastHidden = v; store.set("qna-last-hidden", v); $("#lastBar").classList.toggle("hidden", v); $("#lastEye").textContent = v ? "🙈" : "👁"; };
  setLastHidden(lastHidden);
  $("#lastEye").onclick = () => setLastHidden(!lastHidden);
  function updateLast(){
    let lastQ = null;
    hist.forEach(h => { if (h.status === "dijawab" && (!lastQ || h.at > lastQ.at)) lastQ = h; });
    const box = $("#lastIn");
    box.classList.toggle("empty-last", !lastQ);
    if (!lastQ || lastQ.id === lastShownId) return;
    lastShownId = lastQ.id;
    $("#lastWho").textContent = persona(lastQ).name;
    $("#lastTxt").textContent = lastQ.text;
    box.classList.remove("flash-in"); void box.offsetWidth; box.classList.add("flash-in");
  }

  /* ---------- side controls ---------- */
  $("#btnSound").textContent = soundOn ? "🔊 Suara: ON" : "🔇 Suara: OFF";
  $("#btnSound").onclick = () => { soundOn = !soundOn; store.set("qna-sound", soundOn); $("#btnSound").textContent = soundOn ? "🔊 Suara: ON" : "🔇 Suara: OFF"; };
  $("#btnFull").onclick = () => { try { document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen(); } catch (e) {} };
  const confirmBtn = (btn, label, fn) => {
    let armed = false, t;
    btn.addEventListener("click", () => {
      if (!armed) { armed = true; const old = btn.textContent; btn.textContent = label; t = setTimeout(() => { armed = false; btn.textContent = old; }, 2500); btn._old = old; return; }
      clearTimeout(t); armed = false; btn.textContent = btn._old; fn();
    });
  };
  confirmBtn($("#btnClear"), "Yakin? Klik lagi", async () => {
    const ids = [...qs.keys()]; if (!ids.length) return;
    const batch = writeBatch(db);
    ids.forEach(id => batch.update(qDoc(id), {status: "dihapus", votes: voteCount(votes, id), at: Date.now()}));
    try { await batch.commit(); toast("Semua pertanyaan dihapus 🧹"); } catch (e) { fbErr(e); }
  });
  confirmBtn($("#btnNewRoom"), "Yakin? Klik lagi", () => createRoom(randCode(6)));
  setInterval(() => document.querySelectorAll(".time[data-ts]").forEach(t => t.textContent = timeAgo(+t.dataset.ts)), 30000);

  /* rekap */
  const rows = () => rekapRows(new Map([...qs].map(([k, o]) => [k, o.q])), hist, votes, spotId);
  $("#btnRekap").onclick = () => { renderRekap($("#rekapBody"), rows()); $("#rekapModal").classList.add("on"); };
  $("#rkClose").onclick = () => $("#rekapModal").classList.remove("on");
  $("#rekapModal").addEventListener("click", e => { if (e.target.id === "rekapModal") $("#rekapModal").classList.remove("on"); });
  $("#rkCsv").onclick = () => downloadFile("rekap-qna-" + room + ".csv", rekapCSV(rows()), "text/csv;charset=utf-8");
  $("#rkCopy").onclick = () => copyText(rekapText(rows(), room));
  /* admin link */
  $("#adminLink").textContent = adminURL;
  let adminQrMade = false;
  $("#btnAdmin").onclick = () => {
    if (!adminQrMade) { try { new QRCode($("#adminQr"), {text: adminURL, width: 360, height: 360, correctLevel: QRCode.CorrectLevel.M}); } catch (e) {} adminQrMade = true; }
    $("#adminModal").classList.add("on");
  };
  $("#amClose").onclick = () => $("#adminModal").classList.remove("on");
  $("#amCopy").onclick = () => copyText(adminURL);
  $("#amOpen").onclick = () => { const w = window.open(adminURL, "tanyaaja_admin", "popup,width=560,height=900"); if (!w) location.href = adminURL; $("#adminModal").classList.remove("on"); };

  /* ---------- live data ---------- */
  onSnapshot(qCol(room), s => {
    s.docChanges().forEach(ch => {
      const q = parseDoc(ch.doc), id = q.id;
      if (ch.type === "removed") { hist.delete(id); removeQ(id, false); return; }
      if (q.status === "antre") { hist.delete(id); addQ(q); return; }
      hist.set(id, q);
      if (!qs.has(id)) return;
      if (q.status === "dijawab" && spotId === id) { if (!busy) popSpot(true); }   // popped from the admin page
      else removeQ(id, false);
    });
    firstLoad = false;
    updateLast();
  }, fbErr);
  onSnapshot(vCol(room), s => {
    votes = votesFromSnap(s);
    qs.forEach(o => { if (+(o.v.dataset.n || 0) !== voteCount(votes, o.q.id)) ballBadge(o, true); });
    sortBoard();
    if (spotId) { const sb = $("#spotSlot .bubble"); if (sb) setVotesBadge(sb, voteCount(votes, spotId), true); }
  }, fbErr);
  onSnapshot(roomRef(room), s => {
    const live = (s.data() || {}).live || null;
    if (live && live !== spotId && !busy) { if (qs.has(live)) openSpot(live, true); else pendingLive = live; }
    else if (!live && spotId && !busy) {
      const id = spotId;
      setTimeout(() => { if (spotId === id && !busy) closeSpot(true); }, 700);   // give a remote "pop" the chance to arrive first
    }
  }, fbErr);
  updateStats();
}

/* ============ GUEST (participant phone) ============ */
async function startGuest(room){
  show("guest");
  $("#gRoom").textContent = room;
  netWatch($("#guestConn"));
  const mineKey = "qna-mine-" + room;
  let mine = store.get(mineKey, []); // [{id,text,status}]
  let anon = store.get("qna-anon", false), lastSent = 0, liveId = null, ready = false;
  const allQ = new Map(); let votes = new Map(), me = null;
  const save = () => store.set(mineKey, mine.slice(-30));
  let feedQueued = false;
  const queueFeed = () => { if (feedQueued) return; feedQueued = true; requestAnimationFrame(() => { feedQueued = false; renderFeed(); }); };
  function renderFeed(){
    const list = $("#feedList"), mineIds = new Set(mine.map(m => m.id));
    const items = [...allQ.values()].sort((a, b) => (voteCount(votes, b.id) - voteCount(votes, a.id)) || (a.ts - b.ts));
    const prev = {}; list.querySelectorAll(".fq").forEach(el => prev[el.dataset.id] = +el.dataset.n);
    list.innerHTML = "";
    if (!items.length) { list.innerHTML = '<div class="feed-empty">Belum ada pertanyaan lain. Jadi yang pertama! ✨</div>'; return; }
    items.forEach(q => {
      const n = voteCount(votes, q.id), own = mineIds.has(q.id), on = !!me && votes.has(q.id) && votes.get(q.id).has(me.uid);
      const pz = persona(q);
      const row = document.createElement("div"); row.className = "fq" + (liveId === q.id ? " live" : ""); row.dataset.id = q.id; row.dataset.n = n;
      const body = document.createElement("div"); body.className = "body";
      const meta = document.createElement("div"); meta.className = "meta";
      meta.append(document.createTextNode(pz.anon ? pz.av + " " + pz.name : pz.name));
      if (own) { const t = document.createElement("span"); t.className = "tag"; t.textContent = "punyamu"; meta.append(t); }
      if (liveId === q.id) { const t = document.createElement("span"); t.className = "tag live"; t.textContent = "🎤 lagi dibacain"; meta.append(t); }
      const t = document.createElement("div"); t.className = "t"; t.textContent = q.text;
      body.append(meta, t);
      const btn = document.createElement("button"); btn.type = "button"; btn.className = "vote" + (on ? " on" : "");
      btn.innerHTML = '<span class="f">🔥</span>'; btn.append(document.createTextNode(String(n)));
      btn.setAttribute("aria-label", (on ? "Batal dukung" : "Dukung") + " pertanyaan ini, " + n + " dukungan");
      if (own) { btn.disabled = true; btn.title = "Nggak bisa vote pertanyaan sendiri 😄"; }
      else btn.onclick = () => {
        if (!me) return;
        const ref = doc(vCol(room), q.id + "_" + me.uid);
        const p = on ? deleteDoc(ref) : setDoc(ref, {q: q.id, uid: me.uid});
        p.catch(fbErr);
        if (!on && navigator.vibrate) navigator.vibrate(30);
      };
      if (prev[q.id] !== undefined && n > prev[q.id]) btn.classList.add("bump");
      row.append(body, btn); list.append(row);
    });
  }
  function renderMine(){
    $("#mine").style.display = mine.length ? "block" : "none";
    const list = $("#mineList"); list.innerHTML = "";
    [...mine].reverse().forEach(m => {
      const st = liveId === m.id ? "live" : m.status;
      const it = document.createElement("div"); it.className = "mine-item";
      const tx = document.createElement("div"); tx.textContent = m.text;
      const badge = document.createElement("span"); badge.className = "st " + st;
      badge.textContent = st === "live" ? "🎤 Lagi dibacain" : st === "done" ? "✅ Sudah dibahas" : "⏳ Antre di layar";
      it.append(tx, badge); list.append(it);
    });
    $("#liveBanner").classList.toggle("on", mine.some(m => m.id === liveId));
  }
  $("#gName").value = store.get("qna-name", "");
  const setAnon = v => { anon = v; store.set("qna-anon", v); $("#anonToggle").classList.toggle("on", v); $("#anonToggle").setAttribute("aria-checked", v); $("#nameBox").classList.toggle("hide", v); };
  setAnon(anon);
  $("#anonToggle").onclick = () => setAnon(!anon);
  $("#anonToggle").onkeydown = e => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); setAnon(!anon); } };
  $("#gText").oninput = () => $("#gCount").textContent = $("#gText").value.length;
  $("#gName").onchange = () => store.set("qna-name", $("#gName").value.trim());
  renderMine(); renderFeed();

  $("#qForm").addEventListener("submit", async e => {
    e.preventDefault();
    const text = $("#gText").value.trim(), name = $("#gName").value.trim();
    if (!ready || !me) { toast("Masih menyambungkan… coba lagi sebentar 📶", true); return; }
    if (text.length < 3) { toast("Pertanyaannya masih kosong nih 😅", true); return; }
    if (!anon && !name) { toast("Isi nama dulu, atau nyalain mode anonim 👻", true); $("#gName").focus(); return; }
    const wait = 8000 - (Date.now() - lastSent);
    if (wait > 0) { toast("Santai dulu, tunggu " + Math.ceil(wait/1000) + " detik ya ⏳", true); return; }
    const ref = doc(qCol(room));
    lastSent = Date.now();
    try {
      await setDoc(ref, {text, name: anon ? "" : name, anon, uid: me.uid, ts: Date.now(), status: "antre"});
    } catch (err) { lastSent = 0; fbErr(err); return; }
    mine.push({id: ref.id, text, status: "wait"}); save(); renderMine(); queueFeed();
    $("#gText").value = ""; $("#gCount").textContent = "0";
    if (name) store.set("qna-name", name);
    toast("Terkirim! Cek layar ya 🚀");
    explode($("#btnSend"), "#C6FF3D");
  });

  // connect: participants sign in anonymously behind the scenes (no account needed)
  me = await authReady;
  if (!me) { try { me = (await signInAnonymously(auth)).user; } catch (e) { fbErr(e); return; } }
  let rs;
  try { rs = await getDoc(roomRef(room)); } catch (e) { fbErr(e); return; }
  if (!rs.exists()) {
    $("#gHeadP").textContent = `⚠️ Ruang "${room}" tidak ditemukan. Cek lagi kodenya di layar ya.`;
    $("#btnSend").disabled = true; return;
  }
  ready = true;
  onSnapshot(roomRef(room), s => {
    const id = (s.data() || {}).live || null;
    if (id !== liveId) {
      liveId = id; renderMine(); queueFeed();
      if (id && mine.some(m => m.id === id) && navigator.vibrate) navigator.vibrate([120, 60, 120]);
    }
  }, fbErr);
  let seenOnce = new Set();
  onSnapshot(query(qCol(room), where("status", "==", "antre")), s => {
    allQ.clear(); s.forEach(d => allQ.set(d.id, parseDoc(d)));
    let changed = false;
    mine.forEach(m => {
      if (allQ.has(m.id)) { seenOnce.add(m.id); if (m.status !== "wait") { m.status = "wait"; changed = true; } }
      else if (m.status === "wait" && (seenOnce.has(m.id) || !s.metadata.hasPendingWrites)) { m.status = "done"; changed = true; }
    });
    if (changed) { save(); renderMine(); }
    queueFeed();
  }, fbErr);
  onSnapshot(vCol(room), s => { votes = votesFromSnap(s); queueFeed(); }, fbErr);
}

/* ============ ADMIN (laptop) ============ */
async function startAdmin(room){
  const me = await requireOwner(room); if (!me) return;
  show("admin");
  document.title = "Admin · " + room + " — Tanya Aja!";
  $("#adRoom").textContent = room;
  const active = new Map(), hist = new Map(); let votes = new Map();
  let liveId = null, tab = "antre", queued = false;
  const qDoc = id => doc(db, "rooms", room, "questions", id);
  const rows = () => rekapRows(active, hist, votes, liveId);
  const render = () => { if (queued) return; queued = true; requestAnimationFrame(() => { queued = false; draw(); }); };
  const setLive = id => updateDoc(roomRef(room), {live: id}).catch(fbErr);
  const finish = (id, status) => updateDoc(qDoc(id), {status, votes: voteCount(votes, id), at: Date.now()}).catch(fbErr);
  function pop(id){
    if (!id) return;
    finish(id, "dijawab");                                  // the projector explodes it when it sees this
    setTimeout(() => { if (liveId === id) setLive(null); }, 2500);   // fallback if the projector page is closed
  }
  function draw(){
    const lq = liveId && active.get(liveId);
    $("#adLive").classList.toggle("on", !!lq);
    if (lq) { $("#adLiveTxt").textContent = lq.text; $("#adLiveWho").textContent = realName(lq) + " · " + fmtTime(lq.ts) + " · 🔥 " + voteCount(votes, lq.id); }
    const all = rows();
    $("#tabAntre").textContent = "💬 Antre (" + active.size + ")";
    $("#tabRekap").textContent = "📚 Rekap semua (" + all.length + ")";
    const list = $("#adList"); list.innerHTML = "";
    if (tab === "rekap") { const box = document.createElement("div"); box.className = "modal-card"; box.style.cssText = "width:100%;max-height:none;padding:16px"; renderRekap(box, all); list.append(box); return; }
    const items = [...active.values()].sort((a, b) => (voteCount(votes, b.id) - voteCount(votes, a.id)) || (a.ts - b.ts));
    if (!items.length) { list.innerHTML = '<div class="ad-empty">Belum ada pertanyaan di antrean.</div>'; return; }
    items.forEach(q => {
      const card = document.createElement("div"); card.className = "ad-q" + (q.id === liveId ? " live" : "");
      const body = document.createElement("div"); body.className = "body";
      const meta = document.createElement("div"); meta.className = "meta";
      const pz = persona(q);
      meta.append(document.createTextNode((pz.anon ? pz.av + " " : "") + realName(q) + " · " + fmtTime(q.ts)));
      const n = voteCount(votes, q.id);
      if (n) { const f = document.createElement("span"); f.className = "fire"; f.textContent = "🔥 " + n; meta.append(f); }
      if (q.id === liveId) { const l = document.createElement("span"); l.className = "pill tampil"; l.textContent = "🎤 Tampil"; meta.append(l); }
      const t = document.createElement("div"); t.className = "t"; t.textContent = q.text;
      body.append(meta, t);
      const acts = document.createElement("div"); acts.className = "acts";
      const b1 = document.createElement("button"); b1.className = "btn lime"; b1.textContent = q.id === liveId ? "💥 POP" : "▶ Tampilkan";
      b1.onclick = () => { if (q.id === liveId) pop(q.id); else setLive(q.id); };
      const b2 = document.createElement("button"); b2.className = "btn paper"; b2.textContent = "🗑 Hapus";
      let armed = false;
      b2.onclick = () => { if (!armed) { armed = true; b2.textContent = "Yakin?"; setTimeout(() => { armed = false; b2.textContent = "🗑 Hapus"; }, 2500); return; } finish(q.id, "dihapus"); if (liveId === q.id) setLive(null); };
      acts.append(b1, b2);
      card.append(body, acts); list.append(card);
    });
  }
  document.querySelectorAll(".ad-tabs button").forEach(b => b.onclick = () => {
    tab = b.dataset.tab; document.querySelectorAll(".ad-tabs button").forEach(x => x.classList.toggle("on", x === b)); draw();
  });
  /* manual question (e.g. from WA / Zoom chat / paper) */
  const addModal = $("#addModal");
  $("#adAdd").onclick = () => { addModal.classList.add("on"); setTimeout(() => $("#addText").focus(), 50); };
  $("#addClose").onclick = () => addModal.classList.remove("on");
  addModal.addEventListener("click", e => { if (e.target === addModal) addModal.classList.remove("on"); });
  $("#addForm").addEventListener("submit", async e => {
    e.preventDefault();
    const text = $("#addText").value.trim(), name = $("#addName").value.trim(), now = $("#addNow").checked;
    if (text.length < 3) { toast("Pertanyaannya masih kosong 😅", true); return; }
    const ref = doc(qCol(room));
    try { await setDoc(ref, {text, name, anon: !name, uid: me.uid, ts: Date.now(), status: "antre"}); } catch (err) { fbErr(err); return; }
    if (now) setLive(ref.id);
    $("#addText").value = ""; $("#addName").value = "";
    addModal.classList.remove("on");
    toast(now ? "Masuk & ditampilkan 🎤" : "Masuk ke layar sebagai bola ❓");
  });
  $("#adPop").onclick = () => pop(liveId);
  $("#adBack").onclick = () => setLive(null);
  $("#adCsv").onclick = () => downloadFile("rekap-qna-" + room + ".csv", rekapCSV(rows()), "text/csv;charset=utf-8");
  $("#adCopy").onclick = () => copyText(rekapText(rows(), room));
  setInterval(draw, 30000);
  const conn = () => { $("#adConn").innerHTML = navigator.onLine ? '<span style="display:inline-flex;gap:6px;align-items:center;font-size:13px;font-weight:700"><i class="dot ok"></i>' + (me.email || "") + '</span>' : '<span class="conn-warn">⚠️ Offline</span>'; };
  addEventListener("online", conn); addEventListener("offline", conn); conn();

  onSnapshot(roomRef(room), s => { liveId = (s.data() || {}).live || null; render(); }, fbErr);
  onSnapshot(qCol(room), s => {
    s.docChanges().forEach(ch => {
      const q = parseDoc(ch.doc);
      if (ch.type === "removed") { active.delete(q.id); hist.delete(q.id); return; }
      if (q.status === "antre") { active.set(q.id, q); hist.delete(q.id); } else { active.delete(q.id); hist.set(q.id, q); }
    });
    render();
  }, fbErr);
  onSnapshot(vCol(room), s => { votes = votesFromSnap(s); render(); }, fbErr);
  draw();
}

/* ============ router ============ */
const hostRoom = cleanCode(params.get("host")), guestRoom = cleanCode(params.get("room")), adminRoom = cleanCode(params.get("admin"));
if (adminRoom) startAdmin(adminRoom);
else if (hostRoom) startHost(hostRoom);
else if (guestRoom) startGuest(guestRoom);
else startLanding();
