'use strict';

const $ = id => document.getElementById(id);
const STORAGE_KEY = 'jumpEFResults';
const V1_MARK = 'legacy';
const PROTOCOLS = {
  OPS: 'Pies quietos en la salida. Tras el aviso, realiza un salto vertical sin carrera ni pasos previos. Usa los brazos según las bases de tu prueba.',
  CMJ: 'De pie con las manos en la cintura. Tras el aviso, flexiona y salta en un solo movimiento.',
  SJ: 'Mantén la semisentadilla con las manos en la cintura. Tras el aviso, salta sin bajar de nuevo.',
  ABK: 'De pie con los brazos libres. Tras el aviso, acompaña el salto con el balanceo de brazos.'
};
const readable = (value, digits = 1) => value.toLocaleString('es-ES', {
  minimumFractionDigits: digits, maximumFractionDigits: digits
});

let records = readRecords();
let listening = false;
let requesting = false;
let feed = 'off';
let liveAt = -Infinity;
let listenAt = -Infinity;
let samples = [];
let trace = null;
let demoTimer = null;
let audio = null;
let wakeLock = null;
let series = null;
let viewLimit = 15;
let visibleRecords = [];
let trend = [];
let graphPending = false;
let displayedRecord = null;

function readRecords() {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    if (Array.isArray(data)) {
      return data.filter(row => row && Number.isFinite(row.cm) && Number.isFinite(row.flight))
        .map((row, index) => ({
          ...row, id: row.id || 'v1-' + index, protocol: row.protocol || V1_MARK,
          athlete: row.athlete || '', group: row.group || ''
        }));
    }
  } catch {
    $('storage').textContent = 'No se pudo leer el historial del dispositivo.';
  }
  return [];
}

function saveRecords(next) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    $('storage').textContent = 'Los resultados se guardan en este dispositivo.';
    return true;
  } catch {
    $('storage').textContent = 'El almacenamiento ha fallado. Exporta el CSV antes de cerrar si hay datos sin guardar.';
    return false;
  }
}

function updateState(phase, message, stage = 'idle') {
  $('phase-panel').dataset.stage = stage;
  if ($('phase').textContent !== phase) $('phase').textContent = phase;
  if ($('status').textContent !== message) $('status').textContent = message;
}

function updateControls() {
  const live = feed === 'live';
  $('sensor').textContent = { off: 'Sensor inactivo', waiting: 'Buscando señal', live: 'Sensor activo', demo: 'Demo simulada' }[feed];
  $('sensor').dataset.state = feed;
  $('activate').hidden = Boolean(series) || live;
  $('activate').disabled = requesting || (feed === 'waiting' && performance.now() - listenAt < 2500);
  $('activate').textContent = feed === 'waiting' && !$('activate').disabled ? 'Reintentar sensor' : 'Activar sensor';
  $('start').hidden = Boolean(series) || !live;
  $('demo').hidden = Boolean(series);
  $('stop').hidden = !series;
  $('settings').disabled = Boolean(series);
  $('target').disabled = Boolean(series);
  $('nav-history').disabled = Boolean(series);
  $('nav-history').title = series ? 'Disponible al terminar la serie' : '';
  $('demo').disabled = requesting;
}

function updateAttempt() {
  const count = series?.results.length ?? 0;
  const target = series?.target ?? Number($('target').value);
  $('attempt').textContent = count + ' / ' + target + (target === 1 ? ' salto' : ' saltos');
}

async function activateSensor() {
  if (requesting || series) return;
  if (!window.isSecureContext || !('DeviceMotionEvent' in window)) {
    updateState('Sensor no disponible', 'Abre JUMP EF en Safari por HTTPS. También puedes probar la demo.');
    return;
  }
  requesting = true;
  updateControls();
  try {
    if (typeof DeviceMotionEvent.requestPermission === 'function' &&
        await DeviceMotionEvent.requestPermission() !== 'granted') {
      updateState('Permiso denegado', 'Permite el acceso a movimiento en Safari y vuelve a intentarlo.');
      return;
    }
    if (!listening) window.addEventListener('devicemotion', onMotion);
    listening = true;
    listenAt = performance.now();
    liveAt = -Infinity;
    samples = [];
    trace = null;
    feed = 'waiting';
    updateState('Buscando señal', 'Mantén JUMP EF abierta mientras se comprueba el acelerómetro.');
    drawSoon();
  } catch {
    updateState('Sensor no disponible', 'Safari no pudo conceder acceso al movimiento. Revisa el permiso y vuelve a intentarlo.');
  } finally {
    requesting = false;
    updateControls();
  }
}

