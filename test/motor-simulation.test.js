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
  assert.ok(simulation.actualRpm < simulation.synchronousSpeed * 1.03);
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
