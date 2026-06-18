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