function onMotion(event) {
  const acceleration = event.accelerationIncludingGravity;
  if (!acceleration || ![acceleration.x, acceleration.y, acceleration.z].every(Number.isFinite)) return;
  const now = performance.now();
  const stamp = event.timeStamp;
  const t = Number.isFinite(stamp) && stamp > 0 && Math.abs(now - stamp) < 1000 ? stamp : now;
  liveAt = now;
  if (feed === 'demo' || document.hidden) return;
  if (feed !== 'live') {
    samples = [];
    feed = 'live';
    updateControls();
    updateState('Sensor disponible', 'Fija el iPhone a la cintura e inicia la serie.');
  }
  addSample(t, Math.hypot(acceleration.x, acceleration.y, acceleration.z));
}

function audioReady() {
  const Audio = window.AudioContext || window.webkitAudioContext;
  if (!$('sound').checked || !Audio) return;
  try {
    audio ||= new Audio();
    audio.resume().catch(() => {});
  } catch {
    audio = null;
  }
}

function beep(frequency) {
  if (!$('sound').checked || audio?.state !== 'running') return;
  const tone = audio.createOscillator();
  const gain = audio.createGain();
  tone.frequency.value = frequency;
  gain.gain.setValueAtTime(0.15, audio.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.16);
  tone.connect(gain).connect(audio.destination);
  tone.start();
  tone.stop(audio.currentTime + 0.16);
}

