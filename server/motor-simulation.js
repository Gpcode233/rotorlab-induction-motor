const DEFAULT_CONFIG = {
  targetRpm: 1400,
  loadTorqueNm: 8,
  kp: 0.72,
  ki: 0.18,
  kd: 0.06,
  filterEnabled: true,
  filterTaps: 7,
};

class MotorSimulation {
  constructor(motor) {
    this.motor = motor;
    this.config = { ...DEFAULT_CONFIG };
    this.reset();
  }

  reset() {
    this.running = false;
    this.actualRpm = 0;
    this.rawRpm = 0;
    this.filteredRpm = 0;
    this.integral = 0;
    this.previousError = 0;
    this.samples = [];
    this.elapsedSeconds = 0;
    this.maxRpm = 0;
    this.squaredErrorSum = 0;
    this.sampleCount = 0;
    this.stableSamples = 0;
    this.settlingTimeSeconds = null;
    this.disturbance = 0;
  }

  start() {
    this.running = true;
  }

  stop() {
    this.running = false;
  }

  updateConfig(patch) {
    const numericKeys = ["targetRpm", "loadTorqueNm", "kp", "ki", "kd", "filterTaps"];
    for (const key of numericKeys) {
      if (patch[key] !== undefined && Number.isFinite(Number(patch[key]))) {
        this.config[key] = Number(patch[key]);
      }
    }
    if (patch.filterEnabled !== undefined) {
      this.config.filterEnabled = Boolean(patch.filterEnabled);
    }
    this.config.targetRpm = clamp(this.config.targetRpm, 0, this.synchronousSpeed * 0.98);
    this.config.loadTorqueNm = clamp(this.config.loadTorqueNm, 0, this.motor.ratedTorqueNm * 1.4);
    this.config.kp = clamp(this.config.kp, 0, 3);
    this.config.ki = clamp(this.config.ki, 0, 1);
    this.config.kd = clamp(this.config.kd, 0, 1);
    this.config.filterTaps = Math.round(clamp(this.config.filterTaps, 1, 25));
  }

  applyDisturbance() {
    this.disturbance = this.motor.ratedTorqueNm * 0.48;
  }

  get synchronousSpeed() {
    return (120 * this.motor.frequency) / this.motor.poles;
  }

  step(dt = 0.2) {
    this.elapsedSeconds += dt;

    if (this.running) {
      const feedbackRpm = this.sampleCount > 0 ? this.filteredRpm : this.actualRpm;
      const error = this.config.targetRpm - feedbackRpm;
      this.integral = clamp(this.integral + error * dt, -8500, 8500);
      const derivative = (error - this.previousError) / dt;
      const pid = this.config.kp * error + this.config.ki * this.integral + this.config.kd * derivative;
      this.previousError = error;

      const driveCommand = clamp(pid / 900, -0.3, 1);
      const targetFromDrive = driveCommand * this.synchronousSpeed;
      const loadRatio = (this.config.loadTorqueNm + this.disturbance) / this.motor.ratedTorqueNm;
      const loadLoss = loadRatio * 48;
      const timeConstant = 0.85 + this.motor.inertiaKgM2 * 10;
      const acceleration = (targetFromDrive - this.actualRpm - loadLoss) / timeConstant;
      this.actualRpm = clamp(this.actualRpm + acceleration * dt, 0, this.synchronousSpeed * 1.03);
      this.disturbance *= 0.88;
    } else {
      this.actualRpm = Math.max(0, this.actualRpm - this.actualRpm * dt * 1.8);
      this.integral *= 0.9;
    }

    const sensorNoise = (Math.random() - 0.5) * 38 + Math.sin(this.elapsedSeconds * 13) * 8;
    this.rawRpm = Math.max(0, this.actualRpm + sensorNoise);
    this.samples.push(this.rawRpm);
    if (this.samples.length > 25) this.samples.shift();

    const taps = Math.min(this.config.filterTaps, this.samples.length);
    const recent = this.samples.slice(-taps);
    const firValue = recent.reduce((sum, sample) => sum + sample, 0) / taps;
    this.filteredRpm = this.config.filterEnabled ? firValue : this.rawRpm;

    const measuredError = this.config.targetRpm - this.filteredRpm;
    this.maxRpm = Math.max(this.maxRpm, this.filteredRpm);
    this.squaredErrorSum += measuredError ** 2;
    this.sampleCount += 1;

    const tolerance = Math.max(this.config.targetRpm * 0.02, 10);
    if (this.running && Math.abs(measuredError) <= tolerance) {
      this.stableSamples += 1;
      if (this.stableSamples >= 15 && this.settlingTimeSeconds === null) {
        this.settlingTimeSeconds = this.elapsedSeconds - 2.8;
      }
    } else {
      this.stableSamples = 0;
    }

    return this.snapshot();
  }

  snapshot() {
    const error = this.config.targetRpm - this.filteredRpm;
    const slip = this.synchronousSpeed
      ? ((this.synchronousSpeed - this.actualRpm) / this.synchronousSpeed) * 100
      : 0;
    const overshoot = this.config.targetRpm
      ? Math.max(0, ((this.maxRpm - this.config.targetRpm) / this.config.targetRpm) * 100)
      : 0;
    const errorPercent = this.config.targetRpm ? Math.abs(error) / this.config.targetRpm * 100 : 0;
    let stability = "stopped";
    if (this.running) {
      stability = errorPercent <= 2 && this.stableSamples >= 5
        ? "stable"
        : errorPercent <= 8
          ? "settling"
          : "correcting";
    }

    return {
      timestamp: Date.now(),
      running: this.running,
      motor: this.motor,
      config: this.config,
      rawRpm: round(this.rawRpm),
      filteredRpm: round(this.filteredRpm),
      actualRpm: round(this.actualRpm),
      synchronousSpeed: round(this.synchronousSpeed),
      slipPercent: round(slip),
      speedError: round(error),
      overshootPercent: round(overshoot),
      settlingTimeSeconds: this.settlingTimeSeconds === null ? null : round(this.settlingTimeSeconds),
      meanSquaredError: round(this.squaredErrorSum / Math.max(1, this.sampleCount)),
      stability,
      elapsedSeconds: round(this.elapsedSeconds),
    };
  }
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function round(value) {
  return Math.round(value * 100) / 100;
}

module.exports = { MotorSimulation, DEFAULT_CONFIG };
