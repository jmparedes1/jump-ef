'use strict';

const GRAVITY = 9.80665;
const MAX_SAMPLE_GAP = 80;
const LANDING_CONFIRM_MS = 70;
const IMPACT_WAIT_MS = 140;

function crossing(previous, current, level) {
  const fraction = (level - previous.value) / (current.value - previous.value);
  return previous.t + (current.t - previous.t) * fraction;
}

class JumpDetector {
  constructor(baseline, standing = false) {
    this.baseline = baseline;
    this.lowLevel = baseline * (standing ? 0.50 : 0.36);
    this.impulseDelta = standing ? 1.0 : 2.1;
    this.impactDelta = standing ? 0.7 : 1.5;
    this.minimumFlight = standing ? 0.09 : 0.12;
    this.minimumLowTime = standing ? 25 : 34;
    this.endLevel = baseline * 0.64;
    this.reset();
  }

  reset() {
    this.impulse = null;
    this.takeoff = null;
    this.landing = null;
    this.impact = false;
    this.inFlight = false;
    this.intervals = [];
  }

  sample(t, value) {
    const current = { t, value };
    const previous = this.previous;
    if (previous && t <= previous.t) return null;
    this.previous = current;
    if (!previous) return null;
    const dt = t - previous.t;
    if (dt > MAX_SAMPLE_GAP) {
      const interrupted = this.takeoff !== null;
      this.reset();
      return interrupted ? { error: 'Faltan muestras durante el salto.' } : null;
    }

    if (this.takeoff === null) {
      if (value >= this.baseline + this.impulseDelta) this.impulse = t;
      if (this.impulse !== null && t - this.impulse <= 800 && value < this.lowLevel && previous.value >= this.lowLevel) {
        this.takeoff = crossing(previous, current, this.lowLevel);
        this.intervals.push(dt);
      }
      return null;
    }

    this.intervals.push(dt);
    if (!this.inFlight) {
      if (value >= this.lowLevel) this.reset();
      else if (t - this.takeoff >= this.minimumLowTime) this.inFlight = true;
      return null;
    }

    if (value < this.endLevel) {
      this.landing = null;
      this.impact = false;
      return t - this.takeoff > 1000 ? { error: 'No se detectó el aterrizaje.' } : null;
    }

    if (this.landing === null) {
      this.landing = crossing(previous, current, this.endLevel);
    }
    this.impact ||= value >= this.baseline + this.impactDelta;
    const landedFor = t - this.landing;
    if (!this.impact) {
      return landedFor > IMPACT_WAIT_MS ? { error: 'No se confirmó el impacto de aterrizaje.' } : null;
    }
    // Confirm ground contact without moving the timestamp of the first threshold crossing.
    if (landedFor < LANDING_CONFIRM_MS) return null;

    const flight = (this.landing - this.takeoff) / 1000;
    if (flight < this.minimumFlight || flight > 0.95) return { error: 'Tiempo de vuelo fuera del intervalo de detección.' };
    const hz = 1000 * this.intervals.length / this.intervals.reduce((sum, dt) => sum + dt, 0);
    const gap = Math.max(...this.intervals);
    return {
      flight, cm: 100 * GRAVITY * flight ** 2 / 8, hz, gap,
      quality: hz >= 40 && gap <= 40 ? 'Regular' : 'Limitado',
      takeoff: this.takeoff, landing: this.landing
    };
  }
}
