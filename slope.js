/* The slope says which way: measuring the slope, building it from each trip's pull, and stepping against it.
   Every figure is a pure drawing of model output; nothing moves unless the model says so. */
"use strict";

(function () {
  const { signal, derived, effect, svg, linear, pointerIn, format } = X;

  /* ---------- Model: km = w × miles, scored by squared misses on logged trips ---------- */

  // The trips from the previous page. Chosen for convenience: realistic-looking readings rounded to 0.1,
  // tuned so the least-squares weight Σ(miles·km) / Σ(miles²) is 1.6090, the true 1.609344 km per mile.
  const TRIPS = [
    { miles: 3.2, km: 5.1 },
    { miles: 5.0, km: 8.0 },
    { miles: 7.4, km: 11.9 },
    { miles: 12.5, km: 19.9 },
    { miles: 18.0, km: 29.1 },
    { miles: 24.6, km: 39.6 },
    { miles: 46.3, km: 74.5 },
  ];
  const KM_PER_MILE = 1.609;

  const average = (values) => values.reduce((sum, v) => sum + v, 0) / values.length;
  const miss = (w, trip) => w * trip.miles - trip.km;
  const lossAt = (w) => average(TRIPS.map((t) => miss(w, t) ** 2));

  /* How much one trip's squared miss changes per unit the guess moves: 2 × miles × miss. */
  const pull = (w, trip) => 2 * trip.miles * miss(w, trip);
  const slopeAt = (w) => average(TRIPS.map((t) => pull(w, t)));

  /* ---------- Stepping against the slope ---------- */

  // Fixed for this page; choosing it is the next page's subject. With these trips each step covers
  // about 47% of the remaining distance (0.0005 × 2 × average miles² ≈ 0.474).
  const STEP_FACTOR = 0.0005;
  const stepFrom = (w) => -STEP_FACTOR * slopeAt(w);

  const SMALLEST_STEP = 0.0001;
  const MAX_STEPS = 20; // every start in 0.2–4 takes a step below SMALLEST_STEP within 17 steps

  function descend(start) {
    const steps = [{ w: start, slope: slopeAt(start) }];
    for (let i = 0; i < MAX_STEPS; i += 1) {
      const { w } = steps[i];
      const step = stepFrom(w);
      if (Math.abs(step) < SMALLEST_STEP) return steps;
      steps.push({ w: w + step, slope: slopeAt(w + step) });
    }
    throw new Error(`descend: no halt within ${MAX_STEPS} steps from ${start}`);
  }

  const last = (items) => items[items.length - 1];
  const ALL_STARTS = Array.from({ length: 20 }, (_, i) => Number((0.2 * (i + 1)).toFixed(1)));

  /* ---------- State ---------- */

  const MEASURE_AT = 1;
  const NUDGES = [0.1, 0.01, 0.001];
  const measureNudge = signal("measureNudge", NUDGES[0]);

  const HAND_START = 1;
  const HAND_RANGE = [0, 3.2]; // a run of wrong-way steps stops here; right-way steps never leave it
  const handPath = signal("handPath", [HAND_START]); // every guess the reader has stepped to, in order

  const start = signal("start", 1);
  const run = derived("run", [start], descend);
  const k = signal("k", run.value.length - 1);
  derived("runEnd", [run], (steps) => last(steps).w);
  derived("runSteps", [run], (steps) => steps.length - 1);
  const allRuns = ALL_STARTS.map(descend);
  const hovered = signal("hovered", null);

  derived("stepsFromOne", [], () => descend(1).length - 1);
  derived("stepsFromFour", [], () => descend(4).length - 1);

  run.subscribe((steps) => (k.value = steps.length - 1));

  X.mount();
  X.initThemeToggle(document.getElementById("theme"));

  const byId = (id) => document.getElementById(id);
  const runPlayer = document.querySelector("#fig-run x-player");
  const fitPlayer = (steps) => runPlayer.setAttribute("max", String(steps.length - 1));
  run.subscribe(fitPlayer);
  fitPlayer(run.value);

  const signed = (value, digits) => (value < 0 ? `−${format(-value, digits)}` : format(value, digits));

  /* ---------- Figure: measuring the slope with a small nudge ---------- */

  for (const button of document.querySelectorAll("[data-nudge]")) {
    button.addEventListener("click", () => (measureNudge.value = Number(button.dataset.nudge)));
  }

  effect([measureNudge], (h) => {
    for (const button of document.querySelectorAll("[data-nudge]")) {
      button.setAttribute("aria-pressed", String(Number(button.dataset.nudge) === h));
    }
    const before = lossAt(MEASURE_AT);
    const after = lossAt(MEASURE_AT + h);
    const nudgeDigits = Math.round(-Math.log10(h));
    byId("measure-nudged").textContent = format(MEASURE_AT + h, nudgeDigits);
    byId("measure-before").textContent = format(before, 3);
    byId("measure-after").textContent = format(after, 3);
    byId("measure-change").textContent = signed(after - before, 3);
    byId("measure-h").textContent = format(h, nudgeDigits);
    byId("measure-ratio").textContent = signed((after - before) / h, 1);
  });

  /* ---------- Figure: each trip's pull ---------- */

  const PULL_MAX = 2700; // half-width of the pull bars; the longest trip pulls −2611 at w = 1

  function pullRows(w) {
    return TRIPS.map((trip) => {
      const value = pull(w, trip);
      const widthPercent = (Math.min(Math.abs(value), PULL_MAX) / PULL_MAX) * 50;
      const bar = document.createElement("span");
      bar.style.width = `${widthPercent}%`;
      bar.style.left = value < 0 ? `${50 - widthPercent}%` : "50%";
      const cells = [format(trip.miles, 1), signed(miss(w, trip), 1), signed(value, 1)].map((content) =>
        Object.assign(document.createElement("td"), { textContent: content }),
      );
      const barCell = Object.assign(document.createElement("td"), { className: "bar-cell" });
      const track = Object.assign(document.createElement("div"), { className: "pull-bar" });
      track.append(bar);
      barCell.append(track);
      const row = document.createElement("tr");
      row.append(...cells, barCell);
      return row;
    });
  }

  byId("pull-rows").replaceChildren(...pullRows(MEASURE_AT));
  byId("pull-total").textContent = signed(slopeAt(MEASURE_AT), 1);

  /* ---------- Figure: stepping by hand ---------- */

  const STEP_DIGITS = 4;

  function takeStep(direction) {
    const here = last(handPath.value);
    const next = here + direction * Math.abs(stepFrom(here));
    if (next < HAND_RANGE[0] || next > HAND_RANGE[1]) return;
    handPath.value = [...handPath.value, next];
  }
  byId("step-up").addEventListener("click", () => takeStep(1));
  byId("step-down").addEventListener("click", () => takeStep(-1));
  byId("hand-reset").addEventListener("click", () => (handPath.value = [HAND_START]));

  effect([handPath], (path) => {
    const w = last(path);
    const length = Math.abs(stepFrom(w));
    byId("hand-guess").textContent = format(w, 3);
    byId("hand-loss").textContent = format(lossAt(w), 3);
    byId("hand-slope").textContent = signed(slopeAt(w), 1);
    byId("step-up").textContent = `Step up ${format(length, STEP_DIGITS)}`;
    byId("step-down").textContent = `Step down ${format(length, STEP_DIGITS)}`;
    byId("step-up").disabled = w + length > HAND_RANGE[1];
    byId("step-down").disabled = w - length < HAND_RANGE[0];

    const rows = path.slice(1).map((after, i) => {
      const before = path[i];
      const lossWent = lossAt(after) < lossAt(before) ? "down" : "up";
      const cells = [String(i + 1), format(before, 3), signed(slopeAt(before), 1), signed(after - before, STEP_DIGITS), format(after, 3), lossWent];
      const row = document.createElement("tr");
      if (lossWent === "up") row.className = "wrong-way";
      row.append(...cells.map((content) => Object.assign(document.createElement("td"), { textContent: content })));
      return row;
    });
    byId("hand-rows").replaceChildren(...rows);
    byId("hand-log").hidden = rows.length === 0;
  });

  byId("predict-steps").addEventListener("reveal", () => (byId("fig-hand").hidden = false));

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
    return { area, xOf: linear(W_AXIS, [area.left, area.right]), yOf: linear([0, MAX_STEPS], [area.top, area.bottom]) };
  }

  /* Axes for a chart of guess (across) against step (down), with the true km per mile marked. */
  function traceAxes({ area, xOf, yOf }) {
    const nodes = [];
    for (const step of [0, 5, 10, 15, 20]) {
      nodes.push(svg("line", { class: "grid", x1: area.left, x2: area.right, y1: yOf(step), y2: yOf(step) }));
      nodes.push(text(area.left - 6, yOf(step) + 4, String(step), { class: "tick", "text-anchor": "end" }));
    }
    for (const w of [0, 1, 2, 3, 4]) {
      nodes.push(text(xOf(w), area.bottom + 16, String(w), { class: "tick", "text-anchor": "middle" }));
    }
    nodes.push(text(area.left - 6, area.top - 18, "step", { "text-anchor": "end" }));
    nodes.push(text(area.right, area.top - 18, "guess w", { "text-anchor": "end", class: "label-strong" }));
    nodes.push(svg("line", { class: "threshold", x1: xOf(KM_PER_MILE), x2: xOf(KM_PER_MILE), y1: area.top - 6, y2: area.bottom }));
    nodes.push(text(xOf(KM_PER_MILE) + 6, area.bottom - 6, "1.609 km per mile", { class: "tick" }));
    return nodes;
  }

  const pathPoints = (steps, { xOf, yOf }) => steps.map((s, i) => `${xOf(s.w).toFixed(1)},${yOf(i).toFixed(1)}`).join(" ");

  /* ---------- Figure: one run of the program ---------- */

  const runSvg = byId("run");

  effect([run, k], (steps, upTo) => {
    const frame = traceFrame(runSvg);
    const { xOf, yOf } = frame;
    const shown = Math.min(upTo, steps.length - 1);
    const nodes = traceAxes(frame);
    const visible = steps.slice(0, shown + 1);
    visible.slice(1).forEach((s, i) => {
      nodes.push(svg("line", { class: "step-arrow", x1: xOf(visible[i].w), x2: xOf(s.w), y1: yOf(i), y2: yOf(i + 1) }));
    });
    visible.forEach((s, i) => nodes.push(svg("circle", { class: "trace-dot", cx: xOf(s.w), cy: yOf(i), r: i === shown ? 5 : 2.5 })));
    runSvg.replaceChildren(...nodes);
    byId("run-log").replaceChildren(...describeStep(steps, shown));
  });

  function describeStep(steps, shown) {
    const here = steps[shown];
    const strong = (content) => Object.assign(document.createElement("strong"), { textContent: content });
    const step = stepFrom(here.w);
    const parts = [strong(`Step ${shown}: `), `guess ${format(here.w, 4)}, slope ${signed(here.slope, 2)}. `];
    if (shown < steps.length - 1) {
      parts.push(`The next step is −${STEP_FACTOR} × slope = ${signed(step, STEP_DIGITS)}.`);
    } else {
      parts.push(`The next step would be ${signed(step, 5)}, smaller than ${SMALLEST_STEP}, so the program stops.`);
    }
    return parts;
  }

  /* ---------- Figure: every start at once ---------- */

  const allSvg = byId("all");

  byId("predict-starts").addEventListener("reveal", () => (byId("fig-all").hidden = false));

  effect([hovered, start], (hover, current) => {
    const frame = traceFrame(allSvg);
    const { xOf, yOf } = frame;
    const nodes = traceAxes(frame);
    const picked = hover ?? current;
    allRuns.forEach((steps, i) => {
      const isPicked = ALL_STARTS[i] === picked;
      nodes.push(svg("polyline", { class: isPicked ? "trace-path" : "trace-path faint", points: pathPoints(steps, frame) }));
      nodes.push(svg("circle", { class: isPicked ? "end-dot active" : "end-dot", cx: xOf(last(steps).w), cy: yOf(steps.length - 1), r: isPicked ? 5 : 3 }));
    });
    for (const s of ALL_STARTS) {
      nodes.push(svg("circle", { class: s === picked ? "start-dot active" : "start-dot", cx: xOf(s), cy: yOf(0), r: 5 }));
    }
    allSvg.replaceChildren(...nodes);
    const pickedRun = allRuns[ALL_STARTS.indexOf(picked)];
    byId("all-log").textContent = pickedRun
      ? `From ${format(picked, 1)}: ${pickedRun.length - 1} steps, ending at ${format(last(pickedRun).w, 4)}.`
      : "";
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
