/* Learning a number from examples: the trips, the two losses, the nudge loop, and the figures drawn from them.
   Every figure is a pure drawing of model output; nothing moves unless the model says so. */
"use strict";

(function () {
  const { signal, derived, effect, svg, linear, pointerIn, format } = X;

  /* ---------- Model: km = w × miles, scored on logged trips ---------- */

  // Chosen for convenience: realistic-looking readings rounded to 0.1, tuned so the least-squares
  // weight Σ(miles·km) / Σ(miles²) is 1.6090 (to four places), the true 1.609344 km per mile.
  const TRIPS = [
    { miles: 3.2, km: 5.1 },
    { miles: 5.0, km: 8.0 },
    { miles: 7.4, km: 11.9 },
    { miles: 12.5, km: 19.9 },
    { miles: 18.0, km: 29.1 },
    { miles: 24.6, km: 39.6 },
    { miles: 46.3, km: 74.5 },
  ];
  // A 13-mile trip typed as 31 miles; the phone's 20.9 km is right.
  const TYPO_TRIP = { miles: 31.0, km: 20.9 };
  const KM_PER_MILE = 1.609;

  const miss = (w, trip) => w * trip.miles - trip.km;
  const average = (values) => values.reduce((sum, v) => sum + v, 0) / values.length;

  const LOSSES = {
    squared: (w, trips) => average(trips.map((t) => miss(w, t) ** 2)),
    size: (w, trips) => average(trips.map((t) => Math.abs(miss(w, t)))),
  };
  const OTHER_LOSS = { squared: "size", size: "squared" };
  const LOSS_NAME = { squared: "squared misses", size: "size of misses" };

  const last = (steps) => steps[steps.length - 1];

  /* ---------- The nudge loop: try both ways, keep the lower, halve when stuck ---------- */

  const FIRST_NUDGE = 0.4;
  const SMALLEST_NUDGE = 0.001;
  const MAX_STEPS = 24; // the loop halts on SMALLEST_NUDGE within 20 steps from any start in 0.2–4, either loss, either trip set

  /* Each step records the guess it reached and the round that got it there (absent on step 0). */
  function learn(start, lossKind, trips) {
    const score = (w) => LOSSES[lossKind](w, trips);
    const steps = [{ w: start, nudge: FIRST_NUDGE, loss: score(start), round: null }];
    for (let i = 0; i < MAX_STEPS; i += 1) {
      const { w, nudge, loss } = steps[i];
      if (nudge < SMALLEST_NUDGE) break;
      const up = { w: w + nudge, loss: score(w + nudge) };
      const down = { w: w - nudge, loss: score(w - nudge) };
      const best = up.loss <= down.loss ? up : down;
      const improved = best.loss < loss;
      const round = { from: w, up, down, outcome: improved ? (best === up ? "up" : "down") : "halve" };
      steps.push(improved ? { w: best.w, nudge, loss: best.loss, round } : { w, nudge: nudge / 2, loss, round });
    }
    if (last(steps).nudge >= SMALLEST_NUDGE) throw new Error(`learn: no halt within ${MAX_STEPS} steps from ${start}`);
    return steps;
  }

  const tripsWith = (typo) => (typo ? [...TRIPS, TYPO_TRIP] : TRIPS);
  const ALL_STARTS = Array.from({ length: 20 }, (_, i) => Number((0.2 * (i + 1)).toFixed(1)));

  /* ---------- State ---------- */

  const HAND_START = 1;
  const HAND_NUDGE = 0.05;
  const HAND_RANGE = [1, 2.2]; // keeps every miss inside the bars' fixed scale
  const guess = signal("guess", HAND_START);
  const previousGuess = signal("previousGuess", null);

  const start = signal("start", 1);
  const lossKind = signal("lossKind", "squared");
  const typo = signal("typo", false);
  const run = derived("run", [start, lossKind, typo], (s, kind, withTypo) => learn(s, kind, tripsWith(withTypo)));
  const otherRun = derived("otherRun", [start, lossKind, typo], (s, kind, withTypo) =>
    learn(s, OTHER_LOSS[kind], tripsWith(withTypo)),
  );
  const k = signal("k", run.value.length - 1);
  derived("runEnd", [run], (steps) => last(steps).w);
  derived("runSteps", [run], (steps) => steps.length - 1);
  derived("typoSquaredEnd", [start], (s) => last(learn(s, "squared", tripsWith(true))).w);
  derived("typoSizeEnd", [start], (s) => last(learn(s, "size", tripsWith(true))).w);

  const allRuns = derived("allRuns", [lossKind, typo], (kind, withTypo) =>
    ALL_STARTS.map((s) => learn(s, kind, tripsWith(withTypo))),
  );
  derived("allEnd", [allRuns], (runs) => {
    const ends = runs.map((steps) => format(last(steps).w, 3));
    return new Set(ends).size === 1 ? ends[0] : `${ends[0]} to ${ends[ends.length - 1]}`;
  });
  const hovered = signal("hovered", null); // start under the pointer in the every-start figure, if any

  // Changing an assumption shows the whole run at once; the player is for replaying it.
  run.subscribe((steps) => (k.value = steps.length - 1));

  X.mount();
  X.initThemeToggle(document.getElementById("theme"));

  const runPlayer = document.querySelector("#fig-run x-player");
  const fitPlayer = (steps) => runPlayer.setAttribute("max", String(steps.length - 1));
  run.subscribe(fitPlayer);
  fitPlayer(run.value);

  /* ---------- Figure: nudging by hand ---------- */

  const BAR_KM_MAX = 30; // half-width of the miss bars; HAND_RANGE keeps every miss inside it
  const byId = (id) => document.getElementById(id);

  /* A miss to 0.1 km with its sign; the shared format switches to exponents below 0.1. */
  function signedKm(gap) {
    const tenths = Math.round(gap * 10);
    if (tenths === 0) return "0.0";
    return `${tenths > 0 ? "+" : "−"}${(Math.abs(tenths) / 10).toFixed(1)}`;
  }

  function nudgeHand(direction) {
    const next = Number((guess.value + direction * HAND_NUDGE).toFixed(2));
    if (next < HAND_RANGE[0] || next > HAND_RANGE[1]) return;
    previousGuess.value = guess.value;
    guess.value = next;
  }
  byId("nudge-up").addEventListener("click", () => nudgeHand(1));
  byId("nudge-down").addEventListener("click", () => nudgeHand(-1));
  byId("hand-reset").addEventListener("click", () => {
    previousGuess.value = null;
    guess.value = HAND_START;
  });
  byId("hide-loss").addEventListener("change", (event) => {
    byId("hand-score").hidden = event.target.checked;
  });

  effect([guess, previousGuess], (w, before) => {
    const loss = LOSSES.squared(w, TRIPS);
    byId("hand-guess").textContent = format(w, 2);
    byId("hand-loss").textContent = format(loss, 3);
    if (before === null) {
      byId("hand-verdict").textContent = "";
    } else {
      const lossBefore = LOSSES.squared(before, TRIPS);
      const verdict = loss < lossBefore ? "better than" : "worse than";
      byId("hand-verdict").textContent = `${verdict} ${format(before, 2)}, which scored ${format(lossBefore, 3)}`;
    }
    byId("nudge-down").disabled = w - HAND_NUDGE < HAND_RANGE[0] - 1e-9;
    byId("nudge-up").disabled = w + HAND_NUDGE > HAND_RANGE[1] + 1e-9;

    const rows = TRIPS.map((trip) => {
      const gap = miss(w, trip);
      const widthPercent = (Math.min(Math.abs(gap), BAR_KM_MAX) / BAR_KM_MAX) * 50;
      const bar = document.createElement("span");
      bar.style.width = `${widthPercent}%`;
      bar.style.left = gap < 0 ? `${50 - widthPercent}%` : "50%";
      const cells = [
        format(trip.miles, 1),
        format(trip.km, 1),
        format(w * trip.miles, 1),
        signedKm(gap),
      ].map((content, i) => Object.assign(document.createElement("td"), { textContent: content, className: i === 2 ? "wide" : "" }));
      const barCell = Object.assign(document.createElement("td"), { className: "bar-cell" });
      barCell.append(Object.assign(document.createElement("div"), { className: "miss-bar" }));
      barCell.firstChild.append(bar);
      const row = document.createElement("tr");
      row.append(...cells, barCell);
      return row;
    });
    byId("hand-rows").replaceChildren(...rows);
  });

  /* ---------- Shared drawing helpers ---------- */

  function text(x, y, content, attributes = {}) {
    const element = svg("text", { x, y, class: "label", ...attributes });
    element.textContent = content;
    return element;
  }

  const W_AXIS = [0, 4.2];

  function traceFrame(svgElement) {
    const { width, height } = svgElement.viewBox.baseVal;
    const area = { left: 40, right: width - 16, top: 34, bottom: height - 30 };
    return {
      area,
      xOf: linear(W_AXIS, [area.left, area.right]),
      yOf: linear([0, MAX_STEPS], [area.top, area.bottom]),
    };
  }

  /* Axes for a chart of guess (across) against step (down), with the true km per mile marked. */
  function traceAxes({ area, xOf, yOf }) {
    const nodes = [];
    for (const step of [0, 8, 16, 24]) {
      nodes.push(svg("line", { class: "grid", x1: area.left, x2: area.right, y1: yOf(step), y2: yOf(step) }));
      nodes.push(text(area.left - 6, yOf(step) + 4, String(step), { class: "tick", "text-anchor": "end" }));
    }
    for (const w of [0, 1, 2, 3, 4]) {
      nodes.push(text(xOf(w), area.bottom + 16, String(w), { class: "tick", "text-anchor": "middle" }));
    }
    nodes.push(text(area.left - 6, area.top - 18, "step", { "text-anchor": "end" }));
    nodes.push(text(area.right, area.bottom + 16, "guess w", { "text-anchor": "end", class: "label-strong" }));
    nodes.push(svg("line", { class: "threshold", x1: xOf(KM_PER_MILE), x2: xOf(KM_PER_MILE), y1: area.top - 6, y2: area.bottom }));
    nodes.push(text(xOf(KM_PER_MILE) + 6, area.bottom - 6, "1.609 km per mile", { class: "tick" }));
    return nodes;
  }

  const pathPoints = (steps, { xOf, yOf }) =>
    steps.map((s, i) => `${xOf(s.w).toFixed(1)},${yOf(i).toFixed(1)}`).join(" ");

  /* ---------- Figure: one run of the program ---------- */

  const runSvg = byId("run");

  for (const button of document.querySelectorAll("[data-loss]")) {
    button.addEventListener("click", () => (lossKind.value = button.dataset.loss));
  }
  effect([lossKind], (kind) => {
    for (const button of document.querySelectorAll("[data-loss]")) {
      button.setAttribute("aria-pressed", String(button.dataset.loss === kind));
    }
  });
  const typoBox = byId("typo");
  typoBox.addEventListener("change", () => (typo.value = typoBox.checked));
  effect([typo], (withTypo) => (typoBox.checked = withTypo));

  effect([run, otherRun, k, lossKind], (steps, other, upTo, kind) => {
    const frame = traceFrame(runSvg);
    const { xOf, yOf } = frame;
    const shown = Math.min(upTo, steps.length - 1);
    const nodes = traceAxes(frame);

    nodes.push(svg("polyline", { class: "trace-path other", points: pathPoints(other, frame) }));
    const otherEnd = last(other);
    nodes.push(text(xOf(otherEnd.w) + 6, yOf(other.length - 1) + 12, LOSS_NAME[OTHER_LOSS[kind]], { class: "tick" }));

    const visible = steps.slice(0, shown + 1);
    nodes.push(svg("polyline", { class: "trace-path", points: pathPoints(visible, frame) }));
    visible.forEach((s, i) => nodes.push(svg("circle", { class: "trace-dot", cx: xOf(s.w), cy: yOf(i), r: i === shown ? 5 : 2.5 })));

    const nextRound = steps[shown + 1]?.round;
    if (nextRound) {
      for (const tried of [nextRound.up, nextRound.down]) {
        nodes.push(svg("circle", { class: "tried-mark", cx: xOf(tried.w), cy: yOf(shown), r: 5 }));
      }
    }
    runSvg.replaceChildren(...nodes);

    byId("run-log").replaceChildren(...describeStep(steps, shown, nextRound));
  });

  function describeStep(steps, shown, nextRound) {
    const here = steps[shown];
    const strong = (content) => Object.assign(document.createElement("strong"), { textContent: content });
    const parts = [strong(`Step ${shown}: `), `guess ${format(here.w, 3)}, loss ${format(here.loss, 3)}. `];
    if (nextRound) {
      const { up, down, outcome } = nextRound;
      const tried = `Next it tries ${format(up.w, 3)} (loss ${format(up.loss, 3)}) and ${format(down.w, 3)} (loss ${format(down.loss, 3)}): `;
      const decision = {
        up: "the higher guess scores lower, so it moves up.",
        down: "the lower guess scores lower, so it moves down.",
        halve: `neither beats ${format(here.loss, 3)}, so it halves the nudge to ${format(here.nudge / 2, 4)}.`,
      }[outcome];
      parts.push(tried, decision);
    } else {
      parts.push(`The nudge is down to ${format(here.nudge, 4)}, below ${SMALLEST_NUDGE}, so the program stops.`);
    }
    return parts;
  }

  byId("predict-typo").addEventListener("reveal", () => {
    typo.value = true;
    runPlayer.play({ fromStart: true });
  });

  /* ---------- Figure: every start at once ---------- */

  const allSvg = byId("all");
  const figAll = byId("fig-all");

  byId("predict-starts").addEventListener("reveal", () => (figAll.hidden = false));

  effect([allRuns, hovered, start], (runs, hover, current) => {
    const frame = traceFrame(allSvg);
    const { xOf, yOf } = frame;
    const nodes = traceAxes(frame);
    const picked = hover ?? current;
    runs.forEach((steps, i) => {
      const isPicked = ALL_STARTS[i] === picked;
      nodes.push(svg("polyline", { class: isPicked ? "trace-path" : "trace-path faint", points: pathPoints(steps, frame) }));
      if (isPicked) nodes.push(svg("circle", { class: "trace-dot", cx: xOf(last(steps).w), cy: yOf(steps.length - 1), r: 5 }));
    });
    for (const s of ALL_STARTS) {
      nodes.push(svg("circle", { class: s === picked ? "start-dot active" : "start-dot", cx: xOf(s), cy: yOf(0), r: 5 }));
    }
    allSvg.replaceChildren(...nodes);
  });

  function nearestStart(event) {
    const w = traceFrame(allSvg).xOf.invert(pointerIn(allSvg, event).x);
    return ALL_STARTS.reduce((best, s) => (Math.abs(s - w) < Math.abs(best - w) ? s : best));
  }
  allSvg.addEventListener("pointermove", (event) => (hovered.value = nearestStart(event)));
  allSvg.addEventListener("pointerleave", () => (hovered.value = null));
  allSvg.addEventListener("click", (event) => {
    start.value = nearestStart(event);
    runPlayer.play({ fromStart: true });
  });
})();
