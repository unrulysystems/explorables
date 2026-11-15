/* How big a nudge: the learning rate scales every step, each step multiplies the distance to the answer by
   one number, and past a certain rate that number makes the distance grow.
   Every figure is a pure drawing of model output; nothing moves unless the model says so. */
"use strict";

(function () {
  const { signal, derived, effect, svg, linear, logarithmic, pointerIn, format } = X;

  /* ---------- Model: km = w × miles, scored by squared misses on logged trips ---------- */

  // The trips from the previous pages. Chosen for convenience: realistic-looking readings rounded to 0.1,
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
  // One long drive, logged correctly: 150 × 1.609344 = 241.4 to one decimal. Chosen for convenience: a round
  // length whose square (22,500) is several times the other seven squares combined (3,319), so this one trip
  // sets the steepness. With it the least-squares weight is 1.6093.
  const LONG_TRIP = { miles: 150.0, km: 241.4 };
  const tripsFor = (includeLongTrip) => (includeLongTrip ? [...TRIPS, LONG_TRIP] : TRIPS);
  const KM_PER_MILE = 1.609;

  const average = (values) => values.reduce((sum, v) => sum + v, 0) / values.length;
  const miss = (w, trip) => w * trip.miles - trip.km;
  const lossAt = (w, trips) => average(trips.map((t) => miss(w, t) ** 2));
  const slopeAt = (w, trips) => average(trips.map((t) => 2 * t.miles * miss(w, t)));

  /* Slope per unit of distance from the least-squares weight. For one weight scored by squared misses,
     slopeAt(w) = steepness × (w − best) exactly, so the steepness is the same at every guess. */
  const steepness = (trips) => 2 * average(trips.map((t) => t.miles ** 2));

  /* What one step does to the distance from the least-squares weight: distance after = multiplier × distance before. */
  const multiplier = (rate, trips) => 1 - steepness(trips) * rate;

  const stepFrom = (w, rate, trips) => -rate * slopeAt(w, trips);

  const START = 1;
  const RUN_STEPS = 20;

  function descend(rate, trips, count) {
    const steps = [{ w: START, loss: lossAt(START, trips), slope: slopeAt(START, trips) }];
    for (let i = 0; i < count; i += 1) {
      const w = steps[i].w + stepFrom(steps[i].w, rate, trips);
      steps.push({ w, loss: lossAt(w, trips), slope: slopeAt(w, trips) });
    }
    return steps;
  }

  const SMALLEST_STEP = 0.0001; // the previous page's stopping rule
  const SETTLE_LIMIT = 200;

  /* How many steps a run takes before its next step would be smaller than SMALLEST_STEP,
     or null when SETTLE_LIMIT steps are not enough. */
  function stepsToSettle(rate, trips) {
    let w = START;
    for (let taken = 0; taken <= SETTLE_LIMIT; taken += 1) {
      const step = stepFrom(w, rate, trips);
      if (Math.abs(step) < SMALLEST_STEP) return taken;
      w += step;
    }
    return null;
  }

  const RATE_STEP = 0.0001;
  const RATES = Array.from({ length: 25 }, (_, i) => Number(((i + 1) * RATE_STEP).toFixed(4)));
  const PREVIOUS_PAGE_RATE = 0.0005;

  const last = (items) => items[items.length - 1];
  const signed = (value, digits) => (value < 0 ? `−${format(-value, digits)}` : format(value, digits));
  /* A signed value to one decimal; anything that rounds to zero reads "0.0", never an exponent or "−0.0". */
  const tenths = (value) => signed(Number(value.toFixed(1)) + 0, 1);
  const whole = (value) => (value < 0 ? "−" : "") + Math.round(Math.abs(value)).toLocaleString("en-US");

  /* ---------- State ---------- */

  const rate = signal("rate", PREVIOUS_PAGE_RATE);
  const includeLongTrip = signal("includeLongTrip", false);
  const trips = derived("trips", [includeLongTrip], tripsFor);

  const run = derived("run", [rate, trips], (r, t) => descend(r, t, RUN_STEPS));
  const k = signal("k", RUN_STEPS);
  run.subscribe(() => (k.value = RUN_STEPS));

  derived("multiplierSeven", [rate], (r) => signed(multiplier(r, TRIPS), 2));
  derived("multiplierNow", [rate, trips], (r, t) => signed(multiplier(r, t), 2));
  derived("steepnessNow", [trips], (t) => whole(steepness(t)));

  const HAND_STEPS_MAX = 30;
  const handSteps = signal("handSteps", []); // every step the reader has taken on the seven trips: { rate, from, to }

  const sweep = derived("sweep", [trips], (t) => RATES.map((r) => ({ rate: r, steps: stepsToSettle(r, t) })));
  const probe = signal("probe", null); // rate under the pointer in the sweep, if any

  // Numbers the prose quotes, computed here so the text cannot drift from the model.
  const settleOnSeven = (r) => {
    const steps = stepsToSettle(r, TRIPS);
    if (steps === null) throw new Error(`learning-rate: the prose quotes a settling count for ${r}, which does not settle`);
    return steps;
  };
  derived("settleAt0001", [], () => settleOnSeven(0.0001));
  derived("settleAt0005", [], () => settleOnSeven(0.0005));
  derived("settleAt0010", [], () => settleOnSeven(0.001));
  derived("settleAt0015", [], () => settleOnSeven(0.0015));
  derived("settleAt0020", [], () => settleOnSeven(0.002));
  derived("distanceAfterRunAt0022", [], () => Math.abs(last(descend(0.0022, TRIPS, RUN_STEPS)).w - KM_PER_MILE));

  X.mount();
  X.initThemeToggle(document.getElementById("theme"));

  const byId = (id) => document.getElementById(id);
  const cell = (content) => Object.assign(document.createElement("td"), { textContent: content });
  const runPlayer = document.querySelector("#fig-run x-player");

  /* ---------- Figure: the previous page's rate on the log with the long trip ---------- */

  const FAIL_STEPS = 5;
  byId("fail-rows").replaceChildren(
    ...descend(PREVIOUS_PAGE_RATE, tripsFor(true), FAIL_STEPS).map((s, i) => {
      const row = document.createElement("tr");
      row.append(cell(String(i)), cell(signed(s.w, 3)), cell(whole(s.loss)), cell(whole(s.slope)));
      return row;
    }),
  );

  /* ---------- Figure: stepping by hand at a rate the reader sets ---------- */

  const STEP_DIGITS = 4;
  const handGuess = (steps) => (steps.length === 0 ? START : last(steps).to);

  byId("hand-step").addEventListener("click", () => {
    const taken = handSteps.value;
    if (taken.length >= HAND_STEPS_MAX) return;
    const from = handGuess(taken);
    handSteps.value = [...taken, { rate: rate.value, from, to: from + stepFrom(from, rate.value, TRIPS) }];
  });
  byId("hand-reset").addEventListener("click", () => (handSteps.value = []));

  effect([handSteps, rate], (taken, r) => {
    const w = handGuess(taken);
    const atLimit = taken.length >= HAND_STEPS_MAX;
    byId("hand-guess").textContent = signed(w, 3);
    byId("hand-loss").textContent = format(lossAt(w, TRIPS), 3);
    byId("hand-slope").textContent = tenths(slopeAt(w, TRIPS));
    byId("hand-step").textContent = atLimit
      ? `${HAND_STEPS_MAX} steps taken`
      : `Take a step: ${signed(stepFrom(w, r, TRIPS), STEP_DIGITS)}`;
    byId("hand-step").disabled = atLimit;

    const rows = taken.map((step, i) => {
      const lossWent = lossAt(step.to, TRIPS) < lossAt(step.from, TRIPS) ? "down" : "up";
      const row = document.createElement("tr");
      if (lossWent === "up") row.className = "wrong-way";
      const from = Object.assign(cell(signed(step.from, 3)), { className: "wide" });
      row.append(
        cell(String(i + 1)),
        cell(format(step.rate, 4)),
        from,
        cell(tenths(slopeAt(step.from, TRIPS))),
        cell(signed(step.to - step.from, STEP_DIGITS)),
        cell(signed(step.to, 3)),
        cell(lossWent),
      );
      return row;
    });
    byId("hand-rows").replaceChildren(...rows);
    byId("hand-log").hidden = rows.length === 0;
  });

  /* ---------- Controls shared by the run and the sweep ---------- */

  const longTripToggles = [...document.querySelectorAll("input[data-long-trip]")];
  for (const toggle of longTripToggles) {
    toggle.addEventListener("change", () => (includeLongTrip.value = toggle.checked));
  }
  effect([includeLongTrip], (included) => {
    for (const toggle of longTripToggles) toggle.checked = included;
  });

  function replayAt(chosenRate, { withLongTrip }) {
    includeLongTrip.value = withLongTrip;
    rate.value = chosenRate;
    runPlayer.play({ fromStart: true });
  }

  byId("predict-swing").addEventListener("reveal", () => replayAt(0.0015, { withLongTrip: false }));
  byId("predict-edge").addEventListener("reveal", () => replayAt(0.0022, { withLongTrip: false }));
  byId("predict-cliff").addEventListener("reveal", () => {
    includeLongTrip.value = true;
    rate.value = PREVIOUS_PAGE_RATE; // the run the page opened with, which the reveal goes on to explain
  });

  /* ---------- Shared drawing helpers ---------- */

  function text(x, y, content, attributes = {}) {
    const element = svg("text", { x, y, class: "label", ...attributes });
    element.textContent = content;
    return element;
  }

  /* ---------- Figure: one run of the program ---------- */

  const runSvg = byId("run");
  const W_AXIS = [-2, 5]; // wide enough for twenty steps at 0.0022 on the seven trips;
  // guesses outside it are clipped, and the log line under the chart still reports them
  const onChart = (w) => w >= W_AXIS[0] && w <= W_AXIS[1];

  function runFrame() {
    const { width, height } = runSvg.viewBox.baseVal;
    const area = { left: 40, right: width - 16, top: 34, bottom: height - 30 };
    return { area, xOf: linear(W_AXIS, [area.left, area.right]), yOf: linear([0, RUN_STEPS], [area.top, area.bottom]) };
  }

  /* Axes for a chart of guess (across) against step (down), with the true km per mile marked. */
  function runAxes({ area, xOf, yOf }) {
    const nodes = [];
    for (const step of [0, 5, 10, 15, 20]) {
      nodes.push(svg("line", { class: "grid", x1: area.left, x2: area.right, y1: yOf(step), y2: yOf(step) }));
      nodes.push(text(area.left - 6, yOf(step) + 4, String(step), { class: "tick", "text-anchor": "end" }));
    }
    for (const w of [-2, -1, 0, 1, 2, 3, 4, 5]) {
      nodes.push(text(xOf(w), area.bottom + 16, signed(w, 0), { class: "tick", "text-anchor": "middle" }));
    }
    nodes.push(text(area.left - 6, area.top - 18, "step", { "text-anchor": "end" }));
    nodes.push(text(area.right, area.top - 18, "guess w", { "text-anchor": "end", class: "label-strong" }));
    nodes.push(svg("line", { class: "threshold", x1: xOf(KM_PER_MILE), x2: xOf(KM_PER_MILE), y1: area.top - 6, y2: area.bottom }));
    nodes.push(text(xOf(KM_PER_MILE) + 6, area.bottom - 6, "1.609 km per mile", { class: "tick" }));
    return nodes;
  }

  effect([run, k, rate], (steps, upTo, r) => {
    const frame = runFrame();
    const { area, xOf, yOf } = frame;
    const visible = steps.slice(0, upTo + 1);
    const clip = svg("clipPath", { id: "run-clip" }, [
      svg("rect", { x: area.left, y: area.top - 8, width: area.right - area.left, height: area.bottom - area.top + 16 }),
    ]);
    const marks = svg("g", { "clip-path": "url(#run-clip)" });
    visible.slice(1).forEach((s, i) => {
      marks.append(svg("line", { class: "step-arrow", x1: xOf(visible[i].w), x2: xOf(s.w), y1: yOf(i), y2: yOf(i + 1) }));
    });
    visible.forEach((s, i) => {
      if (onChart(s.w)) marks.append(svg("circle", { class: "trace-dot", cx: xOf(s.w), cy: yOf(i), r: i === upTo ? 5 : 2.5 }));
    });
    runSvg.replaceChildren(clip, ...runAxes(frame), marks);
    byId("run-log").replaceChildren(...describeStep(steps, upTo, r));
  });

  function describeStep(steps, shown, r) {
    const here = steps[shown];
    const strong = (content) => Object.assign(document.createElement("strong"), { textContent: content });
    const parts = [strong(`Step ${shown}: `), `guess ${signed(here.w, 3)}, loss ${format(here.loss, 3)}, slope ${tenths(here.slope)}. `];
    if (!onChart(here.w)) parts.push("The guess is off the chart. ");
    if (shown < steps.length - 1) {
      const step = steps[shown + 1].w - here.w;
      parts.push(`The next step is −${format(r, 4)} × slope = ${signed(step, STEP_DIGITS)}.`);
    }
    return parts;
  }

  /* ---------- Figure: every rate at once ---------- */

  const sweepSvg = byId("sweep");
  const UNSETTLED_BAND = 26; // height of the strip that holds rates with no settling count
  const COUNT_AXIS = [1, SETTLE_LIMIT];

  function sweepFrame() {
    const { width, height } = sweepSvg.viewBox.baseVal;
    const area = { left: 44, right: width - 16, top: 30, bottom: height - 34 };
    const countTop = area.top + UNSETTLED_BAND + 10;
    return {
      area,
      xOf: linear([0, last(RATES) + RATE_STEP], [area.left, area.right]),
      yOf: logarithmic(COUNT_AXIS, [area.bottom, countTop]),
      bandMiddle: area.top + UNSETTLED_BAND / 2,
    };
  }

  const describeSample = (sample) =>
    sample.steps === null
      ? `η = ${format(sample.rate, 4)}: not settled after ${SETTLE_LIMIT} steps.`
      : `η = ${format(sample.rate, 4)}: settles in ${sample.steps} ${sample.steps === 1 ? "step" : "steps"}.`;

  effect([sweep, rate, probe], (samples, current, probed) => {
    const { area, xOf, yOf, bandMiddle } = sweepFrame();
    const nodes = [
      svg("rect", { class: "region", x: area.left, y: area.top, width: area.right - area.left, height: UNSETTLED_BAND }),
      text(area.right, area.top - 12, `grey band: not settled after ${SETTLE_LIMIT} steps`, { class: "tick", "text-anchor": "end" }),
    ];
    for (const count of [1, 3, 10, 30, 100]) {
      nodes.push(svg("line", { class: "grid", x1: area.left, x2: area.right, y1: yOf(count), y2: yOf(count) }));
      nodes.push(text(area.left - 6, yOf(count) + 4, String(count), { class: "tick", "text-anchor": "end" }));
    }
    for (const tick of [0.0005, 0.001, 0.0015, 0.002, 0.0025]) {
      nodes.push(text(xOf(tick), area.bottom + 16, format(tick, 4), { class: "tick", "text-anchor": "middle" }));
    }
    nodes.push(text(area.left - 6, area.top - 12, "steps to settle", { "text-anchor": "start", class: "label-strong" }));
    nodes.push(text(area.right, area.bottom + 30, "learning rate η", { "text-anchor": "end" }));
    nodes.push(svg("line", { class: "rate-rule", x1: xOf(current), x2: xOf(current), y1: area.top, y2: area.bottom }));
    for (const sample of samples) {
      const picked = sample.rate === (probed ?? current);
      const cy = sample.steps === null ? bandMiddle : yOf(Math.max(sample.steps, COUNT_AXIS[0]));
      nodes.push(svg("circle", { class: picked ? "end-dot active" : "end-dot", cx: xOf(sample.rate), cy, r: picked ? 5 : 3.5 }));
    }
    sweepSvg.replaceChildren(...nodes);
    const described = samples.find((sample) => sample.rate === (probed ?? current));
    byId("sweep-log").textContent = described ? describeSample(described) : "";
  });

  function nearestRate(event) {
    const pointed = sweepFrame().xOf.invert(pointerIn(sweepSvg, event).x);
    return RATES.reduce((best, r) => (Math.abs(r - pointed) < Math.abs(best - pointed) ? r : best));
  }
  sweepSvg.addEventListener("pointermove", (event) => (probe.value = nearestRate(event)));
  sweepSvg.addEventListener("pointerleave", () => (probe.value = null));
  sweepSvg.addEventListener("click", (event) => {
    rate.value = nearestRate(event);
    runPlayer.play({ fromStart: true });
  });
})();
