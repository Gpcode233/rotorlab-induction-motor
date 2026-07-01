const hostedDemo = !["localhost", "127.0.0.1"].includes(location.hostname);
const socket = !hostedDemo && typeof io === "function" ? io() : null;
const chart = document.getElementById("speedChart");
const ctx = chart.getContext("2d");
const gaugeArc = document.getElementById("gaugeArc");
const gaugeTargetTick = document.getElementById("gaugeTargetTick");
const history = [];
let latest = null;
let token = localStorage.getItem("rotorlab_token");
let user = JSON.parse(localStorage.getItem("rotorlab_user") || "null");
let registerMode = false;
let filterEnabled = true;
let controlTimer;

const $ = (id) => document.getElementById(id);

const DEFAULT_SETTINGS = {
  kp: 0.72,
  ki: 0.18,
  kd: 0.06,
  filterTaps: 7,
  samplingFrequencyHz: 5,
  passBandFrequencyHz: 0.8,
  stopBandFrequencyHz: 2,
};

function loadSettings() {
  const saved = JSON.parse(localStorage.getItem("rotorlab_settings") || "{}");
  return { ...DEFAULT_SETTINGS, ...saved };
}

function saveSettings() {
  const settings = {
    kp: Number($("kpInput").value),
    ki: Number($("kiInput").value),
    kd: Number($("kdInput").value),
    filterTaps: Number($("filterTapsInput").value),
    samplingFrequencyHz: Number($("samplingFrequencyInput").value),
    passBandFrequencyHz: Number($("passBandInput").value),
    stopBandFrequencyHz: Number($("stopBandInput").value),
  };
  localStorage.setItem("rotorlab_settings", JSON.stringify(settings));
}

async function loadMotors() {
  try {
    const response = await fetch("/api/motors");
    const motors = await response.json();
    const select = $("motorSelect");
    select.innerHTML = motors.map((m) => `<option value="${m.id}">${m.name}</option>`).join("");
    const savedMotorId = localStorage.getItem("rotorlab_motor_id");
    if (savedMotorId && motors.some((m) => m.id === savedMotorId)) {
      select.value = savedMotorId;
    } else if (motors.length > 0) {
      select.value = motors[0].id;
    }
    select.addEventListener("change", (e) => {
      localStorage.setItem("rotorlab_motor_id", e.target.value);
      location.reload();
    });
  } catch (error) {
    console.error("Failed to load motors:", error);
  }
}

if (token && user) showApp();

$("authToggle").addEventListener("click", () => {
  registerMode = !registerMode;
  $("nameField").classList.toggle("hidden", !registerMode);
  $("authTitle").textContent = registerMode ? "Create operator account" : "Access control station";
  $("authSubtitle").textContent = registerMode
    ? "Credentials are stored locally for this demonstration."
    : "Sign in to operate and save motor experiments.";
  $("authSubmit").textContent = registerMode ? "Create account" : "Sign in";
  $("authToggle").textContent = registerMode ? "Already registered? Sign in" : "New operator? Create an account";
  $("authError").textContent = "";
});

