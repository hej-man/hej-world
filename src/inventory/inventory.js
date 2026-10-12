import { state } from '../state.js';
import { renderer } from '../render/scene.js';
import { itemCategory, itemHint, renderCrafting, CATEGORIES } from './items.js';
import { mouse } from '../player/interaction.js';
import { toast } from '../ui/hud.js';
import { updateOverlay } from '../ui/menu.js';
import { keys } from '../ui/input.js';
import { MAX_HEALTH, stats } from '../player/survival.js';
import { blockIcon, hasBlockIcon } from '../world/blocks.js';
import { drawnIcon, iconSpec } from './icons.js';

// ---------------------------------------------------------------------------
// Inventory + hotbar (items get registered later with game.registerItem)
// ---------------------------------------------------------------------------
const HOTBAR_SIZE = 9, INVENTORY_SIZE = 36; // slots 0-8 are the hotbar, 9-35 the backpack
export const STACK = 100; // how many of one item fit in a slot (tools and armour: 1)
export const ITEMS = {};                            // id -> { id, name, icon (emoji) or color, maxStack }
export const slots = new Array(INVENTORY_SIZE).fill(null); // each slot: null or { id, count }


export let inventoryOpen = false;
export let inventoryTab = 'bag';   // 'bag', 'craft' or 'items' (creative)

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
  const spec = iconSpec(def);
  if (spec) el.insertAdjacentHTML('beforeend', `<span class="swatch cube" style="background-image:url(${drawnIcon(spec)})"></span>`);
  else if (def.icon) el.insertAdjacentHTML('beforeend', `<span>${def.icon}</span>`);
  else if (def.block) {
    const url = hasBlockIcon(def.place) ? blockIcon(def.place) : (queueIcon(def.place), '');
    el.insertAdjacentHTML('beforeend', `<span class="swatch cube" data-cube="${def.place}"${url ? ` style="background-image:url(${url})"` : ''}></span>`);
  } else el.insertAdjacentHTML('beforeend', `<span class="swatch${def.flat ? ' flat' : ''}" style="background:${def.color || '#999'}"></span>`);
  if (def.badge && !spec) el.insertAdjacentHTML('beforeend', `<span class="badge" style="background:${def.badge}"></span>`);
  if (stack.count > 1) el.insertAdjacentHTML('beforeend', `<span class="count">${stack.count}</span>`);
  el.dataset.name = def.name;
}

// Block pictures take a moment to draw, so they're drawn a few at a time after the slots are
// shown (the creative item list shows hundreds at once) and filled in as they're ready.
const iconQueue = new Set();
function queueIcon(type) {
  if (!iconQueue.size) setTimeout(drawQueuedIcons, 0);
  iconQueue.add(type);
}
function drawQueuedIcons() {
  const until = performance.now() + 10;
  for (const type of iconQueue) {
    iconQueue.delete(type);
    const url = blockIcon(type);
    for (const el of document.querySelectorAll(`[data-cube="${type}"]`)) el.style.backgroundImage = `url(${url})`;
    if (performance.now() > until) break;
  }
  if (iconQueue.size) setTimeout(drawQueuedIcons, 0);
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
  if (inventoryOpen) { renderCrafting(); renderYou(); }
}

export function showTooltip(id) {
  const def = ITEMS[id];
  tooltipEl.innerHTML = `<b>${def?.name || id}</b>${def && itemHint(def) ? '<br>' + itemHint(def) : ''}`;
  tooltipEl.style.display = 'block';
  showItemInfo(id);
}
// The backpack page's side panel: what you're wearing, and the item under the mouse (or in your hand).
const infoEl = document.getElementById('item-info');
function showItemInfo(id) {
  const def = ITEMS[id];
  if (!def) { infoEl.innerHTML = '<span style="opacity:0.6">Point at an item to see what it is for.</span>'; return; }
  const cat = CATEGORIES.find(([k]) => k === itemCategory(def))?.[1] || '';
  infoEl.innerHTML = `<b>${def.icon ? def.icon + ' ' : ''}${def.name}</b><br><span style="opacity:0.6">${cat} · stacks to ${def.maxStack}</span><br>${itemHint(def)}`;
}
function renderYou() {
  document.getElementById('you').innerHTML = state.creative ? 'Creative mode: nothing can hurt you, and every item is on the All items page.' :
    `Health ${Math.ceil(stats.health)} / ${MAX_HEALTH} · hunger ${Math.round(stats.hunger)} · thirst ${Math.round(stats.thirst)}<br>` +
    `Armour: ${stats.armour ? `${Math.round(stats.armour * 100)}% less damage` : 'none'}` +
    (stats.sick > 0 ? `<br><span style="color:#c9e07a">Sick from dirty water (${Math.ceil(stats.sick)} s)</span>` : '');
  const s = slots[state.selectedSlot];
  if (inventoryTab === 'bag' && tooltipEl.style.display !== 'block') showItemInfo(s?.id);
}

// Sorts the backpack (not the hotbar): by kind, then name, merging part stacks.
export function sortBackpack() {
  const items = new Map();
  for (let i = HOTBAR_SIZE; i < INVENTORY_SIZE; i++) if (slots[i]) { items.set(slots[i].id, (items.get(slots[i].id) || 0) + slots[i].count); slots[i] = null; }
  const order = CATEGORIES.map(([k]) => k);
  const ids = [...items.keys()].sort((a, b) => order.indexOf(itemCategory(ITEMS[a])) - order.indexOf(itemCategory(ITEMS[b])) || ITEMS[a].name.localeCompare(ITEMS[b].name));
  let i = HOTBAR_SIZE;
  for (const id of ids) {
    let n = items.get(id);
    while (n > 0 && i < INVENTORY_SIZE) { const k = Math.min(n, ITEMS[id].maxStack); slots[i++] = { id, count: k }; n -= k; }
    if (n > 0) addItem(id, n); // can't happen: sorting never needs more room
  }
  renderInventory();
}
document.getElementById('btn-sort').addEventListener('click', sortBackpack);

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

export function setInventoryTab(tab) {
  if (tab === 'items' && !state.creative) tab = 'craft';
  inventoryTab = tab;
  for (const b of document.querySelectorAll('.inv-tabs button')) {
    b.classList.toggle('on', b.dataset.tab === tab);
    b.style.display = b.dataset.tab === 'items' && !state.creative ? 'none' : '';
  }
  for (const p of document.querySelectorAll('.inv-page')) p.classList.toggle('on', p.id === `page-${tab}`);
  tooltipEl.style.display = 'none';
  renderInventory();
}
for (const b of document.querySelectorAll('.inv-tabs button')) b.addEventListener('mousedown', (e) => { e.preventDefault(); setInventoryTab(b.dataset.tab); });

// Opens or closes the inventory; `tab` picks the page it opens on (default: the last one used, and
// in creative the item list).
export function setInventoryOpen(open, tab) {
  inventoryOpen = open;
  if (open) setInventoryTab(tab || inventoryTab);
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
