const $ = (id) => document.getElementById(id);

function readForm() {
  return {
    server: $("server").value.trim(),
    user: $("user").value.trim(),
    password: $("password").value,
    database: $("database").value.trim() || "master",
  };
}

function setStatus(kind, msg) {
  const s = $("status");
  s.className = "status " + kind;
  s.textContent = msg;
}

function validate(c) {
  if (!c.server) return "SQL sunucu adını girin.";
  if (!c.user) return "Kullanıcı adını girin.";
  if (!c.password) return "Şifreyi girin.";
  return null;
}

$("btnTest").addEventListener("click", async () => {
  const c = readForm();
  const err = validate(c);
  if (err) return setStatus("err", err);
  setStatus("info", "Bağlanılıyor...");
  $("btnTest").disabled = true;
  const r = await window.api.testConnection(c);
  $("btnTest").disabled = false;
  if (r.ok) setStatus("ok", "✓ Bağlantı başarılı — " + r.info);
  else setStatus("err", "✗ Bağlanılamadı: " + r.error);
});

let lastConfigPath = "";

$("btnInstall").addEventListener("click", async () => {
  const c = readForm();
  const err = validate(c);
  if (err) return setStatus("err", err);
  setStatus("info", "Önce bağlantı doğrulanıyor...");
  $("btnInstall").disabled = true;
  const t = await window.api.testConnection(c);
  if (!t.ok) {
    $("btnInstall").disabled = false;
    return setStatus("err", "✗ Kurulmadı — bağlantı başarısız: " + t.error);
  }
  setStatus("info", "Kuruluyor...");
  const r = await window.api.install(c);
  $("btnInstall").disabled = false;
  if (r.ok) {
    lastConfigPath = r.path;
    $("form").style.display = "none";
    $("done").style.display = "block";
  } else {
    setStatus("err", "✗ Kurulum hatası: " + r.error);
  }
});

$("btnConfig")?.addEventListener("click", () => {
  if (lastConfigPath) window.api.openPath(lastConfigPath);
});
$("btnClose")?.addEventListener("click", () => window.close());
$("btnSentinel")?.addEventListener("click", () => window.api.openUrl("https://sentineldb360.com"));
$("btnCopy")?.addEventListener("click", async (e) => {
  e.preventDefault();
  const r = await window.api.copyConfig(readForm());
  $("btnCopy").textContent = r.ok ? "Kopyalandı ✓ (istemcinin MCP ayarına yapıştır)" : "Kopyalanamadı";
});


// --- Hizli Tarama ---------------------------------------------------------
function scanCard(state, ico, lbl, val) {
  return `<div class="card ${state}"><span class="ico">${ico}</span><span class="lbl">${lbl}</span><span class="val">${val}</span></div>`;
}

function renderScan(r) {
  const h = r.health || {};
  const gun = h.uptime_saat != null ? Math.floor(h.uptime_saat / 24) : null;
  $("scanHead").innerHTML = h.makine
    ? `<b>${h.makine}</b> · ${h.edition || ""} ${h.surum || ""}<br/>${gun != null ? gun + " gün uptime" : ""} · ${h.db ?? "?"} veritabanı`
    : "Sunucu bilgisi alınamadı";

  const cards = [];
  if (h.offline > 0) cards.push(scanCard("bad", "⛔", "Online olmayan DB", h.offline));

  const bl = r.blocking;
  if (bl && bl.n != null) cards.push(scanCard(bl.n > 0 ? "warn" : "", bl.n > 0 ? "⚠" : "✓", "Blocking (engellenen oturum)", bl.n));

  const w = r.wait;
  if (w && w.tur) cards.push(scanCard(w.yuzde >= 40 ? "warn" : "", "◔", "En çok bekleme", `${w.tur} · %${w.yuzde}`));

  const mi = r.missing;
  if (mi && mi.n != null) cards.push(scanCard(mi.n > 0 ? "warn" : "", mi.n > 0 ? "⚠" : "✓", "Eksik index önerisi", mi.n));

  const b = r.backup;
  if (b && b._err) cards.push(scanCard("", "🔒", "Yedek durumu (msdb izni gerekli)", "—"));
  else if (b && b.db) {
    if (b.saat == null) cards.push(scanCard("bad", "⛔", `Full yedeği YOK: ${b.db}`, "—"));
    else cards.push(scanCard(b.saat > 24 ? "warn" : "", b.saat > 24 ? "⚠" : "✓", `En eski full yedek: ${b.db}`, `${b.saat} saat önce`));
  }

  const d = r.disk;
  if (d && d.bos_yuzde != null) {
    const st = d.bos_yuzde < 15 ? "bad" : (d.bos_yuzde < 25 ? "warn" : "");
    const ic = d.bos_yuzde < 15 ? "⛔" : (d.bos_yuzde < 25 ? "⚠" : "✓");
    cards.push(scanCard(st, ic, `Disk boş alan (${d.disk || ""})`, `%${d.bos_yuzde}`));
  }

  const t = r.tempdb;
  if (t && t.toplam_mb != null) cards.push(scanCard("", "💾", "tempdb toplam boyut", `${t.toplam_mb} MB`));

  $("scanCards").innerHTML = cards.join("") || `<div class="card">Veri alınamadı.</div>`;
}

async function runScan() {
  const c = readForm();
  const err = validate(c);
  if (err) return setStatus("err", err);
  setStatus("info", "Taranıyor...");
  $("btnScan").disabled = true;
  const r = await window.api.quickScan(c);
  $("btnScan").disabled = false;
  if (!r.ok) return setStatus("err", "✗ Taranamadı: " + r.error);
  $("status").className = "status";
  renderScan(r);
  $("form").style.display = "none";
  $("scan").style.display = "block";
}

$("btnScan")?.addEventListener("click", runScan);
$("btnScanBack")?.addEventListener("click", () => { $("scan").style.display = "none"; $("form").style.display = "block"; });
$("btnScanSentinel")?.addEventListener("click", () => window.api.openUrl("https://sentineldb360.com"));
