# RotorLab

RotorLab is a web-based induction motor speed-control simulator. It demonstrates
real-time monitoring, VFD-style control, PID regulation, FIR noise filtering,
stability analysis, authentication, and local JSON persistence without requiring
physical motor hardware.

## Run the Project

Requirements: Node.js 18 or newer.

```powershell
npm install
npm start
```

Open `http://localhost:3000`, create an account, and start the motor.

Run the automated tests with:

```powershell
npm test
```

## Demonstration

1. Create an operator account and sign in.
2. Explain the selected 2.2 kW, 415 V, four-pole motor.
3. Show that its synchronous speed is `120 × 50 / 4 = 1500 RPM`.
4. Start the motor at a target of 1400 RPM.
5. Point out the noisy raw sensor trace and smoother FIR-filtered trace.
6. Apply a load disturbance and observe the speed fall temporarily.
7. Explain how the PID controller restores the target speed.
8. Change the load or PID gains and observe the stability metrics.
9. Open Analysis and save the experiment.
10. Open Applications and discuss industrial uses.

## Architecture

```text
Browser dashboard
  |-- REST commands ----------> Express API
  |-- Socket.IO telemetry <---- Motor simulation (200 ms)
                                   |-- PID controller
                                   |-- induction motor response
                                   |-- noisy speed sensor
                                   |-- FIR moving-average filter
                                   |-- stability metrics
                                Local JSON files
                                   |-- motors
                                   |-- users
                                   |-- experiment runs
```

## Motor Model

Synchronous speed:

```text
Ns = 120f / P
```

where `f` is supply frequency and `P` is the number of poles.

Slip:

```text
s = ((Ns - Nr) / Ns) × 100%
```

where `Nr` is rotor speed. A simulated Variable Frequency Drive receives the
PID command and changes the effective drive applied to the motor. Load torque
reduces acceleration and operating speed.

## PID Stability Control

```text
u(t) = Kp e(t) + Ki integral(e(t)) + Kd de(t)/dt
```

- `Kp` reacts to current speed error.
- `Ki` removes steady-state error.
- `Kd` opposes rapid changes and reduces oscillation.
- Integral clamping limits excessive windup.
- The app evaluates error, overshoot, settling time, and mean squared error.

The status becomes stable after the filtered speed remains within 2% of the
target for consecutive samples.

## FIR Filter

The speed sensor includes simulated random and periodic electrical noise. A
seven-tap moving-average FIR filter is applied:

```text
y[n] = (x[n] + x[n-1] + ... + x[n-6]) / 7
```

This filter reduces high-frequency noise. Because it has no feedback terms, it
is inherently stable. The filter can be disabled from the dashboard to compare
the raw and filtered signals.

## API

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/motors` | List motor definitions |
| POST | `/api/auth/register` | Create a local account |
| POST | `/api/auth/login` | Authenticate an operator |
| GET | `/api/simulation/status` | Read current telemetry |
| POST | `/api/simulation/start` | Start the motor |
| POST | `/api/simulation/stop` | Stop the motor |
| PATCH | `/api/simulation/control` | Change target, load, PID, or FIR settings |
| POST | `/api/simulation/disturbance` | Apply a temporary load |
| GET/POST | `/api/performance` | Read or save experiment results |

## Technology

- Node.js and Express.js
- Socket.IO for real-time telemetry
- HTML, CSS, JavaScript, and Canvas
- Node `crypto.scrypt` password hashing
- Local JSON API and persistence

The project deliberately uses local JSON storage because the brief requests a
simple local API and the application must work reliably without internet
access. A production version could replace the JSON files with MongoDB Atlas
or Supabase without changing the simulation and frontend contracts.

## Project Structure

```text
public/                     Dashboard interface
server/data/                Local JSON database
server/motor-simulation.js  Motor, PID, FIR, and metrics
test/                       Automated model tests
server.js                   Express, Socket.IO, auth, and API
```
