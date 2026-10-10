import { state } from '../state.js';
import { renderer } from '../render/scene.js';
import { itemHint, renderCrafting } from './items.js';
import { mouse } from '../player/interaction.js';
import { toast } from '../ui/hud.js';
import { updateOverlay } from '../ui/menu.js';
import { keys } from '../ui/input.js';

// ---------------------------------------------------------------------------
// Inventory + hotbar (items get registered later with game.registerItem)
// ---------------------------------------------------------------------------
const HOTBAR_SIZE = 9, INVENTORY_SIZE = 36; // slots 0-8 are the hotbar, 9-35 the backpack
export const STACK = 100; // how many of one item fit in a slot (tools and armour: 1)
export const ITEMS = {};                            // id -> { id, name, icon (emoji) or color, maxStack }
export const slots = new Array(INVENTORY_SIZE).fill(null); // each slot: null or { id, count }


export let inventoryOpen = false;

export function registerItem(def) {
  ITEMS[def.id] = { maxStack: STACK, ...def };
  return ITEMS[def.id];
}

// Adds items, filling existing stacks first (hotbar before backpack). Returns how many didn't fit.
export function addItem(id, count = 1) {
  const def = ITEMS[id];
  if (!def) throw new Error(`Unknown item "${id}". Register it with game.registerItem first.`);
  for (const pass of ['stack', 'empty']) {
    for (let i = 0; i < INVENTORY_SIZE && count > 0; i++) {
      const s = slots[i];
      if (pass === 'stack' && s && s.id === id && s.count < def.maxStack) {
        const n = Math.min(count, def.maxStack - s.count); s.count += n; count -= n;
      } else if (pass === 'empty' && !s) {
        const n = Math.min(count, def.maxStack); slots[i] = { id, count: n }; count -= n;
      }
    }
  }
  renderInventory();
  return count;
}

export function removeItem(id, count = 1) {
  for (let i = INVENTORY_SIZE - 1; i >= 0 && count > 0; i--) {
    const s = slots[i];
    if (s && s.id === id) { const n = Math.min(count, s.count); s.count -= n; count -= n; if (!s.count) slots[i] = null; }
  }
  renderInventory();
  return count === 0;
}

export const countItem = (id) => slots.reduce((sum, s) => sum + (s && s.id === id ? s.count : 0), 0);
export const getSelectedItem = () => slots[state.selectedSlot];

export function fillSlotEl(el, stack, keyLabel) {
  el.innerHTML = keyLabel ? `<span class="key">${keyLabel}</span>` : '';
  el.removeAttribute('title');
  if (!stack) return;
  const def = ITEMS[stack.id] || { name: stack.id };
  if (def.icon) el.insertAdjacentHTML('beforeend', `<span>${def.icon}</span>`);
  else el.insertAdjacentHTML('beforeend', `<span class="swatch${def.flat ? ' flat' : ''}" style="background:${def.color || '#999'}"></span>`);
  if (def.badge) el.insertAdjacentHTML('beforeend', `<span class="badge" style="background:${def.badge}"></span>`);
  if (stack.count > 1) el.insertAdjacentHTML('beforeend', `<span class="count">${stack.count}</span>`);
  el.dataset.name = def.name;
}

const hotbarEl = document.getElementById('hotbar');
const invMainEl = document.getElementById('inv-main');
const invHotbarEl = document.getElementById('inv-hotbar');
const inventoryEl = document.getElementById('inventory');
const heldEl = document.getElementById('held');
export const tooltipEl = document.getElementById('tooltip');

function makeSlots(container, from, to, interactive) {
  for (let i = from; i < to; i++) {
    const el = document.createElement('div');
    el.className = 'slot';
    el.dataset.index = i;
    if (interactive) {
      el.addEventListener('mousedown', (e) => { e.preventDefault(); onSlotClick(i, e); });
      el.addEventListener('mouseenter', () => { const s = slots[i]; if (s) showTooltip(s.id); });
      el.addEventListener('mouseleave', () => { tooltipEl.style.display = 'none'; });
      el.addEventListener('contextmenu', (e) => e.preventDefault());
    }
    container.appendChild(el);
  }
}
makeSlots(hotbarEl, 0, HOTBAR_SIZE, false);
makeSlots(invMainEl, HOTBAR_SIZE, INVENTORY_SIZE, true);
makeSlots(invHotbarEl, 0, HOTBAR_SIZE, true);

