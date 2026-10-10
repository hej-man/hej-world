// Game state that several modules change: the camera, game mode, selection and timers.
// Everything else lives in the module that owns it.
export const state = {
  yaw: 0,
  pitch: -0.25,
  view: 'back',      // 'first' person, camera 'back' behind you, or 'front' looking back at you
  thirdPerson: true, // view isn't 'first'
  camDistIndex: 1,
  gameTime: 0,
  selectedSlot: 0,
  heldStack: null, // stack on the mouse cursor while the inventory is open
  buildShape: 'block',
  buildTilt: 0, // index into TILTS: upright, on its side, upside down
  creative: false,
  burning: 0,
  testMode: false, // lets headless tests act without pointer lock
  useCd: 0,
  currentTarget: null,
  locked: false,
  lanternOn: true,
  spawnFacing: 0,
};
