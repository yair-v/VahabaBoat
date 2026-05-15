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
    return { ...d, online, color: getColor(d.waterLevel, online), secondsAgo: Math.round((now - d.lastSeen) / 1000) };
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
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
:root{--bg:#151d2c;--panel:#202a3d;--panel2:#111827;--line:#334155;--text:#f8fafc;--muted:#94a3b8;--green:#22c55e;--red:#ef4444;--orange:#f59e0b;--cyan:#5eead4;--purple:#d946ef}
html,body{margin:0;padding:0;background:var(--bg);color:var(--text);font-family:Arial,Helvetica,sans-serif;min-height:100vh;overflow-x:hidden}
body{padding-bottom:18px}
.appHeader{position:sticky;top:0;z-index:10;background:#263244;padding:max(12px,env(safe-area-inset-top)) 14px 12px;border-bottom:1px solid rgba(255,255,255,.08);box-shadow:0 8px 22px rgba(0,0,0,.25)}
.topLine{display:grid;grid-template-columns:90px 1fr 90px;align-items:center;gap:10px;min-height:52px}.headerAction{color:#dbeafe;font-size:15px;text-align:center}.headerTitle{text-align:center;font-size:23px;font-weight:800;letter-spacing:.2px}.hamburger{width:54px;height:44px;border-radius:13px;border:1px solid rgba(34,197,94,.65);background:rgba(34,197,94,.12);color:#4ade80;font-size:26px;font-weight:900;display:inline-flex;align-items:center;justify-content:center;margin:auto}
.wrap{padding:16px 12px 18px;max-width:1200px;margin:0 auto}.alertBar{display:none;margin:0 0 12px;padding:10px 14px;border-radius:12px;background:#991b1b;color:#fff;border:1px solid rgba(255,255,255,.18);align-items:center;gap:8px;font-size:15px;font-weight:700}.alertBar.show{display:flex}
.waterScroller{overflow-x:auto;overflow-y:hidden;scroll-snap-type:x mandatory;-webkit-overflow-scrolling:touch;padding-bottom:10px}.waterScroller::-webkit-scrollbar{height:6px}.waterScroller::-webkit-scrollbar-thumb{background:rgba(148,163,184,.4);border-radius:999px}.waterPages{display:grid;grid-auto-flow:column;grid-auto-columns:100%;gap:14px}.waterPage{scroll-snap-align:start;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;min-height:420px}
.gaugeCard{background:linear-gradient(180deg,#202a3d,#151d2c);border:1px solid rgba(148,163,184,.18);border-radius:20px;padding:13px 10px 12px;min-height:198px;box-shadow:inset 0 0 0 1px rgba(255,255,255,.02),0 10px 26px rgba(0,0,0,.22);display:flex;flex-direction:column;align-items:center;justify-content:space-between;position:relative;overflow:hidden}.gaugeCard.offline{opacity:.55;filter:grayscale(.3)}
.gaugeName{width:100%;text-align:center;color:#cbd5e1;font-weight:700;font-size:15px;line-height:1.25;min-height:38px;display:flex;align-items:center;justify-content:center}.statusDot{position:absolute;top:11px;right:11px;width:13px;height:13px;border-radius:999px;background:var(--green);box-shadow:0 0 12px currentColor}.statusDot.offline{background:#64748b;box-shadow:none}
.semiGauge{width:145px;height:76px;position:relative;overflow:hidden;margin-top:6px}.semiGaugeArc{width:145px;height:145px;border-radius:50%;background:conic-gradient(from 270deg,var(--gaugeColor) calc(var(--level) * .5%),rgba(51,65,85,.95) 0 50%,transparent 0);filter:drop-shadow(0 0 12px var(--gaugeColor));position:absolute;top:0;left:0}.semiGaugeArc:after{content:"";position:absolute;inset:15px;border-radius:50%;background:#151d2c;border:1px solid rgba(255,255,255,.05)}
.gaugeValue{margin-top:-4px;font-size:42px;font-weight:900;color:var(--text);line-height:1;direction:ltr}.gaugeValue .unit{font-size:21px;font-weight:600;margin-left:2px}.miniData{display:flex;gap:6px;align-items:center;justify-content:center;direction:ltr;font-size:15px;font-weight:700;min-height:24px;margin-top:4px}.temp{color:var(--cyan)}.hum{color:var(--purple)}.batteryText{color:var(--green);font-size:15px;font-weight:800;margin-top:3px}.batteryText.bad{color:#ef4444}.offlineText{color:#cbd5e1;font-size:13px;margin-top:2px}.pageHint{text-align:center;color:var(--muted);font-size:12px;margin:-2px 0 12px}
.chartPanel{background:var(--panel);border:1px solid rgba(148,163,184,.18);border-radius:15px;padding:12px 12px 14px;box-shadow:0 10px 26px rgba(0,0,0,.25);margin-top:6px}.chartLegend{display:flex;align-items:center;flex-wrap:wrap;gap:12px;color:var(--text);font-size:14px;font-weight:700;margin-bottom:8px}.legendItem{display:inline-flex;align-items:center;gap:6px}.legendColor{width:14px;height:14px;border-radius:4px;display:inline-block}.chartTitle{color:#e5e7eb;font-size:16px;font-weight:800;margin-bottom:8px;display:flex;align-items:center;gap:8px}canvas{width:100%;height:260px;background:#253044;border:1px solid rgba(255,255,255,.17);border-radius:10px}
.bottomNav{position:sticky;bottom:0;z-index:9;margin-top:12px;background:#263244;border-top:1px solid rgba(255,255,255,.08);display:grid;grid-template-columns:repeat(4,1fr);border-radius:18px 18px 0 0;overflow:hidden;box-shadow:0 -8px 22px rgba(0,0,0,.20)}.navItem{padding:11px 4px 10px;text-align:center;color:#cbd5e1;font-size:13px}.navItem.active{color:#4ade80}.navIcon{display:block;font-size:24px;margin-bottom:3px}.empty{grid-column:1/-1;background:var(--panel);border-radius:18px;padding:34px 10px;text-align:center;color:var(--muted);border:1px solid rgba(148,163,184,.18)}
@media(max-width:430px){.wrap{padding-left:10px;padding-right:10px}.waterPage{gap:10px;min-height:402px}.gaugeCard{min-height:190px;padding:11px 8px}.semiGauge{width:134px;height:70px}.semiGaugeArc{width:134px;height:134px}.gaugeValue{font-size:39px}.headerTitle{font-size:20px}.topLine{grid-template-columns:72px 1fr 72px}}
</style>
</head>
<body>
<header class="appHeader"><div class="topLine"><div class="headerAction">Remove</div><div class="headerTitle">Vahaba Boat</div><button class="hamburger" onclick="openSettings()">☰</button></div></header>
<main class="wrap"><div id="alertBar" class="alertBar">⚠️ יש התראה פעילה</div><section class="waterScroller" id="waterScroller"><div class="waterPages" id="waterPages"><div class="empty">ממתין לנתונים מה־Raspberry Pi...</div></div></section><div class="pageHint">החלקה לצדדים מציגה עוד חיישנים · 4 חיישנים בכל מסך</div><section class="chartPanel"><div class="chartTitle">↔ גרף טמפרטורה ולחות</div><div class="chartLegend"><span class="legendItem"><span class="legendColor" style="background:#5eead4"></span>טמפרטורה</span><span class="legendItem"><span class="legendColor" style="background:#d946ef"></span>לחות</span></div><canvas id="sensorChart" width="900" height="360"></canvas></section><nav class="bottomNav"><div class="navItem">⚙️<span class="navIcon"></span>Settings</div><div class="navItem">📍<span class="navIcon"></span>Trips</div><div class="navItem">🔍<span class="navIcon"></span>Find Car</div><div class="navItem active">🔋<span class="navIcon"></span>Monitor</div></nav></main>
<script>
function chunk(arr,size){const out=[];for(let i=0;i<arr.length;i+=size)out.push(arr.slice(i,i+size));return out}function escapeHtml(s){return String(s).replace(/[&<>'"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]))}function colorByLevel(level,online){if(!online)return'#64748b';const n=Number(level||0);if(n<=20)return'#22c55e';if(n<=60)return'#f59e0b';return'#ef4444'}
function renderWaterDevices(devices){const root=document.getElementById('waterPages');if(!devices.length){root.innerHTML='<div class="empty">אין עדיין נתונים. הפעל את סקריפט ה־Raspberry Pi.</div>';return}const pages=chunk(devices,4);root.innerHTML=pages.map(page=>{const cards=page.map(d=>{const level=d.waterLevel==null?0:Number(d.waterLevel);const color=colorByLevel(level,d.online);const onlineClass=d.online?'':'offline';const temp=d.temperatureC==null?'--':Number(d.temperatureC).toFixed(0);const hum=d.humidity==null?'--':Number(d.humidity).toFixed(0);const ok=d.online&&level<=20;const statusText=!d.online?'OFFLINE':ok?'Water OK':d.status;return `<article class="gaugeCard ${onlineClass}"><span class="statusDot ${onlineClass}"></span><div class="gaugeName">${escapeHtml(d.name||d.deviceId)}</div><div class="semiGauge" style="--gaugeColor:${color};--level:${level}"><div class="semiGaugeArc"></div></div><div class="gaugeValue" style="color:${level>60?'#ef4444':'#ffffff'}">${level}<span class="unit">%</span></div><div class="miniData"><span class="temp">°C${temp}</span><span class="hum">${hum}%</span></div><div class="batteryText ${ok?'':'bad'}">${d.online?(ok?'✅ Water OK':'❗ '+escapeHtml(statusText)):'OFFLINE'}</div><div class="offlineText">${d.online?'עודכן לפני '+d.secondsAgo+' שנ׳':'לא מחובר'}</div></article>`}).join('');const missing=Math.max(0,4-page.length);const placeholders=Array.from({length:missing}).map(()=>'<article class="gaugeCard offline"><div class="gaugeName">פנוי</div><div class="semiGauge" style="--gaugeColor:#64748b;--level:0"><div class="semiGaugeArc"></div></div><div class="gaugeValue">--<span class="unit">%</span></div><div class="offlineText">אין חיישן</div></article>').join('');return '<div class="waterPage">'+cards+placeholders+'</div>'}).join('')}
async function drawChart(deviceId){const canvas=document.getElementById('sensorChart');const ctx=canvas.getContext('2d');ctx.clearRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#253044';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.strokeStyle='rgba(255,255,255,.35)';ctx.lineWidth=1;ctx.font='20px Arial';const padL=65,padR=20,padT=24,padB=48,w=canvas.width-padL-padR,h=canvas.height-padT-padB;for(let i=0;i<=4;i++){const y=padT+(h/4)*i;ctx.beginPath();ctx.moveTo(padL,y);ctx.lineTo(padL+w,y);ctx.stroke();ctx.fillStyle='#f8fafc';ctx.fillText(String(Math.round(100-i*25)),18,y+6)}for(let i=0;i<=5;i++){const x=padL+(w/5)*i;ctx.beginPath();ctx.moveTo(x,padT);ctx.lineTo(x,padT+h);ctx.stroke()}if(!deviceId){ctx.fillStyle='#94a3b8';ctx.fillText('אין נתוני גרף עדיין',330,180);return}try{const res=await fetch('/api/history/'+encodeURIComponent(deviceId),{cache:'no-store'});const data=await res.json();const arr=(data.history||[]).slice(-60);if(!arr.length){ctx.fillStyle='#94a3b8';ctx.fillText('אין היסטוריה עדיין',345,180);return}function yByValue(v){const n=Math.max(0,Math.min(100,Number(v||0)));return padT+h-(n/100)*h}function drawLine(key,color,scaleTemp){ctx.strokeStyle=color;ctx.lineWidth=4;ctx.beginPath();let started=false;arr.forEach((p,idx)=>{let value=p[key];if(value===null||value===undefined)return;if(scaleTemp)value=Number(value)*2;const x=padL+(arr.length===1?0:(w/(arr.length-1))*idx);const y=yByValue(value);if(!started){ctx.moveTo(x,y);started=true}else ctx.lineTo(x,y)});ctx.stroke()}drawLine('temperatureC','#5eead4',true);drawLine('humidity','#d946ef',false);ctx.fillStyle='#94a3b8';const first=new Date(arr[0].t),last=new Date(arr[arr.length-1].t);ctx.fillText(first.toLocaleTimeString('he-IL',{hour:'2-digit',minute:'2-digit'}),padL,canvas.height-14);ctx.fillText(last.toLocaleTimeString('he-IL',{hour:'2-digit',minute:'2-digit'}),canvas.width-110,canvas.height-14)}catch(err){ctx.fillStyle='#ef4444';ctx.fillText('שגיאה בטעינת גרף',340,180)}}
async function loadData(){try{const res=await fetch('/api/devices',{cache:'no-store'});const data=await res.json();const devices=data.devices||[];const hasAlarm=devices.some(d=>d.online&&Number(d.waterLevel||0)>20);const alertBar=document.getElementById('alertBar');alertBar.classList.toggle('show',hasAlarm);alertBar.textContent=hasAlarm?'⚠️ התראת מפלס מים פעילה':'';renderWaterDevices(devices);const firstWithDht=devices.find(d=>d.temperatureC!=null||d.humidity!=null)||devices[0];drawChart(firstWithDht?firstWithDht.deviceId:null)}catch(err){document.getElementById('waterPages').innerHTML='<div class="empty">שגיאה בטעינת נתונים</div>'}}function openSettings(){alert('הגדרות מנוהלות באפליקציה')}loadData();setInterval(loadData,3000);
</script></body></html>`);
});

app.listen(PORT, () => {
  console.log(`Water monitor server running on port ${PORT}`);
});
