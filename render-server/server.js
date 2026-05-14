const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 10000;
const API_KEY = process.env.API_KEY || 'change-me-12345';
const OFFLINE_AFTER_MS = Number(process.env.OFFLINE_AFTER_MS || 30000);

app.use(cors());
app.use(express.json({ limit: '1mb' }));

const devices = new Map();
const history = new Map();
const MAX_HISTORY = 300;

function getStatus(level) {
  if (level === null || level === undefined || Number.isNaN(Number(level))) return 'SENSOR ERROR';
  const n = Number(level);
  if (n <= 20) return 'GOOD';
  if (n <= 60) return 'WARNING';
  return 'DANGER';
}

function getColor(level, online) {
  if (!online) return '#777777';
  if (level === null || level === undefined || Number.isNaN(Number(level))) return '#777777';
  const n = Number(level);
  if (n <= 20) return '#00cc66';
  if (n <= 60) return '#ffaa00';
  return '#ff3333';
}

function auth(req, res, next) {
  const key = req.header('x-api-key');
  if (key !== API_KEY) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }
  next();
}

app.get('/health', (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

app.post('/api/update', auth, (req, res) => {
  const { deviceId, name, waterLevel, temperatureC, humidity, dhtError, rawLow, rawHigh } = req.body || {};
  if (!deviceId) {
    return res.status(400).json({ ok: false, error: 'Missing deviceId' });
  }

  const level = Number(waterLevel);
  const normalizedLevel = Number.isFinite(level) ? Math.max(0, Math.min(100, Math.round(level))) : null;
  const now = Date.now();

  const item = {
    deviceId,
    name: name || deviceId,
    waterLevel: normalizedLevel,
    status: getStatus(normalizedLevel),
    temperatureC: Number.isFinite(Number(temperatureC)) ? Number(temperatureC) : null,
    humidity: Number.isFinite(Number(humidity)) ? Number(humidity) : null,
    dhtError: dhtError || null,
    rawLow: Array.isArray(rawLow) ? rawLow : [],
    rawHigh: Array.isArray(rawHigh) ? rawHigh : [],
    lastSeen: now,
    lastSeenText: new Date(now).toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' })
  };

  devices.set(deviceId, item);

  if (!history.has(deviceId)) history.set(deviceId, []);
  const arr = history.get(deviceId);
  arr.push({
    t: now,
    level: normalizedLevel,
    temperatureC: item.temperatureC,
    humidity: item.humidity,
    status: item.status
  });

  while (arr.length > MAX_HISTORY) arr.shift();

  res.json({ ok: true, received: item });
});

app.get('/api/devices', (req, res) => {
  const now = Date.now();

  const result = Array.from(devices.values()).map((d) => {
    const online = now - d.lastSeen <= OFFLINE_AFTER_MS;
    return {
      ...d,
      online,
      color: getColor(d.waterLevel, online),
      secondsAgo: Math.round((now - d.lastSeen) / 1000)
    };
  }).sort((a, b) => {
    if (a.online !== b.online) return a.online ? -1 : 1;
    return (b.waterLevel || 0) - (a.waterLevel || 0);
  });

  res.json({ ok: true, devices: result, serverTime: new Date().toISOString() });
});

app.get('/api/history/:deviceId', (req, res) => {
  const arr = history.get(req.params.deviceId) || [];
  res.json({ ok: true, deviceId: req.params.deviceId, history: arr });
});

app.get('/', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Water Cloud Monitor</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: Arial, sans-serif;
      background: #0d1117;
      color: #fff;
      min-height: 100vh;
    }
    header {
      padding: 22px 16px;
      background: linear-gradient(135deg, #161b22, #0d1117);
      border-bottom: 1px solid #30363d;
      position: sticky;
      top: 0;
      z-index: 5;
    }
    h1 { margin: 0; font-size: 26px; }
    .subtitle { color: #8b949e; margin-top: 6px; font-size: 14px; }
    .wrap { padding: 16px; max-width: 1100px; margin: auto; }
    .summary {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 10px;
      margin-bottom: 16px;
    }
    .summaryBox, .card {
      background: #161b22;
      border: 1px solid #30363d;
      border-radius: 18px;
      box-shadow: 0 10px 35px rgba(0,0,0,.25);
    }
    .summaryBox { padding: 14px; text-align: center; }
    .summaryBox b { font-size: 26px; display: block; }
    .summaryBox span { color: #8b949e; font-size: 13px; }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      gap: 16px;
    }
    .card { padding: 18px; text-align: center; }
    .topLine { display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:12px; }
    .deviceName { font-size: 20px; font-weight: bold; text-align:right; }
    .badge { padding: 7px 10px; border-radius:999px; background:#222; font-size:12px; white-space:nowrap; }
    .circle {
      width: 190px;
      height: 190px;
      margin: 18px auto;
      border-radius: 50%;
      display:flex;
      align-items:center;
      justify-content:center;
      background: conic-gradient(var(--c) var(--p), #30363d var(--p));
    }
    .inner {
      width: 142px;
      height: 142px;
      border-radius: 50%;
      background:#0d1117;
      display:flex;
      flex-direction:column;
      align-items:center;
      justify-content:center;
      border:1px solid #30363d;
    }
    .percent { font-size:42px; font-weight:bold; }
    .small { color:#8b949e; font-size:13px; }
    .status { font-size:22px; font-weight:bold; margin-top:8px; }
    .sensorRow {
      display:grid;
      grid-template-columns:1fr 1fr;
      gap:10px;
      margin-top:14px;
    }
    .sensorBox {
      background:#0d1117;
      border:1px solid #30363d;
      border-radius:14px;
      padding:10px;
    }
    .sensorBox b { display:block; font-size:22px; }
    .sensorBox span { color:#8b949e; font-size:12px; }
    .meta { margin-top: 12px; color:#8b949e; font-size:13px; line-height:1.6; }
    .empty { text-align:center; color:#8b949e; padding:40px 10px; }
    button {
      border:0;
      background:#238636;
      color:white;
      border-radius:12px;
      padding:10px 14px;
      font-weight:bold;
    }
    @media (max-width: 600px) {
      .summary { grid-template-columns: 1fr; }
      h1 { font-size: 22px; }
    }
  </style>
</head>
<body>
  <header>
    <h1>מערכת ניטור הצפה בענן</h1>
    <div class="subtitle">מפלס מים + DHT11 · 0% תקין ירוק · 100% מסוכן אדום · מתעדכן אוטומטית</div>
  </header>

  <main class="wrap">
    <div class="summary">
      <div class="summaryBox"><b id="onlineCount">0</b><span>מחוברים</span></div>
      <div class="summaryBox"><b id="dangerCount">0</b><span>התראות</span></div>
      <div class="summaryBox"><b id="totalCount">0</b><span>סה״כ התקנים</span></div>
    </div>

    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;gap:10px;">
      <div class="small" id="lastUpdate">ממתין לנתונים...</div>
      <button onclick="loadData()">רענון</button>
    </div>

    <div class="grid" id="devices"></div>
  </main>

<script>
async function loadData() {
  try {
    const res = await fetch('/api/devices', { cache: 'no-store' });
    const data = await res.json();
    const devices = data.devices || [];

    document.getElementById('totalCount').textContent = devices.length;
    document.getElementById('onlineCount').textContent = devices.filter(d => d.online).length;
    document.getElementById('dangerCount').textContent = devices.filter(d => d.online && d.waterLevel > 60).length;
    document.getElementById('lastUpdate').textContent = 'עודכן: ' + new Date().toLocaleString('he-IL');

    const root = document.getElementById('devices');

    if (!devices.length) {
      root.innerHTML = '<div class="empty">אין עדיין נתונים. הפעל את סקריפט ה־Raspberry Pi.</div>';
      return;
    }

    root.innerHTML = devices.map(d => {
      const level = d.waterLevel == null ? 0 : d.waterLevel;
      const onlineText = d.online ? 'ONLINE' : 'OFFLINE';
      const opacity = d.online ? '1' : '.55';

      return \`<div class="card" style="opacity:\${opacity}">
        <div class="topLine">
          <div class="deviceName">\${escapeHtml(d.name || d.deviceId)}</div>
          <div class="badge">\${onlineText}</div>
        </div>

        <div class="circle" style="--c:\${d.color};--p:\${level}%">
          <div class="inner">
            <div class="percent">\${level}%</div>
            <div class="small">WATER</div>
          </div>
        </div>

        <div class="status" style="color:\${d.color}">\${d.online ? d.status : 'OFFLINE'}</div>

        <div class="sensorRow">
          <div class="sensorBox">
            <b>\${d.temperatureC == null ? '--' : d.temperatureC + '°C'}</b>
            <span>טמפרטורה</span>
          </div>
          <div class="sensorBox">
            <b>\${d.humidity == null ? '--' : d.humidity + '%'}</b>
            <span>לחות</span>
          </div>
        </div>

        <div class="meta">
          \${d.dhtError ? 'DHT11: ' + escapeHtml(d.dhtError) + '<br />' : ''}
          מזהה: \${escapeHtml(d.deviceId)}<br />
          נראה לאחרונה: \${d.secondsAgo} שניות<br />
          \${escapeHtml(d.lastSeenText || '')}
        </div>
      </div>\`;
    }).join('');
  } catch (err) {
    document.getElementById('devices').innerHTML = '<div class="empty">שגיאה בטעינת נתונים</div>';
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
}

loadData();
setInterval(loadData, 3000);
</script>
</body>
</html>`);
});

app.listen(PORT, () => {
  console.log(`Water monitor server running on port ${PORT}`);
});     