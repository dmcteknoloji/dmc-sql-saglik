// DMC SQL Saglik — Electron ana surec (kurulum sihirbazi GUI'si)
// Not: AI client bu uygulamayi ELECTRON_RUN_AS_NODE=1 ile cagirdiginda main.js
// CALISMAZ; saf-node modunda dogrudan mcp/index.js (MCP sunucusu) calisir.

const { app, BrowserWindow, ipcMain, shell } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const sql = require("mssql");

function createWindow() {
  const win = new BrowserWindow({
    width: 580,
    height: 720,
    resizable: false,
    title: "DMC SQL Saglik — Kurulum",
    backgroundColor: "#0c2148",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  if (win.removeMenu) win.removeMenu();
  win.loadFile(path.join(__dirname, "renderer", "index.html"));
}

app.whenReady().then(createWindow);
app.on("window-all-closed", () => app.quit());
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// --- yardimcilar -----------------------------------------------------------

function sqlConfig(c) {
  const host = String(c.server || "").split(",");
  return {
    server: host[0].replace(/^tcp:/i, ""),
    port: host[1] ? Number(host[1]) : undefined,
    database: c.database || "master",
    user: c.user,
    password: c.password,
    options: { encrypt: true, trustServerCertificate: true },
    connectionTimeout: 10000,
    requestTimeout: 10000,
  };
}

function connStr(c) {
  const srv = c.server + (c.server.includes(",") ? "" : "");
  return (
    `Server=${srv};Database=${c.database || "master"};` +
    `User Id=${c.user};Password=${c.password};` +
    `Encrypt=true;TrustServerCertificate=true;ApplicationIntent=ReadOnly;`
  );
}

function claudeConfigPath() {
  if (process.platform === "win32")
    return path.join(process.env.APPDATA || os.homedir(), "Claude", "claude_desktop_config.json");
  if (process.platform === "darwin")
    return path.join(os.homedir(), "Library", "Application Support", "Claude", "claude_desktop_config.json");
  return path.join(os.homedir(), ".config", "Claude", "claude_desktop_config.json");
}

function mcpScriptPath() {
  return app.isPackaged
    ? path.join(process.resourcesPath, "mcp", "index.js")
    : path.join(__dirname, "mcp", "index.js");
}

// --- IPC: baglanti testi ---------------------------------------------------

ipcMain.handle("test-connection", async (_e, c) => {
  let pool;
  try {
    pool = await new sql.ConnectionPool(sqlConfig(c)).connect();
    const r = await pool.request().query("SELECT @@VERSION AS v");
    return { ok: true, info: String(r.recordset[0].v).split("\n")[0].trim() };
  } catch (err) {
    return { ok: false, error: err.message };
  } finally {
    try { if (pool) await pool.close(); } catch {}
  }
});

// --- IPC: kurulum (AI client config'ine yaz) -------------------------------

ipcMain.handle("install", async (_e, c) => {
  try {
    const cfgPath = claudeConfigPath();
    fs.mkdirSync(path.dirname(cfgPath), { recursive: true });
    let cfg = {};
    if (fs.existsSync(cfgPath)) {
      try { cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8")) || {}; } catch { cfg = {}; }
    }
    cfg.mcpServers = cfg.mcpServers || {};
    cfg.mcpServers["mssql-health"] = {
      command: process.execPath, // bu uygulamanin exe'si
      args: [mcpScriptPath()],
      env: {
        ELECTRON_RUN_AS_NODE: "1", // exe'yi saf-node modunda calistir
        MSSQL_CONNECTION_STRING: connStr(c),
      },
    };
    fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2), "utf8");
    return { ok: true, path: cfgPath };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle("open-path", async (_e, p) => {
  try { await shell.showItemInFolder(p); return { ok: true }; }
  catch (e) { return { ok: false, error: e.message }; }
});

ipcMain.handle("open-url", async (_e, url) => {
  try { await shell.openExternal(url); return { ok: true }; }
  catch (e) { return { ok: false, error: e.message }; }
});
