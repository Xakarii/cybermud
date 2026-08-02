import { startFire, aimHand } from './combat.js';
import { builderCommand } from './builder.js';

// short aliases in the God Wars II spirit
const MOVE = {
  ff: [0, -1],  // feet forward (north)
  fb: [0, 1],   // feet back (south)
  fl: [-1, 0],  // feet left (west)
  fr: [1,0],   // feet right (east)
  n: [0, -1], s: [0, 1], w: [-1, 0], e: [1, 0],
};

export function handleCommand(world, p, line) {
  const parts = line.trim().split(/\s+/);
  const cmd = (parts[0] || '').toLowerCase();
  const arg = parts.slice(1).join(' ');

  // ---- movement (short lag) ----
  if (MOVE[cmd]) {
    const [dx, dy] = MOVE[cmd];
    world.queueAction(p, () => world.tryMove(p, dx, dy), 200);
    return;
  }

  // ---- combat ----
  if (cmd === 'ra' || cmd === 'rf') { 
    // Handle "ra rf" (aim + fire) or just "ra" (aim)
    if (cmd === 'ra' || arg.includes('r')) {
      world.queueAction(p, () => aimHand(world, p, 'rightHand'), p.rightHand?.aimLag || 300);
    }
    // Handle "ra rf" (aim + fire) or just "rf" (fire directly)
    if (cmd === 'rf' || arg.includes('f')) {
      world.queueAction(p, () => startFire(world, p, 'rightHand'), p.rightHand?.fireLag || 800);
    }
    return;
  }

  if (cmd === 'la' || cmd === 'lf') {
    if (cmd === 'la' || arg.includes('l')) {
      world.queueAction(p, () => aimHand(world, p, 'leftHand'), p.leftHand?.aimLag || 300);
    }
    if (cmd === 'lf' || arg.includes('f')) {
      world.queueAction(p, () => startFire(world, p, 'leftHand'), p.leftHand?.fireLag || 800);
    }
    return;
  }

  if (cmd === 'target' || cmd === 't') {
    const tgt = [...world.players].find(o => o !== p && o.area === p.area && o.name?.toLowerCase() === arg.toLowerCase());
    if (!tgt) return world.send(p, '\x1b[31mNo such target in range.\x1b[0m');
    p.target = tgt.id;
    return world.send(p, `\x1b[33mTargeting ${tgt.name}.\x1b[0m`);
  }

  // ---- look / info (no lag, immediate) ----
  if (cmd === 'look' || cmd === 'l') { p.dirty = true; return; }
  
  if (cmd === 'say') {
    world.broadcastArea(p.area, p.x, p.y, `\x1b[36m${p.name} says: ${arg}\x1b[0m`);
    return world.send(p, `\x1b[36mYou say: ${arg}\x1b[0m`);
  }
  
  if (cmd === 'who') {
    const names = [...world.players].filter(x => x.name).map(x => x.name).join(', ');
    return world.send(p, `Online: ${names}`);
  }
  
  if (cmd === 'help') return world.send(p, HELP);

  // ---- admin / builder ----
  if (cmd === '@' || cmd.startsWith('@')) {
    if (!p.admin) return world.send(p, '\x1b[31mAccess denied.\x1b[0m');
    return builderCommand(world, p, line.slice(1).trim());
  }

  world.send(p, `\x1b[31mUnknown command: ${cmd}\x1b[0m`);
} // <--- handleCommand function cleanly ends here now!

const HELP = `\x1b[36m== COMMANDS ==\x1b[0m
Movement: ff fb fl fr  (or n s e w)
Combat:   target <name>  |  ra rf (aim+fire right)  |  la lf (aim+fire left)
Social:   say <msg>  who  look
Builder:  @dig <glyph> <name>   @desc <text>   @wall   @clear
          @teleport <x> <y>     @save`;



