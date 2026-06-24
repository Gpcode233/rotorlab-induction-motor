const test = require("node:test");
const assert = require("node:assert/strict");
const { MotorSimulation } = require("../server/motor-simulation");

const motor = {
  ratedPowerKw: 2.2,
  ratedVoltage: 415,
  frequency: 50,
  poles: 4,
  ratedSpeedRpm: 1440,
  ratedTorqueNm: 14.6,
  inertiaKgM2: 0.018,
};

test("calculates synchronous speed from frequency and pole count", () => {
  const simulation = new MotorSimulation(motor);
  assert.equal(simulation.synchronousSpeed, 1500);
});

test("accelerates toward target speed when started", () => {
  const simulation = new MotorSimulation(motor);
  simulation.start();
  for (let index = 0; index < 100; index += 1) simulation.step();
  assert.ok(simulation.actualRpm > 1000);
  assert.ok(simulation.actualRpm <= simulation.snapshot().maxSpeedRpm * 1.03);
});

test("FIR output averages the configured number of sensor samples", () => {
  const simulation = new MotorSimulation(motor);
  simulation.config.filterTaps = 5;
  simulation.samples = [100, 110, 90, 105];
  simulation.actualRpm = 100;
  const snapshot = simulation.step();
  assert.ok(Number.isFinite(snapshot.filteredRpm));
  assert.notEqual(snapshot.filteredRpm, snapshot.rawRpm);
});

test("rounds load to multiples of 50 up to 300 Nm", () => {
  const simulation = new MotorSimulation(motor);
  simulation.updateConfig({ loadTorqueNm: 276 });
  assert.equal(simulation.config.loadTorqueNm, 300);

  simulation.updateConfig({ loadTorqueNm: 24 });
  assert.equal(simulation.config.loadTorqueNm, 0);
});

test("exposes FIR sampling, pass band, and stop band frequencies", () => {
  const simulation = new MotorSimulation(motor);
  simulation.updateConfig({
    samplingFrequencyHz: 10,
    passBandFrequencyHz: 2,
    stopBandFrequencyHz: 4,
  });
  const snapshot = simulation.snapshot();
  assert.equal(snapshot.filterSpec.samplingFrequencyHz, 10);
  assert.equal(snapshot.filterSpec.passBandFrequencyHz, 2);
  assert.equal(snapshot.filterSpec.stopBandFrequencyHz, 4);
  assert.equal(snapshot.filterSpec.nyquistFrequencyHz, 5);
});

test("pauses and resumes without advancing simulation time", () => {
  const simulation = new MotorSimulation(motor);
  simulation.start();
  simulation.step();
  simulation.pause();
  const before = simulation.snapshot();
  simulation.step();
  const paused = simulation.snapshot();
  assert.equal(paused.paused, true);
  assert.equal(paused.elapsedSeconds, before.elapsedSeconds);

  simulation.resume();
  simulation.step();
  assert.equal(simulation.snapshot().paused, false);
  assert.ok(simulation.snapshot().elapsedSeconds > paused.elapsedSeconds);
});

test("allows target speed up to 3000 RPM", () => {
  const simulation = new MotorSimulation(motor);
  simulation.updateConfig({ targetRpm: 3500 });
  assert.equal(simulation.config.targetRpm, 3000);
  assert.equal(simulation.snapshot().maxSpeedRpm, 3000);
});
