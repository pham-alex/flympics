const $ = id => document.getElementById(id);
const populations = [
  ['sensory_mean', 'Sensory neurons', '#5a93a0'],
  ['intrinsic_mean', 'VNC interneurons', '#9684b2'],
  ['motor_extensor', 'Extensor motor output', '#7d9954'],
  ['motor_flexor', 'Flexor motor output', '#c6a065']
];
for (const [key, label, color] of populations) {
  const row = document.createElement('div'); row.className = 'bar-row';
  row.style.setProperty('--pop-color', color);
  row.innerHTML = `<div class="bar-label"><span>${label}</span><output id="${key}-value">0.000</output></div><div class="bar-track"><div class="bar-fill" id="${key}" style="background:${color}"></div></div>`;
  $('bars').append(row);
}
let dataset, rows, index = -1, playing = false, clock = 0, previous = null, url;
function getEventKey() {
  return $('event')?.value || 'sprint';
}
function getTargetDistance() {
  const key = getEventKey();
  return dataset?.events?.[key]?.distance ?? (key === 'swim' ? 50 : 100);
}
function draw() {
  const eventKey = getEventKey();
  const targetDistance = getTargetDistance();
  const row = rows[index] || {position:0,velocity:0,simulation_time:0,action:'READY'};
  $('distance').textContent = row.position.toFixed(2);
  $('velocity').textContent = row.velocity.toFixed(2);
  $('time').textContent = row.simulation_time.toFixed(1);

  const trackPct = Math.max(0, Math.min(100, (row.position / targetDistance) * 100));
  $('athlete').style.left = `calc(32px + (100% - 64px) * ${trackPct / 100})`;
  $('athlete').classList.toggle('is-running', playing && row.velocity > 0);

  const ended = index === rows.length - 1;
  const actionEl = $('action');
  actionEl.className = '';
  if (ended) {
    if (row.distance_to_finish <= 0) {
      actionEl.textContent = eventKey === 'swim' ? 'FINISHED 🏊' : 'FINISHED 🏁';
      actionEl.classList.add('action-finished');
    } else {
      actionEl.textContent = 'TIME LIMIT ⏱';
      actionEl.classList.add('action-timeout');
    }
  } else if (row.action === 'ACCELERATE' || row.action === 'STROKE') {
    actionEl.textContent = row.action === 'STROKE' ? '● STROKE' : '● ACCELERATE';
    actionEl.classList.add('action-accelerate');
  } else if (row.action === 'COAST' || row.action === 'GLIDE') {
    actionEl.textContent = row.action === 'GLIDE' ? '○ GLIDE' : '○ COAST';
    actionEl.classList.add('action-coast');
  } else {
    actionEl.textContent = row.action;
    actionEl.classList.add('action-ready');
  }

  $('timeline').value = index + 1;
  $('progress').textContent = `${row.simulation_time.toFixed(1)} / ${rows.at(-1).simulation_time.toFixed(1)} s`;
  const neural = ['fly', 'trained'].includes($('controller').value);
  for (const [key] of populations) {
    const value = neural ? (row[key] ?? 0) : null;
    $(key).style.width = `${(value ?? 0) * 100}%`;
    $(key+'-value').textContent = value === null ? 'N/A' : value.toFixed(3);
  }
  drawNeural(row, neural);
  drawBrain(row, neural);
  drawSignalFrame(Math.min(clock, rows.at(-1).simulation_time));
  const threshold = row.motor_threshold ?? rows[0].motor_threshold;
  const verb = eventKey === 'swim' ? 'Stroke' : 'Accelerate';
  $('threshold-note').textContent = neural ? `${verb} when difference > ${threshold.toPrecision(5)}` : 'No neural decoder for this baseline';
  if (neural) {
    const diff = row.motor_difference ?? 0;
    const isAbove = diff > threshold;
    const badgeLabel = eventKey === 'swim' ? (isAbove ? '▲ STROKE' : '▼ GLIDE') : (isAbove ? '▲ ACCEL' : '▼ COAST');
    $('difference').innerHTML = `${diff.toFixed(5)} <span class="diff-badge ${isAbove ? 'diff-above' : 'diff-below'}">${badgeLabel}</span>`;
  } else {
    $('difference').textContent = 'N/A';
  }
  $('activity-note').textContent = neural ? 'Mean modeled activity (0–1), not measured firing rates. Both motor outputs can be active while their difference commands COAST.' : 'This baseline has no neural model. Neural activity does not apply.';
  $('status').textContent = ended ? (row.distance_to_finish <= 0 ? `Finished the ${eventKey}` : 'Time limit · did not finish') : (playing ? 'Playing simulation' : 'Ready · recorded simulation');
  $('play').textContent = playing ? '❚❚ Pause' : ended ? '↺ Play again' : '▶ Play run';
}
function updateControllerLabels() {
  const ctrl = $('controller');
  if (!ctrl) return;
  const labels = {
    trained: 'Trained fly',
    fly: 'Untrained fly',
    rule: 'Rule baseline',
    random: 'Random baseline'
  };
  for (const opt of ctrl.options) {
    if (labels[opt.value]) opt.textContent = labels[opt.value];
  }
}