export function renderInventory() {
  [...hotbarEl.children].forEach((el, i) => { fillSlotEl(el, slots[i], String(i + 1)); el.classList.toggle('selected', i === state.selectedSlot); });
  [...invMainEl.children].forEach((el) => fillSlotEl(el, slots[+el.dataset.index]));
  [...invHotbarEl.children].forEach((el) => fillSlotEl(el, slots[+el.dataset.index], el.dataset.index * 1 + 1 + ''));
  fillSlotEl(heldEl, state.heldStack);
  heldEl.style.display = state.heldStack ? 'flex' : 'none';
  document.getElementById('inv-note').style.display = slots.some(Boolean) || state.heldStack ? 'none' : 'block';
  if (inventoryOpen) renderCrafting();
}

export function showTooltip(id) {
  const def = ITEMS[id];
  tooltipEl.innerHTML = `<b>${def?.name || id}</b>${def && itemHint(def) ? '<br>' + itemHint(def) : ''}`;
  tooltipEl.style.display = 'block';
}

function onSlotClick(i, e) {
  const s = slots[i];
  const max = (id) => ITEMS[id]?.maxStack ?? STACK;
  if (e.button === 0 && e.shiftKey && s && !state.heldStack) {
    // quick move between hotbar and backpack
    const [from, to] = i < HOTBAR_SIZE ? [HOTBAR_SIZE, INVENTORY_SIZE] : [0, HOTBAR_SIZE];
    for (let j = from; j < to && slots[i]; j++) {
      const t = slots[j];
      if (t && t.id === s.id && t.count < max(s.id)) { const n = Math.min(s.count, max(s.id) - t.count); t.count += n; s.count -= n; if (!s.count) slots[i] = null; }
    }
    for (let j = from; j < to && slots[i]; j++) if (!slots[j]) { slots[j] = slots[i]; slots[i] = null; }
  } else if (e.button === 0) {
    if (!state.heldStack) { state.heldStack = s; slots[i] = null; }
    else if (!s) { slots[i] = state.heldStack; state.heldStack = null; }
    else if (s.id === state.heldStack.id) {
      const n = Math.min(state.heldStack.count, max(s.id) - s.count);
      s.count += n; state.heldStack.count -= n;
      if (!state.heldStack.count) state.heldStack = null;
    } else { slots[i] = state.heldStack; state.heldStack = s; }
  } else if (e.button === 2) {
    if (!state.heldStack && s) {
      const half = Math.ceil(s.count / 2);
      state.heldStack = { id: s.id, count: half }; s.count -= half;
      if (!s.count) slots[i] = null;
    } else if (state.heldStack && (!s || (s.id === state.heldStack.id && s.count < max(s.id)))) {
      if (!s) slots[i] = { id: state.heldStack.id, count: 1 }; else s.count++;
      if (!--state.heldStack.count) state.heldStack = null;
    }
  }
  renderInventory();
}

document.addEventListener('mousemove', (e) => {
  heldEl.style.left = e.clientX - 24 + 'px'; heldEl.style.top = e.clientY - 24 + 'px';
  tooltipEl.style.left = e.clientX + 14 + 'px'; tooltipEl.style.top = e.clientY + 14 + 'px';
});

export function selectSlot(i) {
  state.selectedSlot = (i + HOTBAR_SIZE) % HOTBAR_SIZE;
  renderInventory();
  const s = slots[state.selectedSlot];
  if (s) toast(ITEMS[s.id]?.name || s.id);
}

export function setInventoryOpen(open) {
  inventoryOpen = open;
  inventoryEl.style.display = open ? 'block' : 'none';
  tooltipEl.style.display = 'none';
  if (open) {
    for (const k in keys) keys[k] = false;
    mouse.left = mouse.right = false;
    document.exitPointerLock?.();
  } else {
    if (state.heldStack) { const left = addItem(state.heldStack.id, state.heldStack.count); state.heldStack = null; if (left) console.warn('Inventory full, items lost:', left); }
    renderInventory();
    renderer.domElement.requestPointerLock()?.catch?.(() => {});
  }
  renderInventory();
  updateOverlay();
}
renderInventory();
