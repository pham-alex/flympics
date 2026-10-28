const $ = id => document.getElementById(id);

const populations = [
  ['sensory_mean', 'Sensory neurons', '#5a93a0'],
  ['intrinsic_mean', 'VNC interneurons', '#9684b2'],
  ['motor_extensor', 'Extensor motor output', '#7d9954'],
  ['motor_flexor', 'Flexor motor output', '#c6a065']
];

for (const [key, label, color] of populations) {
  const row = document.createElement('div');
  row.className = 'bar-row';
  row.style.setProperty('--pop-color', color);
  row.innerHTML = `<div class="bar-label"><span>${label}</span><output id="${key}-value">0.000</output></div><div class="bar-track"><div class="bar-fill" id="${key}" style="background:${color}"></div></div>`;
  $('bars').append(row);
}

const CONTROLLERS = ['trained', 'rule', 'random', 'fly'];
const CONTROLLER_META = {
  trained: { label: 'Trained fly', tag: '🥇 Trained fly', color: '#275630', stroke: '#2e7d32' },
  rule: { label: 'Rule baseline', tag: '⏱ Rule baseline', color: '#1565c0', stroke: '#1976d2' },
  random: { label: 'Random baseline', tag: '🎲 Random baseline', color: '#7b1fa2', stroke: '#8e24aa' },
  fly: { label: 'Untrained fly', tag: '🛑 Untrained fly', color: '#c62828', stroke: '#d32f2f' }
};

let dataset, rows, activeController = 'trained', viewMode = 'multi';
let playing = false, clock = 0, previous = null, url, maxDuration = 60.0;

function getEventKey() {
  return $('event')?.value || 'sprint';
}

function getTargetDistance() {
  const key = getEventKey();
  return dataset?.events?.[key]?.distance ?? (key === 'swim' ? 50 : 100);
}

function getEventRuns() {
  const eventKey = getEventKey();
  const eventData = dataset?.events?.[eventKey];
  return eventData ? eventData.runs : dataset?.runs;
}

function getEffectiveMaxTime() {
  const eventRuns = getEventRuns();
  if (viewMode === 'single') {
    return eventRuns?.[activeController]?.at(-1)?.simulation_time ?? 60.0;
  }
  return maxDuration;
}

