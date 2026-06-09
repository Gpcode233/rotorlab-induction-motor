const express = require("express");
const http = require("http");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { Server } = require("socket.io");
const { MotorSimulation } = require("./server/motor-simulation");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, "server", "data");
const motors = readJson("motors.json");
let users = readJson("users.json");
let runs = readJson("runs.json");
const sessions = new Map();
const simulation = new MotorSimulation(motors[0]);

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/motors", (_req, res) => res.json(motors));
app.get("/api/motors/:id", (req, res) => {
  const motor = motors.find((item) => item.id === req.params.id);
  if (!motor) return res.status(404).json({ error: "Motor not found" });
  res.json(motor);
});

app.post("/api/auth/register", (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password || password.length < 4) {
    return res.status(400).json({ error: "Name, email and a password of at least 4 characters are required." });
  }
  if (users.some((user) => user.email.toLowerCase() === email.toLowerCase())) {
    return res.status(409).json({ error: "An account with that email already exists." });
  }
  const salt = crypto.randomBytes(16).toString("hex");
  const user = {
    id: crypto.randomUUID(),
    name: name.trim(),
    email: email.trim().toLowerCase(),
    salt,
    passwordHash: hashPassword(password, salt),
  };
  users.push(user);
  writeJson("users.json", users);
  res.status(201).json(createSession(user));
});

app.post("/api/auth/login", (req, res) => {
  const { email, password } = req.body;
  const user = users.find((item) => item.email === String(email).trim().toLowerCase());
  if (!user || hashPassword(String(password), user.salt) !== user.passwordHash) {
    return res.status(401).json({ error: "Invalid email or password." });
  }
  res.json(createSession(user));
});

app.get("/api/simulation/status", (_req, res) => res.json(simulation.snapshot()));
app.post("/api/simulation/start", requireAuth, (_req, res) => {
  simulation.start();
  res.json(simulation.snapshot());
});
app.post("/api/simulation/stop", requireAuth, (_req, res) => {
  simulation.stop();
  res.json(simulation.snapshot());
});
app.post("/api/simulation/reset", requireAuth, (_req, res) => {
  simulation.reset();
  res.json(simulation.snapshot());
});
app.post("/api/simulation/disturbance", requireAuth, (_req, res) => {
  simulation.applyDisturbance();
  res.json({ ok: true });
});
app.patch("/api/simulation/control", requireAuth, (req, res) => {
  simulation.updateConfig(req.body);
  res.json(simulation.snapshot());
});

app.get("/api/performance", requireAuth, (req, res) => {
  res.json(runs.filter((run) => run.userId === req.user.id).slice(-20).reverse());
});
app.post("/api/performance", requireAuth, (req, res) => {
  const snapshot = simulation.snapshot();
  const run = {
    id: crypto.randomUUID(),
    userId: req.user.id,
    createdAt: new Date().toISOString(),
    label: String(req.body.label || "Motor test").slice(0, 60),
    targetRpm: snapshot.config.targetRpm,
    filteredRpm: snapshot.filteredRpm,
    loadTorqueNm: snapshot.config.loadTorqueNm,
    overshootPercent: snapshot.overshootPercent,
    settlingTimeSeconds: snapshot.settlingTimeSeconds,
    meanSquaredError: snapshot.meanSquaredError,
    stability: snapshot.stability,
  };
  runs.push(run);
  writeJson("runs.json", runs);
  res.status(201).json(run);
});

io.on("connection", (socket) => {
  socket.emit("motor:update", simulation.snapshot());
});

setInterval(() => {
  io.emit("motor:update", simulation.step(0.2));
}, 200);

server.listen(PORT, () => {
  console.log(`Motor monitor running at http://localhost:${PORT}`);
});

function requireAuth(req, res, next) {
  const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const userId = sessions.get(token);
  const user = users.find((item) => item.id === userId);
  if (!user) return res.status(401).json({ error: "Please log in to continue." });
  req.user = user;
  next();
}

function createSession(user) {
  const token = crypto.randomBytes(24).toString("hex");
  sessions.set(token, user.id);
  return { token, user: { id: user.id, name: user.name, email: user.email } };
}

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString("hex");
}

function readJson(filename) {
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, filename), "utf8"));
}

function writeJson(filename, value) {
  fs.writeFileSync(path.join(DATA_DIR, filename), JSON.stringify(value, null, 2));
}
