'use strict';

const GRAVITY = 9.80665;
const MAX_SAMPLE_GAP = 80;

function crossing(previous, current, level) {
  const fraction = (level - previous.value) / (current.value - previous.value);
  return previous.t + (current.t - previous.t) * fraction;
}

class JumpDetector {
  constructor(baseline) {
    this.baseline = baseline;
    this.lowLevel = baseline * 0.36;
    this.endLevel = baseline * 0.64;
    this.reset();
  }

  reset() {
    this.impulse = null;
    this.takeoff = null;
    this.landing = null;
    this.inFlight = false;
    this.intervals = [];
  }

  sample(t, value) {
    const current = { t, value };
    const previous = this.previous;
    this.previous = current;
    if (!previous) return null;
    const dt = t - previous.t;
    if (dt <= 0) return null;
    if (dt > MAX_SAMPLE_GAP) {
      const interrupted = this.takeoff !== null;
      this.reset();
      return interrupted ? { error: 'Faltan muestras durante el salto.' } : null;
    }

    if (this.takeoff === null) {
      if (value >= this.baseline + 2.1) this.impulse = t;
      if (this.impulse !== null && t - this.impulse <= 800 && value < this.lowLevel && previous.value >= this.lowLevel) {
        this.takeoff = crossing(previous, current, this.lowLevel);
        this.intervals.push(dt);
      }
      return null;
    }

    this.intervals.push(dt);
    if (!this.inFlight) {
      if (value >= this.lowLevel) this.reset();
      else if (t - this.takeoff >= 34) this.inFlight = true;
      return null;
    }

    if (this.landing === null && value >= this.endLevel && previous.value < this.endLevel) {
      this.landing = crossing(previous, current, this.endLevel);
    }
    if (this.landing === null) {
      return t - this.takeoff > 1000 ? { error: 'No se detectó el aterrizaje.' } : null;
    }
    if (t - this.landing > 140 || value < this.lowLevel) {
      return { error: 'No se confirmó el impacto de aterrizaje.' };
    }
    if (value < this.baseline + 1.5) return null;

    const flight = (this.landing - this.takeoff) / 1000;
    if (flight < 0.12 || flight > 0.95) return { error: 'Tiempo de vuelo fuera del intervalo de detección.' };
    const hz = 1000 * this.intervals.length / this.intervals.reduce((sum, dt) => sum + dt, 0);
    const gap = Math.max(...this.intervals);
    return {
      flight, cm: 100 * GRAVITY * flight ** 2 / 8, hz, gap,
      quality: hz >= 40 && gap <= 40 ? 'Regular' : 'Limitado',
      takeoff: this.takeoff, landing: this.landing
    };
  }
}
