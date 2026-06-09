# Design and Implementation of a Web-Based Induction Motor Speed Control System

## Abstract

This project presents RotorLab, a web application for simulating, controlling,
and monitoring the speed of a three-phase induction motor. The system uses a
PID controller to regulate rotor speed and a finite impulse response filter to
reduce noise in simulated sensor measurements. Express.js provides a local API,
Socket.IO transmits telemetry every 200 milliseconds, and JSON files store
motor parameters, user accounts, and performance records. The application
allows a user to vary the target speed, load torque, PID gains, and filter state
while observing speed, slip, overshoot, settling time, and tracking error.

## 1. Introduction

Induction motors are widely used because they are robust, inexpensive, and
require little maintenance. Many industrial processes need their speed to stay
constant even when the mechanical load changes. A Variable Frequency Drive
controls motor speed by varying the electrical supply frequency. Closed-loop
control compares measured speed with a setpoint and adjusts the drive command.

The objective of RotorLab is to demonstrate these principles without requiring
high-voltage laboratory hardware. It provides a safe software environment in
which controller settings, sensor noise, filtering, and load disturbances can
be observed in real time.

## 2. System Objectives

- Define and display important induction motor parameters.
- Simulate real-time acceleration, loading, and speed measurement.
- Regulate speed using a PID controller.
- remove sensor noise using an FIR filter.
- Evaluate stability using standard performance measurements.
- Provide authentication and local storage through an Express API.
- Explain practical applications of controlled induction motors.

## 3. Motor Parameters and Control

The default machine is rated at 2.2 kW, 415 V, 50 Hz, four poles, 1440 RPM, and
14.6 Nm rated torque. It also includes stator resistance, rotor resistance, and
rotor inertia values.

Synchronous speed is calculated using:

```text
Ns = 120f / P
```

For a 50 Hz, four-pole motor, synchronous speed is 1500 RPM. The rotor operates
below synchronous speed because torque production requires slip:

```text
slip = ((Ns - Nr) / Ns) × 100%
```

The application represents a VFD through a normalized drive command. The motor
response includes inertia, load torque, and a first-order mechanical time
constant. A temporary disturbance adds load torque and demonstrates the
controller's recovery.

## 4. PID Controller

The speed error is the target speed minus measured speed. The controller is:

```text
u(t) = Kp e(t) + Ki integral(e(t)) + Kd de(t)/dt
```

The proportional gain provides immediate correction. The integral gain
accumulates error and removes steady-state offset. The derivative gain reacts
to the rate of error change and helps reduce oscillation. Integral clamping is
used as an anti-windup measure.

Stability is assessed using steady-state error, percentage overshoot, settling
time, and mean squared error. The response is marked stable after it remains
within two percent of the target for a sustained period.

## 5. FIR Noise Filter

Real motor speed sensors may be affected by electromagnetic interference,
switching noise, vibration, and quantization. RotorLab adds random noise and a
periodic component to the actual simulated speed.

A seven-sample moving average is used as an FIR filter:

```text
y[n] = sum(b[k]x[n-k]), where each b[k] = 1/7
```

FIR filters are suitable because they are inherently stable and can have
linear phase. The dashboard plots both signals, making the noise reduction
visible. Increasing the number of taps produces greater smoothing but also
increases delay.

## 6. Software Architecture

The browser sends control commands to an Express REST API. The server executes
the motor model every 200 milliseconds and broadcasts the resulting telemetry
using Socket.IO. The dashboard draws the latest 180 samples on an HTML Canvas.

Local JSON files provide the requested simple API data source. Passwords are
salted and hashed with Node.js `scrypt`; only password hashes are stored.
Random session tokens protect control and performance endpoints. Saved
experiments are associated with the authenticated user.

## 7. Real-Time Cloud Extension

The submitted implementation is local-first so it can operate without an
internet connection during assessment. Express.js provides the computation
layer and Socket.IO provides real-time communication. For production cloud
deployment, the same Express server can be deployed to a Node.js host and the
JSON storage can be replaced with MongoDB Atlas or Supabase. The existing API
means the frontend would not require major changes.

## 8. Applications

Controlled induction motors are used in conveyor belts, pumps, compressors,
industrial fans, HVAC systems, elevators, machine tools, and manufacturing
lines. Speed control improves process accuracy, saves energy, reduces
mechanical stress, and allows smooth starting and stopping.

## 9. Testing and Results

Automated tests verify the synchronous-speed formula, motor acceleration, and
FIR output. Manual testing covers registration, login, starting and stopping,
setpoint changes, load changes, disturbances, filter switching, responsive
layout, and saving experiments.

With the default gains, the rotor accelerates toward the 1400 RPM target. The
raw speed trace contains visible noise while the FIR output is smoother. A load
disturbance causes a temporary drop, after which the integral action increases
the drive command and restores the operating point.

## 10. Limitations

This is an educational dynamic approximation rather than a full dq-axis
electromagnetic model. It does not control physical high-voltage equipment.
Sessions are held in server memory and JSON writes are intended for a
single-user demonstration. These choices keep the project understandable and
reliable while still demonstrating the required control concepts.

## 11. Conclusion

RotorLab successfully combines motor modelling, closed-loop PID control, FIR
filtering, real-time web communication, authentication, and performance
analysis. It demonstrates how software can monitor and regulate an induction
motor and provides a foundation for future connection to a physical speed
sensor, VFD, and cloud database.