function load() {
  playing = false; index = -1; clock = 0; previous = null;
  const eventKey = getEventKey();
  if (eventKey === 'swim' && (!dataset?.events || !dataset?.events?.swim)) {
    $('status').textContent = 'Error: The server has no swim data. Restart python -m experiments.serve_view.';
    return;
  }
  const eventData = dataset?.events?.[eventKey];
  const targetDist = eventData ? eventData.distance : (eventKey === 'swim' ? 50 : 100);
  const eventRuns = eventData ? eventData.runs : dataset.runs;
  rows = eventRuns[$('controller').value];
  if (!rows || rows.length === 0) {
    $('status').textContent = `No run data found for ${eventKey} / ${$('controller').value}`;
    return;
  }
  $('timeline').max = rows.length;
  if(url) URL.revokeObjectURL(url);
  url = URL.createObjectURL(new Blob([JSON.stringify(rows,null,2)], {type:'application/json'}));
  $('download').href = url; $('download').download = `${eventKey}_${$('controller').value}_seed${dataset.seed}.json`;

  updateControllerLabels();
  if ($('dist-target')) $('dist-target').textContent = ` / ${targetDist} m`;
  if ($('finish-label')) $('finish-label').textContent = eventKey === 'swim' ? '50 m FINISH' : '100 m FINISH';
  if ($('exp-number')) $('exp-number').textContent = eventKey === 'swim' ? 'EXPERIMENT 002' : 'EXPERIMENT 001';
  if ($('exp-title')) $('exp-title').textContent = eventKey === 'swim' ? '50 m swim' : '100 m sprint';
  if ($('intro-headline')) {
    $('intro-headline').innerHTML = eventKey === 'swim'
      ? '50 meters.<br>One fluid circuit.'
      : '100 meters.<br>One tiny circuit.';
  }
  if ($('arena-title')) $('arena-title').textContent = eventKey === 'swim' ? 'The pool' : 'The track';
  if ($('lane')) $('lane').classList.toggle('is-pool', eventKey === 'swim');
  if ($('brain-title')) $('brain-title').innerHTML = `A tiny network.<br>A ${targetDist}-meter mission.`;
  if ($('neural-goal')) $('neural-goal').innerHTML = `Task goal <strong>Move forward · reach ${targetDist} m</strong>`;
  if ($('ruler')) {
    if (eventKey === 'swim') {
      $('ruler').innerHTML = '<span>0</span><span>10</span><span>20</span><span>30</span><span>40</span><span>50 m</span>';
    } else {
      $('ruler').innerHTML = '<span>0</span><span>25</span><span>50</span><span>75</span><span>100 m</span>';
    }
  }

  draw();
}
$('play').onclick = () => {if(index===rows.length-1){index=-1;clock=0;} playing=!playing;previous=null;draw();};
$('restart').onclick = () => {playing=false;index=-1;clock=0;draw();};
$('controller').onchange = () => {if(dataset) load();};
if ($('event')) $('event').onchange = () => {if(dataset) load();};
document.querySelector('.neuron-inspector').addEventListener('toggle', () => drawSignalFrame(signalTime));
$('timeline').oninput = () => {playing=false;index=Number($('timeline').value)-1;clock=index<0?0:rows[index].simulation_time;draw();};

// Click lane to seek
const trackLane = document.querySelector('.lane');
if (trackLane) {
  trackLane.title = 'Click to scrub along track';
  trackLane.addEventListener('click', e => {
    if (!rows || rows.length === 0) return;
    const targetDist = getTargetDistance();
    const rect = trackLane.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const target = pct * targetDist;
    let bestIdx = 0, bestDiff = Infinity;
    for (let i = 0; i < rows.length; i++) {
      const diff = Math.abs(rows[i].position - target);
      if (diff < bestDiff) {
        bestDiff = diff;
        bestIdx = i;
      }
    }
    playing = false;
    index = bestIdx;
    clock = rows[index].simulation_time;
    draw();
  });
}

// Global keyboard shortcuts
window.addEventListener('keydown', e => {
  if (['input', 'select', 'textarea'].includes(document.activeElement?.tagName?.toLowerCase())) return;
  if (e.code === 'Space') {
    e.preventDefault();
    $('play').click();
  } else if (e.code === 'KeyR') {
    e.preventDefault();
    $('restart').click();
  } else if (e.code === 'ArrowRight' && rows) {
    e.preventDefault();
    playing = false;
    index = Math.min(rows.length - 1, index + (e.shiftKey ? 10 : 2));
    clock = index < 0 ? 0 : rows[index].simulation_time;
    draw();
  } else if (e.code === 'ArrowLeft' && rows) {
    e.preventDefault();
    playing = false;
    index = Math.max(-1, index - (e.shiftKey ? 10 : 2));
    clock = index < 0 ? 0 : rows[index].simulation_time;
    draw();
  }
});

function tick(now) {
  if(playing && previous!==null){
    clock += Math.min((now-previous)/1000,.25)*Number($('speed').value);
    while(index+1 < rows.length && rows[index+1].simulation_time <= clock) index++;
    if(index===rows.length-1) playing=false;
    draw();
  }
  previous=now; requestAnimationFrame(tick);
}
fetch('/runs.json').then(response => {
  if(!response.ok) throw Error('Simulation unavailable');
  return response.json();
}).then(data => {
  if (!data.circuit || !data.runs.trained[0].neuron_activity) throw Error('Restart the Python server to load neuron recordings');
  initializeBrain(data.circuit);
  initializeNeural(data.circuit);
  dataset=data;
  $('seed').textContent=`Seed ${data.seed} · reproducible run`;
  const urlParam = new URLSearchParams(window.location.search).get('event');
  if (urlParam && ['sprint', 'swim'].includes(urlParam)) {
    $('event').value = urlParam;
  } else if (data.event) {
    $('event').value = data.event;
  }
  load();
  for(const id of ['play','restart','timeline']) $(id).disabled=false;
  requestAnimationFrame(tick);
}).catch(error => {
  $('status').textContent=`Could not load run: ${error.message}. Start python -m experiments.serve_view.`;
});
