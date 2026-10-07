/* Gradient descent explorable: the models, and the figures drawn from them.
   Every figure is a pure drawing of model output; nothing moves unless the model says so. */
"use strict";

(function () {
  const { signal, derived, effect, svg, linear, logarithmic, pointerIn, clamp, format } = X;

  /* ---------- Model 1: one parameter, L(w) = (w − 3)² ---------- */

  const BOTTOM = 3;
  const STEPS = 20;
  const ESCAPE = 1e6; // a run whose |w| passes this has diverged; stop computing it

  const loss = (w) => (w - BOTTOM) ** 2;
  const slope = (w) => 2 * (w - BOTTOM);

  function descend(w0, eta, steps) {
    const path = [w0];
    for (let i = 0; i < steps; i += 1) {
      const w = path[i] - eta * slope(path[i]);
      path.push(w);
      if (Math.abs(w) > ESCAPE) break;
    }
    return path;
  }

  const finalLoss = (path) => (path.length === STEPS + 1 ? loss(path[STEPS]) : Infinity);

  /* ---------- Model 2: two parameters in a valley, L = ½(x² + 10y²) ---------- */

  const STEEPNESS = 10;
  const STEPS_2D = 40;
  const SETTLED = 1e-3;
  const SETTLE_SEARCH_MAX = 5000;

  const loss2 = (p) => 0.5 * (p.x * p.x + STEEPNESS * p.y * p.y);
  const step2 = (p, eta) => ({ x: p.x - eta * p.x, y: p.y - eta * STEEPNESS * p.y });

  function descend2(start, eta, steps) {
    const path = [start];
    for (let i = 0; i < steps; i += 1) {
      const next = step2(path[i], eta);
      path.push(next);
      if (Math.abs(next.x) > ESCAPE || Math.abs(next.y) > ESCAPE) break;
    }
    return path;
  }

  function stepsToSettle(start, eta) {
    let p = start;
    for (let n = 0; n <= SETTLE_SEARCH_MAX; n += 1) {
      const current = loss2(p);
      if (current < SETTLED) return `${n} steps`;
      if (current > ESCAPE) return "never: it diverges";
      p = step2(p, eta);
    }
    return `more than ${SETTLE_SEARCH_MAX.toLocaleString("en-US")} steps`;
  }

  /* ---------- Model 0: a one-weight latency model, fitted by hand ---------- */

  // Chosen so the least-squares weight is exactly 3 ms per token, matching the bowl used below.
  const REQUESTS = [
    { tokens: 100, ms: 340 },
    { tokens: 200, ms: 570 },
    { tokens: 300, ms: 860 },
    { tokens: 400, ms: 1210 },
    { tokens: 500, ms: 1520 },
  ];
  const GUESS_RANGE = [0, 6];
  const GUESS_STEP = 0.05;

  const fitLoss = (w) => REQUESTS.reduce((sum, r) => sum + (w * r.tokens - r.ms) ** 2, 0) / REQUESTS.length;
  const snapGuess = (w) => Math.round(clamp(w, ...GUESS_RANGE) / GUESS_STEP) * GUESS_STEP;

  /* ---------- State ---------- */

  const guess = signal("guess", 1);
  derived("typicalMiss", [guess], (w) => `${Math.round(Math.sqrt(fitLoss(w)))} ms`);
  derived("fitLossText", [guess], (w) => Math.round(fitLoss(w)).toLocaleString("en-US"));
  // Every weight the reader has tried, on the guess grid, so the set is bounded by the grid's size.
  const tried = signal("tried", [1]);
  guess.subscribe((w) => {
    const rounded = Number(snapGuess(w).toFixed(2));
    if (!tried.value.includes(rounded)) tried.value = [...tried.value, rounded];
  });

  const eta = signal("eta", 0.1);
  const w0 = signal("w0", 0);
  const k = signal("k", STEPS);
  const path = derived("path", [w0, eta], (start, rate) => descend(start, rate, STEPS));
  derived("wFinal", [path], (run) => (run.length === STEPS + 1 ? run[STEPS] : Infinity));
  derived("lossFinal", [path], finalLoss);
  derived("factor", [eta], (rate) => 1 - 2 * rate);

  const probe = signal("probe", null); // learning rate under the pointer in the sweep, if any
  const sweep = derived("sweep", [w0], (start) =>
    Array.from({ length: 241 }, (_, i) => {
      const rate = (i / 240) * 1.2;
      return { eta: rate, loss: finalLoss(descend(start, rate, STEPS)) };
    }),
  );

  const eta2 = signal("eta2", 0.05);
  const start2 = signal("start2", { x: -8, y: 2.5 });
  const k2 = signal("k2", STEPS_2D);
  const path2 = derived("path2", [start2, eta2], (start, rate) => descend2(start, rate, STEPS_2D));
  derived("alongFactor", [eta2], (rate) => Math.abs(1 - rate));
  derived("acrossFactor", [eta2], (rate) => Math.abs(1 - STEEPNESS * rate));
  derived("settleSteps", [start2, eta2], stepsToSettle);

  // Changing an assumption shows its whole consequence at once; the player is for replaying it.
  for (const input of [eta, w0]) input.subscribe(() => (k.value = STEPS));
  for (const input of [eta2, start2]) input.subscribe(() => (k2.value = STEPS_2D));

  X.mount();
  X.initThemeToggle(document.getElementById("theme"));

  /* ---------- Shared drawing helpers ---------- */

  const SUPERSCRIPT = { "-": "⁻", 0: "⁰", 1: "¹", 2: "²", 3: "³", 4: "⁴", 5: "⁵", 6: "⁶", 7: "⁷", 8: "⁸", 9: "⁹" };
  const powerOfTen = (exponent) =>
    exponent === 0 ? "1" : `10${[...String(exponent)].map((c) => SUPERSCRIPT[c]).join("")}`;

  function text(x, y, content, attributes = {}) {
    const element = svg("text", { x, y, class: "label", ...attributes });
    element.textContent = content;
    return element;
  }

  function plotArea(width, height, margin) {
    return {
      left: margin.left,
      right: width - margin.right,
      top: margin.top,
      bottom: height - margin.bottom,
    };
  }

  function clipRect(id, area, slack = 0) {
    return svg("clipPath", { id }, [
      svg("rect", {
        x: area.left,
        y: area.top - slack,
        width: area.right - area.left,
        height: area.bottom - area.top + slack,
      }),
    ]);
  }

  function makeTooltip(container, svgElement) {
    const tip = Object.assign(document.createElement("div"), { className: "tooltip", hidden: true });
    container.append(tip);
    const viewWidth = svgElement.viewBox.baseVal.width;
    return {
      show(lines, xView, yView) {
        const svgBox = svgElement.getBoundingClientRect();
        const box = container.getBoundingClientRect();
        const ratio = svgBox.width / viewWidth;
        tip.replaceChildren(
          ...lines.map((line) => Object.assign(document.createElement("div"), { textContent: line })),
        );
        tip.style.left = `${svgBox.left - box.left + xView * ratio}px`;
        tip.style.top = `${svgBox.top - box.top + yView * ratio}px`;
        tip.hidden = false;
      },
      hide() {
        tip.hidden = true;
      },
    };
  }

  /* ---------- Figure: fitting the latency model by hand ---------- */

  const TOKENS_AXIS = [0, 560];
  const MS_AXIS = [0, 3400];
  const HANDLE_TOKENS = 540;
  const fitSvg = document.getElementById("fit");
  const fitTip = makeTooltip(fitSvg.parentElement, fitSvg);

  function fitFrame() {
    const { width, height } = fitSvg.viewBox.baseVal;
    const area = plotArea(width, height, { top: 30, right: 12, bottom: 34, left: 40 });
    return { area, xOf: linear(TOKENS_AXIS, [area.left, area.right]), yOf: linear(MS_AXIS, [area.bottom, area.top]) };
  }

  effect([guess], (w) => {
    const { area, xOf, yOf } = fitFrame();
    const nodes = [svg("defs", {}, [clipRect("clip-fit", area)])];
    for (const ms of [0, 1000, 2000, 3000]) {
      nodes.push(svg("line", { class: "grid", x1: area.left, x2: area.right, y1: yOf(ms), y2: yOf(ms) }));
      nodes.push(text(area.left - 6, yOf(ms) + 4, ms.toLocaleString("en-US"), { class: "tick", "text-anchor": "end" }));
    }
    for (const tokens of [0, 100, 200, 300, 400, 500]) {
      nodes.push(text(xOf(tokens), area.bottom + 16, String(tokens), { class: "tick", "text-anchor": "middle" }));
    }
    nodes.push(text(area.right, area.bottom + 30, "tokens generated", { "text-anchor": "end", class: "label-strong" }));
    nodes.push(text(area.left - 6, area.top - 14, "latency (ms)"));

    const misses = svg("g", { "clip-path": "url(#clip-fit)" });
    for (const r of REQUESTS) {
      misses.append(svg("line", { class: "miss", x1: xOf(r.tokens), x2: xOf(r.tokens), y1: yOf(r.ms), y2: yOf(w * r.tokens) }));
    }
    nodes.push(misses);
    nodes.push(
      svg("g", { "clip-path": "url(#clip-fit)" }, [
        svg("line", { class: "guess-line", x1: xOf(0), y1: yOf(0), x2: xOf(TOKENS_AXIS[1]), y2: yOf(w * TOKENS_AXIS[1]) }),
      ]),
    );
    for (const r of REQUESTS) nodes.push(svg("circle", { class: "request", cx: xOf(r.tokens), cy: yOf(r.ms), r: 5 }));

    const [hx, hy] = [xOf(HANDLE_TOKENS), yOf(w * HANDLE_TOKENS)];
    nodes.push(
      svg("circle", { class: "hit", cx: hx, cy: hy, r: 20, "data-drag": "guess" }),
      svg("circle", { class: "handle", cx: hx, cy: hy, r: 7, "data-drag": "guess" }),
      text(hx - 12, hy + (w > 3.5 ? 18 : -12), `w = ${format(w, 2)} · drag`, { "text-anchor": "end", class: "label-strong" }),
    );
    fitSvg.replaceChildren(...nodes);
  });

  fitSvg.addEventListener("pointerdown", (event) => {
    if (!event.target.closest("[data-drag]")) return;
    event.preventDefault();
    fitSvg.setPointerCapture(event.pointerId);
    fitTip.hide();
    const { yOf } = fitFrame();
    const msOf = linear([yOf(MS_AXIS[0]), yOf(MS_AXIS[1])], MS_AXIS);
    const move = (moveEvent) => {
      guess.value = Number(snapGuess(msOf(pointerIn(fitSvg, moveEvent).y) / HANDLE_TOKENS).toFixed(2));
    };
    const end = () => {
      fitSvg.removeEventListener("pointermove", move);
      fitSvg.removeEventListener("pointerup", end);
      fitSvg.removeEventListener("pointercancel", end);
    };
    fitSvg.addEventListener("pointermove", move);
    fitSvg.addEventListener("pointerup", end);
    fitSvg.addEventListener("pointercancel", end);
  });

  fitSvg.addEventListener("pointermove", (event) => {
    if (event.buttons !== 0) return;
    const { xOf, yOf } = fitFrame();
    const pointerTokens = xOf.invert(pointerIn(fitSvg, event).x);
    const nearest = REQUESTS.reduce((best, r) =>
      Math.abs(r.tokens - pointerTokens) < Math.abs(best.tokens - pointerTokens) ? r : best,
    );
    const predicted = Math.round(guess.value * nearest.tokens);
    fitTip.show(
      [`${nearest.tokens} tokens took ${nearest.ms} ms`, `your model says ${predicted} ms`, `missed by ${Math.abs(predicted - nearest.ms)} ms`],
      xOf(nearest.tokens),
      Math.min(yOf(nearest.ms), yOf(predicted)),
    );
  });
  fitSvg.addEventListener("pointerleave", () => fitTip.hide());

  /* ---------- Figure: the loss of every weight tried ---------- */

  const TRIED_LOSS = [0, 1.1e6];
  const TRIES_BEFORE_BOWL = 8;
  const triedSvg = document.getElementById("tried");

  effect([guess, tried], (w, triedWeights) => {
    const { width, height } = triedSvg.viewBox.baseVal;
    const area = plotArea(width, height, { top: 30, right: 12, bottom: 34, left: 38 });
    const xOf = linear(GUESS_RANGE, [area.left, area.right]);
    const yOf = linear(TRIED_LOSS, [area.bottom, area.top]);
    const nodes = [];
    for (const [value, label] of [[0, "0"], [5e5, "0.5M"], [1e6, "1M"]]) {
      nodes.push(svg("line", { class: "grid", x1: area.left, x2: area.right, y1: yOf(value), y2: yOf(value) }));
      nodes.push(text(area.left - 6, yOf(value) + 4, label, { class: "tick", "text-anchor": "end" }));
    }
    for (const tick of [0, 2, 4, 6]) {
      nodes.push(text(xOf(tick), area.bottom + 16, String(tick), { class: "tick", "text-anchor": "middle" }));
    }
    nodes.push(text(area.right, area.bottom + 30, "w (ms per token)", { "text-anchor": "end", class: "label-strong" }));
    nodes.push(text(area.left - 6, area.top - 14, "loss"));

    const spansBottom = triedWeights.some((t) => t < 2.4) && triedWeights.some((t) => t > 3.6);
    if (triedWeights.length >= TRIES_BEFORE_BOWL && spansBottom) {
      const points = Array.from({ length: 121 }, (_, i) => {
        const value = GUESS_RANGE[0] + (i / 120) * (GUESS_RANGE[1] - GUESS_RANGE[0]);
        return `${xOf(value).toFixed(1)},${yOf(fitLoss(value)).toFixed(1)}`;
      });
      nodes.push(svg("polyline", { class: "curve", points: points.join(" "), opacity: 0.5 }));
      nodes.push(svg("line", { class: "threshold", x1: xOf(3), x2: xOf(3), y1: area.top + 22, y2: area.bottom }));
      nodes.push(text(xOf(3), area.top + 14, "bottom: w = 3", { "text-anchor": "middle", class: "label-strong" }));
    }
    for (const t of triedWeights) nodes.push(svg("circle", { class: "tried", cx: xOf(t), cy: yOf(fitLoss(t)), r: 3.5 }));
    nodes.push(svg("circle", { class: "ball", cx: xOf(w), cy: yOf(fitLoss(w)), r: 7 }));
    if (triedWeights.length < 3) {
      nodes.push(text((area.left + area.right) / 2, area.top + 40, "Each w you try", { class: "empty-hint", "text-anchor": "middle" }));
      nodes.push(text((area.left + area.right) / 2, area.top + 58, "leaves a dot here.", { class: "empty-hint", "text-anchor": "middle" }));
    }
    triedSvg.replaceChildren(...nodes);
  });

  /* ---------- Figure: a run on the loss curve ---------- */

  const CURVE_W = [-2, 8];
  const CURVE_LOSS = [0, 25];

  function curveFrame(svgElement) {
    const { width, height } = svgElement.viewBox.baseVal;
    const area = plotArea(width, height, { top: 30, right: 12, bottom: 34, left: 30 });
    return {
      area,
      xOf: linear(CURVE_W, [area.left, area.right]),
      yOf: linear(CURVE_LOSS, [area.bottom, area.top]),
    };
  }

  /* Draws the bowl, the run's hops up to step `upTo`, and optionally the draggable start. */
  function drawRun(svgElement, run, upTo, { clipId, showStart }) {
    const { area, xOf, yOf } = curveFrame(svgElement);
    const shown = Math.min(upTo, run.length - 1);
    const inView = (w) => w >= CURVE_W[0] && w <= CURVE_W[1];
    const nodes = [svg("defs", {}, [clipRect(clipId, area, 30)])];

    for (const tick of [0, 10, 20]) {
      nodes.push(svg("line", { class: "grid", x1: area.left, x2: area.right, y1: yOf(tick), y2: yOf(tick) }));
      nodes.push(text(area.left - 6, yOf(tick) + 4, String(tick), { class: "tick", "text-anchor": "end" }));
    }
    for (const w of [-2, 0, BOTTOM, 6, 8]) {
      const label = w === BOTTOM ? `${BOTTOM} (bottom)` : String(w);
      nodes.push(text(xOf(w), area.bottom + 16, label, { class: "tick", "text-anchor": "middle" }));
    }
    nodes.push(svg("line", { class: "axis", x1: area.left, x2: area.right, y1: area.bottom, y2: area.bottom }));
    nodes.push(text(area.right, area.bottom + 30, "w", { "text-anchor": "end", class: "label-strong" }));
    nodes.push(text(area.left - 6, area.top - 14, "loss", { "text-anchor": "start" }));

    const curvePoints = Array.from({ length: 161 }, (_, i) => {
      const w = CURVE_W[0] + (i / 160) * (CURVE_W[1] - CURVE_W[0]);
      return `${xOf(w).toFixed(1)},${yOf(loss(w)).toFixed(1)}`;
    });
    nodes.push(svg("polyline", { class: "curve", points: curvePoints.join(" ") }));
    nodes.push(svg("line", { class: "threshold", x1: xOf(BOTTOM), x2: xOf(BOTTOM), y1: area.bottom, y2: yOf(0) - 6 }));

    const hops = svg("g", { "clip-path": `url(#${clipId})` });
    for (let i = 0; i < shown; i += 1) {
      const [a, b] = [run[i], run[i + 1]];
      const [x1, y1, x2, y2] = [xOf(a), yOf(loss(a)), xOf(b), yOf(loss(b))];
      const lift = Math.abs(x2 - x1) * 0.3 + 12;
      const opacity = 0.35 + 0.65 * ((i + 1) / shown);
      hops.append(
        svg("path", {
          class: "hop",
          d: `M${x1},${y1} Q${(x1 + x2) / 2},${Math.min(y1, y2) - lift} ${x2},${y2}`,
          opacity,
        }),
        svg("circle", { class: "trail", cx: x1, cy: y1, r: 3.5, opacity }),
      );
    }
    nodes.push(hops);

    const LABELED_HOP_PX_MIN = 40; // shorter hops sit too close to the ball to carry a label
    const lastHop = shown > 0 ? [run[shown - 1], run[shown]] : null;
    if (lastHop && lastHop.every(inView) && Math.abs(xOf(lastHop[1]) - xOf(lastHop[0])) >= LABELED_HOP_PX_MIN) {
      const [a, b] = lastHop;
      const apexY = Math.min(yOf(loss(a)), yOf(loss(b))) - (Math.abs(xOf(b) - xOf(a)) * 0.3 + 12);
      nodes.push(
        text((xOf(a) + xOf(b)) / 2, Math.max(area.top - 10, apexY - 8), `step ${shown}: Δw = ${format(b - a, 2)}`, {
          "text-anchor": "middle",
          class: "label-strong",
        }),
      );
    }

    if (showStart) {
      const [sx, sy] = [xOf(run[0]), yOf(loss(run[0]))];
      nodes.push(
        svg("circle", { class: "hit", cx: sx, cy: sy, r: 18, "data-drag": "start" }),
        svg("circle", { class: "handle", cx: sx, cy: sy, r: 7, "data-drag": "start" }),
        text(sx + (run[0] < BOTTOM ? -12 : 12), sy - 12, "start · drag", {
          "text-anchor": run[0] < BOTTOM ? "end" : "start",
        }),
      );
    }

    const current = run[shown];
    if (inView(current) && loss(current) <= CURVE_LOSS[1] + 2) {
      nodes.push(svg("circle", { class: "ball", cx: xOf(current), cy: yOf(loss(current)), r: 8 }));
    } else {
      const toRight = current > BOTTOM;
      nodes.push(
        text(toRight ? area.right : area.left + 4, area.top + 4, toRight ? "w flew off the chart →" : "← w flew off the chart", {
          "text-anchor": toRight ? "end" : "start",
          class: "label-strong",
        }),
      );
    }

    svgElement.replaceChildren(...nodes);
  }

  const curveSvg = document.getElementById("curve");
  effect([path, k], (run, upTo) => drawRun(curveSvg, run, upTo, { clipId: "clip-curve", showStart: true }));

  curveSvg.addEventListener("pointerdown", (event) => {
    if (!event.target.closest("[data-drag]")) return;
    event.preventDefault();
    curveSvg.setPointerCapture(event.pointerId);
    const { xOf } = curveFrame(curveSvg);
    const move = (moveEvent) => {
      const w = xOf.invert(pointerIn(curveSvg, moveEvent).x);
      w0.value = Math.round(clamp(w, -1.5, 7.5) * 10) / 10;
    };
    const end = () => {
      curveSvg.removeEventListener("pointermove", move);
      curveSvg.removeEventListener("pointerup", end);
      curveSvg.removeEventListener("pointercancel", end);
    };
    curveSvg.addEventListener("pointermove", move);
    curveSvg.addEventListener("pointerup", end);
    curveSvg.addEventListener("pointercancel", end);
  });

  /* ---------- Figure: loss at each step ---------- */

  const STEP_LOSS = [1e-6, 1e4];
  const stepsSvg = document.getElementById("loss-steps");
  const stepsTip = makeTooltip(stepsSvg.parentElement, stepsSvg);

  function stepsFrame() {
    const { width, height } = stepsSvg.viewBox.baseVal;
    const area = plotArea(width, height, { top: 30, right: 12, bottom: 34, left: 34 });
    return { area, xOf: linear([0, STEPS], [area.left, area.right]), yOf: logarithmic(STEP_LOSS, [area.bottom, area.top]) };
  }

  effect([path, k], (run, upTo) => {
    const { area, xOf, yOf } = stepsFrame();
    const shown = Math.min(upTo, run.length - 1);
    const nodes = [];
    for (let exponent = -6; exponent <= 4; exponent += 2) {
      const y = yOf(10 ** exponent);
      nodes.push(svg("line", { class: "grid", x1: area.left, x2: area.right, y1: y, y2: y }));
      nodes.push(text(area.left - 6, y + 4, powerOfTen(exponent), { class: "tick", "text-anchor": "end" }));
    }
    for (const step of [0, 10, 20]) {
      nodes.push(text(xOf(step), area.bottom + 16, String(step), { class: "tick", "text-anchor": "middle" }));
    }
    nodes.push(text(area.right, area.bottom + 30, "step", { "text-anchor": "end", class: "label-strong" }));
    nodes.push(text(area.left - 6, area.top - 14, "loss"));

    const points = run.slice(0, shown + 1).map((w, i) => [xOf(i), yOf(loss(w))]);
    nodes.push(svg("polyline", { class: "curve", points: points.map((p) => p.join(",")).join(" ") }));
    for (const [x, y] of points) nodes.push(svg("circle", { cx: x, cy: y, r: 3, fill: "var(--c-loss)" }));
    if (loss(run[shown]) > STEP_LOSS[1]) {
      nodes.push(text(area.right, area.top + 4, "↑ growing without bound", { "text-anchor": "end", class: "label-strong" }));
    }
    stepsSvg.replaceChildren(...nodes);
  });

  stepsSvg.addEventListener("pointermove", (event) => {
    const { xOf, yOf } = stepsFrame();
    const run = path.value;
    const shown = Math.min(k.value, run.length - 1);
    const step = clamp(Math.round(xOf.invert(pointerIn(stepsSvg, event).x)), 0, shown);
    stepsTip.show([`step ${step}`, `w = ${format(run[step], 3)}`, `loss = ${format(loss(run[step]), 4)}`], xOf(step), yOf(loss(run[step])));
  });
  stepsSvg.addEventListener("pointerleave", () => stepsTip.hide());

  const table = document.getElementById("run-table");
  effect([path], (run) => {
    const header = document.createElement("tr");
    for (const label of ["step", "w", "loss"]) header.append(Object.assign(document.createElement("th"), { textContent: label }));
    const rows = run.map((w, i) => {
      const row = document.createElement("tr");
      for (const value of [String(i), format(w, 4), format(loss(w), 6)]) {
        row.append(Object.assign(document.createElement("td"), { textContent: value }));
      }
      return row;
    });
    table.replaceChildren(header, ...rows);
  });

  /* ---------- Figure: every learning rate at once ---------- */

  const SWEEP_ETA = [0, 1.2];
  const SWEEP_LOSS = [1e-40, 1e10]; // deep floor so the dip at η = 0.5 reads as a V, not a plateau
  const sweepSvg = document.getElementById("sweep");
  const sweepTip = makeTooltip(sweepSvg.parentElement, sweepSvg);

  function sweepFrame() {
    const { width, height } = sweepSvg.viewBox.baseVal;
    const area = plotArea(width, height, { top: 30, right: 12, bottom: 34, left: 40 });
    return { area, xOf: linear(SWEEP_ETA, [area.left, area.right]), yOf: logarithmic(SWEEP_LOSS, [area.bottom, area.top]) };
  }

  effect([sweep, eta, probe], (samples, rate, probed) => {
    const { area, xOf, yOf } = sweepFrame();
    const nodes = [
      svg("rect", { class: "region", x: xOf(1), y: area.top, width: area.right - xOf(1), height: area.bottom - area.top }),
    ];
    for (let exponent = -40; exponent <= 10; exponent += 10) {
      const y = yOf(10 ** exponent);
      nodes.push(svg("line", { class: "grid", x1: area.left, x2: area.right, y1: y, y2: y }));
      nodes.push(text(area.left - 6, y + 4, exponent === -40 ? "≈0" : powerOfTen(exponent), { class: "tick", "text-anchor": "end" }));
    }
    for (const tick of [0, 0.5, 1]) {
      nodes.push(text(xOf(tick), area.bottom + 16, String(tick), { class: "tick", "text-anchor": "middle" }));
    }
    for (const edge of [0.5, 1]) {
      nodes.push(svg("line", { class: "threshold", x1: xOf(edge), x2: xOf(edge), y1: area.top, y2: area.bottom }));
    }
    nodes.push(text((area.left + xOf(0.5)) / 2, area.top + 16, "creeps", { "text-anchor": "middle" }));
    nodes.push(text((xOf(0.5) + xOf(1)) / 2, area.top + 16, "overshoots, settles", { "text-anchor": "middle" }));
    nodes.push(text((xOf(1) + area.right) / 2, area.top + 16, "diverges", { "text-anchor": "middle" }));
    nodes.push(text(area.right, area.bottom + 30, "learning rate η", { "text-anchor": "end", class: "label-strong" }));
    nodes.push(text(area.left - 6, area.top - 14, "loss after 20 steps", { "text-anchor": "start" }));

    const points = samples.map((s) => `${xOf(s.eta).toFixed(1)},${yOf(s.loss).toFixed(1)}`);
    nodes.push(svg("polyline", { class: "curve", points: points.join(" ") }));

    nodes.push(svg("line", { class: "rate-rule", x1: xOf(rate), x2: xOf(rate), y1: area.top, y2: area.bottom }));
    nodes.push(
      text(xOf(rate) + (rate > 0.9 ? -6 : 6), area.bottom - 8, `η = ${format(rate, 2)}`, {
        "text-anchor": rate > 0.9 ? "end" : "start",
        class: "label-strong",
      }),
    );

    if (probed !== null) {
      const probedLoss = finalLoss(descend(w0.value, probed, STEPS));
      nodes.push(svg("line", { class: "crosshair", x1: xOf(probed), x2: xOf(probed), y1: area.top, y2: area.bottom }));
      nodes.push(svg("circle", { class: "ball", cx: xOf(probed), cy: yOf(probedLoss), r: 5, style: "fill: var(--c-loss)" }));
    }

    nodes.push(svg("rect", { x: area.left, y: area.top, width: area.right - area.left, height: area.bottom - area.top, fill: "transparent", "data-sweep-hit": "" }));
    sweepSvg.replaceChildren(...nodes);
  });

  function probedRate(event) {
    const { xOf } = sweepFrame();
    return Math.round(clamp(xOf.invert(pointerIn(sweepSvg, event).x), 0.01, 1.2) * 100) / 100;
  }

  sweepSvg.addEventListener("pointermove", (event) => {
    const rate = probedRate(event);
    probe.value = rate;
    const { xOf, yOf } = sweepFrame();
    const lossAfter = finalLoss(descend(w0.value, rate, STEPS));
    sweepTip.show([`η = ${format(rate, 2)}`, `loss after 20 steps: ${format(lossAfter, 3)}`, "click to use this rate"], xOf(rate), yOf(lossAfter));
  });
  sweepSvg.addEventListener("pointerleave", () => {
    probe.value = null;
    sweepTip.hide();
  });
  sweepSvg.addEventListener("pointerdown", (event) => {
    eta.value = probedRate(event);
  });

  const miniSvg = document.getElementById("mini");
  const miniTitle = document.getElementById("mini-title");
  effect([w0, eta, probe], (start, rate, probed) => {
    const shownRate = probed ?? rate;
    miniTitle.textContent = `The run behind η = ${format(shownRate, 2)}`;
    drawRun(miniSvg, descend(start, shownRate, STEPS), STEPS, { clipId: "clip-mini", showStart: false });
  });

  /* ---------- Figure: the valley ---------- */

  const valleySvg = document.getElementById("valley");
  const X_HALF = 10;

  function valleyFrame() {
    const { width, height } = valleySvg.viewBox.baseVal;
    const area = plotArea(width, height, { top: 14, right: 14, bottom: 14, left: 14 });
    const unit = (area.right - area.left) / (2 * X_HALF); // equal scales keep the valley's true shape
    const yHalf = (area.bottom - area.top) / (2 * unit);
    return {
      area,
      unit,
      yHalf,
      xOf: linear([-X_HALF, X_HALF], [area.left, area.right]),
      yOf: linear([-yHalf, yHalf], [area.bottom, area.top]),
    };
  }

  effect([path2, k2], (run, upTo) => {
    const { area, unit, yHalf, xOf, yOf } = valleyFrame();
    const shown = Math.min(upTo, run.length - 1);
    const inView = (p) => Math.abs(p.x) <= X_HALF && Math.abs(p.y) <= yHalf;
    const contours = svg("g", { "clip-path": "url(#clip-valley)" });
    for (let n = 1; n <= 12; n += 1) {
      // The level set L = n²/2 is an ellipse with semi-axes n (along) and n/√10 (across).
      contours.append(svg("ellipse", { class: "contour", cx: xOf(0), cy: yOf(0), rx: n * unit, ry: (n / Math.sqrt(STEEPNESS)) * unit }));
    }
    const trail = svg("g", { "clip-path": "url(#clip-valley)" });
    const visible = run.slice(0, shown + 1);
    trail.append(svg("polyline", { class: "path2d", points: visible.map((p) => `${xOf(p.x)},${yOf(p.y)}`).join(" ") }));
    visible.forEach((p, i) => {
      if (i > 0 && i < shown) trail.append(svg("circle", { class: "trail", cx: xOf(p.x), cy: yOf(p.y), r: 2.5 }));
    });

    const nodes = [
      svg("defs", {}, [clipRect("clip-valley", area)]),
      contours,
      svg("circle", { cx: xOf(0), cy: yOf(0), r: 3, fill: "var(--c-loss)" }),
      text(xOf(0) + 8, yOf(0) + 16, "bottom"),
      text(area.right - 6, yOf(0) - 6, "along the valley: gentle →", { "text-anchor": "end" }),
      text(xOf(0) + 8, area.top + 14, "↕ across: 10× steeper"),
      trail,
    ];

    const current = run[shown];
    if (inView(current)) {
      nodes.push(svg("circle", { class: "ball", cx: xOf(current.x), cy: yOf(current.y), r: 7 }));
    } else {
      nodes.push(text(area.right - 6, area.top + 14, "the ball flew out of the valley", { "text-anchor": "end", class: "label-strong" }));
    }
    const start = run[0];
    nodes.push(
      svg("circle", { class: "hit", cx: xOf(start.x), cy: yOf(start.y), r: 18, "data-drag": "start" }),
      svg("circle", { class: "handle", cx: xOf(start.x), cy: yOf(start.y), r: 7, "data-drag": "start" }),
      text(xOf(start.x) + 12, yOf(start.y) - 10, "start · drag"),
    );
    valleySvg.replaceChildren(...nodes);
  });

  valleySvg.addEventListener("pointerdown", (event) => {
    if (!event.target.closest("[data-drag]")) return;
    event.preventDefault();
    valleySvg.setPointerCapture(event.pointerId);
    const { yHalf, xOf, yOf } = valleyFrame();
    const move = (moveEvent) => {
      const point = pointerIn(valleySvg, moveEvent);
      start2.value = {
        x: Math.round(clamp(xOf.invert(point.x), -X_HALF + 0.5, X_HALF - 0.5) * 10) / 10,
        y: Math.round(clamp(yOf.invert(point.y), -yHalf + 0.3, yHalf - 0.3) * 10) / 10,
      };
    };
    const end = () => {
      valleySvg.removeEventListener("pointermove", move);
      valleySvg.removeEventListener("pointerup", end);
      valleySvg.removeEventListener("pointercancel", end);
    };
    valleySvg.addEventListener("pointermove", move);
    valleySvg.addEventListener("pointerup", end);
    valleySvg.addEventListener("pointercancel", end);
  });

  /* ---------- Predictions settle by playing the scene ---------- */

  const players = {
    run: document.querySelector('x-player[bind="k"]'),
    valley: document.querySelector('x-player[bind="k2"]'),
  };
  const rates = { eta, eta2 };

  for (const question of document.querySelectorAll("x-predict[data-rate]")) {
    question.addEventListener("reveal", () => {
      const rate = rates[question.dataset.rate];
      const player = players[question.dataset.player];
      if (!rate || !player) throw new Error(`explorable: <x-predict> refers to unknown rate or player`);
      rate.value = Number(question.dataset.value);
      player.closest("figure").scrollIntoView({ behavior: "smooth", block: "nearest" });
      player.play({ fromStart: true });
    });
  }
})();
