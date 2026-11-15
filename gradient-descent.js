/* Draft for "Two weights, one learning rate": gradient descent in a valley ten times steeper across than along.
   Every figure is a pure drawing of model output; nothing moves unless the model says so. */
"use strict";

(function () {
  const { signal, derived, effect, svg, linear, pointerIn, clamp } = X;

  /* ---------- Model: two parameters in a valley, L = ½(x² + 10y²) ---------- */

  const ESCAPE = 1e6; // a run whose |x| or |y| passes this has diverged; stop computing it

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

  /* ---------- State ---------- */

  const eta2 = signal("eta2", 0.05);
  const start2 = signal("start2", { x: -8, y: 2.5 });
  const k2 = signal("k2", STEPS_2D);
  const path2 = derived("path2", [start2, eta2], (start, rate) => descend2(start, rate, STEPS_2D));
  derived("alongFactor", [eta2], (rate) => Math.abs(1 - rate));
  derived("acrossFactor", [eta2], (rate) => Math.abs(1 - STEEPNESS * rate));
  derived("settleSteps", [start2, eta2], stepsToSettle);

  // Changing an assumption shows its whole consequence at once; the player is for replaying it.
  for (const input of [eta2, start2]) input.subscribe(() => (k2.value = STEPS_2D));

  X.mount();
  X.initThemeToggle(document.getElementById("theme"));

  /* ---------- Shared drawing helpers ---------- */

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

  function clipRect(id, area) {
    return svg("clipPath", { id }, [
      svg("rect", { x: area.left, y: area.top, width: area.right - area.left, height: area.bottom - area.top }),
    ]);
  }

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

  /* ---------- The prediction settles by playing the scene ---------- */

  const valleyPlayer = document.querySelector('x-player[bind="k2"]');
  document.getElementById("predict-limit").addEventListener("reveal", () => {
    eta2.value = 0.19;
    valleyPlayer.play({ fromStart: true });
  });
})();
