(function () {

  // ─── Shared state ─────────────────────────────────────────────────────────

  var params = {
    mode: 'lfo',

    // LFO mode
    lfoRate:  0.12,   // Hz
    depth:    0.04,   // 10% of 0.4 max

    // Envelope mode
    tempo:    120,    // BPM — each step is one quarter note
    attack:   0.05,   // seconds
    decay:    0.30,   // seconds

    // Shared
    Q:        3       // filter resonance
  };


  // ─── LFO ──────────────────────────────────────────────────────────────────

  var lfoPhase = 0;

  function updateLFO(dt) {
    lfoPhase += 2 * Math.PI * params.lfoRate * dt;
  }

  function lfoFcNorm() {
    return 0.475 + params.depth * Math.sin(lfoPhase);
  }


  // ─── Envelope ─────────────────────────────────────────────────────────────

  var ENV_BASE = 0.25;  // fcNorm when envelope is fully closed

  var envelope = {
    phase: 'idle',  // 'idle' | 'attack' | 'decay'
    value: 0,       // 0 = closed, 1 = fully open
    timer: 0
  };

  function triggerEnvelope() {
    envelope.phase = 'attack';
    envelope.timer = 0;
  }

  function updateEnvelope(dt) {
    if (envelope.phase === 'attack') {
      envelope.timer += dt;
      envelope.value = Math.min(1, envelope.timer / Math.max(0.001, params.attack));
      if (envelope.value >= 1) {
        envelope.phase = 'decay';
        envelope.timer = 0;
      }
    } else if (envelope.phase === 'decay') {
      envelope.timer += dt;
      envelope.value = Math.max(0, 1 - envelope.timer / Math.max(0.001, params.decay));
      if (envelope.value <= 0) {
        envelope.phase = 'idle';
      }
    }
  }

  function envelopeFcNorm() {
    return ENV_BASE + envelope.value * params.depth;
  }


  // ─── Sequencer ────────────────────────────────────────────────────────────

  var sequencer = {
    steps:       [true, false, false, false, true, false, true, false],
    currentStep: -1,
    stepTimer:   0,
    stepEls:     []  // DOM references kept for highlight updates
  };

  function stepDuration() {
    return 60 / params.tempo / 4;  // one 16th note in seconds
  }

  function advanceSequencer(dt) {
    sequencer.stepTimer += dt;
    if (sequencer.stepTimer >= stepDuration()) {
      sequencer.stepTimer -= stepDuration();
      sequencer.currentStep = (sequencer.currentStep + 1) % 8;

      if (sequencer.steps[sequencer.currentStep]) {
        triggerEnvelope();
      }

      updateSequencerHighlight();
    }
  }

  function updateSequencerHighlight() {
    sequencer.stepEls.forEach(function (el, i) {
      el.classList.toggle('playing', i === sequencer.currentStep);
    });
  }

  function resetSequencer() {
    sequencer.stepTimer   = 0;
    sequencer.currentStep = -1;
    updateSequencerHighlight();
  }


  // ─── Filter response ──────────────────────────────────────────────────────

  // 4th-order resonant low-pass (two cascaded 2nd-order stages = slope doubled in dB)
  // u = f/fc (frequency ratio relative to cutoff), Q = resonance
  function filterDb(u, Q) {
    var h = 1 / Math.sqrt(Math.pow(1 - u * u, 2) + Math.pow(u / Q, 2));
    return 40 * Math.log10(h);
  }

  function buildCurvePoints(width, height, fcNorm) {
    var logRange = 3;
    var dBMin    = -54;
    var dBMax    = 40 * Math.log10(params.Q) + 6;  // headroom above resonance peak
    var points   = [];
    for (var x = 0; x <= width; x++) {
      var u  = Math.pow(10, (x / width - fcNorm) * logRange);
      var db = filterDb(u, params.Q);
      var y  = height - Math.max(0, Math.min(1, (db - dBMin) / (dBMax - dBMin))) * height;
      points.push([x, y]);
    }
    return points;
  }


  // ─── Canvas drawing ───────────────────────────────────────────────────────

  function drawCurve(ctx, width, height, accentRgb) {
    var fcNorm = params.mode === 'lfo' ? lfoFcNorm() : envelopeFcNorm();
    var points = buildCurvePoints(width, height, fcNorm);

    // Filled area under curve
    var gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, 'rgba(' + accentRgb + ',0.25)');
    gradient.addColorStop(1, 'rgba(' + accentRgb + ',0)');

    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    for (var i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
    ctx.lineTo(width, height);
    ctx.lineTo(0, height);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();

    // Curve line with glow
    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    for (var j = 1; j < points.length; j++) ctx.lineTo(points[j][0], points[j][1]);
    ctx.strokeStyle    = 'rgb(' + accentRgb + ')';
    ctx.lineWidth      = 1.5;
    ctx.shadowColor    = 'rgb(' + accentRgb + ')';
    ctx.shadowBlur     = 6;
    ctx.stroke();
    ctx.shadowBlur     = 0;
  }


  // ─── UI utility ───────────────────────────────────────────────────────────

  function hexToRgb(hex) {
    hex = hex.trim().replace('#', '');
    if (hex.length === 3) hex = hex.split('').map(function (c) { return c + c; }).join('');
    var n = parseInt(hex, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }


  // ─── UI: Knob ─────────────────────────────────────────────────────────────
  // Drag upward to increase value, downward to decrease.
  // Indicator sweeps from −135° (min) to +135° (max).

  function createKnob(label, min, max, defaultVal, onChange, formatVal) {
    var wrap = document.createElement('div');
    wrap.className = 'knob-wrap';

    var knob = document.createElement('div');
    knob.className = 'knob';

    var indicator = document.createElement('div');
    indicator.className = 'knob__indicator';
    knob.appendChild(indicator);

    var labelEl = document.createElement('div');
    labelEl.className = 'knob__label';
    labelEl.textContent = label;

    var valueEl = document.createElement('div');
    valueEl.className = 'knob__value';

    wrap.appendChild(knob);
    wrap.appendChild(labelEl);
    wrap.appendChild(valueEl);

    var value = defaultVal;

    function update(v) {
      value = Math.max(min, Math.min(max, v));
      var angle = -135 + (value - min) / (max - min) * 270;
      indicator.style.transform = 'rotate(' + angle + 'deg)';
      valueEl.textContent = formatVal(value);
      onChange(value);
    }

    update(defaultVal);

    var startY, startVal;
    var sensitivity = (max - min) / 150;  // 150 px drag = full range

    function onMove(e) {
      e.preventDefault();
      var clientY = e.touches ? e.touches[0].clientY : e.clientY;
      update(startVal + (startY - clientY) * sensitivity);
    }

    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup',   onUp);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend',  onUp);
    }

    knob.addEventListener('mousedown', function (e) {
      e.preventDefault();
      startY = e.clientY; startVal = value;
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup',   onUp);
    });

    knob.addEventListener('touchstart', function (e) {
      e.preventDefault();
      startY = e.touches[0].clientY; startVal = value;
      document.addEventListener('touchmove', onMove, { passive: false });
      document.addEventListener('touchend',  onUp);
    });

    return wrap;
  }


  // ─── UI: Sparks ───────────────────────────────────────────────────────────
  // Spawns small pixel sparks flying out from the right edge of a label element.
  // Each spark is an absolutely-positioned <span> that CSS-transitions to its
  // destination then removes itself.

  function spawnSparks(toggleEl, labelEl) {
    var labelRect  = labelEl.getBoundingClientRect();
    var parentRect = toggleEl.getBoundingClientRect();
    var originX    = labelRect.right  - parentRect.left;
    var originY    = labelRect.top    - parentRect.top + labelRect.height * 0.5;

    for (var i = 0; i < 6; i++) {
      var angle    = (Math.random() - 0.5) * (Math.PI * 2 / 3);  // ±60° from horizontal
      var distance = 10 + Math.random() * 14;                     // 10–24 px
      var dx       = Math.cos(angle) * distance;
      var dy       = Math.sin(angle) * distance;
      var size     = Math.random() < 0.5 ? 1 : 2;                 // 1 or 2 px
      var duration = 300 + Math.random() * 200;                   // 300–500 ms

      var spark = document.createElement('span');
      spark.style.cssText = [
        'position:absolute',
        'width:'      + size + 'px',
        'height:'     + size + 'px',
        'background:var(--accent)',
        'left:'       + originX + 'px',
        'top:'        + originY + 'px',
        'pointer-events:none',
        'transition:transform ' + duration + 'ms linear,opacity ' + duration + 'ms linear'
      ].join(';');

      toggleEl.appendChild(spark);

      // Force reflow to commit the start position before setting the end state
      spark.getBoundingClientRect();
      spark.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
      spark.style.opacity   = '0';

      setTimeout(function (s) { s.remove(); }, duration + 50, spark);
    }
  }


  // ─── UI: Panel show/hide toggle ───────────────────────────────────────────
  // Minimal trigger below the canvas. Chevron rotates to indicate state.
  // Receives the panel element so it can toggle its 'open' class directly.

  function createPanelToggle(panel) {
    var el = document.createElement('div');
    el.className = 'filter-panel-toggle';

    var chevron = document.createElement('span');
    chevron.className = 'filter-panel-toggle__chevron';
    chevron.textContent = '▾';

    var label = document.createElement('span');
    label.textContent = 'controls';

    el.appendChild(chevron);
    el.appendChild(label);

    // Pulse every 10 seconds until the panel is opened for the first time
    var pulseInterval = setInterval(function () {
      el.classList.add('pulsing');
      spawnSparks(el, label);
      el.addEventListener('animationend', function onEnd() {
        el.classList.remove('pulsing');
        el.removeEventListener('animationend', onEnd);
      });
    }, 5000);

    el.addEventListener('click', function () {
      var isOpen = panel.classList.toggle('open');
      el.classList.toggle('open', isOpen);
      if (isOpen) {
        clearInterval(pulseInterval);
      }
    });

    return el;
  }


  // ─── UI: Mode toggle (LFO / Envelope) ────────────────────────────────────
  // iOS-style left/right switch. onChange receives 'lfo' or 'envelope'.

  function createModeToggle(onChange) {
    var wrap = document.createElement('div');
    wrap.className = 'toggle-wrap';

    var track = document.createElement('div');
    track.className = 'toggle-track';

    var thumb = document.createElement('div');
    thumb.className = 'toggle-thumb';
    track.appendChild(thumb);

    var labels = document.createElement('div');
    labels.className = 'toggle-labels';

    var lfoLabel = document.createElement('span');
    lfoLabel.className = 'toggle-label active';
    lfoLabel.textContent = 'LFO';

    var envLabel = document.createElement('span');
    envLabel.className = 'toggle-label';
    envLabel.textContent = 'Envelope';

    labels.appendChild(lfoLabel);
    labels.appendChild(envLabel);
    wrap.appendChild(track);
    wrap.appendChild(labels);

    var isEnvelope = false;

    track.addEventListener('click', function () {
      isEnvelope = !isEnvelope;
      track.classList.toggle('active', isEnvelope);
      lfoLabel.classList.toggle('active', !isEnvelope);
      envLabel.classList.toggle('active', isEnvelope);
      onChange(isEnvelope ? 'envelope' : 'lfo');
    });

    return wrap;
  }


  // ─── UI: Sequencer steps ──────────────────────────────────────────────────
  // 8 click-to-toggle buttons. Active steps trigger the envelope.
  // The currently playing step gets the 'playing' class from updateSequencerHighlight().

  function createSequencerUI() {
    var container = document.createElement('div');
    container.className = 'filter-sequencer';

    sequencer.stepEls = [];

    for (var i = 0; i < 8; i++) {
      var step = document.createElement('button');
      step.className = 'seq-step' + (sequencer.steps[i] ? ' active' : '');
      step.setAttribute('aria-label', 'Step ' + (i + 1));

      // Capture loop variable
      (function (index, el) {
        el.addEventListener('click', function () {
          sequencer.steps[index] = !sequencer.steps[index];
          el.classList.toggle('active', sequencer.steps[index]);
        });
      })(i, step);

      sequencer.stepEls.push(step);
      container.appendChild(step);
    }

    return container;
  }


  // ─── Controls panel ───────────────────────────────────────────────────────
  // Knob sets are rebuilt on mode switch. The toggle element is preserved and
  // re-appended so it always appears at the far right of the row.

  function buildLFOControls(container, toggle) {
    container.innerHTML = '';
    container.appendChild(createKnob(
      'Rate', 0.05, 10.0, params.lfoRate,
      function (v) { params.lfoRate = v; },
      function (v) { return v.toFixed(2) + ' Hz'; }
    ));
    container.appendChild(createKnob(
      'Depth', 0.0, 0.4, params.depth,
      function (v) { params.depth = v; },
      function (v) { return Math.round(v / 0.4 * 100) + '%'; }
    ));
    container.appendChild(createKnob(
      'Resonance', 1, 20, params.Q,
      function (v) { params.Q = v; },
      function (v) { return v.toFixed(1); }
    ));
    container.appendChild(toggle);
  }

  function buildEnvelopeControls(container, toggle) {
    container.innerHTML = '';
    container.appendChild(createKnob(
      'Tempo', 40, 200, params.tempo,
      function (v) { params.tempo = v; },
      function (v) { return Math.round(v) + ' BPM'; }
    ));
    container.appendChild(createKnob(
      'Depth', 0.0, 0.4, params.depth,
      function (v) { params.depth = v; },
      function (v) { return Math.round(v / 0.4 * 100) + '%'; }
    ));
    container.appendChild(createKnob(
      'Attack', 0.01, 1.0, params.attack,
      function (v) { params.attack = v; },
      function (v) { return (v * 1000).toFixed(0) + ' ms'; }
    ));
    container.appendChild(createKnob(
      'Decay', 0.05, 2.0, params.decay,
      function (v) { params.decay = v; },
      function (v) { return v < 1 ? (v * 1000).toFixed(0) + ' ms' : v.toFixed(2) + ' s'; }
    ));
    container.appendChild(createKnob(
      'Resonance', 1, 20, params.Q,
      function (v) { params.Q = v; },
      function (v) { return v.toFixed(1); }
    ));
    container.appendChild(toggle);
  }

  function switchMode(mode, controlsContainer, seqContainer, toggle) {
    params.mode = mode;
    if (mode === 'lfo') {
      buildLFOControls(controlsContainer, toggle);
      seqContainer.style.display = 'none';
    } else {
      buildEnvelopeControls(controlsContainer, toggle);
      seqContainer.style.display = 'flex';
      resetSequencer();
      envelope.phase = 'idle';
      envelope.value = 0;
    }
  }


  // ─── Animation loop ───────────────────────────────────────────────────────

  function makeAnimationLoop(canvas, ctx, accentRgb) {
    var lastTime = performance.now();

    return function frame(now) {
      if (canvas.width !== canvas.offsetWidth || canvas.height !== canvas.offsetHeight) {
        canvas.width  = canvas.offsetWidth;
        canvas.height = canvas.offsetHeight;
      }

      var dt = Math.min((now - lastTime) / 1000, 0.1);  // cap to avoid big jumps on tab restore
      lastTime = now;

      if (params.mode === 'lfo') {
        updateLFO(dt);
      } else {
        advanceSequencer(dt);
        updateEnvelope(dt);
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      drawCurve(ctx, canvas.width, canvas.height, accentRgb);
      requestAnimationFrame(frame);
    };
  }


  // ─── Init ─────────────────────────────────────────────────────────────────

  function init() {
    var header = document.querySelector('.header');
    if (!header) return;

    var canvas = document.createElement('canvas');
    canvas.className = 'filter-viz';
    header.insertAdjacentElement('afterend', canvas);

    // Collapsible panel — hidden on load, revealed by panelToggle
    var panel = document.createElement('div');
    panel.className = 'filter-panel';
    var panelInner = document.createElement('div');
    panelInner.className = 'filter-panel__inner';
    panel.appendChild(panelInner);

    var panelToggle = createPanelToggle(panel);
    canvas.insertAdjacentElement('afterend', panelToggle);
    panelToggle.insertAdjacentElement('afterend', panel);

    var controlsContainer = document.createElement('div');
    controlsContainer.className = 'filter-controls';
    panelInner.appendChild(controlsContainer);

    var seqContainer = createSequencerUI();
    seqContainer.style.display = 'none';
    panelInner.appendChild(seqContainer);

    var modeToggle = createModeToggle(function (mode) {
      switchMode(mode, controlsContainer, seqContainer, modeToggle);
    });

    buildLFOControls(controlsContainer, modeToggle);

    var accentHex = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
    var accentRgb = hexToRgb(accentHex).join(',');
    var ctx       = canvas.getContext('2d');

    requestAnimationFrame(makeAnimationLoop(canvas, ctx, accentRgb));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