function announce(cm) {
  if (!$('voice').checked || !('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const speech = new SpeechSynthesisUtterance(readable(cm) + ' centímetros');
  speech.lang = 'es-ES';
  window.speechSynthesis.speak(speech);
}

async function keepAwake(owner) {
  if (!navigator.wakeLock) return;
  try {
    const lock = await navigator.wakeLock.request('screen');
    if (series === owner && !document.hidden) wakeLock = lock;
    else await lock.release();
  } catch {
    // La serie puede funcionar con la pantalla encendida manualmente.
  }
}

function startSeries(demo = false) {
  if (series || requesting || (!demo && feed !== 'live')) return;
  audioReady();
  const started = performance.now();
  series = {
    demo, id: newId(), results: [], state: 'countdown', since: started,
    deadline: started + 3000, displayCount: null, target: demo ? 1 : Number($('target').value),
    protocol: $('protocol').value, athlete: $('athlete').value.trim(), group: $('group').value.trim()
  };
  $('series-summary').hidden = true;
  $('setup-details').open = false;
  $('help-details').open = false;
  clearResult(demo ? 'Demo con señal simulada' : 'Esperando el primer salto');
  if (demo) {
    feed = 'demo';
    samples = [];
    demoTimer = setInterval(demoSample, 17);
  }
  updateControls();
  updateAttempt();
  $('stop').focus({ preventScroll: true });
  tick(started);
  keepAwake(series);
}

function demoSample() {
  const now = performance.now();
  const age = series.state === 'ready' ? now - series.since : -1;
  let value = GRAVITY + Math.sin(now / 60) * 0.08;
  if (age >= 480 && age < 620) value = 14;
  if (age >= 620 && age < 1090) value = 1.4;
  if (age >= 1090 && age < 1160) value = 17;
  addSample(now, value);
}

function addSample(t, value) {
  const last = samples.at(-1);
  if (last && t <= last.t) return;
  samples.push({ t, value });
  while (samples.length && samples[0].t < t - 5000) samples.shift();
  drawSoon();
  if (series?.state !== 'ready') return;
  const result = series.detector.sample(t, value);
  if (result?.error) {
    prepareNext('Intento descartado. ' + result.error);
  } else if (result) {
    saveJump(result);
  } else if (series.detector.inFlight) {
    updateState('En vuelo', 'Esperando el aterrizaje.', 'flight');
  }
}

function baselineAt(now) {
  const window = samples.filter(sample => sample.t >= now - 650);
  if (window.length < 8 || window.at(-1).t - window[0].t < 390 || now - window.at(-1).t > 100) return null;
  const interrupted = window.some((sample, index) => index > 0 && sample.t - window[index - 1].t > 50);
  if (interrupted) return null;
  const values = window.map(sample => sample.value).sort((a, b) => a - b);
  const middle = Math.floor(values.length / 2);
  const baseline = (values[middle] + values[Math.floor((values.length - 1) / 2)]) / 2;
  const stable = values.at(-1) - values[0] <= 1.6;
  return stable && Math.abs(baseline - GRAVITY) <= 2 ? baseline : null;
}

function tick(now) {
  if (feed === 'live' && now - liveAt > 1000) {
    feed = 'waiting';
    listenAt = now - 2500;
    if (series) endSeries('Señal interrumpida', 'La medición se detuvo porque dejaron de llegar datos del sensor.');
    else updateState('Señal interrumpida', 'Abre Safari en primer plano y comprueba el permiso de movimiento.');
    updateControls();
  }
  if (feed === 'waiting' && now - listenAt >= 2500 && $('activate').disabled && !requesting) {
    updateState('Sin señal', 'Comprueba el permiso de movimiento o prueba la demo.');
    updateControls();
  }
  if (!series) return;
  if (series.state === 'ready') {
    if (now >= series.deadline) endSeries('Serie finalizada', 'Se agotó el tiempo para realizar el siguiente salto.');
    return;
  }
  if (series.state === 'pause') {
    if (now < series.deadline) {
      updateState('Descanso · ' + Math.ceil((series.deadline - now) / 1000), series.pauseMessage, 'pause');
      return;
    }
    series.state = 'countdown';
    series.deadline = now + 3000;
  }
  const remaining = Math.ceil((series.deadline - now) / 1000);
  if (remaining > 0) {
    if (remaining !== series.displayCount) {
      series.displayCount = remaining;
      updateState('Prepárate · ' + remaining, 'Mantén el iPhone quieto. Salta al aviso.', 'countdown');
      beep(530);
    }
    return;
  }
  const baseline = baselineAt(now);
  if (baseline === null) {
    if (now - series.deadline > 8000) endSeries('Calibración interrumpida', 'Fija el iPhone a la cintura y vuelve a iniciar la serie.');
    else updateState('Calibrando', 'Mantén el iPhone quieto para que pueda medirse el reposo.');
    return;
  }
  series.state = 'ready';
  series.since = now;
  series.deadline = now + 14000;
  series.detector = new JumpDetector(baseline, series.protocol === 'OPS');
  series.detector.sample(samples.at(-1).t, samples.at(-1).value);
  beep(890);
  updateState('¡Salta!', series.demo ? 'Reproduciendo una señal de ejemplo.' : 'Salta cuando estés listo.', 'ready');
}

function newId() {
  return window.crypto?.randomUUID?.() || Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
}

function saveJump(result) {
  const { takeoff, landing, ...measurement } = result;
  const { demo, id: session, athlete, group, protocol } = series;
  const record = {
    ...measurement, id: newId(), date: new Date().toISOString(), session,
    athlete, group, protocol, attempt: series.results.length + 1, detector: 4
  };
  trace = { samples: samples.filter(p => p.t >= takeoff - 480), takeoff, landing, demo, hz: measurement.hz };
  series.results.push(record);
  updateAttempt();
  showResult(record, demo);
  const { best, mean } = summarize(series.results);
  $('series-best').textContent = readable(best) + ' cm';
  $('series-mean').textContent = readable(mean) + ' cm';
  $('series-summary').hidden = false;
  announce(record.cm);
  if (!demo) {
    records.push(record);
    saveRecords(records);
    renderHistory();
  }
  if (series.results.length < series.target) {
    prepareNext('Salto registrado. Descansa cuatro segundos antes de la siguiente cuenta atrás.');
  } else {
    endSeries(demo ? 'Demo finalizada' : 'Serie completada',
      demo ? 'Resultado simulado. Los saltos de demo quedan fuera del historial.' : 'Consulta el resumen de la serie y el historial.');
  }
}

function prepareNext(message) {
  series.state = 'pause';
  series.deadline = performance.now() + 4000;
  series.displayCount = null;
  series.pauseMessage = message;
  tick(performance.now());
}

function endSeries(phase, message) {
  if (!series) return;
  const { demo } = series;
  clearInterval(demoTimer);
  demoTimer = null;
  wakeLock?.release().catch(() => {});
  wakeLock = null;
  series = null;
  if (demo) {
    samples = [];
    feed = 'off';
    if (listening) {
      feed = performance.now() - liveAt < 1000 ? 'live' : 'waiting';
      listenAt = performance.now() - 2500;
    }
  }
  updateControls();
  updateState(phase, message);
  if (document.activeElement === $('stop')) (feed === 'live' ? $('start') : $('activate')).focus({ preventScroll: true });
}

function showResult(record, demo = false) {
  displayedRecord = demo ? null : record.id;
  $('result-title').textContent = demo ? 'Salto de demostración' : 'Último salto';
  $('height').textContent = readable(record.cm);
  $('flight').textContent = readable(record.flight, 3) + ' s';
  $('quality').textContent = record.quality + (record.hz ? ' · ' + readable(record.hz, 0) + ' Hz' : '');
  $('result-context').textContent = demo ? 'Dato simulado' :
    [record.protocol === V1_MARK ? 'Registro de la versión 1' : record.protocol, record.athlete, record.group].filter(Boolean).join(' · ');
}

function summarize(data) {
  let best = 0;
  let sum = 0;
  for (const row of data) {
    best = Math.max(best, row.cm);
    sum += row.cm;
  }
  return { best, mean: sum / data.length };
}

function filterOptions(id, values) {
  const field = $(id);
  const choice = field.value;
  const options = [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
  field.replaceChildren(new Option('Todos', ''), ...options.map(value => new Option(value, value)));
  if (options.includes(choice)) field.value = choice;
}

function renderHistory() {
  const protocol = $('filter-protocol').value;
  const source = records.filter(row => !protocol || row.protocol === protocol);
  filterOptions('filter-group', source.map(row => row.group));
  const group = $('filter-group').value;
  const inGroup = source.filter(row => !group || row.group === group);
  filterOptions('filter-athlete', inGroup.map(row => row.athlete));
  const athlete = $('filter-athlete').value;
  visibleRecords = inGroup.filter(row => !athlete || row.athlete === athlete);
  const { length } = visibleRecords;
  const { best, mean } = summarize(visibleRecords);
  $('best').textContent = length ? readable(best) + ' cm' : '—';
  $('average').textContent = length ? readable(mean) + ' cm' : '—';
  $('count').textContent = length;
  $('export').disabled = length === 0;
  $('more').hidden = length <= viewLimit;
  $('clear').hidden = records.length === 0;
  const comparable = length > 1 && visibleRecords.every(row =>
    row.athlete === visibleRecords[0].athlete && row.group === visibleRecords[0].group &&
    row.protocol === visibleRecords[0].protocol);
  trend = comparable ? visibleRecords.slice(-20).map(row => row.cm) : [];
  $('trend-region').hidden = !comparable;
  $('history-note').textContent = length === 0
    ? (records.length ? 'Sin resultados para estos filtros.' : 'Los saltos medidos aparecerán aquí.')
    : !comparable && length > 1 ? 'Filtra por protocolo, grupo y alumno para comparar saltos de un mismo registro.' : '';
  $('history').replaceChildren(...visibleRecords.slice(-viewLimit).reverse().map(historyRow));
  drawSoon();
}

function historyRow(record) {
  const row = document.createElement('li');
  const info = document.createElement('div');
  const label = document.createElement('strong');
  const details = document.createElement('small');
  const score = document.createElement('strong');
  const remove = document.createElement('button');
  label.textContent = [record.athlete || 'Sin nombre', record.group].filter(Boolean).join(' · ');
  const date = new Date(record.date);
  details.textContent = [
    record.protocol === V1_MARK ? 'Versión 1' : record.protocol, date.toLocaleString('es-ES'),
    readable(record.flight, 3) + ' s de vuelo'
  ].join(' · ');
  score.textContent = readable(record.cm) + ' cm';
  score.className = 'score';
  remove.textContent = 'Borrar';
  remove.setAttribute('aria-label', 'Borrar el salto de ' + score.textContent + ' de ' + label.textContent);
  remove.addEventListener('click', () => {
    if (!confirm('¿Borrar este salto del historial?')) return;
    const next = records.filter(row => row.id !== record.id);
    if (saveRecords(next)) {
      records = next;
      if (displayedRecord === record.id) restoreLastResult();
      renderHistory();
      $('filter-protocol').focus();
    }
  });
  info.append(label, details);
  row.append(info, score, remove);
  return row;
}

function clearResult(message = 'Coloca el iPhone en un cinturón ajustado.') {
  trace = null;
  displayedRecord = null;
  $('result-title').textContent = 'Altura estimada';
  for (const id of ['height', 'flight', 'quality']) $(id).textContent = '—';
  $('result-context').textContent = message;
  drawSoon();
}

function restoreLastResult() {
  clearResult();
  if (records.length) showResult(records.at(-1));
}

function exportCsv() {
  const safeText = value => {
    const text = String(value ?? '');
    const escaped = /^\s*[=+\-@]/.test(text) || /^[\t\r\n]/.test(text) ? "'" + text : text;
    return '"' + escaped.replaceAll('"', '""') + '"';
  };
  const decimal = (value, digits) => Number.isFinite(value) ? value.toFixed(digits).replace('.', ',') : '';
  const rows = visibleRecords.map(row => [
    safeText(row.date), safeText(row.group), safeText(row.athlete), safeText(row.protocol),
    safeText(row.session), row.attempt || '', decimal(row.cm, 2), decimal(row.flight, 3),
    decimal(row.hz, 1), decimal(row.gap, 1), safeText(row.quality),
    row.detector || ''
  ].join(';'));
  const header = 'fecha;grupo;alumno;protocolo;serie;intento;altura_cm;vuelo_s;frecuencia_hz;intervalo_max_ms;muestreo;version_detector';
  const blob = new Blob(['\ufeff' + [header, ...rows].join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'jump-ef-' + new Date().toISOString().slice(0, 10) + '.csv';
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

function plot(id, data, options) {
  const canvas = $(id);
  const { width: w, height: h } = canvas.getBoundingClientRect();
  if (!w || !h) return;
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.round(w * ratio);
  const height = Math.round(h * ratio);
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const { min, max, start, end, ticks, markers, unit } = options;
  const left = 42, right = w - 14, top = 13, bottom = h - 24;
  const x = time => left + (time - start) / (end - start) * (right - left);
  const y = value => bottom - (value - min) / (max - min) * (bottom - top);
  ctx.font = '11px system-ui';
  ctx.fillStyle = '#aebdc3';
  ctx.strokeStyle = '#344048';
  ctx.lineWidth = 1;
  ctx.textAlign = 'right';
  for (const tick of ticks) {
    const row = y(tick);
    ctx.fillText(readable(tick, 0), left - 8, row + 4);
    ctx.beginPath();
    ctx.moveTo(left, row);
    ctx.lineTo(right, row);
    ctx.stroke();
  }
  ctx.fillText(unit, right, h - 7);
  ctx.save();
  ctx.beginPath();
  ctx.rect(left, top, right - left, bottom - top);
  ctx.clip();
  if (markers) {
    ctx.fillStyle = '#c8f76b24';
    ctx.fillRect(x(markers.takeoff), top, x(markers.landing) - x(markers.takeoff), bottom - top);
    ctx.strokeStyle = '#b5d883';
    ctx.setLineDash([3, 4]);
    for (const time of [markers.takeoff, markers.landing]) {
      ctx.beginPath();
      ctx.moveTo(x(time), top);
      ctx.lineTo(x(time), bottom);
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }
  ctx.strokeStyle = '#c8f76b';
  ctx.lineWidth = 2;
  ctx.beginPath();
  let last = null;
  for (const point of data) {
    if (!last || (id === 'signal' && point.t - last.t > MAX_SAMPLE_GAP)) ctx.moveTo(x(point.t), y(point.value));
    else ctx.lineTo(x(point.t), y(point.value));
    last = point;
  }
  ctx.stroke();
  ctx.restore();
}

function drawSoon() {
  if (graphPending || (!$('signal-details').open && $('historial').hidden)) return;
  graphPending = true;
  requestAnimationFrame(() => {
    graphPending = false;
    const data = trace?.samples || samples;
    const end = (data.at(-1)?.t ?? 0) + (trace ? 35 : 0);
    const start = end - (trace ? Math.max(900, end - data[0].t) : 5000);
    const ceiling = Math.max(20, Math.ceil(Math.max(0, ...data.map(p => p.value)) / 10) * 10);
    if ($('signal-details').open && !$('medicion').hidden) plot('signal', data, { min: 0, max: ceiling, start, end, ticks: [0, ceiling / 2, ceiling], markers: trace, unit: 'm/s²' });
    const span = data.length > 1 ? data.at(-1).t - data[0].t : 0;
    const hz = trace?.hz || (span > 0 ? 1000 * (data.length - 1) / span : 0);
    $('rate').textContent = hz ? readable(hz, 0) + ' Hz' : '— Hz';
    $('signal-caption').textContent = trace
      ? (trace.demo ? 'Señal simulada' : 'Último intento') + ' · Área sombreada: tiempo de vuelo'
      : 'Magnitud de la aceleración con gravedad · m/s²';
    if (trend.length && !$('historial').hidden) {
      const min = Math.max(0, Math.floor((Math.min(...trend) - 1) / 5) * 5);
      const max = Math.ceil((Math.max(...trend) + 1) / 5) * 5;
      plot('trend', trend.map((value, t) => ({ t, value })), {
        min, max, start: -0.2, end: trend.length - 0.8, ticks: [min, max], unit: 'cm'
      });
    }
  });
}

function showHistory(open) {
  if (series && open) return;
  $('medicion').hidden = open;
  $('historial').hidden = !open;
  $('nav-measure').setAttribute('aria-pressed', String(!open));
  $('nav-history').setAttribute('aria-pressed', String(open));
  drawSoon();
}

$('nav-measure').addEventListener('click', () => showHistory(false));
$('nav-history').addEventListener('click', () => showHistory(true));
$('signal-details').addEventListener('toggle', drawSoon);
$('activate').addEventListener('click', activateSensor);
$('start').addEventListener('click', () => startSeries());
$('demo').addEventListener('click', () => startSeries(true));
$('stop').addEventListener('click', () => endSeries('Serie detenida', 'Puedes iniciar una nueva serie cuando quieras.'));
$('protocol').addEventListener('change', () => {
  $('protocol-help').textContent = PROTOCOLS[$('protocol').value];
});
$('target').addEventListener('change', () => {
  $('series-summary').hidden = true;
  updateAttempt();
});
for (const filter of ['filter-protocol', 'filter-group', 'filter-athlete']) {
  $(filter).addEventListener('change', () => {
    viewLimit = 15;
    renderHistory();
  });
}
$('more').addEventListener('click', () => {
  viewLimit += 15;
  renderHistory();
});
$('clear').addEventListener('click', () => {
  if (!confirm('¿Borrar todos los saltos guardados en este dispositivo?')) return;
  if (saveRecords([])) {
    records = [];
    if (displayedRecord) restoreLastResult();
    renderHistory();
    $('filter-protocol').focus();
  }
});
$('export').addEventListener('click', exportCsv);
window.addEventListener('resize', drawSoon);
document.addEventListener('visibilitychange', () => {
  if (document.hidden && series) endSeries('Serie interrumpida', 'Mantén la app abierta en primer plano durante el salto.');
  if (!document.hidden) tick(performance.now());
});

$('protocol-help').textContent = PROTOCOLS[$('protocol').value];
if (records.length) showResult(records.at(-1));
renderHistory();
updateControls();
updateAttempt();
setInterval(() => tick(performance.now()), 100);

if ('serviceWorker' in navigator && window.isSecureContext) {
  navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).catch(() => {});
}
