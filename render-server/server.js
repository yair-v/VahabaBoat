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

  if (!deviceId) return res.status(400).json({ ok: false, error: 'Missing deviceId' });

  const level = Number(waterLevel);
  const normalizedLevel = Number.isFinite(level) ? Math.max(0, Math.min(100, Math.round(level))) : null;
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
  arr.push({ t: now, level: normalizedLevel, temperatureC: tempValue, humidity: humValue, status: item.status });
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

const html = `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
  <title>Vahaba Boat Monitor</title>
  <style>
    * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
    :root {
      --bg:#0f172a; --panel:#1e2a3f; --line:rgba(148,163,184,.22);
      --text:#f8fafc; --muted:#94a3b8; --green:#22c55e; --red:#ef4444;
      --orange:#f59e0b; --cyan:#22d3ee; --purple:#d946ef;
    }
    html,body{
      margin:0; padding:0; color:var(--text); font-family:Arial,Helvetica,sans-serif;
      min-height:100vh; overflow-x:hidden;
      background:radial-gradient(circle at top,rgba(56,189,248,.16),transparent 32%),linear-gradient(180deg,#111c31,#0f172a);
    }
    body{padding-bottom:20px}
    .appHeader{
      position:sticky; top:0; z-index:10;
      padding:max(12px,env(safe-area-inset-top)) 14px 12px;
      background:rgba(17,28,49,.94); backdrop-filter:blur(14px);
      border-bottom:1px solid var(--line); box-shadow:0 8px 24px rgba(0,0,0,.24);
    }
    .headerTitle{text-align:center;font-size:23px;font-weight:900;letter-spacing:.2px;line-height:1.2}
    .headerSub{margin-top:4px;text-align:center;color:var(--muted);font-size:13px;direction:ltr}
    .wrap{padding:14px 12px 18px;max-width:1200px;margin:0 auto}
    .alertBar{
      display:none;margin:0 0 12px;padding:11px 14px;border-radius:16px;
      background:linear-gradient(135deg,#991b1b,#ef4444);color:#fff;
      border:1px solid rgba(255,255,255,.18);font-size:15px;font-weight:800;
      box-shadow:0 12px 28px rgba(239,68,68,.22)
    }
    .alertBar.show{display:block}
    .waterScroller{
      overflow-x:auto;overflow-y:hidden;scroll-snap-type:x mandatory;-webkit-overflow-scrolling:touch;padding:2px 0 10px
    }
    .waterScroller::-webkit-scrollbar{height:5px}
    .waterScroller::-webkit-scrollbar-thumb{background:rgba(148,163,184,.4);border-radius:999px}
    .waterPages{display:grid;grid-auto-flow:column;grid-auto-columns:100%;gap:14px}
    .waterPage{scroll-snap-align:start;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;min-height:416px}
    .gaugeCard{
      position:relative;overflow:hidden;min-height:198px;padding:14px 10px 12px;border-radius:24px;
      background:linear-gradient(180deg,rgba(45,59,87,.95),rgba(21,32,51,.98));
      border:1px solid var(--line);
      box-shadow:inset 0 0 0 1px rgba(255,255,255,.03),0 14px 32px rgba(0,0,0,.24);
      display:flex;flex-direction:column;align-items:center;justify-content:space-between
    }
    .gaugeCard:before{
      content:"";position:absolute;inset:-70px -70px auto auto;width:150px;height:150px;border-radius:50%;
      background:radial-gradient(circle,rgba(34,211,238,.18),transparent 70%)
    }
    .gaugeCard.offline{opacity:.55;filter:grayscale(.3)}
    .statusDot{position:absolute;top:13px;right:13px;width:13px;height:13px;border-radius:999px;background:var(--green);box-shadow:0 0 14px currentColor}
    .statusDot.offline{background:#64748b;box-shadow:none}
    .gaugeName{
      width:100%;min-height:38px;display:flex;align-items:center;justify-content:center;
      padding:0 18px;text-align:center;color:#dbeafe;font-size:15px;line-height:1.25;font-weight:800;z-index:1
    }
    .semiGauge{width:148px;height:78px;position:relative;overflow:hidden;margin-top:6px}
    .semiGaugeArc{
      width:148px;height:148px;border-radius:50%;
      background:conic-gradient(from 270deg,var(--gaugeColor) calc(var(--level) * .5%),rgba(51,65,85,.95) 0 50%,transparent 0);
      filter:drop-shadow(0 0 13px var(--gaugeColor));position:absolute;top:0;left:0
    }
    .semiGaugeArc:after{
      content:"";position:absolute;inset:15px;border-radius:50%;background:#151d2c;border:1px solid rgba(255,255,255,.06)
    }
    .gaugeValue{margin-top:-5px;font-size:43px;font-weight:900;color:var(--text);line-height:1;direction:ltr;z-index:1}
    .gaugeValue .unit{font-size:21px;font-weight:700;margin-left:2px;opacity:.9}
    .miniData{display:flex;gap:8px;align-items:center;justify-content:center;direction:ltr;font-size:15px;font-weight:800;min-height:24px;margin-top:3px;z-index:1}
    .temp{color:#5eead4}.hum{color:#f0abfc}
    .statusText{color:var(--green);font-size:15px;font-weight:900;margin-top:4px;z-index:1}
    .statusText.bad{color:#f87171}
    .offlineText{color:#cbd5e1;font-size:12px;margin-top:2px;z-index:1}
    .pageHint{text-align:center;color:var(--muted);font-size:12px;margin:-2px 0 12px}
    .chartPanel{
      background:linear-gradient(180deg,rgba(45,59,87,.95),rgba(30,42,63,.98));
      border:1px solid var(--line);border-radius:24px;padding:14px 12px 15px;
      box-shadow:0 14px 32px rgba(0,0,0,.24);margin-top:6px
    }
    .chartTitle{color:#e5e7eb;font-size:17px;font-weight:900;margin-bottom:8px;display:flex;align-items:center;justify-content:space-between;gap:8px}
    .chartLegend{display:flex;align-items:center;flex-wrap:wrap;gap:12px;color:var(--text);font-size:14px;font-weight:800;margin-bottom:9px}
    .legendItem{display:inline-flex;align-items:center;gap:6px}
    .legendColor{width:14px;height:14px;border-radius:5px;display:inline-block}
    canvas{width:100%;height:270px;background:#253044;border:1px solid rgba(255,255,255,.14);border-radius:16px;box-shadow:inset 0 0 26px rgba(0,0,0,.18)}
    .empty{
      grid-column:1/-1;background:linear-gradient(180deg,rgba(45,59,87,.95),rgba(21,32,51,.98));
      border-radius:22px;padding:34px 10px;text-align:center;color:var(--muted);border:1px solid var(--line)
    }
    @media(max-width:430px){
      .wrap{padding-left:10px;padding-right:10px}.waterPage{gap:10px;min-height:402px}
      .gaugeCard{min-height:190px;padding:12px 8px}.semiGauge{width:136px;height:72px}.semiGaugeArc{width:136px;height:136px}
      .gaugeValue{font-size:40px}.headerTitle{font-size:21px}canvas{height:250px}
    }
  </style>
</head>
<body>
  <header class="appHeader">
    <div class="headerTitle">Vahaba Boat</div>
    <div class="headerSub">Water Level · Temperature · Humidity</div>
  </header>
  <main class="wrap">
    <div id="alertBar" class="alertBar">⚠️ יש התראה פעילה</div>
    <section class="waterScroller">
      <div class="waterPages" id="waterPages">
        <div class="empty">ממתין לנתונים מה־Raspberry Pi...</div>
      </div>
    </section>
    <div class="pageHint">החלקה לצדדים מציגה עוד חיישנים · 4 חיישני מפלס בכל מסך</div>
    <section class="chartPanel">
      <div class="chartTitle"><span>גרף טמפרטורה ולחות</span><span style="color:#94a3b8;font-size:12px;font-weight:700;">Live</span></div>
      <div class="chartLegend">
        <span class="legendItem"><span class="legendColor" style="background:#5eead4"></span>טמפרטורה</span>
        <span class="legendItem"><span class="legendColor" style="background:#d946ef"></span>לחות</span>
      </div>
      <canvas id="sensorChart" width="900" height="360"></canvas>
    </section>
  </main>
<script>
var lastDevices = [];

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

function renderWaterDevices(devices) {
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
      var onlineClass = d.online ? '' : 'offline';
      var temp = d.temperatureC == null ? '--' : Number(d.temperatureC).toFixed(0);
      var hum = d.humidity == null ? '--' : Number(d.humidity).toFixed(0);
      var ok = d.online && level <= 20;
      var statusText = !d.online ? 'OFFLINE' : ok ? 'Water OK' : d.status;

      html += '<article class="gaugeCard ' + onlineClass + '">';
      html += '<span class="statusDot ' + onlineClass + '"></span>';
      html += '<div class="gaugeName">' + escapeHtml(d.name || d.deviceId) + '</div>';
      html += '<div class="semiGauge" style="--gaugeColor:' + color + ';--level:' + level + '"><div class="semiGaugeArc"></div></div>';
      html += '<div class="gaugeValue" style="color:' + (level > 60 ? '#f87171' : '#ffffff') + '">' + level + '<span class="unit">%</span></div>';
      html += '<div class="miniData"><span class="temp">' + temp + '°C</span><span class="hum">' + hum + '%</span></div>';
      html += '<div class="statusText ' + (ok ? '' : 'bad') + '">' + (d.online ? (ok ? '✅ Water OK' : '❗ ' + escapeHtml(statusText)) : 'OFFLINE') + '</div>';
      html += '<div class="offlineText">' + (d.online ? 'עודכן לפני ' + d.secondsAgo + ' שנ׳' : 'לא מחובר') + '</div>';
      html += '</article>';
    });

    var missing = Math.max(0, 4 - page.length);
    for (var i = 0; i < missing; i++) {
      html += '<article class="gaugeCard offline">';
      html += '<div class="gaugeName">פנוי</div>';
      html += '<div class="semiGauge" style="--gaugeColor:#64748b;--level:0"><div class="semiGaugeArc"></div></div>';
      html += '<div class="gaugeValue">--<span class="unit">%</span></div>';
      html += '<div class="offlineText">אין חיישן</div>';
      html += '</article>';
    }

    html += '</div>';
  });

  root.innerHTML = html;
}

async function drawChart(deviceId) {
  var canvas = document.getElementById('sensorChart');
  var ctx = canvas.getContext('2d');

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#253044';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  var padL = 65, padR = 20, padT = 24, padB = 48;
  var w = canvas.width - padL - padR;
  var h = canvas.height - padT - padB;

  ctx.strokeStyle = 'rgba(255,255,255,0.26)';
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
    var arr = (data.history || []).slice(-60);

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

    lastDevices = devices;

    var hasAlarm = devices.some(function(d) {
      return d.online && Number(d.waterLevel || 0) > 20;
    });

    var alertBar = document.getElementById('alertBar');
    alertBar.classList.toggle('show', hasAlarm);
    alertBar.textContent = hasAlarm ? '⚠️ התראת מפלס מים פעילה' : '';

    renderWaterDevices(devices);

    var firstWithDht = devices.find(function(d) {
      return d.temperatureC != null || d.humidity != null;
    }) || devices[0];

    drawChart(firstWithDht ? firstWithDht.deviceId : null);

  } catch (err) {
    document.getElementById('waterPages').innerHTML = '<div class="empty">שגיאה בטעינת נתונים</div>';
  }
}

loadData();
setInterval(loadData, 3000);
</script>
</body>
</html>`;

app.get('/', (req, res) => {
  res.send(html);
});

app.listen(PORT, () => {
  console.log(`Water monitor server running on port ${PORT}`);
});
