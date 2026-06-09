const hostedDemo = !["localhost", "127.0.0.1"].includes(location.hostname);
const socket = !hostedDemo && typeof io === "function" ? io() : null;
const chart = document.getElementById("speedChart");
const ctx = chart.getContext("2d");
const history = [];
let latest = null;
let token = localStorage.getItem("rotorlab_token");
let user = JSON.parse(localStorage.getItem("rotorlab_user") || "null");
let registerMode = false;
let filterEnabled = true;
let controlTimer;

const $ = (id) => document.getElementById(id);

if (token && user) showApp();

$("authToggle").addEventListener("click", () => {
  registerMode = !registerMode;
  $("nameField").classList.toggle("hidden", !registerMode);
  $("authTitle").textContent = registerMode ? "Create operator account" : "Access control station";
  $("authSubtitle").textContent = registerMode ? "Credentials are stored locally for this demonstration." : "Sign in to operate and save motor experiments.";
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

["targetInput", "loadInput", "kpInput", "kiInput", "kdInput"].forEach((id) => {
  $(id).addEventListener("input", () => {
    $("targetOutput").textContent = `${Number($("targetInput").value).toLocaleString()} RPM`;
    $("loadOutput").textContent = `${Number($("loadInput").value).toFixed(1)} Nm`;
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
}

function render(data) {
  const config = data.config;
  $("filteredRpm").textContent = Math.round(data.filteredRpm).toLocaleString();
  $("rawRpm").textContent = Math.round(data.rawRpm).toLocaleString();
  $("slip").textContent = data.slipPercent.toFixed(1);
  $("stability").textContent = data.stability.toUpperCase();
  $("speedDelta").textContent = `Target ${config.targetRpm.toLocaleString()} RPM • Error ${Math.round(data.speedError)} RPM`;
  $("runState").textContent = data.running ? "online" : "offline";
  $("startStopBtn").innerHTML = data.running ? "■ Stop motor" : '<span class="play-icon">▶</span> Start motor';
  $("stabilityDot").style.background = data.stability === "stable" ? "var(--green)" : data.running ? "var(--amber)" : "var(--muted)";
  $("statusDetail").textContent = data.stability === "stable" ? "Within ±2% target" : data.running ? "Controller active" : "System idle";
  $("elapsedTime").textContent = `${formatTime(data.elapsedSeconds)} elapsed`;
  $("syncSpeed").textContent = `${data.synchronousSpeed.toLocaleString()} RPM synchronous`;
  $("analysisError").textContent = `${data.speedError.toFixed(1)} RPM`;
  $("analysisOvershoot").textContent = `${data.overshootPercent.toFixed(2)}%`;
  $("analysisSettling").textContent = data.settlingTimeSeconds === null ? "—" : `${data.settlingTimeSeconds.toFixed(1)} s`;
  $("analysisMse").textContent = Math.round(data.meanSquaredError).toLocaleString();

  const motor = data.motor;
  $("motorName").textContent = motor.name;
  $("parameterList").innerHTML = [
    ["RATED POWER", `${motor.ratedPowerKw} kW`],
    ["VOLTAGE", `${motor.ratedVoltage} V`],
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
  const maxRpm = Math.max(1600, latest?.synchronousSpeed || 1500);
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

  plot("rawRpm", "#547269", 1, .5);
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
        filterTaps: 7,
      }),
    });
  }, 120);
}

