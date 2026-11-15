/* How big a nudge: the learning rate scales every step, each step multiplies the distance to the answer by
   one number, and past a certain rate that number makes the distance grow.
   Every figure is a pure drawing of model output; nothing moves unless the model says so. */
"use strict";

(function () {
  const { signal, derived, effect, svg, linear, logarithmic, pointerIn } = X;

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
  const TRIPS_WITH_LONG_DRIVE = [...TRIPS, { miles: 150.0, km: 241.4 }];
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
  const sweepOver = (trips) => RATES.map((r) => ({ rate: r, steps: stepsToSettle(r, trips) }));

  const PREVIOUS_PAGE_RATE = 0.0005;
  const SWINGING_RATE = 0.0015;
  const GROWING_RATE = 0.0022;

  const last = (items) => items[items.length - 1];

  /* A number written out in full, with a true minus sign and no exponent; a value that rounds to zero has no sign. */
  function plain(value, digits) {
    const rounded = Number(value.toFixed(digits)) + 0;
    const body = Math.abs(rounded).toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
    return rounded < 0 ? `−${body}` : body;
  }
  // A loss is read to three places near the answer and as a whole number once it is in the thousands.
  const lossText = (value) => plain(value, value < 1000 ? 3 : 0);

  /* ---------- State ---------- */

  const rate = signal("rate", PREVIOUS_PAGE_RATE);
  const run = derived("run", [rate], (r) => descend(r, TRIPS, RUN_STEPS));
  const k = signal("k", RUN_STEPS);
  run.subscribe(() => (k.value = RUN_STEPS));
  derived("multiplierSeven", [rate], (r) => plain(multiplier(r, TRIPS), 2));

  const HAND_STEPS_MAX = 30;
  const handSteps = signal("handSteps", []); // every step the reader has taken on the seven trips: { rate, from, to }

  const probe = signal("probe", null); // rate under the pointer in the sweep, if any

  // The run the second prediction is about.
  const growingRate = signal("growingRate", GROWING_RATE);
  const growingRun = derived("growingRun", [growingRate], (r) => descend(r, TRIPS, RUN_STEPS));
  const kGrowing = signal("kGrowing", RUN_STEPS);

  // The same two views once the long drive is in the log.
  const longRate = signal("longRate", PREVIOUS_PAGE_RATE);
  const longRun = derived("longRun", [longRate], (r) => descend(r, TRIPS_WITH_LONG_DRIVE, RUN_STEPS));
  const kLong = signal("kLong", RUN_STEPS);
  longRun.subscribe(() => (kLong.value = RUN_STEPS));
  derived("multiplierLong", [longRate], (r) => plain(multiplier(r, TRIPS_WITH_LONG_DRIVE), 2));
  const longProbe = signal("longProbe", null);

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
  derived("distanceAfterGrowingRun", [], () => plain(Math.abs(last(growingRun.value).w - KM_PER_MILE), 2));

  X.mount();
  X.initThemeToggle(document.getElementById("theme"));

  const byId = (id) => document.getElementById(id);
  const cell = (content) => Object.assign(document.createElement("td"), { textContent: content });
  const playerIn = (figureId) => document.querySelector(`#${figureId} x-player`);

  /* ---------- Figure: the previous page's rate on the log with the long drive ---------- */

  const FAIL_STEPS = 5;
  byId("fail-rows").replaceChildren(
    ...descend(PREVIOUS_PAGE_RATE, TRIPS_WITH_LONG_DRIVE, FAIL_STEPS).map((s, i) => {
      const row = document.createElement("tr");
      row.append(cell(String(i)), cell(plain(s.w, 3)), cell(plain(s.loss, 0)), cell(plain(s.slope, 0)));
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
    byId("hand-guess").textContent = plain(w, 3);
    byId("hand-loss").textContent = lossText(lossAt(w, TRIPS));
    byId("hand-slope").textContent = plain(slopeAt(w, TRIPS), 1);
    byId("hand-step").textContent = atLimit
      ? `${HAND_STEPS_MAX} steps taken`
      : `Take a step: ${plain(stepFrom(w, r, TRIPS), STEP_DIGITS)}`;
    byId("hand-step").disabled = atLimit;

    const rows = taken.map((step, i) => {
      const lossWent = lossAt(step.to, TRIPS) < lossAt(step.from, TRIPS) ? "down" : "up";
      const row = document.createElement("tr");
      if (lossWent === "up") row.className = "wrong-way";
      const from = Object.assign(cell(plain(step.from, 3)), { className: "wide" });
      row.append(
        cell(String(i + 1)),
        cell(plain(step.rate, 4)),
        from,
        cell(plain(slopeAt(step.from, TRIPS), 1)),
        cell(plain(step.to - step.from, STEP_DIGITS)),
        cell(plain(step.to, 3)),
        cell(lossWent),
      );
      return row;
    });
    byId("hand-rows").replaceChildren(...rows);
    byId("hand-log").hidden = rows.length === 0;
  });

  /* ---------- Shared drawing helpers ---------- */

  function text(x, y, content, attributes = {}) {
    const element = svg("text", { x, y, class: "label", ...attributes });
    element.textContent = content;
    return element;
  }

  /* ---------- A run chart: guess across, step down ---------- */

  const W_AXIS = [-2, 5]; // wide enough for twenty steps at GROWING_RATE on the seven trips;
  // guesses outside it are clipped, and the line under the chart still reports them
  const onChart = (w) => w >= W_AXIS[0] && w <= W_AXIS[1];
  const FAR_GUESS = 1e6; // past this the line under the chart says so instead of printing ever longer numbers

  function runFrame(svgElement) {
    const { width, height } = svgElement.viewBox.baseVal;
    const area = { left: 40, right: width - 16, top: 46, bottom: height - 30 };
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
      nodes.push(text(xOf(w), area.bottom + 16, plain(w, 0), { class: "tick", "text-anchor": "middle" }));
    }
    nodes.push(text(area.left - 6, area.top - 30, "step", { "text-anchor": "end" }));
    nodes.push(text(area.right, area.top - 30, "guess w", { "text-anchor": "end", class: "label-strong" }));
    nodes.push(svg("line", { class: "threshold", x1: xOf(KM_PER_MILE), x2: xOf(KM_PER_MILE), y1: area.top - 8, y2: area.bottom }));
    // Above the plot, where no step line can cross it.
    nodes.push(text(xOf(KM_PER_MILE), area.top - 14, "1.609 km per mile", { class: "tick", "text-anchor": "middle" }));
    return nodes;
  }

  function describeStep(steps, shown, r) {
    const here = steps[shown];
    const strong = (content) => Object.assign(document.createElement("strong"), { textContent: content });
    if (Math.abs(here.w) >= FAR_GUESS) {
      const side = here.w > 0 ? "above a million" : "below minus a million";
      return [strong(`Step ${shown}: `), `the guess is ${side}, far off the chart, and the loss is still growing.`];
    }
    const parts = [strong(`Step ${shown}: `), `guess ${plain(here.w, 3)}, loss ${lossText(here.loss)}, slope ${plain(here.slope, 1)}. `];
    if (!onChart(here.w)) parts.push("The guess is off the chart. ");
    if (shown < steps.length - 1) {
      parts.push(`The next step is −${plain(r, 4)} × slope = ${plain(steps[shown + 1].w - here.w, STEP_DIGITS)}.`);
    }
    return parts;
  }

  /* Keeps a run chart and the line under it drawn from the run, the step shown and the rate that produced it. */
  function mountRunChart({ svgElement, logElement, steps, shownStep, usedRate }) {
    const clipId = `${svgElement.id}-clip`;
    effect([steps, shownStep, usedRate], (taken, upTo, r) => {
      const frame = runFrame(svgElement);
      const { area, xOf, yOf } = frame;
      const visible = taken.slice(0, upTo + 1);
      const clip = svg("clipPath", { id: clipId }, [
        svg("rect", { x: area.left, y: area.top - 6, width: area.right - area.left, height: area.bottom - area.top + 12 }),
      ]);
      const marks = svg("g", { "clip-path": `url(#${clipId})` });
      visible.slice(1).forEach((s, i) => {
        marks.append(svg("line", { class: "step-arrow", x1: xOf(visible[i].w), x2: xOf(s.w), y1: yOf(i), y2: yOf(i + 1) }));
      });
      visible.forEach((s, i) => {
        if (onChart(s.w)) marks.append(svg("circle", { class: "trace-dot", cx: xOf(s.w), cy: yOf(i), r: i === upTo ? 5 : 2.5 }));
      });
      svgElement.replaceChildren(clip, ...runAxes(frame), marks);
      logElement.replaceChildren(...describeStep(taken, upTo, r));
    });
  }

  mountRunChart({ svgElement: byId("run"), logElement: byId("run-log"), steps: run, shownStep: k, usedRate: rate });
  mountRunChart({ svgElement: byId("run-growing"), logElement: byId("run-growing-log"), steps: growingRun, shownStep: kGrowing, usedRate: growingRate });
  mountRunChart({ svgElement: byId("run-long"), logElement: byId("run-long-log"), steps: longRun, shownStep: kLong, usedRate: longRate });

  /* ---------- A sweep chart: steps to settle at every rate ---------- */

  const UNSETTLED_BAND = 26; // height of the strip that holds rates with no settling count
  const COUNT_AXIS = [1, SETTLE_LIMIT];

  function sweepFrame(svgElement) {
    const { width, height } = svgElement.viewBox.baseVal;
    const area = { left: 44, right: width - 16, top: 30, bottom: height - 34 };
    return {
      area,
      xOf: linear([0, last(RATES) + RATE_STEP], [area.left, area.right]),
      yOf: logarithmic(COUNT_AXIS, [area.bottom, area.top + UNSETTLED_BAND + 10]),
      bandMiddle: area.top + UNSETTLED_BAND / 2,
    };
  }

  const describeSample = (sample) =>
    sample.steps === null
      ? `η = ${plain(sample.rate, 4)}: not settled after ${SETTLE_LIMIT} steps.`
      : `η = ${plain(sample.rate, 4)}: settles in ${sample.steps} ${sample.steps === 1 ? "step" : "steps"}.`;

  /* Keeps a sweep chart and the line under it drawn from its samples, the rate in use and the rate pointed at.
     Clicking a dot hands that rate to `onPick`. */
  function mountSweepChart({ svgElement, logElement, samples, usedRate, pointedRate, onPick }) {
    effect([usedRate, pointedRate], (current, pointed) => {
      const { area, xOf, yOf, bandMiddle } = sweepFrame(svgElement);
      const nodes = [
        svg("rect", { class: "unsettled-band", x: area.left, y: area.top, width: area.right - area.left, height: UNSETTLED_BAND }),
        text(area.right, area.top - 12, `top band: not settled after ${SETTLE_LIMIT} steps`, { class: "tick", "text-anchor": "end" }),
      ];
      for (const count of [1, 3, 10, 30, 100]) {
        nodes.push(svg("line", { class: "grid", x1: area.left, x2: area.right, y1: yOf(count), y2: yOf(count) }));
        nodes.push(text(area.left - 6, yOf(count) + 4, String(count), { class: "tick", "text-anchor": "end" }));
      }
      for (const tick of [0.0005, 0.001, 0.0015, 0.002, 0.0025]) {
        nodes.push(text(xOf(tick), area.bottom + 16, plain(tick, 4), { class: "tick", "text-anchor": "middle" }));
      }
      nodes.push(text(area.left - 6, area.top - 12, "steps to settle", { "text-anchor": "start", class: "label-strong" }));
      nodes.push(text(area.right, area.bottom + 30, "learning rate η", { "text-anchor": "end" }));
      nodes.push(svg("line", { class: "rate-rule", x1: xOf(current), x2: xOf(current), y1: area.top, y2: area.bottom }));
      const picked = pointed ?? current;
      for (const sample of samples) {
        const cy = sample.steps === null ? bandMiddle : yOf(Math.max(sample.steps, COUNT_AXIS[0]));
        const isPicked = sample.rate === picked;
        nodes.push(svg("circle", { class: isPicked ? "sweep-dot picked" : "sweep-dot", cx: xOf(sample.rate), cy, r: isPicked ? 6 : 4 }));
      }
      svgElement.replaceChildren(...nodes);
      const described = samples.find((sample) => sample.rate === picked);
      logElement.textContent = described ? describeSample(described) : "";
    });

    const nearestRate = (event) => {
      const pointed = sweepFrame(svgElement).xOf.invert(pointerIn(svgElement, event).x);
      return RATES.reduce((best, r) => (Math.abs(r - pointed) < Math.abs(best - pointed) ? r : best));
    };
    svgElement.addEventListener("pointermove", (event) => (pointedRate.value = nearestRate(event)));
    svgElement.addEventListener("pointerleave", () => (pointedRate.value = null));
    svgElement.addEventListener("click", (event) => onPick(nearestRate(event)));
  }

  function replay(figureId, rateSignal, chosenRate) {
    rateSignal.value = chosenRate;
    playerIn(figureId).play({ fromStart: true });
  }

  mountSweepChart({
    svgElement: byId("sweep"),
    logElement: byId("sweep-log"),
    samples: sweepOver(TRIPS),
    usedRate: rate,
    pointedRate: probe,
    onPick: (picked) => replay("fig-run", rate, picked),
  });
  mountSweepChart({
    svgElement: byId("sweep-long"),
    logElement: byId("sweep-long-log"),
    samples: sweepOver(TRIPS_WITH_LONG_DRIVE),
    usedRate: longRate,
    pointedRate: longProbe,
    onPick: (picked) => replay("fig-long", longRate, picked),
  });

  /* ---------- Each prediction settles by playing the scene under it ---------- */

  byId("predict-swing").addEventListener("reveal", () => replay("fig-run", rate, SWINGING_RATE));
  byId("predict-edge").addEventListener("reveal", () => {
    byId("fig-growing").hidden = false;
    playerIn("fig-growing").play({ fromStart: true });
  });
  byId("predict-cliff").addEventListener("reveal", () => {
    byId("fig-long").hidden = false;
    replay("fig-long", longRate, PREVIOUS_PAGE_RATE);
  });
})();
