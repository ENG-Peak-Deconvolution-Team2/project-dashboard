/* Optional visual layer. The saved favorite and project records stay independent. */
(() => {
  "use strict";
  const body = document.body;
  const hero = document.querySelector(".experimental-hero");
  const slider = document.getElementById("peak-separation");
  const toggle = document.getElementById("motion-toggle");
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const finePointer = matchMedia("(hover: hover) and (pointer: fine)");
  let wanted = true;
  try { wanted = localStorage.getItem("eng-experiment-motion") !== "off"; } catch {}
  let visible = true;
  let frame = 0;
  let elapsed = 0;
  let previous = 0;
  let separation = Number(slider.value) / 100;
  let introDone = reduced.matches;
  let litCard = null;
  let pointerFrame = 0;
  const entrances = new Set();
  const paths = ["component-a", "component-b", "component-c"].map(id => document.getElementById(id));
  const combined = document.getElementById("combined-signal");
  const area = document.getElementById("signal-area");
  const scanLine = document.getElementById("scan-line");
  const scanPoint = document.getElementById("scan-point");
  const scanHalo = document.getElementById("scan-halo");
  const reactive = ".team-member,.stat,.presentation-card,.risk-card,.next-review,.plan-group";

  function values(x) {
    const centres = [240 - separation * 125, 240, 240 + separation * 125];
    return centres.map((centre, i) => [66, 85, 59][i] * Math.exp(-0.5 * ((x - centre) / [30, 35, 27][i]) ** 2));
  }
  function scan(position) {
    const x = 20 + position * 440;
    const y = 220 - values(x).reduce((sum, value) => sum + value, 0);
    scanLine.setAttribute("x1", x.toFixed(2));
    scanLine.setAttribute("x2", x.toFixed(2));
    for (const node of [scanPoint, scanHalo]) {
      node.setAttribute("cx", x.toFixed(2));
      node.setAttribute("cy", y.toFixed(2));
    }
  }
  function draw() {
    separation = Number(slider.value) / 100;
    const components = [[], [], []];
    const mix = [];
    for (let x = 20; x <= 460; x += 2) {
      const parts = values(x);
      const command = x === 20 ? "M" : "L";
      parts.forEach((value, i) => components[i].push(command + x + " " + (220 - value).toFixed(2)));
      mix.push(command + x + " " + (220 - parts.reduce((sum, value) => sum + value, 0)).toFixed(2));
    }
    paths.forEach((path, i) => path.setAttribute("d", components[i].join(" ")));
    combined.setAttribute("d", mix.join(" "));
    area.setAttribute("d", mix.join(" ") + " L460 220 L20 220Z");
    document.getElementById("separation-value").textContent = separation < .4 ? "Blended" : separation < .75 ? "Resolving" : "Separated";
    slider.style.setProperty("--range-fill", slider.value + "%");
    scan((elapsed % 7000) / 7000);
  }
  function animate(time) {
    if (previous) elapsed += Math.min(time - previous, 50);
    previous = time;
    if (!introDone) {
      const progress = Math.min(elapsed / 3200, 1);
      slider.value = String(Math.round(35 + 50 * (1 - (1 - progress) ** 3)));
      draw();
      introDone = progress === 1;
    }
    scan((elapsed % 7000) / 7000);
    frame = requestAnimationFrame(animate);
  }
  function resetCard() {
    if (!litCard) return;
    for (const key of ["--pointer-x", "--pointer-y", "--tilt-x", "--tilt-y"]) litCard.style.removeProperty(key);
    litCard.classList.remove("pointer-lit");
    litCard = null;
  }
  function syncMotion() {
    const enabled = wanted && !reduced.matches;
    body.dataset.motion = enabled ? "on" : "off";
    document.documentElement.style.scrollBehavior = enabled ? "" : "auto";
    body.dataset.pageVisible = document.hidden ? "false" : "true";
    toggle.textContent = reduced.matches ? "Reduced motion" : wanted ? "Pause motion" : "Play motion";
    toggle.disabled = reduced.matches;
    toggle.setAttribute("aria-pressed", String(!enabled));
    cancelAnimationFrame(frame);
    frame = 0;
    previous = 0;
    if (enabled && visible && !document.hidden) frame = requestAnimationFrame(animate);
    if (!enabled) {
      if (reduced.matches) introDone = true;
      cancelAnimationFrame(pointerFrame);
      pointerFrame = 0;
      resetCard();
      for (const animation of entrances) animation.cancel();
      entrances.clear();
    }
  }
  function enter(panel) {
    if (body.dataset.motion !== "on") return;
    const cards = [...panel.querySelectorAll(".stat,.plan-group,.presentation-card,.research-section,.journal-entry")].slice(0, 6);
    cards.forEach((card, i) => {
      const animation = card.animate([
        { opacity: .2, transform: "translateY(22px) scale(.985)" },
        { opacity: 1, transform: "translateY(0) scale(1)" }
      ], { duration: 600, delay: i * 65, easing: "cubic-bezier(.16,1,.3,1)", fill: "backwards" });
      entrances.add(animation);
      animation.finished.catch(() => {}).finally(() => entrances.delete(animation));
    });
  }
  for (const event of ["pointerdown", "keydown", "input"]) {
    slider.addEventListener(event, () => { introDone = true; });
  }
  slider.addEventListener("input", draw);
  toggle.addEventListener("click", () => {
    wanted = !wanted;
    try { localStorage.setItem("eng-experiment-motion", wanted ? "on" : "off"); } catch {}
    syncMotion();
  });
  reduced.addEventListener("change", syncMotion);
  document.addEventListener("visibilitychange", syncMotion);
  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    hero.classList.toggle("offscreen", !visible);
    syncMotion();
  }).observe(hero);
  document.addEventListener("shown.bs.tab", event => {
    const panel = document.querySelector(event.target.dataset.bsTarget);
    if (panel) enter(panel);
  });
  document.addEventListener("pointermove", event => {
    if (body.dataset.motion !== "on" || !finePointer.matches) return;
    const card = event.target.closest(reactive);
    if (card !== litCard) { resetCard(); litCard = card; }
    if (!card) return;
    cancelAnimationFrame(pointerFrame);
    pointerFrame = requestAnimationFrame(() => {
      const rect = card.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width;
      const y = (event.clientY - rect.top) / rect.height;
      card.style.setProperty("--pointer-x", (x * 100).toFixed(1) + "%");
      card.style.setProperty("--pointer-y", (y * 100).toFixed(1) + "%");
      card.style.setProperty("--tilt-x", ((.5 - y) * 3).toFixed(2) + "deg");
      card.style.setProperty("--tilt-y", ((x - .5) * 3).toFixed(2) + "deg");
      card.classList.add("pointer-lit");
    });
  });
  document.addEventListener("pointerout", event => {
    if (litCard && !litCard.contains(event.relatedTarget)) {
      cancelAnimationFrame(pointerFrame);
      resetCard();
    }
  });
  draw();
  syncMotion();
})();