function selectController(ctrl) {
  if (!CONTROLLERS.includes(ctrl)) return;
  activeController = ctrl;
  if ($('controller')) $('controller').value = ctrl;
  const eventRuns = getEventRuns();
  if (eventRuns) rows = eventRuns[ctrl];

  document.querySelectorAll('.lane-row').forEach(row => {
    const isSelected = row.dataset.controller === ctrl;
    row.classList.toggle('is-selected', isSelected);
  });

  document.querySelectorAll('#tbody-benchmarks tr').forEach(row => {
    row.classList.toggle('is-selected', row.dataset.controller === ctrl);
  });

  if (url) URL.revokeObjectURL(url);
  if (rows) {
    url = URL.createObjectURL(new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' }));
    $('download').href = url;
    $('download').download = `${getEventKey()}_${ctrl}_seed${dataset.seed}.json`;
  }

  const effectiveMax = getEffectiveMaxTime();
  $('timeline').max = Math.round(effectiveMax * 10);
  if (clock > effectiveMax) {
    clock = effectiveMax;
    playing = false;
  }

  draw();
}

function updateControllerLabels() {
  const ctrl = $('controller');
  if (!ctrl) return;
  for (const opt of ctrl.options) {
    if (CONTROLLER_META[opt.value]) opt.textContent = CONTROLLER_META[opt.value].label;
  }
}

function draw() {
  const eventKey = getEventKey();
  const targetDistance = getTargetDistance();
  const eventRuns = getEventRuns();
  if (!eventRuns) return;

  const currentCtrl = activeController;
  const activeRows = eventRuns[currentCtrl] || rows;
  const activeIdx = Math.min(Math.floor(clock * 10), activeRows.length - 1);
  const activeRow = activeRows[activeIdx] || { position: 0, velocity: 0, simulation_time: 0, action: 'READY' };

  // Update primary telemetry for the active controller
  $('distance').textContent = activeRow.position.toFixed(2);
  $('velocity').textContent = activeRow.velocity.toFixed(2);
  $('time').textContent = activeRow.simulation_time.toFixed(1);

  const effectiveMax = getEffectiveMaxTime();

  // Update multi-lane athlete positions and status badges
  for (const ctrl of CONTROLLERS) {
    const ctrlRows = eventRuns[ctrl];
    if (!ctrlRows || ctrlRows.length === 0) continue;
    const idx = Math.min(Math.floor(clock * 10), ctrlRows.length - 1);
    const r = ctrlRows[idx];
    const isFinished = r.distance_to_finish <= 0;
    const isTimeout = !isFinished && clock >= maxDuration;
    const athleteEl = $(`athlete-${ctrl}`);
    const statEl = $(`lane-stat-${ctrl}`);

    const trackPct = Math.max(0, Math.min(100, (r.position / targetDistance) * 100));
    if (athleteEl) {
      athleteEl.style.left = `calc(32px + (100% - 64px) * ${trackPct / 100})`;
      athleteEl.classList.toggle('is-running', playing && r.velocity > 0 && !isFinished && !isTimeout);
    }

    if (statEl) {
      if (isFinished) {
        statEl.textContent = eventKey === 'swim'
          ? `FINISH 🏊 (${r.simulation_time.toFixed(1)} s)`
          : `FINISH 🏁 (${r.simulation_time.toFixed(1)} s)`;
        statEl.className = 'lane-telemetry status-finished';
      } else if (isTimeout) {
        statEl.textContent = `TIME LIMIT ⏱ (${r.position.toFixed(2)} m)`;
        statEl.className = 'lane-telemetry status-timeout';
      } else {
        statEl.textContent = `${r.position.toFixed(2)} m · ${r.velocity.toFixed(2)} m/s`;
        statEl.className = 'lane-telemetry';
      }
    }
  }

  // Active controller action badge
  const isEnded = activeRow.distance_to_finish <= 0 || clock >= effectiveMax;
  const actionEl = $('action');
  actionEl.className = '';
  if (isEnded) {
    if (activeRow.distance_to_finish <= 0) {
      actionEl.textContent = eventKey === 'swim' ? 'FINISHED 🏊' : 'FINISHED 🏁';
      actionEl.classList.add('action-finished');
    } else {
      actionEl.textContent = 'TIME LIMIT ⏱';
      actionEl.classList.add('action-timeout');
    }
  } else if (activeRow.action === 'ACCELERATE' || activeRow.action === 'STROKE') {
    actionEl.textContent = activeRow.action === 'STROKE' ? '● STROKE' : '● ACCELERATE';
    actionEl.classList.add('action-accelerate');
  } else if (activeRow.action === 'COAST' || activeRow.action === 'GLIDE') {
    actionEl.textContent = activeRow.action === 'GLIDE' ? '○ GLIDE' : '○ COAST';
    actionEl.classList.add('action-coast');
  } else {
    actionEl.textContent = activeRow.action;
    actionEl.classList.add('action-ready');
  }

  // Timeline slider
  $('timeline').value = Math.round(clock * 10);
  $('progress').textContent = `${clock.toFixed(1)} / ${effectiveMax.toFixed(1)} s`;

  // Brain & Neural activity readouts
  const neural = ['fly', 'trained'].includes(currentCtrl);
  for (const [key] of populations) {
    const value = neural ? (activeRow[key] ?? 0) : null;
    $(key).style.width = `${(value ?? 0) * 100}%`;
    $(key + '-value').textContent = value === null ? 'N/A' : value.toFixed(3);
  }
  drawNeural(activeRow, neural);
  drawBrain(activeRow, neural);
  drawSignalFrame(Math.min(clock, activeRows.at(-1).simulation_time));

  // Motor threshold and difference
  const threshold = activeRow.motor_threshold ?? activeRows[0].motor_threshold;
  const verb = eventKey === 'swim' ? 'Stroke' : 'Accelerate';
  $('threshold-note').textContent = neural ? `${verb} when difference > ${threshold.toPrecision(5)}` : 'No neural decoder for this baseline';
  if (neural) {
    const diff = activeRow.motor_difference ?? 0;
    const isAbove = diff > threshold;
    const badgeLabel = eventKey === 'swim' ? (isAbove ? '▲ STROKE' : '▼ GLIDE') : (isAbove ? '▲ ACCEL' : '▼ COAST');
    $('difference').innerHTML = `${diff.toFixed(5)} <span class="diff-badge ${isAbove ? 'diff-above' : 'diff-below'}">${badgeLabel}</span>`;
  } else {
    $('difference').textContent = 'N/A';
  }
  $('activity-note').textContent = neural ? 'Mean modeled activity (0–1), not measured firing rates. Both motor outputs can be active while their difference commands COAST.' : 'This baseline has no neural model. Neural activity does not apply.';

  $('status').textContent = isEnded
    ? (activeRow.distance_to_finish <= 0 ? `Finished the ${eventKey}` : 'Time limit · did not finish')
    : (playing ? 'Playing simulation' : 'Ready · recorded simulation');
  $('play').textContent = playing ? '❚❚ Pause' : (clock >= effectiveMax ? '↺ Play again' : '▶ Play run');
}

function computeAnalytics() {
  const eventKey = getEventKey();
  const eventRuns = getEventRuns();
  if (!eventRuns) return;

  const propForce = eventKey === 'swim' ? 1.05 : 1.60;

  // 1. Benchmark Comparison Table
  const tbodyBench = $('tbody-benchmarks');
  if (tbodyBench) {
    tbodyBench.innerHTML = '';
    for (const ctrl of CONTROLLERS) {
      const ctrlRows = eventRuns[ctrl];
      if (!ctrlRows || ctrlRows.length === 0) continue;
      const lastRow = ctrlRows.at(-1);
      const isFinished = lastRow.distance_to_finish <= 0;
      const finishTime = isFinished ? `${lastRow.simulation_time.toFixed(1)} s` : `60.0 s (Timeout)`;
      const finalDist = `${lastRow.position.toFixed(2)} m`;
      const peakSpeed = `${Math.max(...ctrlRows.map(r => r.velocity)).toFixed(2)} m/s`;
      const avgSpeed = `${(lastRow.position / lastRow.simulation_time).toFixed(2)} m/s`;

      // Kinetic Work proxy = Sum(F * v * dt) during active steps
      let work = 0;
      for (const r of ctrlRows) {
        if (r.action === 'ACCELERATE' || r.action === 'STROKE') {
          work += propForce * r.velocity * 0.1;
        }
      }

      const tr = document.createElement('tr');
      tr.dataset.controller = ctrl;
      if (ctrl === activeController) tr.className = 'is-selected';
      tr.innerHTML = `
        <td><strong>${CONTROLLER_META[ctrl].tag}</strong></td>
        <td><span class="${isFinished ? 'status-finished' : 'status-timeout'}">${isFinished ? (eventKey === 'swim' ? 'Finished 🏊' : 'Finished 🏁') : 'Time limit ⏱'}</span></td>
        <td><b>${finishTime}</b></td>
        <td>${finalDist}</td>
        <td>${peakSpeed}</td>
        <td>${avgSpeed}</td>
        <td>${work.toFixed(1)} J*</td>
      `;
      tr.onclick = () => selectController(ctrl);
      tbodyBench.append(tr);
    }
  }

  // 2. Split Times Table
  const splitsHeader = $('tr-splits-header');
  const tbodySplits = $('tbody-splits');
  if (splitsHeader && tbodySplits) {
    const gates = eventKey === 'swim' ? [10, 20, 30, 40, 50] : [25, 50, 75, 100];
    splitsHeader.innerHTML = '<th>Controller</th>' + gates.map((g, i) => {
      const prev = i === 0 ? 0 : gates[i - 1];
      return `<th>${prev}–${g} m</th>`;
    }).join('') + '<th>Final Time</th>';

    // Calculate crossing times for each controller at each gate
    const crossingTimes = {};
    for (const ctrl of CONTROLLERS) {
      const ctrlRows = eventRuns[ctrl];
      crossingTimes[ctrl] = [];
      for (const gate of gates) {
        if (ctrlRows.at(-1).position < gate) {
          crossingTimes[ctrl].push(null);
          continue;
        }
        let tCross = null;
        for (let i = 1; i < ctrlRows.length; i++) {
          if (ctrlRows[i].position >= gate) {
            const p0 = ctrlRows[i - 1].position;
            const p1 = ctrlRows[i].position;
            const t0 = ctrlRows[i - 1].simulation_time;
            const t1 = ctrlRows[i].simulation_time;
            const frac = p1 > p0 ? (gate - p0) / (p1 - p0) : 0;
            tCross = t0 + frac * (t1 - t0);
            break;
          }
        }
        crossingTimes[ctrl].push(tCross);
      }
    }

    // Determine fastest split for each interval
    const bestIntervalTimes = gates.map((gate, idx) => {
      let minDt = Infinity;
      for (const ctrl of CONTROLLERS) {
        const tEnd = crossingTimes[ctrl][idx];
        const tStart = idx === 0 ? 0 : crossingTimes[ctrl][idx - 1];
        if (tEnd !== null && (idx === 0 || tStart !== null)) {
          const dt = tEnd - tStart;
          if (dt < minDt) minDt = dt;
        }
      }
      return minDt;
    });

    tbodySplits.innerHTML = '';
    for (const ctrl of CONTROLLERS) {
      const tr = document.createElement('tr');
      tr.dataset.controller = ctrl;
      if (ctrl === activeController) tr.className = 'is-selected';
      const lastRow = eventRuns[ctrl].at(-1);

      let cells = `<td><strong>${CONTROLLER_META[ctrl].tag}</strong></td>`;
      for (let idx = 0; idx < gates.length; idx++) {
        const tEnd = crossingTimes[ctrl][idx];
        const tStart = idx === 0 ? 0 : crossingTimes[ctrl][idx - 1];
        if (tEnd !== null && (idx === 0 || tStart !== null)) {
          const dt = tEnd - tStart;
          const distInterval = idx === 0 ? gates[0] : gates[idx] - gates[idx - 1];
          const speed = dt > 0 ? (distInterval / dt).toFixed(2) : '0.00';
          const isBest = Math.abs(dt - bestIntervalTimes[idx]) < 0.05;
          cells += `<td><span class="split-pill ${isBest ? 'split-fastest' : 'split-normal'}"><span class="split-time">${dt.toFixed(1)} s</span> <span class="split-speed">(${speed} m/s)</span></span></td>`;
        } else {
          cells += `<td><span class="split-dnf">—</span></td>`;
        }
      }
      const finishStr = lastRow.distance_to_finish <= 0 ? `${lastRow.simulation_time.toFixed(1)} s` : `DNF (${lastRow.position.toFixed(2)} m)`;
      cells += `<td><b>${finishStr}</b></td>`;
      tr.innerHTML = cells;
      tr.onclick = () => selectController(ctrl);
      tbodySplits.append(tr);
    }
  }
}

function load() {
  playing = false; clock = 0; previous = null;
  const eventKey = getEventKey();

  if (eventKey === 'swim' && (!dataset?.events || !dataset?.events?.swim)) {
    $('status').textContent = 'Error: The server has no swim data. Restart python -m experiments.serve_view.';
    return;
  }

  const eventData = dataset?.events?.[eventKey];
  const targetDist = eventData ? eventData.distance : (eventKey === 'swim' ? 50 : 100);
  const eventRuns = eventData ? eventData.runs : dataset.runs;

  rows = eventRuns[activeController];
  if (!rows || rows.length === 0) {
    activeController = 'trained';
    rows = eventRuns['trained'];
  }

  maxDuration = Math.max(...CONTROLLERS.map(c => eventRuns[c]?.at(-1)?.simulation_time ?? 60.0));
  const effectiveMax = getEffectiveMaxTime();
  $('timeline').max = Math.round(effectiveMax * 10);

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

  // Pool water styling on lanes
  document.querySelectorAll('.lane').forEach(lane => {
    lane.classList.toggle('is-pool', eventKey === 'swim');
  });

  if ($('brain-title')) $('brain-title').innerHTML = `A tiny network.<br>A ${targetDist}-meter mission.`;
  if ($('neural-goal')) $('neural-goal').innerHTML = `Task goal <strong>Move forward · reach ${targetDist} m</strong>`;

  if ($('ruler')) {
    if (eventKey === 'swim') {
      $('ruler').innerHTML = '<span>0</span><span>10</span><span>20</span><span>30</span><span>40</span><span>50 m</span>';
    } else {
      $('ruler').innerHTML = '<span>0</span><span>25</span><span>50</span><span>75</span><span>100 m</span>';
    }
  }

  selectController(activeController);
  computeAnalytics();
  draw();
}

// Replay mode switch: multi vs single
if ($('view-mode')) {
  $('view-mode').onchange = () => {
    viewMode = $('view-mode').value;
    const wrapper = $('lanes-wrapper');
    if (wrapper) {
      wrapper.className = viewMode === 'multi' ? 'lanes-multi' : 'lanes-single';
    }
    const effectiveMax = getEffectiveMaxTime();
    $('timeline').max = Math.round(effectiveMax * 10);
    if (clock > effectiveMax) {
      clock = effectiveMax;
      playing = false;
    }
    draw();
  };
}

// Controller selector change
if ($('controller')) {
  $('controller').onchange = () => {
    selectController($('controller').value);
  };
}

// Lane row click selection
document.querySelectorAll('.lane-row').forEach(row => {
  row.addEventListener('click', () => {
    selectController(row.dataset.controller);
  });
});

// Transport controls
$('play').onclick = () => {
  const effectiveMax = getEffectiveMaxTime();
  if (clock >= effectiveMax) {
    clock = 0;
  }
  playing = !playing;
  previous = null;
  draw();
};

$('restart').onclick = () => {
  playing = false;
  clock = 0;
  draw();
};

if ($('event')) $('event').onchange = () => { if (dataset) load(); };

document.querySelector('.neuron-inspector')?.addEventListener('toggle', () => drawSignalFrame(signalTime));

$('timeline').oninput = () => {
  playing = false;
  const effectiveMax = getEffectiveMaxTime();
  clock = Math.min(effectiveMax, Math.max(0, Number($('timeline').value) / 10));
  draw();
};

// Analytics tab buttons
const tabBench = $('tab-benchmarks');
const tabSplits = $('tab-splits');
const viewBench = $('view-benchmarks');
const viewSplits = $('view-splits');

if (tabBench && tabSplits && viewBench && viewSplits) {
  tabBench.onclick = () => {
    tabBench.classList.add('is-active');
    tabSplits.classList.remove('is-active');
    viewBench.classList.remove('is-hidden');
    viewSplits.classList.add('is-hidden');
  };
  tabSplits.onclick = () => {
    tabSplits.classList.add('is-active');
    tabBench.classList.remove('is-active');
    viewSplits.classList.remove('is-hidden');
    viewBench.classList.add('is-hidden');
  };
}

// Global keyboard shortcuts
window.addEventListener('keydown', e => {
  if (['input', 'select', 'textarea'].includes(document.activeElement?.tagName?.toLowerCase())) return;
  const effectiveMax = getEffectiveMaxTime();
  if (e.code === 'Space') {
    e.preventDefault();
    $('play').click();
  } else if (e.code === 'KeyR') {
    e.preventDefault();
    $('restart').click();
  } else if (e.code === 'ArrowRight') {
    e.preventDefault();
    playing = false;
    clock = Math.min(effectiveMax, clock + (e.shiftKey ? 1.0 : 0.1));
    draw();
  } else if (e.code === 'ArrowLeft') {
    e.preventDefault();
    playing = false;
    clock = Math.max(0, clock - (e.shiftKey ? 1.0 : 0.1));
    draw();
  } else if (['Digit1', 'Digit2', 'Digit3', 'Digit4'].includes(e.code)) {
    const idx = Number(e.code.replace('Digit', '')) - 1;
    if (CONTROLLERS[idx]) selectController(CONTROLLERS[idx]);
  }
});

function tick(now) {
  if (playing && previous !== null) {
    const dt = Math.min((now - previous) / 1000, 0.25) * Number($('speed').value);
    clock += dt;
    const effectiveMax = getEffectiveMaxTime();

    if (clock >= effectiveMax) {
      clock = effectiveMax;
      playing = false;
    }
    draw();
  }
  previous = now;
  requestAnimationFrame(tick);
}

fetch('/runs.json').then(response => {
  if (!response.ok) throw Error('Simulation unavailable');
  return response.json();
}).then(data => {
  if (!data.circuit || !data.runs.trained[0].neuron_activity) throw Error('Restart the Python server to load neuron recordings');
  initializeBrain(data.circuit);
  initializeNeural(data.circuit);
  dataset = data;
  $('seed').textContent = `Seed ${data.seed} · reproducible run`;
  const urlParam = new URLSearchParams(window.location.search).get('event');
  if (urlParam && ['sprint', 'swim'].includes(urlParam)) {
    $('event').value = urlParam;
  } else if (data.event) {
    $('event').value = data.event;
  }
  load();
  for (const id of ['play', 'restart', 'timeline']) $(id).disabled = false;
  requestAnimationFrame(tick);
}).catch(error => {
  $('status').textContent = `Could not load run: ${error.message}. Start python -m experiments.serve_view.`;
});
