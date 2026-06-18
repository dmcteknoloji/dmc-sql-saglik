// DMC SQL Saglik — Electron ana surec (kurulum sihirbazi GUI'si)
// Not: AI client bu uygulamayi ELECTRON_RUN_AS_NODE=1 ile cagirdiginda main.js
// CALISMAZ; saf-node modunda dogrudan mcp/index.js (MCP sunucusu) calisir.

const { app, BrowserWindow, ipcMain, shell, clipboard } = require("electron");
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

ipcMain.handle("copy-config", async (_e, c) => {
  try {
    const block = {
      mcpServers: {
        "mssql-health": {
          command: process.execPath,
          args: [mcpScriptPath()],
          env: { ELECTRON_RUN_AS_NODE: "1", MSSQL_CONNECTION_STRING: connStr(c) },
        },
      },
    };
    clipboard.writeText(JSON.stringify(block, null, 2));
    return { ok: true };
  } catch (e) { return { ok: false, error: e.message }; }
});


// --- IPC: hizli tarama (teshisleri app icinde calistir, salt-okunur) -------

const SCAN_Q = {
  health: `
    SELECT
      CONVERT(varchar(128), SERVERPROPERTY('MachineName')) AS makine,
      CONVERT(varchar(64),  SERVERPROPERTY('Edition'))     AS edition,
      CONVERT(varchar(32),  SERVERPROPERTY('ProductVersion')) AS surum,
      si.cpu_count AS cpu,
      DATEDIFF(HOUR, si.sqlserver_start_time, GETDATE()) AS uptime_saat,
      (SELECT COUNT(*) FROM sys.databases) AS db,
      (SELECT COUNT(*) FROM sys.databases WHERE state_desc <> 'ONLINE') AS offline
    FROM sys.dm_os_sys_info si;`,
  blocking: `SELECT COUNT(*) AS n FROM sys.dm_exec_requests WHERE blocking_session_id <> 0;`,
  missing:  `SELECT COUNT(*) AS n FROM sys.dm_db_missing_index_group_stats;`,
  wait: `
    SELECT TOP 1 wait_type AS tur,
      CONVERT(decimal(5,1), 100.0*wait_time_ms/NULLIF(SUM(wait_time_ms) OVER(),0)) AS yuzde
    FROM sys.dm_os_wait_stats
    WHERE waiting_tasks_count > 0 AND wait_type NOT IN (
      'CLR_SEMAPHORE','LAZYWRITER_SLEEP','RESOURCE_QUEUE','SLEEP_TASK','SLEEP_SYSTEMTASK',
      'SQLTRACE_BUFFER_FLUSH','WAITFOR','LOGMGR_QUEUE','CHECKPOINT_QUEUE','REQUEST_FOR_DEADLOCK_SEARCH',
      'XE_TIMER_EVENT','BROKER_TO_FLUSH','BROKER_TASK_STOP','CLR_MANUAL_EVENT','CLR_AUTO_EVENT',
      'DISPATCHER_QUEUE_SEMAPHORE','FT_IFTS_SCHEDULER_IDLE_WAIT','XE_DISPATCHER_WAIT','XE_DISPATCHER_JOIN',
      'BROKER_EVENTHANDLER','TRACEWRITE','FT_IFTSHC_MUTEX','SQLTRACE_INCREMENTAL_FLUSH_SLEEP',
      'BROKER_RECEIVE_WAITFOR','ONDEMAND_TASK_QUEUE','DBMIRROR_EVENTS_QUEUE','DBMIRRORING_CMD',
      'BROKER_TRANSMITTER','SQLTRACE_WAIT_ENTRIES','SLEEP_BPOOL_FLUSH','DIRTY_PAGE_POLL',
      'SP_SERVER_DIAGNOSTICS_SLEEP','HADR_WORK_QUEUE','HADR_TIMER_TASK','QDS_ASYNC_QUEUE',
      'QDS_PERSIST_TASK_MAIN_LOOP_SLEEP','REDO_THREAD_PENDING_WORK','SLEEP_DBSTARTUP')
    ORDER BY wait_time_ms DESC;`,
  backup: `
    SELECT TOP 1 d.name AS db,
      DATEDIFF(HOUR, MAX(b.backup_finish_date), GETDATE()) AS saat
    FROM sys.databases d
    LEFT JOIN msdb.dbo.backupset b ON b.database_name = d.name AND b.type = 'D'
    WHERE d.database_id > 4
    GROUP BY d.name
    ORDER BY MAX(b.backup_finish_date) ASC;`,
  disk: `
    SELECT TOP 1 vs.volume_mount_point AS disk,
      CONVERT(decimal(5,1), 100.0*vs.available_bytes/NULLIF(vs.total_bytes,0)) AS bos_yuzde
    FROM sys.master_files mf
    CROSS APPLY sys.dm_os_volume_stats(mf.database_id, mf.file_id) vs
    GROUP BY vs.volume_mount_point, vs.available_bytes, vs.total_bytes
    ORDER BY bos_yuzde ASC;`,
  tempdb: `
    SELECT CONVERT(decimal(18,1), SUM(total_page_count)*8.0/1024) AS toplam_mb
    FROM tempdb.sys.dm_db_file_space_usage;`,
};

ipcMain.handle("quick-scan", async (_e, c) => {
  let pool;
  try {
    pool = await new sql.ConnectionPool(sqlConfig(c)).connect();
    const one = async (q) => {
      try { const r = await pool.request().query(q); return r.recordset && r.recordset[0] ? r.recordset[0] : null; }
      catch (e) { return { _err: e.message }; }
    };
    const [health, blocking, missing, wait, backup, disk, tempdb] = await Promise.all([
      one(SCAN_Q.health), one(SCAN_Q.blocking), one(SCAN_Q.missing),
      one(SCAN_Q.wait), one(SCAN_Q.backup), one(SCAN_Q.disk), one(SCAN_Q.tempdb),
    ]);
    return { ok: true, health, blocking, missing, wait, backup, disk, tempdb };
  } catch (err) {
    return { ok: false, error: err.message };
  } finally {
    try { if (pool) await pool.close(); } catch {}
  }
});
