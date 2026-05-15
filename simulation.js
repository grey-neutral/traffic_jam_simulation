(() => {
  const TAU = Math.PI * 2;
  const MAX_DPR = 2;
  const HISTORY_BINS = 42;
  const HISTORY_COLUMNS = 280;

  const canvas = document.getElementById("simulation-canvas");
  const ctx = canvas.getContext("2d", { alpha: false });
  const historyCanvas = document.getElementById("history-canvas");
  const historyCtx = historyCanvas.getContext("2d", { alpha: true });

  const metricEls = {
    speed: document.getElementById("metric-speed"),
    flow: document.getElementById("metric-flow"),
    density: document.getElementById("metric-density"),
    jam: document.getElementById("metric-jam"),
    time: document.getElementById("metric-time"),
  };

  const controls = {
    vehicles: document.getElementById("vehicles"),
    roadLength: document.getElementById("roadLength"),
    targetSpeed: document.getElementById("targetSpeed"),
    reactionTime: document.getElementById("reactionTime"),
    acceleration: document.getElementById("acceleration"),
    braking: document.getElementById("braking"),
    minGap: document.getElementById("minGap"),
    variation: document.getElementById("variation"),
    disturbance: document.getElementById("disturbance"),
    timeScale: document.getElementById("timeScale"),
    showTrails: document.getElementById("showTrails"),
    showHeat: document.getElementById("showHeat"),
    showGhosts: document.getElementById("showGhosts"),
    showSensors: document.getElementById("showSensors"),
  };

  const outputEls = {
    vehicles: document.getElementById("vehicles-value"),
    roadLength: document.getElementById("roadLength-value"),
    targetSpeed: document.getElementById("targetSpeed-value"),
    reactionTime: document.getElementById("reactionTime-value"),
    acceleration: document.getElementById("acceleration-value"),
    braking: document.getElementById("braking-value"),
    minGap: document.getElementById("minGap-value"),
    variation: document.getElementById("variation-value"),
    disturbance: document.getElementById("disturbance-value"),
    timeScale: document.getElementById("timeScale-value"),
  };

  const buttons = {
    toggle: document.getElementById("toggle-run"),
    pulse: document.getElementById("jam-pulse"),
    reset: document.getElementById("reset-sim"),
  };

  const params = {
    vehicles: 64,
    roadLength: 1200,
    targetSpeed: 88 / 3.6,
    reactionTime: 1.1,
    acceleration: 1.55,
    braking: 2.15,
    minGap: 8,
    variation: 0.18,
    disturbance: 0.3,
    timeScale: 1.2,
  };

  const renderFlags = {
    showTrails: true,
    showHeat: true,
    showGhosts: true,
    showSensors: true,
  };

  const state = {
    cars: [],
    running: true,
    time: 0,
    lastFrame: performance.now(),
    passTimes: [],
    history: [],
    historyAccumulator: 0,
    view: { width: 1, height: 1, dpr: 1 },
    historyView: { width: 1, height: 1, dpr: 1 },
    road: {
      cx: 0,
      cy: 0,
      rx: 1,
      ry: 1,
      width: 64,
    },
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function lerp(a, b, amount) {
    return a + (b - a) * amount;
  }

  function wrapDistance(a, b) {
    const raw = Math.abs(a - b) % TAU;
    return Math.min(raw, TAU - raw);
  }

  function mixRgb(a, b, amount) {
    return [
      Math.round(lerp(a[0], b[0], amount)),
      Math.round(lerp(a[1], b[1], amount)),
      Math.round(lerp(a[2], b[2], amount)),
    ];
  }

  function rgba(rgb, alpha) {
    return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
  }

  function speedColor(ratio, alpha = 1) {
    const stops = [
      [255, 78, 100],
      [255, 141, 77],
      [255, 200, 87],
      [107, 242, 164],
      [98, 220, 255],
    ];

    const scaled = clamp(ratio, 0, 1) * (stops.length - 1);
    const index = Math.min(stops.length - 2, Math.floor(scaled));
    return rgba(mixRgb(stops[index], stops[index + 1], scaled - index), alpha);
  }

  function congestionColor(strength, alpha = 1) {
    const warm = mixRgb([255, 200, 87], [255, 78, 100], clamp(strength, 0, 1));
    return rgba(warm, alpha);
  }

  function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }

  function readControls() {
    params.vehicles = Number(controls.vehicles.value);
    params.roadLength = Number(controls.roadLength.value) * 1000;
    params.targetSpeed = Number(controls.targetSpeed.value) / 3.6;
    params.reactionTime = Number(controls.reactionTime.value);
    params.acceleration = Number(controls.acceleration.value);
    params.braking = Number(controls.braking.value);
    params.minGap = Number(controls.minGap.value);
    params.variation = Number(controls.variation.value) / 100;
    params.disturbance = Number(controls.disturbance.value) / 100;
    params.timeScale = Number(controls.timeScale.value);

    renderFlags.showTrails = controls.showTrails.checked;
    renderFlags.showHeat = controls.showHeat.checked;
    renderFlags.showGhosts = controls.showGhosts.checked;
    renderFlags.showSensors = controls.showSensors.checked;
  }

  function setRangeFill(input) {
    const min = Number(input.min);
    const max = Number(input.max);
    const value = Number(input.value);
    const fill = ((value - min) / (max - min)) * 100;
    input.style.setProperty("--fill", `${clamp(fill, 0, 100)}%`);
  }

  function syncOutputs() {
    outputEls.vehicles.value = String(params.vehicles);
    outputEls.roadLength.value = `${(params.roadLength / 1000).toFixed(2)} km`;
    outputEls.targetSpeed.value = `${Math.round(params.targetSpeed * 3.6)} km/h`;
    outputEls.reactionTime.value = `${params.reactionTime.toFixed(2)} s`;
    outputEls.acceleration.value = `${params.acceleration.toFixed(2)} m/s2`;
    outputEls.braking.value = `${params.braking.toFixed(2)} m/s2`;
    outputEls.minGap.value = `${params.minGap.toFixed(1)} m`;
    outputEls.variation.value = `${Math.round(params.variation * 100)}%`;
    outputEls.disturbance.value = `${Math.round(params.disturbance * 100)}%`;
    outputEls.timeScale.value = `${params.timeScale.toFixed(2)}x`;

    Object.values(controls).forEach((control) => {
      if (control instanceof HTMLInputElement && control.type === "range") {
        setRangeFill(control);
      }
    });
  }

  function resizeCanvas(targetCanvas, targetCtx, view) {
    const rect = targetCanvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));
    const scaledWidth = Math.round(width * dpr);
    const scaledHeight = Math.round(height * dpr);

    if (targetCanvas.width !== scaledWidth || targetCanvas.height !== scaledHeight) {
      targetCanvas.width = scaledWidth;
      targetCanvas.height = scaledHeight;
    }

    targetCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    view.width = width;
    view.height = height;
    view.dpr = dpr;
  }

  function resize() {
    resizeCanvas(canvas, ctx, state.view);
    resizeCanvas(historyCanvas, historyCtx, state.historyView);
    updateRoadGeometry();
  }

  function updateRoadGeometry() {
    const { width, height } = state.view;
    const minSide = Math.min(width, height);
    const roadWidth = clamp(minSide * 0.085, 46, 86);
    const rx = clamp(Math.min(width * 0.38, height * 0.44), 130, Math.max(132, width * 0.43));
    const ry = clamp(Math.min(width * 0.22, height * 0.27), 82, Math.max(84, height * 0.3));

    state.road.width = roadWidth;
    state.road.rx = rx;
    state.road.ry = ry;
    state.road.cx = width * 0.5;
    state.road.cy = height * 0.53;
  }

  function pointAt(s, offset = 0) {
    const normalized = ((s % params.roadLength) + params.roadLength) % params.roadLength;
    const theta = (normalized / params.roadLength) * TAU - Math.PI / 2;
    const { cx, cy, rx, ry } = state.road;
    const laneRx = Math.max(10, rx + offset);
    const laneRy = Math.max(10, ry + offset * 0.68);
    const x = cx + Math.cos(theta) * laneRx;
    const y = cy + Math.sin(theta) * laneRy;
    const dx = -Math.sin(theta) * laneRx;
    const dy = Math.cos(theta) * laneRy;

    return {
      x,
      y,
      theta,
      angle: Math.atan2(dy, dx),
    };
  }

  function drawEllipse(offset, lineWidth, strokeStyle, dash = []) {
    const { cx, cy, rx, ry } = state.road;
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(cx, cy, Math.max(10, rx + offset), Math.max(10, ry + offset * 0.68), 0, 0, TAU);
    ctx.setLineDash(dash);
    ctx.lineDashOffset = -state.time * 24;
    ctx.lineWidth = lineWidth;
    ctx.strokeStyle = strokeStyle;
    ctx.lineCap = "round";
    ctx.stroke();
    ctx.restore();
  }

  function drawPathSegment(s0, s1, offset, lineWidth, strokeStyle, cap = "round") {
    const distance = Math.abs(s1 - s0);
    const steps = clamp(Math.ceil((distance / params.roadLength) * 150), 4, 42);
    ctx.beginPath();
    for (let i = 0; i <= steps; i += 1) {
      const s = lerp(s0, s1, i / steps);
      const point = pointAt(s, offset);
      if (i === 0) {
        ctx.moveTo(point.x, point.y);
      } else {
        ctx.lineTo(point.x, point.y);
      }
    }
    ctx.lineWidth = lineWidth;
    ctx.strokeStyle = strokeStyle;
    ctx.lineCap = cap;
    ctx.stroke();
  }

  function drawWrappedSegment(s0, s1, offset, lineWidth, strokeStyle, cap = "round") {
    if (s0 < 0) {
      drawPathSegment(params.roadLength + s0, params.roadLength, offset, lineWidth, strokeStyle, cap);
      drawPathSegment(0, s1, offset, lineWidth, strokeStyle, cap);
    } else if (s1 > params.roadLength) {
      drawPathSegment(s0, params.roadLength, offset, lineWidth, strokeStyle, cap);
      drawPathSegment(0, s1 - params.roadLength, offset, lineWidth, strokeStyle, cap);
    } else {
      drawPathSegment(s0, s1, offset, lineWidth, strokeStyle, cap);
    }
  }

  function createCar(index, spacing) {
    const lanePattern = [-0.26, 0, 0.26, -0.1, 0.1];
    const jitter = (Math.random() - 0.5) * spacing * 0.2 * params.disturbance;
    const speedBlend = 0.72 + Math.random() * 0.18 - params.disturbance * Math.random() * 0.2;
    const variation = params.variation;

    return {
      s: (index * spacing + spacing * 0.35 + jitter + params.roadLength) % params.roadLength,
      v: params.targetSpeed * clamp(speedBlend, 0.35, 1),
      a: 0,
      pulse: 0,
      seed: Math.random() * 1000,
      driverFactor: clamp(1 + (Math.random() - 0.5) * variation * 1.5, 0.68, 1.34),
      reactionFactor: clamp(1 + (Math.random() - 0.5) * variation, 0.72, 1.42),
      laneOffsetFactor: lanePattern[index % lanePattern.length] + (Math.random() - 0.5) * 0.06,
    };
  }

  function resetSimulation({ keepClock = false } = {}) {
    const spacing = params.roadLength / params.vehicles;
    state.cars = Array.from({ length: params.vehicles }, (_, index) => createCar(index, spacing));
    state.passTimes = [];
    state.history = [];
    state.historyAccumulator = 0;

    if (!keepClock) {
      state.time = 0;
    }

    if (params.disturbance > 0.08) {
      triggerJamPulse(0.46, params.disturbance * 0.65);
    }
  }

  function triggerJamPulse(centerRatio = 0.72, strength = 1) {
    const center = centerRatio * params.roadLength;
    const radius = params.roadLength * (0.035 + params.disturbance * 0.06);

    state.cars.forEach((car) => {
      const direct = Math.abs(car.s - center);
      const wrapped = params.roadLength - direct;
      const distance = Math.min(direct, wrapped);
      if (distance < radius) {
        const falloff = 1 - distance / radius;
        car.pulse = Math.max(car.pulse, 1.6 + falloff * 2.7 * strength);
        car.v *= clamp(1 - falloff * 0.55 * strength, 0.18, 1);
      }
    });
  }

  function physicsStep(dt) {
    const cars = state.cars;
    const n = cars.length;
    const accelerations = new Array(n);
    const physicalLength = clamp((params.roadLength / params.vehicles) * 0.42, 2.2, 4.8);
    const desiredSpeedBase = Math.max(1, params.targetSpeed);

    for (let i = 0; i < n; i += 1) {
      const car = cars[i];
      const leader = cars[(i + 1) % n];
      const rawGap = (leader.s - car.s + params.roadLength) % params.roadLength;
      const gap = Math.max(0.35, rawGap - physicalLength);
      const deltaV = car.v - leader.v;
      const desiredSpeed = desiredSpeedBase * car.driverFactor;
      const reactionTime = params.reactionTime * car.reactionFactor;
      const root = 2 * Math.sqrt(params.acceleration * params.braking);
      const desiredGap =
        params.minGap + Math.max(0, car.v * reactionTime + (car.v * deltaV) / root);
      const freeRoad = 1 - Math.pow(car.v / desiredSpeed, 4);
      const following = Math.pow(desiredGap / gap, 2);
      let acceleration = params.acceleration * (freeRoad - following);

      const theta = (car.s / params.roadLength) * TAU;
      const zoneCenter = (0.82 + Math.sin(state.time * 0.045) * 0.08) * TAU;
      const zone = Math.exp(-Math.pow(wrapDistance(theta, zoneCenter), 2) / 0.024);
      const hesitation = params.braking * params.disturbance * zone * 0.75;
      const driverNoise =
        Math.sin(state.time * 0.76 + car.seed) * 0.22 * params.disturbance +
        Math.sin(state.time * 1.37 + car.seed * 0.37) * 0.08 * params.disturbance;

      acceleration += driverNoise - hesitation;

      if (car.pulse > 0) {
        acceleration -= params.braking * (0.9 + car.pulse * 0.45);
        car.pulse = Math.max(0, car.pulse - dt);
      }

      accelerations[i] = clamp(acceleration, -params.braking * 3.5, params.acceleration * 1.8);
    }

    for (let i = 0; i < n; i += 1) {
      const car = cars[i];
      const previousS = car.s;
      car.a = accelerations[i];
      car.v = clamp(car.v + car.a * dt, 0, params.targetSpeed * car.driverFactor * 1.35 + 4);
      car.s = (car.s + car.v * dt + params.roadLength) % params.roadLength;

      if (car.s < previousS) {
        state.passTimes.push(state.time);
      }
    }

    const flowWindow = 55;
    while (state.passTimes.length && state.passTimes[0] < state.time - flowWindow) {
      state.passTimes.shift();
    }
  }

  function update(dt) {
    if (!state.running) {
      return;
    }

    const scaledDt = dt * params.timeScale;
    const subSteps = Math.max(1, Math.ceil(scaledDt / 0.035));
    const stepDt = scaledDt / subSteps;

    for (let i = 0; i < subSteps; i += 1) {
      physicsStep(stepDt);
      state.time += stepDt;
    }

    state.historyAccumulator += scaledDt;
    if (state.historyAccumulator >= 0.18) {
      state.historyAccumulator = 0;
      addHistoryColumn();
    }
  }

  function computeBins(binCount) {
    const bins = Array.from({ length: binCount }, () => ({ count: 0, speed: 0 }));
    state.cars.forEach((car) => {
      const index = Math.min(binCount - 1, Math.floor((car.s / params.roadLength) * binCount));
      bins[index].count += 1;
      bins[index].speed += car.v;
    });
    return bins.map((bin) => {
      const average = bin.count > 0 ? bin.speed / bin.count : params.targetSpeed;
      return {
        count: bin.count,
        speed: average,
        speedRatio: clamp(average / Math.max(1, params.targetSpeed), 0, 1.2),
        jamStrength: bin.count > 0 ? clamp(1 - average / Math.max(1, params.targetSpeed), 0, 1) : 0,
      };
    });
  }

  function addHistoryColumn() {
    const bins = computeBins(HISTORY_BINS).map((bin) => bin.speedRatio);
    state.history.push(bins);
    if (state.history.length > HISTORY_COLUMNS) {
      state.history.shift();
    }
  }

  function drawBackground() {
    const { width, height } = state.view;
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, "#090a07");
    gradient.addColorStop(0.42, "#12130f");
    gradient.addColorStop(1, "#070806");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    const glowA = ctx.createRadialGradient(width * 0.24, height * 0.18, 0, width * 0.24, height * 0.18, width * 0.62);
    glowA.addColorStop(0, "rgba(98, 220, 255, 0.12)");
    glowA.addColorStop(1, "rgba(98, 220, 255, 0)");
    ctx.fillStyle = glowA;
    ctx.fillRect(0, 0, width, height);

    const glowB = ctx.createRadialGradient(width * 0.82, height * 0.74, 0, width * 0.82, height * 0.74, width * 0.52);
    glowB.addColorStop(0, "rgba(255, 141, 77, 0.11)");
    glowB.addColorStop(1, "rgba(255, 141, 77, 0)");
    ctx.fillStyle = glowB;
    ctx.fillRect(0, 0, width, height);
  }

  function drawRoadBase() {
    const { width } = state.road;
    ctx.save();
    ctx.shadowColor = "rgba(0, 0, 0, 0.55)";
    ctx.shadowBlur = 32;
    drawEllipse(0, width + 18, "rgba(0, 0, 0, 0.5)");
    ctx.shadowBlur = 0;
    drawEllipse(0, width + 10, "rgba(24, 26, 22, 0.95)");
    drawEllipse(0, width - 4, "rgba(38, 40, 35, 0.92)");
    drawEllipse(0, 2, "rgba(255, 255, 255, 0.10)", [18, 18]);
    drawEllipse(-width * 0.23, 1.3, "rgba(255, 255, 255, 0.16)", [12, 22]);
    drawEllipse(width * 0.23, 1.3, "rgba(255, 255, 255, 0.16)", [12, 22]);
    drawEllipse(-width * 0.56, 2.2, "rgba(98, 220, 255, 0.28)");
    drawEllipse(width * 0.56, 2.2, "rgba(255, 200, 87, 0.20)");
    ctx.restore();
  }

  function drawHeatOverlay(bins) {
    if (!renderFlags.showHeat) {
      return;
    }

    const segmentLength = params.roadLength / bins.length;
    bins.forEach((bin, index) => {
      const expectedDensity = params.vehicles / bins.length;
      const crowding = expectedDensity > 0 ? clamp(bin.count / expectedDensity - 0.8, 0, 1.4) : 0;
      const strength = clamp(bin.jamStrength * 1.25 + crowding * 0.18, 0, 1);
      if (strength < 0.04) {
        return;
      }

      drawPathSegment(
        index * segmentLength,
        (index + 1) * segmentLength,
        0,
        state.road.width + 15,
        congestionColor(strength, 0.08 + strength * 0.36),
        "butt",
      );
    });
  }

  function drawWaveEchoes(bins) {
    if (!renderFlags.showGhosts) {
      return;
    }

    const segmentLength = params.roadLength / bins.length;
    bins.forEach((bin, index) => {
      if (bin.jamStrength < 0.42 || bin.count === 0) {
        return;
      }

      const pulse = (Math.sin(state.time * 2.2 + index * 0.9) + 1) * 0.5;
      const offset = state.road.width * (0.64 + pulse * 0.08);
      const alpha = 0.08 + bin.jamStrength * 0.22;
      drawPathSegment(
        index * segmentLength,
        (index + 0.78) * segmentLength,
        offset,
        1.4 + pulse * 1.8,
        `rgba(255, 78, 100, ${alpha})`,
      );
      drawPathSegment(
        index * segmentLength,
        (index + 0.65) * segmentLength,
        -offset,
        1 + pulse * 1.4,
        `rgba(255, 200, 87, ${alpha * 0.72})`,
      );
    });
  }

  function drawSensors() {
    if (!renderFlags.showSensors) {
      return;
    }

    const gates = [0, 0.25, 0.5, 0.75];
    gates.forEach((ratio, index) => {
      const s = ratio * params.roadLength;
      const inner = pointAt(s, -state.road.width * 0.58);
      const outer = pointAt(s, state.road.width * 0.58);
      const mid = pointAt(s, 0);
      const pulse = 0.5 + Math.sin(state.time * 3 + index) * 0.5;

      ctx.save();
      ctx.strokeStyle = `rgba(98, 220, 255, ${0.22 + pulse * 0.28})`;
      ctx.lineWidth = 2;
      ctx.shadowColor = "rgba(98, 220, 255, 0.8)";
      ctx.shadowBlur = 14;
      ctx.beginPath();
      ctx.moveTo(inner.x, inner.y);
      ctx.lineTo(outer.x, outer.y);
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.fillStyle = "rgba(245, 241, 232, 0.72)";
      ctx.font = "700 11px Inter, system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(`S${index + 1}`, mid.x, mid.y);
      ctx.restore();
    });
  }

  function drawTrails() {
    if (!renderFlags.showTrails) {
      return;
    }

    state.cars.forEach((car) => {
      const speedRatio = clamp(car.v / Math.max(1, params.targetSpeed), 0, 1);
      const laneOffset = car.laneOffsetFactor * state.road.width;
      const trailLength = 12 + car.v * 1.8;
      const width = clamp(state.road.width * 0.052, 2.2, 4.6);
      const alpha = 0.08 + speedRatio * 0.22;
      drawWrappedSegment(
        car.s - trailLength,
        car.s - 1.4,
        laneOffset,
        width,
        speedColor(speedRatio, alpha),
      );
    });
  }

  function drawCars() {
    const carLength = clamp(state.road.width * 0.35, 16, 28);
    const carWidth = clamp(state.road.width * 0.15, 7, 12);
    const densityScale = clamp(95 / Math.max(1, params.vehicles), 0.62, 1);

    state.cars.forEach((car) => {
      const speedRatio = clamp(car.v / Math.max(1, params.targetSpeed), 0, 1);
      const laneOffset = car.laneOffsetFactor * state.road.width;
      const point = pointAt(car.s, laneOffset);
      const bodyColor = speedColor(speedRatio, 1);
      const brakeAlpha = clamp(0.2 + Math.max(0, -car.a) / Math.max(1, params.braking), 0, 1);

      ctx.save();
      ctx.translate(point.x, point.y);
      ctx.rotate(point.angle);
      ctx.globalAlpha = 0.92;
      ctx.shadowColor = speedColor(speedRatio, 0.75);
      ctx.shadowBlur = 16 + speedRatio * 12;
      ctx.fillStyle = bodyColor;
      ctx.beginPath();
      ctx.roundRect(
        (-carLength * densityScale) / 2,
        (-carWidth * densityScale) / 2,
        carLength * densityScale,
        carWidth * densityScale,
        3,
      );
      ctx.fill();

      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
      ctx.fillStyle = "rgba(255, 255, 255, 0.74)";
      ctx.fillRect(carLength * densityScale * 0.06, -carWidth * densityScale * 0.28, carLength * densityScale * 0.22, carWidth * densityScale * 0.56);

      ctx.fillStyle = `rgba(255, 63, 86, ${brakeAlpha})`;
      ctx.fillRect(-carLength * densityScale * 0.48, -carWidth * densityScale * 0.42, carLength * densityScale * 0.12, carWidth * densityScale * 0.25);
      ctx.fillRect(-carLength * densityScale * 0.48, carWidth * densityScale * 0.17, carLength * densityScale * 0.12, carWidth * densityScale * 0.25);

      ctx.fillStyle = `rgba(255, 245, 200, ${0.24 + speedRatio * 0.38})`;
      ctx.fillRect(carLength * densityScale * 0.4, -carWidth * densityScale * 0.35, carLength * densityScale * 0.14, carWidth * densityScale * 0.22);
      ctx.fillRect(carLength * densityScale * 0.4, carWidth * densityScale * 0.13, carLength * densityScale * 0.14, carWidth * densityScale * 0.22);
      ctx.restore();
    });
  }

  function drawCentralReadout(bins) {
    const jamIndex = state.cars.length
      ? state.cars.filter((car) => car.v < params.targetSpeed * 0.35).length / state.cars.length
      : 0;
    const flowPressure = clamp(params.vehicles / (params.roadLength / 1000) / 140, 0, 1);
    const { cx, cy } = state.road;
    const radius = clamp(state.road.ry * 0.46, 42, 84);

    const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius * 1.7);
    gradient.addColorStop(0, `rgba(98, 220, 255, ${0.08 + flowPressure * 0.1})`);
    gradient.addColorStop(0.62, `rgba(255, 200, 87, ${jamIndex * 0.12})`);
    gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 1.75, 0, TAU);
    ctx.fill();

    const orbitCount = 3;
    for (let i = 0; i < orbitCount; i += 1) {
      const orbitRadius = radius * (0.78 + i * 0.31);
      ctx.beginPath();
      ctx.arc(cx, cy, orbitRadius, 0, TAU);
      ctx.strokeStyle = `rgba(255, 255, 255, ${0.05 + i * 0.025})`;
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    const activeBins = bins.filter((bin) => bin.jamStrength > 0.2).length;
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "rgba(245, 241, 232, 0.86)";
    ctx.font = "800 18px Inter, system-ui, sans-serif";
    ctx.fillText(`${Math.round(flowPressure * 100)}%`, cx, cy - 9);
    ctx.fillStyle = "rgba(170, 167, 157, 0.9)";
    ctx.font = "700 10px Inter, system-ui, sans-serif";
    ctx.fillText(`${activeBins} jam sectors`, cx, cy + 14);
    ctx.restore();
  }

  function drawHistory() {
    const { width, height } = state.historyView;
    historyCtx.clearRect(0, 0, width, height);

    const background = historyCtx.createLinearGradient(0, 0, width, height);
    background.addColorStop(0, "rgba(255, 255, 255, 0.05)");
    background.addColorStop(1, "rgba(255, 255, 255, 0.015)");
    historyCtx.fillStyle = background;
    historyCtx.fillRect(0, 0, width, height);

    const columns = Math.min(HISTORY_COLUMNS, Math.max(1, state.history.length));
    const columnWidth = width / HISTORY_COLUMNS;
    const rowHeight = height / HISTORY_BINS;
    const start = Math.max(0, state.history.length - HISTORY_COLUMNS);

    for (let x = start; x < state.history.length; x += 1) {
      const column = state.history[x];
      const drawX = (x - start) * columnWidth;
      for (let y = 0; y < HISTORY_BINS; y += 1) {
        const ratio = column[y] ?? 1;
        historyCtx.fillStyle = speedColor(ratio, 0.86);
        historyCtx.fillRect(drawX, height - (y + 1) * rowHeight, Math.ceil(columnWidth) + 0.5, Math.ceil(rowHeight) + 0.5);
      }
    }

    historyCtx.strokeStyle = "rgba(255, 255, 255, 0.10)";
    historyCtx.lineWidth = 1;
    for (let i = 1; i < 4; i += 1) {
      const y = (height / 4) * i;
      historyCtx.beginPath();
      historyCtx.moveTo(0, y);
      historyCtx.lineTo(width, y);
      historyCtx.stroke();
    }

    if (columns < HISTORY_COLUMNS) {
      const fadeX = columns * columnWidth;
      const fade = historyCtx.createLinearGradient(fadeX, 0, width, 0);
      fade.addColorStop(0, "rgba(255, 255, 255, 0.02)");
      fade.addColorStop(1, "rgba(255, 255, 255, 0)");
      historyCtx.fillStyle = fade;
      historyCtx.fillRect(fadeX, 0, width - fadeX, height);
    }
  }

  function updateMetrics() {
    const averageSpeed =
      state.cars.reduce((total, car) => total + car.v, 0) / Math.max(1, state.cars.length);
    const density = params.vehicles / (params.roadLength / 1000);
    const jammedCars = state.cars.filter((car) => car.v < params.targetSpeed * 0.35).length;
    const jamIndex = (jammedCars / Math.max(1, state.cars.length)) * 100;
    const flowWindow = 55;
    const flow = (state.passTimes.length / flowWindow) * 3600;

    metricEls.speed.textContent = `${Math.round(averageSpeed * 3.6)} km/h`;
    metricEls.flow.textContent = `${Math.round(flow)} veh/h`;
    metricEls.density.textContent = `${Math.round(density)} veh/km`;
    metricEls.jam.textContent = `${Math.round(jamIndex)}%`;
    metricEls.time.textContent = formatTime(state.time);
  }

  function render() {
    drawBackground();
    const bins = computeBins(96);
    drawRoadBase();
    drawHeatOverlay(bins);
    drawSensors();
    drawTrails();
    drawWaveEchoes(bins);
    drawCentralReadout(bins);
    drawCars();
    drawHistory();
    updateMetrics();
  }

  function frame(now) {
    const dt = clamp((now - state.lastFrame) / 1000, 0, 0.08);
    state.lastFrame = now;
    update(dt);
    render();
    requestAnimationFrame(frame);
  }

  function handleParamInput(event) {
    const id = event.currentTarget.id;
    readControls();
    syncOutputs();

    if (id === "vehicles" || id === "roadLength" || id === "variation") {
      resetSimulation({ keepClock: true });
    }
  }

  Object.entries(controls).forEach(([key, control]) => {
    if (!(control instanceof HTMLInputElement)) {
      return;
    }
    control.addEventListener("input", key.startsWith("show") ? () => readControls() : handleParamInput);
    control.addEventListener("change", key.startsWith("show") ? () => readControls() : handleParamInput);
  });

  buttons.toggle.addEventListener("click", () => {
    state.running = !state.running;
    buttons.toggle.textContent = state.running ? "Pause" : "Resume";
  });

  buttons.pulse.addEventListener("click", () => {
    triggerJamPulse(0.7 + Math.random() * 0.18, 1.15);
  });

  buttons.reset.addEventListener("click", () => {
    resetSimulation();
  });

  window.addEventListener("resize", resize);

  readControls();
  syncOutputs();
  resize();
  resetSimulation();
  requestAnimationFrame(frame);
})();
