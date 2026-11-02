// Forger, Jewett & Kronauer (1999) "A simpler model of the human circadian pacemaker".
// J Biol Rhythms 14(6):532-7.
//
// A light-driven van der Pol oscillator (x, xc) plus "Process L", a photoreceptor
// activation variable (n). Equations and default parameters follow the open-source
// reference implementation in the Arcascope `circadian` package (Forger99 class), which
// is the version used in published validation work (Cheng et al. 2021, Sleep 44:zsab126).
//
//   α      = α0 · (I / I0)^p
//   B̂      = G · (1 − n) · α · (1 − 0.4x) · (1 − 0.4xc)
//   dx/dt  = π/12 · (xc + B̂)
//   dxc/dt = π/12 · ( μ(xc − 4/3·xc³) − x · ((24 / (0.99669 τx))² + k·B̂) )
//   dn/dt  = 60 · (α(1 − n) − β n)
//
// Phase marker: the minimum of x = core body temperature minimum (CBTmin);
// DLMO = CBTmin − 7 h (as used by Cheng et al. 2021).
//
// Real-world accuracy (Cheng 2021): in day workers with wrist light/activity data, mean
// absolute error for DLMO was ~0.6–1.0 h, comparable to the "bedtime − 2 h" proxy (0.97 h).

export const FORGER99 = Object.freeze({
  taux: 24.2,
  mu: 0.23,
  G: 33.75,
  alpha0: 0.05,
  beta: 0.0075,
  p: 0.5,
  I0: 9500,
  k: 0.55,
  cbtToDlmo: 7,
});

export const DT_H = 0.1; // integration step (6 min)
export const STEPS_PER_DAY = Math.round(24 / DT_H);

function deriv(x, xc, n, I, P) {
  const alpha = I > 0 ? P.alpha0 * Math.pow(I / P.I0, P.p) : 0;
  const Bhat = P.G * (1 - n) * alpha * (1 - 0.4 * x) * (1 - 0.4 * xc);
  const muTerm = P.mu * (xc - (4 / 3) * xc * xc * xc);
  const tauTerm = Math.pow(24 / (0.99669 * P.taux), 2) + P.k * Bhat;
  return [
    (Math.PI / 12) * (xc + Bhat),
    (Math.PI / 12) * (muTerm - x * tauTerm),
    60 * (alpha * (1 - n) - P.beta * n),
  ];
}

/** One RK4 step with light held constant across the step. */
export function step(state, lux, dt = DT_H, P = FORGER99) {
  const [x, xc, n] = state;
  const k1 = deriv(x, xc, n, lux, P);
  const k2 = deriv(x + (dt / 2) * k1[0], xc + (dt / 2) * k1[1], n + (dt / 2) * k1[2], lux, P);
  const k3 = deriv(x + (dt / 2) * k2[0], xc + (dt / 2) * k2[1], n + (dt / 2) * k2[2], lux, P);
  const k4 = deriv(x + dt * k3[0], xc + dt * k3[1], n + dt * k3[2], lux, P);
  return [
    x + (dt / 6) * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]),
    xc + (dt / 6) * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]),
    n + (dt / 6) * (k1[2] + 2 * k2[2] + 2 * k3[2] + k4[2]),
  ];
}

export const DEFAULT_INITIAL = Object.freeze([-0.5, -1, 0.5]);

/**
 * Integrate over a light series sampled every DT_H hours.
 * Returns the x trajectory (Float64Array) and final state.
 */
export function simulate(lux, initial = DEFAULT_INITIAL, P = FORGER99) {
  let s = [...initial];
  const xs = new Float64Array(lux.length);
  for (let i = 0; i < lux.length; i++) {
    s = step(s, lux[i], DT_H, P);
    xs[i] = s[0];
  }
  return { x: xs, final: s };
}

/**
 * Run the first day's light pattern repeatedly so the oscillator starts entrained to the
 * person's habitual routine (standard practice before fitting real data).
 */
export function entrain(dayLux, days = 20, P = FORGER99) {
  let s = [...DEFAULT_INITIAL];
  for (let d = 0; d < days; d++) {
    for (let i = 0; i < dayLux.length; i++) s = step(s, dayLux[i], DT_H, P);
  }
  return s;
}

/**
 * Indices of CBTmin (local minima of x), at least 13 h apart, refined with a parabolic
 * fit for sub-step precision. Returns times in hours from the series start.
 */
export function cbtMinTimes(x) {
  const minGap = Math.ceil(13 / DT_H);
  const out = [];
  let last = -Infinity;
  for (let i = 1; i < x.length - 1; i++) {
    if (x[i] <= x[i - 1] && x[i] < x[i + 1] && i - last >= minGap) {
      const denom = x[i - 1] - 2 * x[i] + x[i + 1];
      const offset = denom !== 0 ? (0.5 * (x[i - 1] - x[i + 1])) / denom : 0;
      out.push((i + 1 + offset) * DT_H); // state after step i is at time (i+1)·dt
      last = i;
    }
  }
  return out;
}