$("authForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const payload = {
    name: $("nameInput").value,
    email: $("emailInput").value,
    password: $("passwordInput").value,
  };

  try {
    if (hostedDemo) {
      const accounts = JSON.parse(localStorage.getItem("rotorlab_accounts") || "[]");
      const email = payload.email.trim().toLowerCase();
      let account = accounts.find((item) => item.email === email);
      if (registerMode) {
        if (account) throw new Error("An account with that email already exists.");
        account = { id: crypto.randomUUID(), name: payload.name.trim(), email, password: payload.password };
        accounts.push(account);
        localStorage.setItem("rotorlab_accounts", JSON.stringify(accounts));
      } else if (!account || account.password !== payload.password) {
        throw new Error("Invalid email or password.");
      }
      token = crypto.randomUUID();
      user = { id: account.id, name: account.name, email: account.email };
      localStorage.setItem("rotorlab_token", token);
      localStorage.setItem("rotorlab_user", JSON.stringify(user));
      showApp();
      return;
    }

    const response = await fetch(`/api/auth/${registerMode ? "register" : "login"}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    token = result.token;
    user = result.user;
    localStorage.setItem("rotorlab_token", token);
    localStorage.setItem("rotorlab_user", JSON.stringify(user));
    showApp();
  } catch (error) {
    $("authError").textContent = error.message;
  }
});

$("logoutBtn").addEventListener("click", () => {
  localStorage.removeItem("rotorlab_token");
  localStorage.removeItem("rotorlab_user");
  location.reload();
});

document.querySelectorAll(".nav-link").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".nav-link").forEach((item) => item.classList.remove("active"));
    document.querySelectorAll(".page-section").forEach((item) => item.classList.add("hidden"));
    button.classList.add("active");
    $(`${button.dataset.section}Section`).classList.remove("hidden");
    if (button.dataset.section === "analysis") loadHistory();
  });
});

$("startStopBtn").addEventListener("click", async () => {
  await api(`/api/simulation/${latest?.running ? "stop" : "start"}`, { method: "POST" });
});

$("pauseBtn").addEventListener("click", async () => {
  if (!latest?.running) {
    toast("Start the motor before pausing");
    return;
  }
  await api(`/api/simulation/${latest.paused ? "resume" : "pause"}`, { method: "POST" });
});

$("resetBtn").addEventListener("click", async () => {
  await api("/api/simulation/reset", { method: "POST" });
  history.length = 0;
  toast("Simulation reset");
});

$("disturbanceBtn").addEventListener("click", async () => {
  await api("/api/simulation/disturbance", { method: "POST" });
  toast("Load disturbance applied");
});

$("filterToggle").addEventListener("click", () => {
  filterEnabled = !filterEnabled;
  $("filterToggle").classList.toggle("active", filterEnabled);
  queueControlUpdate();
});

document.querySelectorAll(".preset-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    $("kpInput").value = btn.dataset.kp;
    $("kiInput").value = btn.dataset.ki;
    $("kdInput").value = btn.dataset.kd;
    document.querySelectorAll(".preset-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    queueControlUpdate();
  });
});

[
  "targetInput",
  "loadInput",
  "kpInput",
  "kiInput",
  "kdInput",
  "filterTapsInput",
  "samplingFrequencyInput",
  "passBandInput",
  "stopBandInput",
].forEach((id) => {
  $(id).addEventListener("input", () => {
    $("targetOutput").textContent = `${Number($("targetInput").value).toLocaleString()} RPM`;
    $("loadOutput").textContent = `${Number($("loadInput").value).toFixed(0)} Nm`;
    if (["kpInput", "kiInput", "kdInput", "filterTapsInput", "samplingFrequencyInput", "passBandInput", "stopBandInput"].includes(id)) {
      saveSettings();
    }
    queueControlUpdate();
  });
});

$("saveRunBtn").addEventListener("click", async () => {
  const label = `Test at ${latest?.config.targetRpm || 0} RPM`;
  await api("/api/performance", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ label }),
  });
  await loadHistory();
  toast("Experiment saved locally");
});

socket?.on("motor:update", (snapshot) => {
  latest = snapshot;
  history.push(snapshot);
  if (history.length > 180) history.shift();
  render(snapshot);
  drawChart();
});

if (hostedDemo) startHostedSimulation();

window.addEventListener("resize", drawChart);
setInterval(() => {
  $("footerClock").textContent = new Date().toLocaleTimeString();
}, 1000);

function showApp() {
  $("authShell").classList.add("hidden");
  $("appShell").classList.remove("hidden");
  $("operatorName").textContent = user.name;
  const settings = loadSettings();
  $("kpInput").value = settings.kp;
  $("kiInput").value = settings.ki;
  $("kdInput").value = settings.kd;
  $("filterTapsInput").value = settings.filterTaps;
  $("samplingFrequencyInput").value = settings.samplingFrequencyHz;
  $("passBandInput").value = settings.passBandFrequencyHz;
  $("stopBandInput").value = settings.stopBandFrequencyHz;
  if (!hostedDemo) loadMotors();
}

function render(data) {
  const config = data.config;
  $("filteredRpm").textContent = Math.round(data.filteredRpm).toLocaleString();
  $("rawRpm").textContent = Math.round(data.rawRpm).toLocaleString();
  $("slip").textContent = data.slipPercent.toFixed(1);
  $("powerRating").textContent = data.motor.ratedPowerKw;
  $("ratedVoltage").textContent = data.motor.ratedVoltage;
  $("stability").textContent = data.stability.toUpperCase();
  $("speedDelta").textContent = `Target ${config.targetRpm.toLocaleString()} RPM | Error ${Math.round(data.speedError)} RPM`;
  $("runState").textContent = data.paused ? "paused" : data.running ? "online" : "offline";
  $("startBtnIcon").textContent = data.running ? "◼" : "▶";
  $("startBtnText").textContent = data.running ? " Stop motor" : " Start motor";
  $("pauseBtn").textContent = data.paused ? "Resume" : "Pause";
  $("pauseBtn").disabled = !data.running;
  $("stabilityDot").style.background = data.stability === "stable" ? "var(--green)" : data.running ? "var(--amber)" : "var(--muted)";
  $("statusDetail").textContent = data.paused
    ? "Simulation paused"
    : data.stability === "stable"
      ? "Within +/-2% target"
      : data.running
        ? "Controller active"
        : "System idle";
  $("elapsedTime").textContent = `${formatTime(data.elapsedSeconds)} elapsed`;
  $("syncSpeed").textContent = `${data.maxSpeedRpm.toLocaleString()} RPM chart max`;
  $("filterDescription").textContent =
    `${config.filterTaps}-tap filter | Fs ${config.samplingFrequencyHz} Hz | Pass ${config.passBandFrequencyHz} Hz | Stop ${config.stopBandFrequencyHz} Hz`;
  $("analysisError").textContent = `${data.speedError.toFixed(1)} RPM`;
  $("analysisOvershoot").textContent = `${data.overshootPercent.toFixed(2)}%`;
  $("analysisSettling").textContent = data.settlingTimeSeconds === null ? "-" : `${data.settlingTimeSeconds.toFixed(1)} s`;
  $("analysisMse").textContent = Math.round(data.meanSquaredError).toLocaleString();

  updateGauge(data.filteredRpm, data.config.targetRpm);

  const motor = data.motor;
  $("motorName").textContent = motor.name;
  $("parameterList").innerHTML = [
    ["POWER RATING", `${motor.ratedPowerKw} kW`],
    ["RATED VOLTAGE", `${motor.ratedVoltage} V`],
    ["FREQUENCY", `${motor.frequency} Hz`],
    ["POLES", motor.poles],
    ["RATED SPEED", `${motor.ratedSpeedRpm} RPM`],
    ["RATED TORQUE", `${motor.ratedTorqueNm} Nm`],
  ].map(([label, value]) => `<div><span>${label}</span><strong>${value}</strong></div>`).join("");
}

function drawChart() {
  const rect = chart.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  chart.width = rect.width * dpr;
  chart.height = rect.height * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, rect.width, rect.height);

  const width = rect.width;
  const height = rect.height;
  const maxRpm = latest?.maxSpeedRpm || 3000;
  ctx.strokeStyle = "#202526";
  ctx.lineWidth = 1;
  for (let row = 0; row <= 4; row += 1) {
    const y = row * height / 4;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
    ctx.fillStyle = "#69716f";
    ctx.font = "10px IBM Plex Mono";
    ctx.fillText(`${Math.round(maxRpm - row * maxRpm / 4)}`, 4, Math.max(10, y - 5));
  }

  plot("rawRpm", "#02bd88", 1, .55);
  plot("filteredRpm", "#f0a72e", 2, 1);
  plot("target", "#656d6b", 1, .9, [5, 5]);

  function plot(key, color, lineWidth, alpha, dash = []) {
    if (history.length < 2) return;
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.globalAlpha = alpha;
    ctx.lineWidth = lineWidth;
    ctx.setLineDash(dash);
    history.forEach((sample, index) => {
      const value = key === "target" ? sample.config.targetRpm : sample[key];
      const x = index / Math.max(1, history.length - 1) * width;
      const y = height - value / maxRpm * height;
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.setLineDash([]);
  }
}

function updateGauge(rpm, targetRpm) {
  const maxRpm = 3000;
  const arcTotal = 424.12;
  const circumference = 565.49;
  const fill = (Math.min(Math.max(rpm, 0), maxRpm) / maxRpm) * arcTotal;
  const color = rpm > targetRpm * 1.08 ? "#ef6c61" : rpm >= targetRpm * 0.92 ? "#77d296" : "#f0a72e";
  gaugeArc.style.strokeDasharray = `${fill} ${circumference}`;
  gaugeArc.style.stroke = color;
  const targetAngle = 135 + (Math.min(Math.max(targetRpm, 0), maxRpm) / maxRpm) * 270;
  gaugeTargetTick.setAttribute("transform", `rotate(${targetAngle - 270} 110 115)`);
}

function queueControlUpdate() {
  clearTimeout(controlTimer);
  controlTimer = setTimeout(() => {
    api("/api/simulation/control", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        targetRpm: $("targetInput").value,
        loadTorqueNm: $("loadInput").value,
        kp: $("kpInput").value,
        ki: $("kiInput").value,
        kd: $("kdInput").value,
        filterEnabled,
        filterTaps: $("filterTapsInput").value,
        samplingFrequencyHz: $("samplingFrequencyInput").value,
        passBandFrequencyHz: $("passBandInput").value,
        stopBandFrequencyHz: $("stopBandInput").value,
      }),
    });
  }, 120);
}

async function loadHistory() {
  try {
    let runs;
    if (hostedDemo) {
      runs = JSON.parse(localStorage.getItem(`rotorlab_runs_${user.id}`) || "[]").reverse();
    } else {
      runs = await api("/api/performance");
    }
    renderHistory(runs);
    if (runs.length > 0) {
      $("exportCsvBtn").style.display = "block";
      $("exportJsonBtn").style.display = "block";
      $("exportCsvBtn").onclick = () => exportData(runs, "csv");
      $("exportJsonBtn").onclick = () => exportData(runs, "json");
    } else {
      $("exportCsvBtn").style.display = "none";
      $("exportJsonBtn").style.display = "none";
    }
  } catch (error) {
    toast(error.message);
  }
}

function exportData(runs, format) {
  let data, filename, type;
  if (format === "csv") {
    const headers = ["Label", "Target RPM", "Filtered RPM", "Overshoot %", "Settling Time (s)", "Created At"];
    const rows = runs.map((r) => [
      escapeHtml(r.label),
      r.targetRpm,
      Math.round(r.filteredRpm),
      r.overshootPercent.toFixed(1),
      r.settlingTimeSeconds === null ? "Not settled" : r.settlingTimeSeconds.toFixed(1),
      new Date(r.createdAt).toLocaleString(),
    ]);
    data = [headers, ...rows].map((row) => row.map((cell) => `"${cell}"`).join(",")).join("\n");
    filename = "rotorlab-runs.csv";
    type = "text/csv";
  } else {
    data = JSON.stringify(runs, null, 2);
    filename = "rotorlab-runs.json";
    type = "application/json";
  }
  const blob = new Blob([data], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  toast(`Exported ${runs.length} run(s) as ${format.toUpperCase()}`);
}

function renderHistory(runs) {
  $("historyList").innerHTML = runs.length ? runs.map((run) => `
      <div class="history-row">
        <strong>${escapeHtml(run.label)}</strong>
        <span>${run.targetRpm} RPM</span>
        <span>${Math.round(run.filteredRpm)} RPM</span>
        <span>${run.overshootPercent.toFixed(1)}% over</span>
        <span>${run.settlingTimeSeconds === null ? "Not settled" : `${run.settlingTimeSeconds}s settle`}</span>
        <span>${new Date(run.createdAt).toLocaleDateString()}</span>
      </div>`).join("") : '<p class="empty-state">No saved runs yet.</p>';
}

async function api(url, options = {}) {
  if (hostedDemo) return hostedApi(url, options);
  const headers = { ...(options.headers || {}), Authorization: `Bearer ${token}` };
  const response = await fetch(url, { ...options, headers });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Request failed");
  return result;
}

function startHostedSimulation() {
  const motor = {
    id: "im-4p-22kw",
    name: "Industrial 3-Phase Motor",
    ratedPowerKw: 2.2,
    ratedVoltage: 415,
    frequency: 50,
    poles: 4,
    ratedSpeedRpm: 1440,
    ratedTorqueNm: 14.6,
    statorResistanceOhm: 3.2,
    rotorResistanceOhm: 2.1,
    inertiaKgM2: 0.018,
  };
  const state = {
    running: false,
    paused: false,
    actualRpm: 0,
    rawRpm: 0,
    filteredRpm: 0,
    integral: 0,
    previousError: 0,
    samples: [],
    elapsedSeconds: 0,
    maxRpm: 0,
    squaredErrorSum: 0,
    sampleCount: 0,
    stableSamples: 0,
    settlingTimeSeconds: null,
    disturbance: 0,
    motor,
    config: {
      targetRpm: 1400,
      loadTorqueNm: 50,
      kp: .72,
      ki: .18,
      kd: .06,
      filterEnabled: true,
      filterTaps: 7,
      samplingFrequencyHz: 5,
      passBandFrequencyHz: .8,
      stopBandFrequencyHz: 2,
    },
  };
  window.hostedMotor = state;

  setInterval(() => {
    const dt = .2;
    if (state.paused) {
      const snapshot = makeHostedSnapshot(state, state.rawRpm, state.filteredRpm);
      latest = snapshot;
      render(snapshot);
      drawChart();
      return;
    }

    state.elapsedSeconds += dt;
    if (state.running) {
      const feedbackRpm = state.sampleCount > 0 ? latest?.filteredRpm ?? state.actualRpm : state.actualRpm;
      const error = state.config.targetRpm - feedbackRpm;
      state.integral = clamp(state.integral + error * dt, -8500, 8500);
      const derivative = (error - state.previousError) / dt;
      const pid = state.config.kp * error + state.config.ki * state.integral + state.config.kd * derivative;
      state.previousError = error;
      const drive = clamp(pid / 900, -.3, 1);
      const loadLoss = ((state.config.loadTorqueNm + state.disturbance) / motor.ratedTorqueNm) * 48;
      const timeConstant = 0.85 + motor.inertiaKgM2 * 10;
      state.actualRpm = clamp(state.actualRpm + (drive * 3000 - state.actualRpm - loadLoss) / timeConstant * dt, 0, 3090);
      state.disturbance *= .88;
    } else {
      state.actualRpm = Math.max(0, state.actualRpm - state.actualRpm * dt * 1.8);
      state.integral *= .9;
    }

    const rawRpm = Math.max(0, state.actualRpm + (Math.random() - .5) * 38 + Math.sin(state.elapsedSeconds * 13) * 8);
    state.samples.push(rawRpm);
    if (state.samples.length > 25) state.samples.shift();
    const recent = state.samples.slice(-state.config.filterTaps);
    const filteredRpm = state.config.filterEnabled ? recent.reduce((sum, value) => sum + value, 0) / recent.length : rawRpm;
    const speedError = state.config.targetRpm - filteredRpm;
    state.rawRpm = rawRpm;
    state.filteredRpm = filteredRpm;
    state.maxRpm = Math.max(state.maxRpm, filteredRpm);
    state.squaredErrorSum += speedError ** 2;
    state.sampleCount += 1;
    const tolerance = Math.max(state.config.targetRpm * .02, 10);
    state.stableSamples = state.running && Math.abs(speedError) <= tolerance ? state.stableSamples + 1 : 0;
    if (state.stableSamples >= 15 && state.settlingTimeSeconds === null) state.settlingTimeSeconds = state.elapsedSeconds - 2.8;

    const snapshot = makeHostedSnapshot(state, rawRpm, filteredRpm);
    latest = snapshot;
    history.push(snapshot);
    if (history.length > 180) history.shift();
    render(snapshot);
    drawChart();
  }, 200);
}

async function hostedApi(url, options) {
  const state = window.hostedMotor;
  if (url.endsWith("/start")) {
    state.running = true;
    state.paused = false;
  }
  if (url.endsWith("/stop")) {
    state.running = false;
    state.paused = false;
  }
  if (url.endsWith("/pause") && state.running) state.paused = true;
  if (url.endsWith("/resume") && state.running) state.paused = false;
  if (url.endsWith("/reset")) {
    Object.assign(state, {
      running: false,
      paused: false,
      actualRpm: 0,
      rawRpm: 0,
      filteredRpm: 0,
      integral: 0,
      previousError: 0,
      samples: [],
      elapsedSeconds: 0,
      maxRpm: 0,
      squaredErrorSum: 0,
      sampleCount: 0,
      stableSamples: 0,
      settlingTimeSeconds: null,
      disturbance: 0,
    });
  }
  if (url.endsWith("/disturbance")) state.disturbance = 50;
  if (url.endsWith("/control")) {
    const patch = JSON.parse(options.body || "{}");
    const samplingFrequencyHz = clamp(Number(patch.samplingFrequencyHz), 1, 100);
    const nyquist = samplingFrequencyHz / 2;
    const passBandFrequencyHz = clamp(Number(patch.passBandFrequencyHz), .1, nyquist - .1);
    Object.assign(state.config, {
      targetRpm: Number(patch.targetRpm),
      loadTorqueNm: roundToStep(clamp(Number(patch.loadTorqueNm), 0, 300), 50),
      kp: Number(patch.kp),
      ki: Number(patch.ki),
      kd: Number(patch.kd),
      filterEnabled: Boolean(patch.filterEnabled),
      filterTaps: Math.round(clamp(Number(patch.filterTaps), 1, 25)),
      samplingFrequencyHz,
      passBandFrequencyHz,
      stopBandFrequencyHz: clamp(Number(patch.stopBandFrequencyHz), passBandFrequencyHz + .1, nyquist),
    });
  }
  if (url === "/api/performance" && options.method === "POST") {
    const payload = JSON.parse(options.body || "{}");
    const runs = JSON.parse(localStorage.getItem(`rotorlab_runs_${user.id}`) || "[]");
    const run = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      label: payload.label,
      targetRpm: latest.config.targetRpm,
      filteredRpm: latest.filteredRpm,
      overshootPercent: latest.overshootPercent,
      settlingTimeSeconds: latest.settlingTimeSeconds,
    };
    runs.push(run);
    localStorage.setItem(`rotorlab_runs_${user.id}`, JSON.stringify(runs));
    return run;
  }
  return latest || {};
}

function makeHostedSnapshot(state, rawRpm, filteredRpm) {
  const speedError = state.config.targetRpm - filteredRpm;
  const errorPercent = state.config.targetRpm ? Math.abs(speedError) / state.config.targetRpm * 100 : 0;
  return {
    timestamp: Date.now(),
    running: state.running,
    paused: Boolean(state.paused),
    motor: state.motor,
    config: { ...state.config },
    filterSpec: {
      samplingFrequencyHz: round(state.config.samplingFrequencyHz),
      passBandFrequencyHz: round(state.config.passBandFrequencyHz),
      stopBandFrequencyHz: round(state.config.stopBandFrequencyHz),
      nyquistFrequencyHz: round(state.config.samplingFrequencyHz / 2),
    },
    rawRpm: round(rawRpm),
    filteredRpm: round(filteredRpm),
    actualRpm: round(state.actualRpm),
    synchronousSpeed: 1500,
    effectiveSynchronousSpeed: Math.max(1500, state.config.targetRpm),
    maxSpeedRpm: 3000,
    slipPercent: round(Math.max(1500, state.config.targetRpm) > 0 ? ((Math.max(1500, state.config.targetRpm) - state.actualRpm) / Math.max(1500, state.config.targetRpm)) * 100 : 0),
    speedError: round(speedError),
    overshootPercent: round(Math.max(0, (state.maxRpm - state.config.targetRpm) / state.config.targetRpm * 100)),
    settlingTimeSeconds: state.settlingTimeSeconds === null ? null : round(state.settlingTimeSeconds),
    meanSquaredError: round(state.squaredErrorSum / Math.max(1, state.sampleCount)),
    stability: state.paused
      ? "paused"
      : !state.running
        ? "stopped"
        : errorPercent <= 2 && state.stableSamples >= 5
          ? "stable"
          : errorPercent <= 8
            ? "settling"
            : "correcting",
    elapsedSeconds: round(state.elapsedSeconds),
  };
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function round(value) {
  return Math.round(value * 100) / 100;
}

function roundToStep(value, step) {
  return Math.round(value / step) * step;
}

function toast(message) {
  $("toast").textContent = message;
  $("toast").classList.add("show");
  setTimeout(() => $("toast").classList.remove("show"), 2200);
}

function formatTime(seconds) {
  const mins = Math.floor(seconds / 60).toString().padStart(2, "0");
  const secs = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${mins}:${secs}`;
}

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = value;
  return div.innerHTML;
}
