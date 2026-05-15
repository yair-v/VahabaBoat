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
const MAX_HISTORY = 500;

function getStatus(level) {
  if (level === null || level === undefined || Number.isNaN(Number(level))) return 'SENSOR ERROR';
  const n = Number(level);
  if (n <= 20) return 'GOOD';
  if (n <= 60) return 'WARNING';
  return 'DANGER';
}

function getColor(level, online) {
  if (!online) return '#64748b';
  if (level === null || level === undefined || Number.isNaN(Number(level))) return '#64748b';
  const n = Number(level);
  if (n <= 20) return '#22c55e';
  if (n <= 60) return '#f59e0b';
  return '#ef4444';
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
  const {
    deviceId,
    name,
    waterLevel,
    temperatureC,
    humidity,
    dhtError,
    rawLow,
    rawHigh
  } = req.body || {};

  if (!deviceId) {
    return res.status(400).json({ ok: false, error: 'Missing deviceId' });
  }

  const level = Number(waterLevel);
  const normalizedLevel = Number.isFinite(level)
    ? Math.max(0, Math.min(100, Math.round(level)))
    : null;

  const tempValue = Number.isFinite(Number(temperatureC)) ? Number(temperatureC) : null;
  const humValue = Number.isFinite(Number(humidity)) ? Number(humidity) : null;
  const now = Date.now();

  const item = {
    deviceId,
    name: name || deviceId,
    waterLevel: normalizedLevel,
    status: getStatus(normalizedLevel),
    temperatureC: tempValue,
    humidity: humValue,
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
    temperatureC: tempValue,
    humidity: humValue,
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
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
  <title>Vahaba Boat Monitor</title>
  <style>
    * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
    :root {
      --bg0: #07111f;
      --bg1: #101b2e;
      --card: rgba(22, 34, 55, 0.92);
      --card2: rgba(15, 23, 42, 0.98);
      --line: rgba(148, 163, 184, 0.20);
      --text: #f8fafc;
      --muted: #94a3b8;
      --good: #22c55e;
      --warn: #f59e0b;
      --bad: #ef4444;
      --cyan: #22d3ee;
      --purple: #d946ef;
    }

    html, body {
      margin: 0;
      padding: 0;
      min-height: 100vh;
      background:
        radial-gradient(circle at 50% -10%, rgba(34, 211, 238, 0.20), transparent 32%),
        radial-gradient(circle at 10% 20%, rgba(59, 130, 246, 0.16), transparent 34%),
        linear-gradient(180deg, var(--bg1), var(--bg0));
      color: var(--text);
      font-family: Arial, Helvetica, sans-serif;
      overflow-x: hidden;
    }

    body { padding-bottom: 20px; }

    .header {
      padding: max(14px, env(safe-area-inset-top)) 16px 12px;
      background: rgba(7, 17, 31, 0.78);
      backdrop-filter: blur(18px);
      border-bottom: 1px solid var(--line);
      position: sticky;
      top: 0;
      z-index: 20;
    }

    .title {
      text-align: center;
      font-size: 24px;
      font-weight: 900;
      letter-spacing: 0.4px;
      line-height: 1.1;
    }

    .subtitle {
      text-align: center;
      margin-top: 6px;
      color: var(--muted);
      font-size: 13px;
      direction: ltr;
    }

    .wrap {
      width: 100%;
      max-width: 1180px;
      margin: 0 auto;
      padding: 14px 12px 22px;
    }

    .alarm {
      display: none;
      margin: 2px 0 12px;
      padding: 12px 14px;
      border-radius: 18px;
      background: linear-gradient(135deg, rgba(127, 29, 29, 0.98), rgba(239, 68, 68, 0.92));
      color: white;
      font-weight: 900;
      box-shadow: 0 16px 34px rgba(239, 68, 68, 0.22);
      border: 1px solid rgba(255,255,255,0.16);
    }
    .alarm.show { display: block; }

    .waterScroller {
      overflow-x: auto;
      overflow-y: hidden;
      scroll-snap-type: x mandatory;
      -webkit-overflow-scrolling: touch;
      padding: 2px 0 10px;
    }

    .waterScroller::-webkit-scrollbar { height: 6px; }
    .waterScroller::-webkit-scrollbar-thumb { background: rgba(148,163,184,0.35); border-radius: 999px; }

    .waterPages {
      display: grid;
      grid-auto-flow: column;
      grid-auto-columns: 100%;
      gap: 16px;
    }

    .waterPage {
      scroll-snap-align: start;
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
      min-height: 430px;
    }

    .card {
      min-height: 205px;
      border-radius: 28px;
      background:
        radial-gradient(circle at 50% 8%, rgba(34, 211, 238, 0.10), transparent 42%),
        linear-gradient(180deg, rgba(40, 54, 82, 0.96), rgba(13, 23, 39, 0.98));
      border: 1px solid var(--line);
      box-shadow:
        0 18px 38px rgba(0,0,0,0.28),
        inset 0 0 0 1px rgba(255,255,255,0.03);
      padding: 14px 10px 13px;
      position: relative;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: space-between;
    }

    .card.offline { opacity: .48; filter: grayscale(.35); }

    .dot {
      position: absolute;
      top: 14px;
      right: 14px;
      width: 12px;
      height: 12px;
      border-radius: 50%;
      background: var(--good);
      box-shadow: 0 0 14px currentColor;
    }
    .dot.offline { background: #64748b; box-shadow: none; }

    .name {
      text-align: center;
      min-height: 38px;
      padding: 0 20px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 900;
      color: #dbeafe;
      font-size: 15px;
      line-height: 1.25;
      z-index: 2;
    }

    .gauge {
      width: 154px;
      height: 82px;
      overflow: hidden;
      position: relative;
      margin-top: 4px;
    }

    .arc {
      width: 154px;
      height: 154px;
      border-radius: 50%;
      position: absolute;
      left: 0;
      top: 0;
      background:
        conic-gradient(from 270deg,
          var(--c) calc(var(--v) * 0.5%),
          rgba(51,65,85,0.98) 0 50%,
          transparent 0);
      filter: drop-shadow(0 0 15px var(--c));
    }

    .arc:after {
      content: "";
      position: absolute;
      inset: 16px;
      border-radius: 50%;
      background: #101b2e;
      border: 1px solid rgba(255,255,255,0.06);
      box-shadow: inset 0 0 20px rgba(0,0,0,0.28);
    }

    .value {
      margin-top: -7px;
      font-size: 45px;
      line-height: 1;
      font-weight: 900;
      direction: ltr;
      letter-spacing: -1px;
      z-index: 2;
    }

    .value span {
      font-size: 21px;
      opacity: .9;
      margin-left: 2px;
    }

    .mini {
      display: flex;
      justify-content: center;
      align-items: center;
      gap: 10px;
      direction: ltr;
      font-size: 15px;
      font-weight: 900;
      margin-top: 2px;
      z-index: 2;
    }

    .t { color: #5eead4; }
    .h { color: #f0abfc; }

    .state {
      margin-top: 3px;
      font-size: 14px;
      font-weight: 900;
      color: var(--good);
      z-index: 2;
    }
    .state.bad { color: #f87171; }
    .seen { margin-top: 2px; color: #cbd5e1; font-size: 12px; z-index: 2; }

    .hint {
      color: var(--muted);
      text-align: center;
      margin: -2px 0 12px;
      font-size: 12px;
    }

    .chartCard {
      margin-top: 8px;
      border-radius: 28px;
      background:
        radial-gradient(circle at top, rgba(217, 70, 239, 0.12), transparent 36%),
        linear-gradient(180deg, rgba(40, 54, 82, 0.96), rgba(15, 23, 42, 0.98));
      border: 1px solid var(--line);
      box-shadow: 0 18px 38px rgba(0,0,0,0.28);
      padding: 15px 12px 16px;
    }

    .chartHead {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      margin-bottom: 10px;
    }

    .chartTitle {
      font-weight: 900;
      font-size: 17px;
      color: #e2e8f0;
    }

    .live {
      color: #4ade80;
      font-size: 12px;
      font-weight: 900;
      direction: ltr;
    }

    .legend {
      display: flex;
      gap: 14px;
      align-items: center;
      flex-wrap: wrap;
      margin-bottom: 10px;
      font-size: 14px;
      font-weight: 900;
      color: #e5e7eb;
    }

    .legendItem { display: inline-flex; align-items: center; gap: 6px; }
    .legendColor { width: 14px; height: 14px; border-radius: 5px; display: inline-block; }

    canvas {
      width: 100%;
      height: 270px;
      border-radius: 18px;
      background: #253044;
      border: 1px solid rgba(255,255,255,0.14);
      box-shadow: inset 0 0 28px rgba(0,0,0,0.20);
    }

    .empty {
      grid-column: 1 / -1;
      min-height: 190px;
      border-radius: 28px;
      background: linear-gradient(180deg, rgba(40,54,82,.95), rgba(15,23,42,.96));
      border: 1px solid var(--line);
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--muted);
      font-weight: 800;
      text-align: center;
      padding: 24px;
    }

    @media (max-width: 430px) {
      .wrap { padding-left: 10px; padding-right: 10px; }
      .waterPage { gap: 10px; min-height: 410px; }
      .card { min-height: 194px; border-radius: 24px; padding: 12px 8px; }
      .gauge { width: 138px; height: 74px; }
      .arc { width: 138px; height: 138px; }
      .value { font-size: 40px; }
      canvas { height: 252px; }
    }
  </style>
</head>

<body>
  <header class="header">
    <div class="title">Vahaba Boat</div>
    <div class="subtitle">Water Level · Temperature · Humidity</div>
  </header>

  <main class="wrap">
    <div id="alarm" class="alarm">⚠️ התראה פעילה</div>

    <section class="waterScroller">
      <div id="waterPages" class="waterPages">
        <div class="empty">ממתין לנתונים מה־Raspberry Pi...</div>
      </div>
    </section>

    <div class="hint">החלקה לצדדים מציגה עוד חיישנים · 4 חיישני מפלס בכל מסך</div>

    <section class="chartCard">
      <div class="chartHead">
        <div class="chartTitle">גרף טמפרטורה ולחות</div>
        <div class="live">LIVE</div>
      </div>

      <div class="legend">
        <span class="legendItem"><span class="legendColor" style="background:#5eead4"></span>טמפרטורה</span>
        <span class="legendItem"><span class="legendColor" style="background:#d946ef"></span>לחות</span>
      </div>

      <canvas id="chart" width="900" height="360"></canvas>
    </section>
  </main>

<script>
function chunk(arr, size) {
  var out = [];
  for (var i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>'"]/g, function(ch) {
    return {'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch];
  });
}

function colorByLevel(level, online) {
  if (!online) return '#64748b';
  var n = Number(level || 0);
  if (n <= 20) return '#22c55e';
  if (n <= 60) return '#f59e0b';
  return '#ef4444';
}

function renderCards(devices) {
  var root = document.getElementById('waterPages');

  if (!devices.length) {
    root.innerHTML = '<div class="empty">אין עדיין נתונים. הפעל את סקריפט ה־Raspberry Pi.</div>';
    return;
  }

  var pages = chunk(devices, 4);
  var html = '';

  pages.forEach(function(page) {
    html += '<div class="waterPage">';

    page.forEach(function(d) {
      var level = d.waterLevel == null ? 0 : Number(d.waterLevel);
      var color = colorByLevel(level, d.online);
      var offline = d.online ? '' : 'offline';
      var temp = d.temperatureC == null ? '--' : Number(d.temperatureC).toFixed(0);
      var hum = d.humidity == null ? '--' : Number(d.humidity).toFixed(0);
      var ok = d.online && level <= 20;
      var stateText = !d.online ? 'OFFLINE' : ok ? '✅ Water OK' : '❗ ' + escapeHtml(d.status || 'ALARM');

      html += '<article class="card ' + offline + '">';
      html += '<span class="dot ' + offline + '"></span>';
      html += '<div class="name">' + escapeHtml(d.name || d.deviceId) + '</div>';
      html += '<div class="gauge" style="--c:' + color + ';--v:' + level + '"><div class="arc"></div></div>';
      html += '<div class="value" style="color:' + (level > 60 ? '#f87171' : '#ffffff') + '">' + level + '<span>%</span></div>';
      html += '<div class="mini"><span class="t">' + temp + '°C</span><span class="h">' + hum + '%</span></div>';
      html += '<div class="state ' + (ok ? '' : 'bad') + '">' + stateText + '</div>';
      html += '<div class="seen">' + (d.online ? 'עודכן לפני ' + d.secondsAgo + ' שנ׳' : 'לא מחובר') + '</div>';
      html += '</article>';
    });

    html += '</div>';
  });

  root.innerHTML = html;
}

async function drawChart(deviceId) {
  var canvas = document.getElementById('chart');
  var ctx = canvas.getContext('2d');

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#253044';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  var padL = 65;
  var padR = 20;
  var padT = 24;
  var padB = 48;
  var w = canvas.width - padL - padR;
  var h = canvas.height - padT - padB;

  ctx.strokeStyle = 'rgba(255,255,255,0.24)';
  ctx.lineWidth = 1;
  ctx.font = '20px Arial';

  for (var i = 0; i <= 4; i++) {
    var y = padT + (h / 4) * i;
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(padL + w, y);
    ctx.stroke();
    ctx.fillStyle = '#f8fafc';
    ctx.fillText(String(Math.round(100 - i * 25)), 18, y + 6);
  }

  for (var j = 0; j <= 5; j++) {
    var x = padL + (w / 5) * j;
    ctx.beginPath();
    ctx.moveTo(x, padT);
    ctx.lineTo(x, padT + h);
    ctx.stroke();
  }

  if (!deviceId) {
    ctx.fillStyle = '#94a3b8';
    ctx.fillText('אין נתוני גרף עדיין', 330, 180);
    return;
  }

  try {
    var res = await fetch('/api/history/' + encodeURIComponent(deviceId), { cache: 'no-store' });
    var data = await res.json();
    var arr = (data.history || []).slice(-70);

    if (!arr.length) {
      ctx.fillStyle = '#94a3b8';
      ctx.fillText('אין היסטוריה עדיין', 345, 180);
      return;
    }

    function yByValue(v) {
      var n = Math.max(0, Math.min(100, Number(v || 0)));
      return padT + h - (n / 100) * h;
    }

    function drawLine(key, color, scaleTemp) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 4;
      ctx.beginPath();

      var started = false;

      arr.forEach(function(p, idx) {
        var value = p[key];
        if (value === null || value === undefined) return;
        if (scaleTemp) value = Number(value) * 2;

        var x = padL + (arr.length === 1 ? 0 : (w / (arr.length - 1)) * idx);
        var y = yByValue(value);

        if (!started) {
          ctx.moveTo(x, y);
          started = true;
        } else {
          ctx.lineTo(x, y);
        }
      });

      ctx.stroke();
    }

    drawLine('temperatureC', '#5eead4', true);
    drawLine('humidity', '#d946ef', false);

    ctx.fillStyle = '#94a3b8';
    var first = new Date(arr[0].t);
    var last = new Date(arr[arr.length - 1].t);

    ctx.fillText(first.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' }), padL, canvas.height - 14);
    ctx.fillText(last.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' }), canvas.width - 110, canvas.height - 14);
  } catch (err) {
    ctx.fillStyle = '#ef4444';
    ctx.fillText('שגיאה בטעינת גרף', 340, 180);
  }
}

async function loadData() {
  try {
    var res = await fetch('/api/devices', { cache: 'no-store' });
    var data = await res.json();
    var devices = data.devices || [];

    var hasAlarm = devices.some(function(d) {
      return d.online && Number(d.waterLevel || 0) > 20;
    });

    var alarm = document.getElementById('alarm');
    alarm.classList.toggle('show', hasAlarm);
    alarm.textContent = hasAlarm ? '⚠️ התראת מפלס מים פעילה' : '';

    renderCards(devices);

    var graphDevice = devices.find(function(d) {
      return d.temperatureC != null || d.humidity != null;
    }) || devices[0];

    drawChart(graphDevice ? graphDevice.deviceId : null);
  } catch (err) {
    document.getElementById('waterPages').innerHTML = '<div class="empty">שגיאה בטעינת נתונים</div>';
  }
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
