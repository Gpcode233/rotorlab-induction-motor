# Induction Motor Speed Control and Monitoring

## Recommended Project

Build a web application that simulates an induction motor and displays its
speed in real time. The user sets a target speed and motor operating
conditions. The simulator produces a noisy speed measurement, applies a
Finite Impulse Response (FIR) filter, and shows whether the motor response is
stable.

This is a software simulation. Physical motor hardware is not required.

## Proposed Stack

- Frontend: Responsive HTML, CSS, JavaScript, and Canvas dashboard
- Backend: Express.js
- Authentication: Local salted password hashes and session tokens
- Real-time updates: Socket.IO
- Local API data: JSON files
- Charts: Native HTML Canvas

The submitted version is local-first so it remains available without internet
access. Its Express API can later be deployed and connected to MongoDB Atlas or
Supabase for a cloud version.

## Motor Parameters

The simulator will use:

- Rated power in kW
- Rated voltage in V
- Supply frequency in Hz
- Number of poles
- Rated speed in RPM
- Synchronous speed in RPM
- Rotor speed in RPM
- Slip in percent
- Load torque in Nm
- Stator resistance
- Rotor resistance
- Rotor inertia
- Target speed in RPM

The synchronous speed is:

`Ns = (120 * frequency) / numberOfPoles`

The slip is:

`slip = ((Ns - rotorSpeed) / Ns) * 100`

## Speed Control

Use a simulated Variable Frequency Drive (VFD). The controller changes the
supply frequency to move the motor toward the target speed.

A PID controller calculates the correction from:

- Proportional response to the current speed error
- Integral response to accumulated error
- Derivative response to the rate of change of error

The dashboard will allow the user to:

- Start and stop the motor
- Set the target speed
- Change the load torque
- Change PID gains
- Apply a sudden load disturbance
- Enable or disable the FIR filter

## FIR Noise Filtering

The simulated sensor reading will contain random electrical and measurement
noise. An FIR moving-average filter will smooth the reading:

`filtered[n] = sum(coefficients[i] * sample[n-i])`

The first implementation can use equal coefficients, for example five
coefficients of `0.2`. The dashboard will plot raw and filtered speed on the
same chart to demonstrate noise reduction.

## Stability Control

The motor will be considered stable when:

- The filtered speed remains within a small tolerance of the target speed
- Overshoot stays below a configured limit
- Oscillation decreases over time
- Settling time remains acceptable

The application will calculate:

- Speed error
- Percentage overshoot
- Settling time
- Steady-state error
- Mean squared error
- Stability status: stable, warning, or unstable

Users can tune the PID gains and compare runs. Unsafe gains will demonstrate
oscillation or instability.

## Main Screens

1. Login and registration
2. Dashboard with live speed, target, slip, load, and stability status
3. Real-time chart comparing raw speed, FIR-filtered speed, and target speed
4. Motor control panel
5. Motor parameter display
6. Performance history and saved experiment results
7. Applications and project explanation page

## Local API

Example endpoints:

- `GET /api/motors`
- `GET /api/motors/:id`
- `POST /api/simulation/start`
- `POST /api/simulation/stop`
- `PATCH /api/simulation/control`
- `GET /api/simulation/status`
- `GET /api/performance`
- `POST /api/performance`

Initial motor definitions will be stored in:

- `server/data/motors.json`
- `server/data/simulation-runs.json`

## Practical Applications

- Conveyor belts
- Water pumps
- Industrial fans and blowers
- Compressors
- Elevators
- Machine tools
- HVAC systems
- Manufacturing production lines

## Two-Week Schedule

### Week 1

- Day 1: Finalize scope, architecture, and UI sketch
- Day 2: Create Express API and local JSON motor data
- Day 3: Implement the induction motor simulation
- Day 4: Implement PID speed control and stability metrics
- Day 5: Implement the FIR filter and automated tests
- Day 6: Build the dashboard and charts
- Day 7: Connect frontend to real-time Socket.IO updates

### Week 2

- Day 8: Add local authentication
- Day 9: Save users, motor settings, and experiment results in JSON
- Day 10: Build history and comparison screens
- Day 11: Improve responsive UI and error handling
- Day 12: Test stable, noisy, disturbed, and unstable scenarios
- Day 13: Prepare report, diagrams, screenshots, and presentation
- Day 14: Rehearse demonstration and fix final issues

## Demonstration Scenario

1. Log in.
2. Select a four-pole, 50 Hz induction motor.
3. Set the target speed to 1400 RPM.
4. Start the motor and show acceleration toward the target.
5. Compare noisy sensor speed with FIR-filtered speed.
6. Apply a sudden load disturbance.
7. Show the PID controller restoring the target speed.
8. Enter poor PID gains to demonstrate oscillation.
9. Restore safe gains and show stable operation.
10. Save and compare the experiment results.

## Minimum Deliverables

- Working web application
- Local JSON API
- Real-time motor simulation
- FIR filter comparison
- PID controller and stability measurements
- Local authentication and saved results
- Source code and README
- Short technical report
- Five-minute demonstration
