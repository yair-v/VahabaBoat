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
const MAX_HISTORY = 600;

function normalizeWater(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : null;
}

function normalizeTemp(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  if (n <= 0 || n > 80) return null;
  return Math.round(n * 10) / 10;
}

function normalizeHum(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  if (n <= 0 || n > 100) return null;
  return Math.round(n);
}

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
  if (key !== API_KEY) return res.status(401).json({ ok: false, error: 'Unauthorized' });
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

  const normalizedLevel = normalizeWater(waterLevel);
  const tempValue = normalizeTemp(temperatureC);
  const humValue = normalizeHum(humidity);
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
      --bg0:#06101f; --bg1:#111c31; --card:#162237; --card2:#0f172a;
      --line:rgba(148,163,184,.22); --text:#f8fafc; --muted:#94a3b8;
      --good:#22c55e; --warn:#f59e0b; --bad:#ef4444; --cyan:#5eead4; --purple:#d946ef;
    }
    html,body{
      margin:0; padding:0; min-height:100vh; overflow-x:hidden; color:var(--text);
      font-family:Arial, Helvetica, sans-serif;
      background:
        radial-gradient(circle at 50% -10%, rgba(34,211,238,.22), transparent 30%),
        linear-gradient(180deg,var(--bg1),var(--bg0));
    }
    body{padding-bottom:20px}
    .header{
      position:sticky; top:0; z-index:20;
      padding:max(14px,env(safe-area-inset-top)) 16px 13px;
      background:rgba(7,17,31,.84); backdrop-filter:blur(16px);
      border-bottom:1px solid var(--line);
      box-shadow:0 8px 28px rgba(0,0,0,.25);
    }
    .title{text-align:center;font-size:25px;font-weight:900;letter-spacing:.4px;line-height:1.1}
    .subtitle{text-align:center;margin-top:6px;color:var(--muted);font-size:13px;direction:ltr}
    .wrap{width:100%;max-width:1160px;margin:0 auto;padding:14px 12px 22px}
    .alarm{
      display:none;margin:2px 0 12px;padding:12px 14px;border-radius:18px;
      background:linear-gradient(135deg,#7f1d1d,#ef4444);color:#fff;font-weight:900;
      box-shadow:0 16px 34px rgba(239,68,68,.22);border:1px solid rgba(255,255,255,.16)
    }
    .alarm.show{display:block}
    .waterScroller{overflow-x:auto;overflow-y:hidden;scroll-snap-type:x mandatory;-webkit-overflow-scrolling:touch;padding:2px 0 10px}
    .waterScroller::-webkit-scrollbar{height:6px}.waterScroller::-webkit-scrollbar-thumb{background:rgba(148,163,184,.35);border-radius:999px}
    .waterPages{display:grid;grid-auto-flow:column;grid-auto-columns:100%;gap:16px}
    .waterPage{scroll-snap-align:start;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;min-height:420px}
    .card{
      min-height:202px;border-radius:28px;padding:14px 10px 13px;position:relative;overflow:hidden;
      background:radial-gradient(circle at 50% 6%,rgba(34,211,238,.12),transparent 42%),linear-gradient(180deg,rgba(40,54,82,.96),rgba(13,23,39,.98));
      border:1px solid var(--line);
      box-shadow:0 18px 38px rgba(0,0,0,.28),inset 0 0 0 1px rgba(255,255,255,.03);
      display:flex;flex-direction:column;align-items:center;justify-content:space-between;
    }
    .card.offline{opacity:.48;filter:grayscale(.35)}
    .dot{position:absolute;top:14px;right:14px;width:12px;height:12px;border-radius:50%;background:var(--good);box-shadow:0 0 14px currentColor}
    .dot.offline{background:#64748b;box-shadow:none}
    .rename{
      position:absolute;top:9px;left:9px;border:0;border-radius:12px;padding:6px 8px;
      background:rgba(15,23,42,.58);color:#cbd5e1;font-size:12px;font-weight:800
    }
    .name{
      text-align:center;min-height:38px;padding:0 28px;display:flex;align-items:center;justify-content:center;
      font-weight:900;color:#dbeafe;font-size:15px;line-height:1.25;z-index:2;
      text-shadow:0 2px 8px rgba(0,0,0,.35)
    }
    .gauge{width:156px;height:84px;overflow:hidden;position:relative;margin-top:4px}
    .arc{
      width:156px;height:156px;border-radius:50%;position:absolute;left:0;top:0;
      background:conic-gradient(from 270deg,var(--c) calc(var(--v) * .5%),rgba(51,65,85,.98) 0 50%,transparent 0);
      filter:drop-shadow(0 0 16px var(--c));
    }
    .arc:after{
      content:"";position:absolute;inset:17px;border-radius:50%;background:#101b2e;
      border:1px solid rgba(255,255,255,.06);box-shadow:inset 0 0 20px rgba(0,0,0,.28)
    }
    .needle{
      position:absolute;left:50%;bottom:0;width:3px;height:63px;border-radius:999px;background:#e2e8f0;
      transform-origin:50% 100%;transform:rotate(calc(-90deg + var(--v) * 1.8deg));opacity:.86;
      box-shadow:0 0 10px rgba(255,255,255,.45)
    }
    .needle:after{content:"";position:absolute;bottom:-6px;left:50%;transform:translateX(-50%);width:13px;height:13px;border-radius:50%;background:#e2e8f0}
    .value{margin-top:-7px;font-size:45px;line-height:1;font-weight:900;direction:ltr;letter-spacing:-1px;z-index:2}
    .value span{font-size:21px;opacity:.9;margin-left:2px}
    .state{margin-top:3px;font-size:15px;font-weight:900;color:var(--good);z-index:2}
    .state.bad{color:#f87171}.seen{margin-top:2px;color:#cbd5e1;font-size:12px;z-index:2}
    .hint{color:var(--muted);text-align:center;margin:-2px 0 12px;font-size:12px}
    .chartCard{
      margin-top:8px;border-radius:28px;padding:15px 12px 16px;
      background:radial-gradient(circle at top,rgba(217,70,239,.12),transparent 36%),linear-gradient(180deg,rgba(40,54,82,.96),rgba(15,23,42,.98));
      border:1px solid var(--line);box-shadow:0 18px 38px rgba(0,0,0,.28)
    }
    .chartHead{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:10px}
    .chartTitle{font-weight:900;font-size:17px;color:#e2e8f0}.live{color:#4ade80;font-size:12px;font-weight:900;direction:ltr}
    .legend{display:flex;gap:14px;align-items:center;flex-wrap:wrap;margin-bottom:10px;font-size:14px;font-weight:900;color:#e5e7eb}
    .legendItem{display:inline-flex;align-items:center;gap:6px}.legendColor{width:14px;height:14px;border-radius:5px;display:inline-block}
    canvas{width:100%;height:300px;border-radius:18px;background:#253044;border:1px solid rgba(255,255,255,.14);box-shadow:inset 0 0 28px rgba(0,0,0,.20)}
    .empty{
      grid-column:1/-1;min-height:190px;border-radius:28px;background:linear-gradient(180deg,rgba(40,54,82,.95),rgba(15,23,42,.96));
      border:1px solid var(--line);display:flex;align-items:center;justify-content:center;color:var(--muted);font-weight:800;text-align:center;padding:24px
    }
    @media (max-width:430px){
      .wrap{padding-left:10px;padding-right:10px}.waterPage{gap:10px;min-height:410px}.card{min-height:194px;border-radius:24px;padding:12px 8px}
      .gauge{width:140px;height:76px}.arc{width:140px;height:140px}.value{font-size:40px}canvas{height:280px}.name{font-size:14px}
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

    <div class="hint">יאיר והבה</div>

    <section class="chartCard">
      <div class="chartHead">
        <div class="chartTitle">גרף טמפרטורה ולחות</div>
        <div class="live">LIVE</div>
      </div>

      <div class="legend">
     <span class="legendItem">
  <span class="legendColor" style="background:#5eead4"></span>
  טמפרטורה C = <span id="currentTemp">--</span>
</span>

<span class="legendItem">
  <span class="legendColor" style="background:#d946ef"></span>
  לחות % = <span id="currentHum">--</span>
</span>
      </div>

      <canvas id="chart" width="900" height="400"></canvas>
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

function defaultWaterName(index) {
  return 'חיישן הצפה מספר ' + (index + 1);
}

function nameKey(deviceId) {
  return 'waterName_' + deviceId;
}

function getDisplayName(device, index) {
  return localStorage.getItem(nameKey(device.deviceId)) || defaultWaterName(index);
}

function renameDevice(deviceId, currentName) {
  var next = prompt('שם חדש לחיישן:', currentName || '');
  if (!next) return;
  localStorage.setItem(nameKey(deviceId), next.trim());
  loadData();
}

function renderCards(devices) {
  var root = document.getElementById('waterPages');

  if (!devices.length) {
    root.innerHTML = '<div class="empty">אין עדיין נתונים. הפעל את סקריפט ה־Raspberry Pi.</div>';
    return;
  }

  var pages = chunk(devices, 4);
  var html = '';

  pages.forEach(function(page, pageIndex) {
    html += '<div class="waterPage">';

    page.forEach(function(d, localIndex) {
      var index = pageIndex * 4 + localIndex;
      var displayName = getDisplayName(d, index);
      var level = d.waterLevel == null ? 0 : Number(d.waterLevel);
      var color = colorByLevel(level, d.online);
      var offline = d.online ? '' : 'offline';
      var ok = d.online && level <= 20;
      var stateText = !d.online ? 'OFFLINE' : ok ? '✅ תקין' : '❗ ' + escapeHtml(d.status || 'ALARM');

      html += '<article class="card ' + offline + '">';
      html += '<button class="rename" onclick="renameDevice(\\'' + escapeHtml(d.deviceId) + '\\',\\'' + escapeHtml(displayName) + '\\')">✎</button>';
      html += '<span class="dot ' + offline + '"></span>';
      html += '<div class="name">' + escapeHtml(displayName) + '</div>';
      html += '<div class="gauge" style="--c:' + color + ';--v:' + level + '"><div class="arc"></div><div class="needle"></div></div>';
      html += '<div class="value" style="color:' + (level > 60 ? '#f87171' : '#ffffff') + '">' + level + '<span>%</span></div>';
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

  var left = 62;
  var right = 62;
  var top = 28;
  var bottom = 54;
  var w = canvas.width - left - right;
  var h = canvas.height - top - bottom;

  ctx.font = '18px Arial';
  ctx.lineWidth = 1;

  function yTemp(v) {
    var n = Math.max(0, Math.min(60, Number(v)));
    return top + h - (n / 60) * h;
  }

  function yHum(v) {
    var n = Math.max(0, Math.min(100, Number(v)));
    return top + h - (n / 100) * h;
  }

  ctx.strokeStyle = 'rgba(255,255,255,0.22)';

  for (var i = 0; i <= 6; i++) {
    var tempVal = i * 10;
    var y = yTemp(tempVal);

    ctx.beginPath();
    ctx.moveTo(left, y);
    ctx.lineTo(left + w, y);
    ctx.stroke();

    ctx.fillStyle = '#5eead4';
    ctx.fillText(String(tempVal), 18, y + 6);
  }

  for (var j = 0; j <= 4; j++) {
    var humVal = j * 25;
    var yy = yHum(humVal);

    ctx.fillStyle = '#d946ef';
    ctx.fillText(String(humVal), canvas.width - 46, yy + 6);
  }

  for (var xg = 0; xg <= 5; xg++) {
    var x = left + (w / 5) * xg;
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x, top + h);
    ctx.stroke();
  }

  ctx.fillStyle = '#5eead4';
  ctx.fillText('°C', 18, 20);
  ctx.fillStyle = '#d946ef';
  ctx.fillText('%', canvas.width - 36, 20);

  if (!deviceId) {
    ctx.fillStyle = '#94a3b8';
    ctx.fillText('אין נתוני גרף עדיין', 330, 190);
    return;
  }

  try {
    var res = await fetch('/api/history/' + encodeURIComponent(deviceId), { cache: 'no-store' });
    var data = await res.json();

    var arr = (data.history || []).filter(function(p) {
      return p.temperatureC !== null || p.humidity !== null;
    }).slice(-80);

    if (!arr.length) {
      ctx.fillStyle = '#94a3b8';
      ctx.fillText('אין היסטוריה עדיין', 350, 190);
      return;
    }

    function smoothLine(points, color) {
      if (points.length < 2) return;

      ctx.strokeStyle = color;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);

      for (var i = 1; i < points.length - 1; i++) {
        var xc = (points[i].x + points[i + 1].x) / 2;
        var yc = (points[i].y + points[i + 1].y) / 2;
        ctx.quadraticCurveTo(points[i].x, points[i].y, xc, yc);
      }

      var last = points[points.length - 1];
      ctx.lineTo(last.x, last.y);
      ctx.stroke();
    }

    var tempPoints = [];
    var humPoints = [];

    arr.forEach(function(p, idx) {
      var x = left + (arr.length === 1 ? 0 : (w / (arr.length - 1)) * idx);

      if (p.temperatureC !== null && p.temperatureC !== undefined) {
        tempPoints.push({ x: x, y: yTemp(p.temperatureC) });
      }

      if (p.humidity !== null && p.humidity !== undefined) {
        humPoints.push({ x: x, y: yHum(p.humidity) });
      }
    });

    smoothLine(tempPoints, '#5eead4');
    smoothLine(humPoints, '#d946ef');

    ctx.fillStyle = '#94a3b8';
    var first = new Date(arr[0].t);
    var last = new Date(arr[arr.length - 1].t);

    ctx.fillText(first.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' }), left, canvas.height - 16);
    ctx.fillText(last.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' }), canvas.width - 120, canvas.height - 16);

  } catch (err) {
    ctx.fillStyle = '#ef4444';
    ctx.fillText('שגיאה בטעינת גרף', 340, 190);
  }
}

async function loadData() {
  try {
    var res = await fetch('/api/devices', { cache: 'no-store' });
    var data = await res.json();
    var devices = data.devices || [];

  var alarm = document.getElementById('alarm');

alarm.classList.remove('show');
alarm.textContent = '';

if (!devices.length) {
  alarm.classList.add('show');
  alarm.textContent = '⚠️ אין נתונים מהמערכת';
}

else if (devices.every(function(d) {
  return !d.online;
})) {
  alarm.classList.add('show');
  alarm.textContent = '⚠️ Raspberry Pi מנותק / לא משדר';
}

else if (devices.some(function(d) {
  return d.online && d.dhtError;
})) {
  alarm.classList.add('show');
  alarm.textContent = '⚠️ חיישן טמפרטורה / לחות מנותק';
}

else if (devices.some(function(d) {
  return d.online && d.waterLevel === null;
})) {
  alarm.classList.add('show');
  alarm.textContent = '⚠️ חיישן הצפה מנותק';
}

else if (devices.some(function(d) {
  return d.online && Number(d.waterLevel || 0) > 20;
})) {
  alarm.classList.add('show');
  alarm.textContent = '⚠️ התראת מפלס מים פעילה';
}

    renderCards(devices);

    var graphDevice = devices.find(function(d) {
  return d.online &&
         (d.temperatureC !== null || d.humidity !== null);
});

if (!graphDevice) {
  document.getElementById('currentTemp').textContent = '--';
  document.getElementById('currentHum').textContent = '--';

  document.getElementById('alarm').classList.add('show');
  document.getElementById('alarm').textContent =
    '⚠️ מערכת הניטור מנותקת';

  drawChart(null);
  return;
}
document.getElementById('currentTemp').textContent =
  graphDevice && graphDevice.temperatureC !== null ? graphDevice.temperatureC : '--';

document.getElementById('currentHum').textContent =
  graphDevice && graphDevice.humidity !== null ? graphDevice.humidity : '--';

  const tooOld = graphDevice.secondsAgo > 600;

if (tooOld) {
  document.getElementById('alarm').classList.add('show');
  document.getElementById('alarm').textContent =
    '⚠️ חיישן לא שידר מעל 10 דקות';

  drawChart(null);
} else {
  drawChart(graphDevice.deviceId);
}
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