/*  Old commands.js
import { startFire, aimHand } from './combat.js';
import { builderCommand } from './builder.js';
// short aliases in the God Wars II spirit
const MOVE = {
  ff: [0, -1],  // feet forward (north)
  fb: [0, 1],   // feet back (south)
  fl: [-1, 0],  // feet left (west)
  fr: [1, 0],   // feet right (east)
  n: [0, -1], s: [0, 1], w: [-1, 0], e: [1, 0],
};
export function handleCommand(world, p, line) {
  const parts = line.trim().split(/\s+/);
  const cmd = (parts[0] || '').toLowerCase();
  const arg = parts.slice(1).join(' ');
  // ---- movement (short lag) ----
  if (MOVE[cmd]) {
    const [dx, dy] = MOVE[cmd];
    world.queueAction(p, () => world.tryMove(p, dx, dy), 200);
    return;
  }
  // ---- combat ----
  if (cmd === 'ra') { // e.g. "ra rf" -> aim then fire right hand
    // support chained sub-actions: "ra rf" queues aim + fire
    if (arg.includes('r')) world.queueAction(p, () => aimHand(world, p, 'rightHand'), p.rightHand?.aimLag || 300);
    if (arg.includes('f')) world.queueAction(p, () => startFire(world, p, 'rightHand'), p.rightHand?.fireLag || 800);
    return;
  }
  if (cmd === 'la') {
    if (arg.includes('l')) world.queueAction(p, () => aimHand(world, p, 'leftHand'), p.leftHand?.aimLag || 300);
    if (arg.includes('f')) world.queueAction(p, () => startFire(world, p, 'leftHand'), p.leftHand?.fireLag || 800);
    return;
  }
  if (cmd === 'target' || cmd === 't') {
    const tgt = [...world.players].find(o => o !== p && o.area === p.area && o.name?.toLowerCase() === arg.toLowerCase());
    if (!tgt) return world.send(p, '\x1b[31mNo such target in range.\x1b[0m');
    p.target = tgt.id;
    return world.send(p, `\x1b[33mTargeting ${tgt.name}.\x1b[0m`);
  }
  // ---- look / info (no lag, immediate) ----
  if (cmd === 'look' || cmd === 'l') { p.dirty = true; return; }
  if (cmd === 'say') {
    world.broadcastArea(p.area, p.x, p.y, `\x1b[36m${p.name} says: ${arg}\x1b[0m`);
    return world.send(p, `\x1b[36mYou say: ${arg}\x1b[0m`);
  }
  if (cmd === 'who') {
    const names = [...world.players].filter(x => x.name).map(x => x.name).join(', ');
    return world.send(p, `Online: ${names}`);
  }
  if (cmd === 'help') return world.send(p, HELP);
  // ---- admin / builder ----
  if (cmd === '@' || cmd.startsWith('@')) {
    if (!p.admin) return world.send(p, '\x1b[31mAccess denied.\x1b[0m');
    return builderCommand(world, p, line.slice(1).trim());
  }
  world.send(p, `\x1b[31mUnknown command: ${cmd}\x1b[0m`);
}
//new commands
// ---- combat ----
  if (cmd === 'ra' || cmd === 'rf') { 
    // Handle "ra rf" (aim + fire) or just "ra" (aim)
    if (cmd === 'ra' || arg.includes('r')) {
      world.queueAction(p, () => aimHand(world, p, 'rightHand'), p.rightHand?.aimLag || 300);
    }
    // Handle "ra rf" (aim + fire) or just "rf" (fire directly)
    if (cmd === 'rf' || arg.includes('f')) {
      world.queueAction(p, () => startFire(world, p, 'rightHand'), p.rightHand?.fireLag || 800);
    }
    return;
  }

  if (cmd === 'la' || cmd === 'lf') {
    if (cmd === 'la' || arg.includes('l')) {
      world.queueAction(p, () => aimHand(world, p, 'leftHand'), p.leftHand?.aimLag || 300);
    }
    if (cmd === 'lf' || arg.includes('f')) {
      world.queueAction(p, () => startFire(world, p, 'leftHand'), p.leftHand?.fireLag || 800);
    }
    return;
  }


//end new commands



const HELP = `\x1b[36m== COMMANDS ==\x1b[0m
Movement: ff fb fl fr  (or n s e w)
Combat:   target <name>  |  ra rf (aim+fire right)  |  la lf (aim+fire left)
Social:   say <msg>  who  look
Builder:  @dig <glyph> <name>   @desc <text>   @wall   @clear
          @teleport <x> <y>     @save`;


*/