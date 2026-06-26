// Student's t-distribution CDF — self-contained, no dependency. Used to turn a
// (mean, predictive SE, dof) fit of the historical "points-from-here" sample into
// P(outcome > betting line), mirroring the HuggingFace app's scipy `t.cdf`.
//
// Implementation: the t CDF in terms of the regularized incomplete beta function
// I_x(a,b), via the standard Numerical Recipes `betai`/`betacf`/`gammaln` routines.

function gammaln(x: number): number {
  const cof = [
    76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155,
    0.1208650973866179e-2, -0.5395239384953e-5,
  ];
  let y = x;
  let tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  for (let j = 0; j < 6; j++) ser += cof[j] / ++y;
  return -tmp + Math.log((2.5066282746310005 * ser) / x);
}

// Continued-fraction evaluation of the incomplete beta (Lentz's method).
function betacf(a: number, b: number, x: number): number {
  const MAXIT = 200,
    EPS = 3e-12,
    FPMIN = 1e-300;
  const qab = a + b,
    qap = a + 1,
    qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= MAXIT; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}

// Regularized incomplete beta I_x(a, b).
function betai(a: number, b: number, x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(
    gammaln(a + b) - gammaln(a) - gammaln(b) + a * Math.log(x) + b * Math.log(1 - x),
  );
  return x < (a + 1) / (a + b + 2)
    ? (bt * betacf(a, b, x)) / a
    : 1 - (bt * betacf(b, a, 1 - x)) / b;
}

/** P(T <= t) for a Student-t with `df` degrees of freedom. */
export function studentTCdf(t: number, df: number): number {
  if (df <= 0 || Number.isNaN(t)) return NaN;
  if (!Number.isFinite(t)) return t > 0 ? 1 : 0;
  const ib = 0.5 * betai(df / 2, 0.5, df / (df + t * t));
  return t > 0 ? 1 - ib : ib;
}

/**
 * P(outcome > line) given the fitted mean, predictive standard error, and dof.
 * Mirrors the HF app: tstat = (line - mu) / se; P(over) = 1 - t.cdf(tstat, dof).
 */
export function probOver(line: number, mu: number, se: number, df: number): number {
  if (!Number.isFinite(se) || se <= 0) return line < mu ? 1 : line > mu ? 0 : 0.5;
  return 1 - studentTCdf((line - mu) / se, df);
}
