/* explorable.js — reactive state and inline controls shared by every page.

   A classic script rather than a module, so a page still works when opened
   straight from disk (browsers refuse file:// module imports).

   A page declares its state first, then mounts the elements that bind to it:

     const eta = X.signal("eta", 0.1);
     X.derived("loss", [eta], (e) => ...);
     X.mount();

   Elements:
     <x-scrub bind="eta" min="0" max="1" step="0.01" color="rate">  drag or arrow keys
     <x-show bind="loss" digits="3">                                 live value in prose
     <x-predict> buttons[data-answer], one [data-correct], [data-reveal] block
     <x-player bind="k" max="20">                                    play / step through time; max may change
*/
"use strict";

(function () {
  class Signal {
    #value;
    #listeners = new Set();

    constructor(value) {
      this.#value = value;
    }

    get value() {
      return this.#value;
    }

    set value(next) {
      if (Object.is(next, this.#value)) return;
      this.#value = next;
      for (const listener of [...this.#listeners]) listener(next);
    }

    subscribe(listener) {
      this.#listeners.add(listener);
      return () => this.#listeners.delete(listener);
    }
  }

  const signals = new Map();

  function signal(name, initial) {
    if (signals.has(name)) throw new Error(`explorable: signal "${name}" declared twice`);
    const created = new Signal(initial);
    signals.set(name, created);
    return created;
  }

  function lookup(name) {
    const found = signals.get(name);
    if (!found) throw new Error(`explorable: no signal named "${name}"`);
    return found;
  }

  /* A derived signal recomputes synchronously, so readers never see it lag its inputs. */
  function derived(name, deps, compute) {
    const created = signal(name, compute(...deps.map((d) => d.value)));
    const recompute = () => {
      created.value = compute(...deps.map((d) => d.value));
    };
    for (const dep of deps) dep.subscribe(recompute);
    return created;
  }

  /* Runs `draw` now and again after any dependency changes, at most once per frame. */
  function effect(deps, draw) {
    let queued = false;
    const run = () => {
      queued = false;
      draw(...deps.map((d) => d.value));
    };
    for (const dep of deps) {
      dep.subscribe(() => {
        if (queued) return;
        queued = true;
        requestAnimationFrame(run);
      });
    }
    run();
  }

  const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

  function snap(value, step) {
    const digits = Math.max(0, -Math.floor(Math.log10(step)));
    return Number((Math.round(value / step) * step).toFixed(digits));
  }

  function numberAttribute(element, name) {
    const raw = element.getAttribute(name);
    const parsed = Number(raw);
    if (raw === null || !Number.isFinite(parsed)) {
      throw new Error(`explorable: <${element.localName}> needs a numeric "${name}" attribute`);
    }
    return parsed;
  }

  function format(value, digits) {
    if (typeof value !== "number") return String(value);
    if (!Number.isFinite(value)) return "∞";
    const magnitude = Math.abs(value);
    if (magnitude !== 0 && (magnitude >= 1e5 || magnitude < 10 ** -digits)) {
      return value.toExponential(1).replace("e+", "e");
    }
    return value.toFixed(digits);
  }

  /* Scrubbable number: drag sideways to change it, or focus it and use arrow keys. */
  class Scrub extends HTMLElement {
    static PIXELS_PER_RANGE = 240;

    connectedCallback() {
      this.state = lookup(this.getAttribute("bind"));
      this.min = numberAttribute(this, "min");
      this.max = numberAttribute(this, "max");
      this.step = numberAttribute(this, "step");
      this.digits = Number(this.getAttribute("digits") ?? 2);
      if (!(this.min < this.max && this.step > 0)) throw new Error("explorable: <x-scrub> needs min < max and step > 0");

      this.tabIndex = 0;
      this.setAttribute("role", "slider");
      this.setAttribute("aria-valuemin", String(this.min));
      this.setAttribute("aria-valuemax", String(this.max));
      this.style.setProperty("--c", `var(--c-${this.getAttribute("color") ?? "param"})`);

      this.addEventListener("pointerdown", (event) => this.#beginDrag(event));
      this.addEventListener("keydown", (event) => this.#key(event));
      this.state.subscribe(() => this.#render());
      this.#render();
    }

    #set(value) {
      this.state.value = clamp(snap(value, this.step), this.min, this.max);
    }

    #beginDrag(event) {
      event.preventDefault();
      this.focus();
      this.setPointerCapture(event.pointerId);
      this.classList.add("dragging");
      const startX = event.clientX;
      const startValue = this.state.value;
      const perPixel = (this.max - this.min) / Scrub.PIXELS_PER_RANGE;
      const move = (moveEvent) => this.#set(startValue + (moveEvent.clientX - startX) * perPixel);
      const end = () => {
        this.classList.remove("dragging");
        this.removeEventListener("pointermove", move);
        this.removeEventListener("pointerup", end);
        this.removeEventListener("pointercancel", end);
      };
      this.addEventListener("pointermove", move);
      this.addEventListener("pointerup", end);
      this.addEventListener("pointercancel", end);
    }

    #key(event) {
      const direction = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }[event.key];
      if (direction === undefined) return;
      event.preventDefault();
      this.#set(this.state.value + direction * this.step * (event.shiftKey ? 10 : 1));
    }

    #render() {
      const text = format(this.state.value, this.digits);
      this.textContent = text;
      this.setAttribute("aria-valuenow", String(this.state.value));
      this.setAttribute("aria-valuetext", text);
    }
  }

  /* Live value inside prose. Numbers are formatted; strings are shown as they are. */
  class Show extends HTMLElement {
    connectedCallback() {
      const state = lookup(this.getAttribute("bind"));
      const digits = Number(this.getAttribute("digits") ?? 2);
      const color = this.getAttribute("color");
      if (color) this.style.setProperty("--c", `var(--c-${color})`);
      this.setAttribute("aria-live", "polite");
      const render = () => {
        this.textContent = format(state.value, digits);
      };
      state.subscribe(render);
      render();
    }
  }

  /* Predict, then reveal. The reader commits to an answer before the page shows the outcome.
     Fires a bubbling "reveal" event so the page can play the scene that settles it. */
  class Predict extends HTMLElement {
    connectedCallback() {
      const answers = [...this.querySelectorAll("button[data-answer]")];
      const correct = answers.filter((button) => button.hasAttribute("data-correct"));
      const reveal = this.querySelector("[data-reveal]");
      if (answers.length < 2 || correct.length !== 1 || !reveal) {
        throw new Error("explorable: <x-predict> needs 2+ answer buttons, exactly one data-correct, and a [data-reveal] block");
      }
      reveal.hidden = true;
      for (const button of answers) {
        button.addEventListener("click", () => {
          if (this.hasAttribute("answered")) return;
          this.setAttribute("answered", "");
          button.setAttribute("aria-pressed", "true");
          correct[0].classList.add("is-correct");
          for (const other of answers) other.disabled = true;
          reveal.hidden = false;
          const guessedRight = button === correct[0];
          this.classList.add(guessedRight ? "guessed-right" : "guessed-wrong");
          this.dispatchEvent(new CustomEvent("reveal", { bubbles: true, detail: { guessedRight } }));
        });
      }
    }
  }

  /* Transport for an independent variable such as the step index. A page may change `max` later,
     for example when a run's length depends on the reader's settings. */
  class Player extends HTMLElement {
    static FRAME_MS = 260;
    static observedAttributes = ["max"];

    attributeChangedCallback() {
      if (!this.range) return; // connectedCallback reads the first value
      this.max = numberAttribute(this, "max");
      this.range.max = String(this.max);
      if (this.state.value > this.max) this.state.value = this.max;
      this.#render();
    }

    connectedCallback() {
      this.state = lookup(this.getAttribute("bind"));
      this.max = numberAttribute(this, "max");
      this.timer = null;

      this.button = Object.assign(document.createElement("button"), { type: "button", className: "player-toggle" });
      this.range = Object.assign(document.createElement("input"), { type: "range", min: "0", max: String(this.max), step: "1" });
      this.range.setAttribute("aria-label", this.getAttribute("label") ?? "step");
      this.readout = Object.assign(document.createElement("span"), { className: "player-readout" });
      this.replaceChildren(this.button, this.range, this.readout);

      this.button.addEventListener("click", () => (this.timer === null ? this.play() : this.pause()));
      this.range.addEventListener("input", () => {
        // Read before pausing: pause() re-renders the slider from the old state.
        const chosen = Number(this.range.value);
        this.pause();
        this.state.value = chosen;
      });
      this.state.subscribe(() => this.#render());
      this.#render();
    }

    play({ fromStart = this.state.value >= this.max } = {}) {
      this.pause();
      if (fromStart) this.state.value = 0;
      this.timer = setInterval(() => {
        if (this.state.value >= this.max) {
          this.pause();
          return;
        }
        this.state.value += 1;
      }, Player.FRAME_MS);
      this.#render();
    }

    pause() {
      if (this.timer !== null) clearInterval(this.timer);
      this.timer = null;
      this.#render();
    }

    #render() {
      const playing = this.timer !== null;
      this.button.textContent = playing ? "Pause" : this.state.value >= this.max ? "Replay" : "Play";
      this.button.setAttribute("aria-pressed", String(playing));
      this.range.value = String(this.state.value);
      this.readout.textContent = `step ${this.state.value} of ${this.max}`;
    }
  }

  function mount() {
    customElements.define("x-scrub", Scrub);
    customElements.define("x-show", Show);
    customElements.define("x-predict", Predict);
    customElements.define("x-player", Player);
  }

  /* SVG helpers. */
  const SVG_NS = "http://www.w3.org/2000/svg";

  function svg(tag, attributes = {}, children = []) {
    const element = document.createElementNS(SVG_NS, tag);
    for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, String(value));
    for (const child of children) element.append(child);
    return element;
  }

  function linear([d0, d1], [r0, r1]) {
    const map = (value) => r0 + ((value - d0) / (d1 - d0)) * (r1 - r0);
    map.invert = (pixel) => d0 + ((pixel - r0) / (r1 - r0)) * (d1 - d0);
    return map;
  }

  /* Log scale that pins values outside the domain to its edges. */
  function logarithmic([d0, d1], range) {
    const inner = linear([Math.log10(d0), Math.log10(d1)], range);
    return (value) => inner(Math.log10(clamp(value, d0, d1)));
  }

  /* Pointer position in the SVG's own coordinate system. */
  function pointerIn(svgElement, event) {
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(svgElement.getScreenCTM().inverse());
    return { x: point.x, y: point.y };
  }

  function initThemeToggle(button) {
    const root = document.documentElement;
    const isDark = () =>
      root.dataset.theme ? root.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
    const label = () => {
      button.textContent = isDark() ? "Light" : "Dark";
    };
    button.addEventListener("click", () => {
      root.dataset.theme = isDark() ? "light" : "dark";
      label();
    });
    label();
  }

  window.X = { signal, derived, effect, mount, lookup, clamp, format, svg, linear, logarithmic, pointerIn, initThemeToggle };
})();
