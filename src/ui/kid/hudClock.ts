import type { WorldClock } from "../../sim/systems/dayNight";
import { NIGHT_WARNING_MS } from "../../sim/systems/dayNight";

const RING_R = 26;
const RING_C = 2 * Math.PI * RING_R;
const REFRESH_MS = 250;

export type HudClock = { refresh(): void };

/**
 * Reloj del niño sin texto (spec "Indicadores de tiempo sin texto"): sol o luna dentro de un arco que
 * se va llenando hasta la noche (o hasta el amanecer) y el número del día. Un minuto antes de la
 * noche aparece una luna que parpadea suavemente.
 */
export function setupHudClock(root: HTMLElement, clock: () => WorldClock): HudClock {
  root.innerHTML = `
    <div class="clock-dial">
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <circle class="ring-bg" cx="32" cy="32" r="${RING_R}" />
        <circle class="ring-fill" cx="32" cy="32" r="${RING_R}" stroke-dasharray="${RING_C}" stroke-dashoffset="${RING_C}" transform="rotate(-90 32 32)" />
      </svg>
      <span class="clock-icon"></span>
    </div>
    <span class="clock-moon" aria-hidden="true">🌙</span>
    <span class="day-number"><small>Día</small> <b></b></span>`;
  const icon = root.querySelector<HTMLElement>(".clock-icon")!;
  const fill = root.querySelector<SVGCircleElement>(".ring-fill")!;
  const day = root.querySelector<HTMLElement>(".day-number b")!;

  const refresh = () => {
    const c = clock();
    const night = c.isNight;
    const soon = !night && c.msUntilNight <= NIGHT_WARNING_MS;
    const glyph = night ? "🌙" : "☀️";
    if (icon.textContent !== glyph) icon.textContent = glyph;
    // En pasos de 0,5 % del arco: el anillo solo se vuelve a pintar cuando el cambio se ve.
    const offset = (RING_C * (1 - Math.round(c.phaseProgress * 200) / 200)).toFixed(2);
    if (fill.getAttribute("stroke-dashoffset") !== offset) fill.setAttribute("stroke-dashoffset", offset);
    const n = String(c.dayCount);
    if (day.textContent !== n) day.textContent = n;
    root.classList.toggle("night", night);
    root.classList.toggle("night-soon", soon);
    root.dataset.phase = c.phase;
    root.setAttribute("aria-label", `Día ${n}, ${night ? "noche" : "día"}`);
  };
  refresh();
  setInterval(refresh, REFRESH_MS);
  return { refresh };
}
