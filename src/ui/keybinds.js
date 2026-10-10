// ---------------------------------------------------------------------------
// Key bindings: every action has up to two keys, which you can change in Settings > Keys. They're
// kept in this browser (localStorage). Hotbar keys 1-9 and Esc (pause) are fixed.
// ---------------------------------------------------------------------------
export const ACTIONS = [
  { id: 'forward', name: 'Move forward', keys: ['KeyW', 'ArrowUp'] },
  { id: 'back', name: 'Move back', keys: ['KeyS', 'ArrowDown'] },
  { id: 'left', name: 'Move left', keys: ['KeyA', 'ArrowLeft'] },
  { id: 'right', name: 'Move right', keys: ['KeyD', 'ArrowRight'] },
  { id: 'jump', name: 'Jump · swim up · fly up', keys: ['Space'] },
  { id: 'sprint', name: 'Sprint · dive · fly down', keys: ['ShiftLeft', 'ShiftRight'] },
  { id: 'inventory', name: 'Backpack', keys: ['KeyE', 'KeyI'] },
  { id: 'crafting', name: 'Crafting', keys: ['KeyC'] },
  { id: 'view', name: 'Change view (first person, behind, in front)', keys: ['Tab', 'KeyV'] },
  { id: 'camDist', name: 'Camera distance', keys: ['KeyZ'] },
  { id: 'shape', name: 'Building shape', keys: ['KeyB'] },
  { id: 'tilt', name: 'Tip blocks over', keys: ['KeyT'] },
  { id: 'lantern', name: 'Lantern', keys: ['KeyF'] },
  { id: 'creative', name: 'Creative mode on / off', keys: ['KeyG'] },
  { id: 'weather', name: 'Change the weather (creative)', keys: ['KeyK'] },
  { id: 'sound', name: 'Sound on / off', keys: ['KeyM'] },
  { id: 'respawn', name: 'Respawn', keys: ['KeyR'] },
];
const STORE = 'terrain-world-keys';
export const binds = {};   // action id -> [code, code]
export function resetBinds() { for (const a of ACTIONS) binds[a.id] = [...a.keys]; saveBinds(); }
function saveBinds() { try { localStorage.setItem(STORE, JSON.stringify(binds)); } catch { /* private window: just not kept */ } }
function loadBinds() {
  for (const a of ACTIONS) binds[a.id] = [...a.keys];
  try {
    const saved = JSON.parse(localStorage.getItem(STORE) || 'null');
    if (saved) for (const a of ACTIONS) if (Array.isArray(saved[a.id])) binds[a.id] = saved[a.id].filter((c) => typeof c === 'string').slice(0, 2);
  } catch { /* nothing saved, or storage blocked */ }
}
loadBinds();

// Sets one of an action's two keys; a key can only do one thing, so it's taken off any other action.
export function setBind(id, slot, code) {
  if (code) for (const a of ACTIONS) binds[a.id] = binds[a.id].filter((c) => c !== code);
  const list = binds[id];
  if (code) list[slot] = code; else list.splice(slot, 1);
  binds[id] = list.filter(Boolean);
  saveBinds();
}

// The action a key does, or null.
export function actionOf(code) {
  for (const a of ACTIONS) if (binds[a.id].includes(code)) return a.id;
  return null;
}
// Is an action's key held down? (`keys` holds the pressed key codes.)
export const held = (keys, id) => binds[id].some((c) => keys[c]);

// A short readable name for a key code.
export function keyName(code) {
  if (!code) return '–';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return 'Num ' + code.slice(6);
  const names = { ShiftLeft: 'Shift', ShiftRight: 'Right Shift', ControlLeft: 'Ctrl', ControlRight: 'Right Ctrl', AltLeft: 'Alt', AltRight: 'Right Alt',
    ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Space: 'Space', Tab: 'Tab', Enter: 'Enter', Backspace: 'Backspace', CapsLock: 'Caps Lock',
    MetaLeft: 'Cmd', MetaRight: 'Right Cmd', Backquote: '`', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Semicolon: ';', Quote: "'",
    Backslash: '\\', Comma: ',', Period: '.', Slash: '/' };
  return names[code] || code;
}
export const kbd = (id) => binds[id].map((c) => `<kbd>${keyName(c)}</kbd>`).join(' ') || '<kbd>–</kbd>';