async function loadHistory() {
  try {
    if (hostedDemo) {
      const runs = JSON.parse(localStorage.getItem(`rotorlab_runs_${user.id}`) || "[]").reverse();
      renderHistory(runs);
      return;
    }
    const runs = await api("/api/performance");
    renderHistory(runs);
  } catch (error) {
    toast(error.message);
  }
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
    id: "im-4p-22kw", name: "Industrial 3-Phase Motor", ratedPowerKw: 2.2,
    ratedVoltage: 415, frequency: 50, poles: 4, ratedSpeedRpm: 1440,
    ratedTorqueNm: 14.6, statorResistanceOhm: 3.2, rotorResistanceOhm: 2.1,
    inertiaKgM2: 0.018,
  };
  const state = {
    running: false, actualRpm: 0, integral: 0, previousError: 0, samples: [],
    elapsedSeconds: 0, maxRpm: 0, squaredErrorSum: 0, sampleCount: 0,
    stableSamples: 0, settlingTimeSeconds: null, disturbance: 0,
    motor, config: { targetRpm: 1400, loadTorqueNm: 8, kp: .72, ki: .18, kd: .06, filterEnabled: true, filterTaps: 7 },
  };
  window.hostedMotor = state;

  setInterval(() => {
    const dt = .2;
    state.elapsedSeconds += dt;
    if (state.running) {
      const error = state.config.targetRpm - state.actualRpm;
      state.integral = clamp(state.integral + error * dt, -8500, 8500);
      const derivative = (error - state.previousError) / dt;
      const pid = state.config.kp * error + state.config.ki * state.integral + state.config.kd * derivative;
      state.previousError = error;
      const drive = clamp(pid / 900, -.3, 1);
      const loadLoss = ((state.config.loadTorqueNm + state.disturbance) / motor.ratedTorqueNm) * 48;
      state.actualRpm = clamp(state.actualRpm + (drive * 1500 - state.actualRpm - loadLoss) / 1.03 * dt, 0, 1545);
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
    state.maxRpm = Math.max(state.maxRpm, filteredRpm);
    state.squaredErrorSum += speedError ** 2;
    state.sampleCount += 1;
    const tolerance = Math.max(state.config.targetRpm * .02, 10);
    state.stableSamples = state.running && Math.abs(speedError) <= tolerance ? state.stableSamples + 1 : 0;
    if (state.stableSamples >= 15 && state.settlingTimeSeconds === null) state.settlingTimeSeconds = state.elapsedSeconds - 2.8;
    const errorPercent = state.config.targetRpm ? Math.abs(speedError) / state.config.targetRpm * 100 : 0;
    const snapshot = {
      timestamp: Date.now(), running: state.running, motor, config: { ...state.config },
      rawRpm: round(rawRpm), filteredRpm: round(filteredRpm), actualRpm: round(state.actualRpm),
      synchronousSpeed: 1500, slipPercent: round((1500 - state.actualRpm) / 15),
      speedError: round(speedError),
      overshootPercent: round(Math.max(0, (state.maxRpm - state.config.targetRpm) / state.config.targetRpm * 100)),
      settlingTimeSeconds: state.settlingTimeSeconds === null ? null : round(state.settlingTimeSeconds),
      meanSquaredError: round(state.squaredErrorSum / state.sampleCount),
      stability: !state.running ? "stopped" : errorPercent <= 2 && state.stableSamples >= 5 ? "stable" : errorPercent <= 8 ? "settling" : "correcting",
      elapsedSeconds: round(state.elapsedSeconds),
    };
    latest = snapshot;
    history.push(snapshot);
    if (history.length > 180) history.shift();
    render(snapshot);
    drawChart();
  }, 200);
}

async function hostedApi(url, options) {
  const state = window.hostedMotor;
  if (url.endsWith("/start")) state.running = true;
  if (url.endsWith("/stop")) state.running = false;
  if (url.endsWith("/reset")) {
    Object.assign(state, { running: false, actualRpm: 0, integral: 0, previousError: 0, samples: [], elapsedSeconds: 0, maxRpm: 0, squaredErrorSum: 0, sampleCount: 0, stableSamples: 0, settlingTimeSeconds: null, disturbance: 0 });
  }
  if (url.endsWith("/disturbance")) state.disturbance = state.motor.ratedTorqueNm * .48;
  if (url.endsWith("/control")) {
    const patch = JSON.parse(options.body || "{}");
    Object.assign(state.config, {
      targetRpm: Number(patch.targetRpm), loadTorqueNm: Number(patch.loadTorqueNm),
      kp: Number(patch.kp), ki: Number(patch.ki), kd: Number(patch.kd),
      filterEnabled: Boolean(patch.filterEnabled),
    });
  }
  if (url === "/api/performance" && options.method === "POST") {
    const payload = JSON.parse(options.body || "{}");
    const runs = JSON.parse(localStorage.getItem(`rotorlab_runs_${user.id}`) || "[]");
    const run = {
      id: crypto.randomUUID(), createdAt: new Date().toISOString(), label: payload.label,
      targetRpm: latest.config.targetRpm, filteredRpm: latest.filteredRpm,
      overshootPercent: latest.overshootPercent, settlingTimeSeconds: latest.settlingTimeSeconds,
    };
    runs.push(run);
    localStorage.setItem(`rotorlab_runs_${user.id}`, JSON.stringify(runs));
    return run;
  }
  return latest || {};
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function round(value) {
  return Math.round(value * 100) / 100;
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
