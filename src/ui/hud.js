// ---------------------------------------------------------------------------
// Input + UI
// ---------------------------------------------------------------------------
export const menuEl = document.getElementById('menu');
export const hud = document.getElementById('hud');
export const crosshair = document.getElementById('crosshair');
const toastEl = document.getElementById('toast');
const damageEl = document.getElementById('damage');


let toastTimer = 0;

export function toast(text) {
  toastEl.textContent = text;
  toastEl.style.opacity = 1;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toastEl.style.opacity = 0), 1600);
}
export function flashDamage() {
  damageEl.style.transition = 'none'; damageEl.style.opacity = 1;
  requestAnimationFrame(() => { damageEl.style.transition = 'opacity 0.8s'; damageEl.style.opacity = 0; });
}
