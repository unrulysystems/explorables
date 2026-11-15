/* Two weights, one learning rate: a fare model with a base and a price per unit of distance. Each weight has
   its own slope and its own steepness, both share one learning rate, and the steeper weight sets the limit.
   Every figure is a pure drawing of model output; nothing moves unless the model says so. */
"use strict";

(function () {
  const { signal, derived, effect, svg, linear } = X;

  /* ---------- Model: fare = base + price × distance, scored by squared misses on logged rides ---------- */

  // A toy log. Chosen for convenience: fares are 3.00 + 1.80 × km rounded to 0.1, and the rounding happens to
  // leave the least-squares weights at 3.00 and 1.80 to two places, so the reader can check what the program finds.
  const RIDES = [
    { km: 1.2, fare: 5.2 },
    { km: 2.5, fare: 7.5 },
    { km: 4.0, fare: 10.2 },
    { km: 6.3, fare: 14.3 },
    { km: 9.0, fare: 19.2 },
    { km: 12.4, fare: 25.3 },
    { km: 18.6, fare: 36.5 },
  ];
  const BASE_ANSWER = 3.0;
  const PRICE_PER_KM_ANSWER = 1.8;

  // The same rides with the distance written in another unit. `perKm` is how many of the unit make a kilometre;
  // `priceDigits` is how many decimals the price per unit needs to be read.
  const UNITS = [
    { id: "m", name: "metres", short: "m", perKm: 1000, priceDigits: 5 },
    { id: "km", name: "kilometres", short: "km", perKm: 1, priceDigits: 3 },
    { id: "10km", name: "tens of km", short: "10 km", perKm: 0.1, priceDigits: 2 },
  ];
  const KM = UNITS[1];
  const unitById = (id) => {
    const found = UNITS.find((unit) => unit.id === id);
    if (!found) throw new Error(`two-weights: no unit "${id}"`);
    return found;
  };

  const distancesIn = (unit) => RIDES.map((ride) => ride.km * unit.perKm);
  const FARES = RIDES.map((ride) => ride.fare);

  const average = (values) => values.reduce((sum, v) => sum + v, 0) / values.length;
  const missesAt = (weights, distances) => distances.map((d, i) => weights.base + weights.price * d - FARES[i]);
  const lossAt = (weights, distances) => average(missesAt(weights, distances).map((m) => m ** 2));

  /* One slope per weight: the average of 2 × input × miss, where the base's input is 1 and the price's is the distance. */
  function slopesAt(weights, distances) {
    const misses = missesAt(weights, distances);
    return { base: average(misses.map((m) => 2 * m)), price: average(misses.map((m, i) => 2 * distances[i] * m)) };
  }

  /* Each weight's steepness taken alone, as on the previous page: twice the average of its input squared. */
  const steepnessOf = (distances) => ({ base: 2, price: 2 * average(distances.map((d) => d ** 2)) });

  /* The rate at which runs stop settling. The two weights' errors feed each other through the average distance,
     so the limit is 2 ÷ the larger of the pair's two joint steepnesses, the roots of
     s² − (base + price) s + (base × price − cross²) = 0. It comes out just under 2 ÷ the steeper weight's own. */
  function largestSettlingRate(distances) {
    const own = steepnessOf(distances);
    const cross = 2 * average(distances);
    const half = (own.base + own.price) / 2;
    const steepest = half + Math.sqrt(half ** 2 - (own.base * own.price - cross ** 2));
    return 2 / steepest;
  }

  /* The least-squares weights for a log: where every run that settles ends up. */
  function bestFit(distances) {
    const meanDistance = average(distances);
    const meanFare = average(FARES);
    const price =
      average(distances.map((d, i) => (d - meanDistance) * (FARES[i] - meanFare))) /
      average(distances.map((d) => (d - meanDistance) ** 2));
    return { base: meanFare - price * meanDistance, price };
  }

  function stepFrom(weights, rate, distances) {
    const slopes = slopesAt(weights, distances);
    return { base: -rate * slopes.base, price: -rate * slopes.price };
  }
  const moved = (weights, step) => ({ base: weights.base + step.base, price: weights.price + step.price });

  // Every run starts from the same wrong rule, a base of 1.00 and 1.00 per km, whatever unit the log uses.
  const startIn = (unit) => ({ base: 1, price: 1 / unit.perKm });

  function descend(rate, unit, count) {
    const distances = distancesIn(unit);
    const steps = [startIn(unit)];
    for (let i = 0; i < count; i += 1) steps.push(moved(steps[i], stepFrom(steps[i], rate, distances)));
    return steps;
  }

  const RUN_STEPS = 60;
  const SMALLEST_STEP = 0.0001; // the stopping rule from the earlier pages, applied to the fare each weight controls
  const CLOSE_ENOUGH = 0.01; // a weight has arrived when it is within a cent of its answer
  const LONG_RUN_STEPS = 100000;
  const CHECKPOINTS = [0, 1, 10, 100, 1000, 10000, LONG_RUN_STEPS];
  const SHARE_OF_LIMIT = 0.75; // each unit's long run uses this share of its own largest settling rate

  /* A long run in one unit at SHARE_OF_LIMIT of that unit's limit: the weights at each checkpoint; the step at
     which both weights first came within CLOSE_ENOUGH of their answers, or null if never; and the step at which
     both weights' steps first fell below SMALLEST_STEP, which is where the earlier pages' stopping rule would
     halt. The price is compared in fare per km whatever the unit. */
  function longRun(unit) {
    const distances = distancesIn(unit);
    const rate = SHARE_OF_LIMIT * largestSettlingRate(distances);
    const checkpoints = [];
    let weights = startIn(unit);
    let arrivedAt = null;
    let smallStepsAt = null;
    for (let taken = 0; taken <= LONG_RUN_STEPS; taken += 1) {
      if (CHECKPOINTS.includes(taken)) checkpoints.push({ step: taken, weights, loss: lossAt(weights, distances) });
      const step = stepFrom(weights, rate, distances);
      const small = Math.abs(step.base) < SMALLEST_STEP && Math.abs(step.price * unit.perKm) < SMALLEST_STEP;
      if (small && smallStepsAt === null) smallStepsAt = taken;
      const close =
        Math.abs(weights.base - BASE_ANSWER) < CLOSE_ENOUGH &&
        Math.abs(weights.price * unit.perKm - PRICE_PER_KM_ANSWER) < CLOSE_ENOUGH;
      if (close && arrivedAt === null) arrivedAt = taken;
      weights = moved(weights, step);
    }
    return {
      unit,
      rate,
      limit: largestSettlingRate(distances),
      steepness: steepnessOf(distances),
      fit: bestFit(distances),
      checkpoints,
      arrivedAt,
      smallStepsAt,
    };
  }

  const last = (items) => items[items.length - 1];

  /* A number written out in full, with a true minus sign and no exponent; a value that rounds to zero has no sign. */
  function plain(value, digits) {
    const rounded = Number(value.toFixed(digits)) + 0;
    const body = Math.abs(rounded).toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
    return rounded < 0 ? `−${body}` : body;
  }
  const withSign = (value, digits) => (Number(value.toFixed(digits)) + 0 > 0 ? `+${plain(value, digits)}` : plain(value, digits));
  // As many decimals as it takes to show three significant figures of a small rate, and none of a large number.
  const rateText = (value) => plain(value, Math.max(0, 2 - Math.floor(Math.log10(Math.abs(value)))));
  // A steepness reads to one decimal when small, as a whole number when large, and in millions past a million.
  const steepnessText = (value) => {
    if (value >= 1e6) return `${plain(value / 1e6, 0)} million`;
    return plain(value, value < 100 ? 1 : 0);
  };
  const lossText = (value) => plain(value, value < 1000 ? 3 : 0);

  /* ---------- State ---------- */

  const KM_DISTANCES = distancesIn(KM);
  const DEFAULT_RATE = 0.005;
  const GROWING_RATE = 0.012;

  const rate = signal("rate", DEFAULT_RATE);
  const run = derived("run", [rate], (r) => descend(r, KM, RUN_STEPS));
  const k = signal("k", RUN_STEPS);
  run.subscribe(() => (k.value = RUN_STEPS));

  const HAND_STEPS_MAX = 2000;
  const handSteps = signal("handSteps", []); // every step the reader has taken: { rate, from, to }

  const growingRate = signal("growingRate", GROWING_RATE);
  const growingRun = derived("growingRun", [growingRate], (r) => descend(r, KM, RUN_STEPS));
  const kGrowing = signal("kGrowing", RUN_STEPS);

  const LONG_RUNS = UNITS.map(longRun);
  const longRunFor = (unitId) => LONG_RUNS.find((entry) => entry.unit.id === unitId);
  const shownUnit = signal("shownUnit", "m");

  // Numbers the prose quotes, computed here so the text cannot drift from the model.
  const startSlopes = slopesAt(startIn(KM), KM_DISTANCES);
  const kmSteepness = steepnessOf(KM_DISTANCES);
  const kmLimit = largestSettlingRate(KM_DISTANCES);
  const afterDefaultRun = last(descend(DEFAULT_RATE, KM, RUN_STEPS));
  const constant = (name, value) => derived(name, [], () => value);
  constant("startSlopeBase", plain(startSlopes.base, 1));
  constant("startSlopePrice", plain(startSlopes.price, 1));
  constant("firstStepBase", withSign(-DEFAULT_RATE * startSlopes.base, 3));
  constant("firstStepPrice", withSign(-DEFAULT_RATE * startSlopes.price, 3));
  constant("priceSteepness", plain(kmSteepness.price, 0));
  constant("averageKmSquared", plain(kmSteepness.price / 2, 0));
  constant("priceAloneLimit", plain(2 / kmSteepness.price, 4));
  constant("kmLimit", plain(kmLimit, 4));
  constant("baseAfterRun", plain(afterDefaultRun.base, 2));
  constant("priceAfterRun", plain(afterDefaultRun.price, 2));
  constant("baseShareCovered", plain((100 * (afterDefaultRun.base - 1)) / (BASE_ANSWER - 1), 0));
  const arrivalOf = (unitId) => {
    const { arrivedAt } = longRunFor(unitId);
    if (arrivedAt === null) throw new Error(`two-weights: the prose quotes an arrival step for ${unitId}, which never arrives`);
    return plain(arrivedAt, 0);
  };
  constant("kmArrivedAt", arrivalOf("km"));
  constant("tensArrivedAt", arrivalOf("10km"));
  constant("metresSmallStepsAt", plain(longRunFor("m").smallStepsAt, 0));
  constant("metresBaseAfterLongRun", plain(last(longRunFor("m").checkpoints).weights.base, 3));
  constant("metresLimit", rateText(longRunFor("m").limit));
  constant("tensLimit", rateText(longRunFor("10km").limit));

  X.mount();
  X.initThemeToggle(document.getElementById("theme"));

  const byId = (id) => document.getElementById(id);
  const cell = (content, className) => Object.assign(document.createElement("td"), { textContent: content, className: className ?? "" });
  const rowOf = (...cells) => {
    const row = document.createElement("tr");
    row.append(...cells);
    return row;
  };
  const playerIn = (figureId) => document.querySelector(`#${figureId} x-player`);

  /* ---------- Figure: the same rides in two units ---------- */

  byId("log-rows").replaceChildren(
    ...RIDES.map((ride) => rowOf(cell(plain(ride.km, 1)), cell(plain(ride.km * 1000, 0)), cell(plain(ride.fare, 2)))),
  );

  /* ---------- Figure: each ride's pull on each weight, at the starting guess ---------- */

  {
    const start = startIn(KM);
    const misses = missesAt(start, KM_DISTANCES);
    byId("pull-rows").replaceChildren(
      ...RIDES.map((ride, i) =>
        rowOf(
          cell(plain(ride.km, 1)),
          cell(plain(ride.fare, 2), "wide"),
          cell(plain(misses[i], 1)),
          cell(plain(2 * misses[i], 1)),
          cell(plain(2 * ride.km * misses[i], 1)),
        ),
      ),
    );
    byId("pull-base").textContent = plain(startSlopes.base, 1);
    byId("pull-price").textContent = plain(startSlopes.price, 1);
  }

  /* ---------- Figure: stepping both weights by hand ---------- */

  /* Which way the loss moved over one step. Near the answer a step changes the loss by less than
     rounding error in the arithmetic, and that reads "same", not "up" or "down". */
  const LOSS_CHANGE_FLOOR = 1e-9;
  function lossMovement(from, to) {
    const change = lossAt(to, KM_DISTANCES) - lossAt(from, KM_DISTANCES);
    if (Math.abs(change) < LOSS_CHANGE_FLOOR) return "same";
    return change < 0 ? "down" : "up";
  }

  const HAND_ROWS_SHOWN = 12;
  const handWeights = (steps) => (steps.length === 0 ? startIn(KM) : last(steps).to);

  function takeHandSteps(count) {
    const taken = [...handSteps.value];
    for (let i = 0; i < count && taken.length < HAND_STEPS_MAX; i += 1) {
      const from = handWeights(taken);
      taken.push({ rate: rate.value, from, to: moved(from, stepFrom(from, rate.value, KM_DISTANCES)) });
    }
    handSteps.value = taken;
  }
  byId("hand-step").addEventListener("click", () => takeHandSteps(1));
  byId("hand-ten").addEventListener("click", () => takeHandSteps(10));
  byId("hand-hundred").addEventListener("click", () => takeHandSteps(100));
  byId("hand-reset").addEventListener("click", () => (handSteps.value = []));

  effect([handSteps, rate], (taken, r) => {
    const weights = handWeights(taken);
    const slopes = slopesAt(weights, KM_DISTANCES);
    const atLimit = taken.length >= HAND_STEPS_MAX;
    byId("hand-base").textContent = plain(weights.base, 3);
    byId("hand-price").textContent = plain(weights.price, 3);
    byId("hand-loss").textContent = lossText(lossAt(weights, KM_DISTANCES));
    byId("hand-slope-base").textContent = plain(slopes.base, 2);
    byId("hand-slope-price").textContent = plain(slopes.price, 2);
    byId("hand-next").textContent = atLimit
      ? `This figure stops at ${plain(HAND_STEPS_MAX, 0)} steps. Press Back to the start to run again.`
      : `The next step moves the base by ${withSign(-r * slopes.base, 4)} and the price by ${withSign(-r * slopes.price, 4)}.`;
    byId("hand-step").disabled = atLimit;
    byId("hand-ten").disabled = atLimit;
    byId("hand-hundred").disabled = atLimit;

    const firstShown = Math.max(0, taken.length - HAND_ROWS_SHOWN);
    const rows = taken.slice(firstShown).map((step, i) => {
      const lossWent = lossMovement(step.from, step.to);
      const row = rowOf(
        cell(plain(firstShown + i + 1, 0)),
        cell(plain(step.rate, 4), "wide"),
        cell(plain(step.to.base, 3)),
        cell(plain(step.to.price, 3)),
        cell(lossText(lossAt(step.to, KM_DISTANCES)), "wide"),
        cell(lossWent),
      );
      if (lossWent === "up") row.className = "wrong-way";
      return row;
    });
    byId("hand-rows").replaceChildren(...rows);
    byId("hand-log").hidden = rows.length === 0;
    byId("hand-earlier").hidden = firstShown === 0;
    byId("hand-earlier").textContent =
      firstShown === 1 ? "Step 1 is not shown." : `Steps 1 to ${plain(firstShown, 0)} are not shown.`;
  });

  /* ---------- A pair of run charts: each weight across, step down ---------- */

  function text(x, y, content, attributes = {}) {
    const element = svg("text", { x, y, class: "label", ...attributes });
    element.textContent = content;
    return element;
  }

  const WEIGHT_AXIS = [0, 4];
  const onChart = (value) => value >= WEIGHT_AXIS[0] && value <= WEIGHT_AXIS[1];
  const PANELS = [
    { key: "base", title: "base fare", answer: BASE_ANSWER, answerLabel: "3.00" },
    { key: "price", title: "price per km", answer: PRICE_PER_KM_ANSWER, answerLabel: "1.80" },
  ];

  function panelFrames(svgElement) {
    const { width, height } = svgElement.viewBox.baseVal;
    const gap = 44;
    const left = 40;
    const panelWidth = (width - left - 12 - gap) / 2;
    const yOf = linear([0, RUN_STEPS], [46, height - 30]);
    return PANELS.map((panel, i) => {
      const x0 = left + i * (panelWidth + gap);
      return { panel, x0, x1: x0 + panelWidth, top: 46, bottom: height - 30, xOf: linear(WEIGHT_AXIS, [x0, x0 + panelWidth]), yOf };
    });
  }

  function describePair(steps, shown, r) {
    const here = steps[shown];
    const strong = (content) => Object.assign(document.createElement("strong"), { textContent: content });
    const parts = [
      strong(`Step ${shown}: `),
      `base ${plain(here.base, 3)}, price ${plain(here.price, 3)}, loss ${lossText(lossAt(here, KM_DISTANCES))}. `,
    ];
    if (!onChart(here.base) || !onChart(here.price)) parts.push("A weight is off its chart. ");
    if (shown < steps.length - 1) {
      const step = stepFrom(here, r, KM_DISTANCES);
      parts.push(`Next step: base ${withSign(step.base, 4)}, price ${withSign(step.price, 4)}.`);
    }
    return parts;
  }

  /* Keeps a pair of run charts and the line under them drawn from the run, the step shown and the rate that produced it. */
  function mountPairChart({ svgElement, logElement, steps, shownStep, usedRate }) {
    effect([steps, shownStep, usedRate], (taken, upTo, r) => {
      const nodes = [];
      const visible = taken.slice(0, upTo + 1);
      panelFrames(svgElement).forEach(({ panel, x0, x1, top, bottom, xOf, yOf }, panelIndex) => {
        const clipId = `${svgElement.id}-clip-${panel.key}`;
        nodes.push(svg("clipPath", { id: clipId }, [svg("rect", { x: x0, y: top - 6, width: x1 - x0, height: bottom - top + 12 })]));
        for (const step of [0, 20, 40, 60]) {
          nodes.push(svg("line", { class: "grid", x1: x0, x2: x1, y1: yOf(step), y2: yOf(step) }));
          if (panelIndex === 0) nodes.push(text(x0 - 6, yOf(step) + 4, String(step), { class: "tick", "text-anchor": "end" }));
        }
        for (const tick of [0, 1, 2, 3, 4]) {
          nodes.push(text(xOf(tick), bottom + 16, String(tick), { class: "tick", "text-anchor": "middle" }));
        }
        if (panelIndex === 0) nodes.push(text(x0 - 6, top - 30, "step", { "text-anchor": "end" }));
        nodes.push(text(x1, top - 30, panel.title, { "text-anchor": "end", class: "label-strong" }));
        nodes.push(svg("line", { class: "threshold", x1: xOf(panel.answer), x2: xOf(panel.answer), y1: top - 8, y2: bottom }));
        nodes.push(text(xOf(panel.answer), top - 14, panel.answerLabel, { class: "tick", "text-anchor": "middle" }));
        const marks = svg("g", { "clip-path": `url(#${clipId})` });
        visible.slice(1).forEach((s, i) => {
          marks.append(
            svg("line", { class: "step-arrow", x1: xOf(visible[i][panel.key]), x2: xOf(s[panel.key]), y1: yOf(i), y2: yOf(i + 1) }),
          );
        });
        const now = visible[upTo][panel.key];
        if (onChart(now)) marks.append(svg("circle", { class: "trace-dot", cx: xOf(now), cy: yOf(upTo), r: 5 }));
        nodes.push(marks);
      });
      svgElement.replaceChildren(...nodes);
      logElement.replaceChildren(...describePair(taken, upTo, r));
    });
  }

  mountPairChart({ svgElement: byId("run"), logElement: byId("run-log"), steps: run, shownStep: k, usedRate: rate });
  mountPairChart({ svgElement: byId("run-growing"), logElement: byId("run-growing-log"), steps: growingRun, shownStep: kGrowing, usedRate: growingRate });

  /* ---------- Figure: the same rides in three units ---------- */

  const arrivedText = (entry) =>
    entry.arrivedAt === null ? `over ${plain(LONG_RUN_STEPS, 0)}` : plain(entry.arrivedAt, 0);

  // The unit buttons are built once, so the one the reader pressed keeps the keyboard focus.
  const unitButtons = LONG_RUNS.map((entry) => {
    const button = Object.assign(document.createElement("button"), { type: "button", className: "pill" });
    const full = Object.assign(document.createElement("span"), { className: "unit-full", textContent: entry.unit.name });
    const short = Object.assign(document.createElement("span"), { className: "unit-short", textContent: entry.unit.short });
    button.append(full, short);
    button.setAttribute("aria-label", entry.unit.name);
    button.addEventListener("click", () => (shownUnit.value = entry.unit.id));
    return { unitId: entry.unit.id, button };
  });
  byId("unit-rows").replaceChildren(
    ...LONG_RUNS.map((entry, i) => {
      const holder = cell("", "unit-cell");
      holder.append(unitButtons[i].button);
      return rowOf(
        holder,
        cell(plain(entry.steepness.base, 0), "wide"),
        cell(steepnessText(entry.steepness.price)),
        cell(rateText(entry.limit)),
        cell(arrivedText(entry)),
      );
    }),
  );

  effect([shownUnit], (unitId) => {
    for (const entry of unitButtons) entry.button.setAttribute("aria-pressed", String(entry.unitId === unitId));

    const shown = longRunFor(unitId);
    const unit = unitById(unitId);
    byId("checkpoint-price-heading").textContent = `price per ${unit.short}`;
    byId("checkpoint-rows").replaceChildren(
      ...shown.checkpoints.map((point) =>
        rowOf(
          cell(plain(point.step, 0)),
          cell(plain(point.weights.base, 3)),
          cell(plain(point.weights.price, unit.priceDigits)),
          cell(lossText(point.loss)),
        ),
      ),
    );
    byId("checkpoint-caption").textContent =
      `Distances in ${unit.name}, at η = ${rateText(shown.rate)}, which is three quarters of that log's largest settling rate. ` +
      `The fares were rounded to ten cents, so the best fit is a base of ${plain(shown.fit.base, 3)} and ` +
      `${plain(shown.fit.price, unit.priceDigits)} per ${unit.short}.`;
  });

  /* ---------- Each prediction settles by playing the scene under it ---------- */

  byId("predict-crawl").addEventListener("reveal", () => {
    for (const element of document.querySelectorAll(".after-crawl")) element.hidden = false;
    rate.value = DEFAULT_RATE;
    playerIn("fig-run").play({ fromStart: true });
  });
  byId("predict-limit").addEventListener("reveal", () => {
    byId("fig-growing").hidden = false;
    playerIn("fig-growing").play({ fromStart: true });
  });
  byId("predict-units").addEventListener("reveal", () => (byId("fig-units").hidden = false));
})();
