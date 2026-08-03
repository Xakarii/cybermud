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
    const area = world.areas.get(p.area);
    if (!arg) return world.send(p, 'Usage: target <name>, target enemy, or target enemy <number>');

    let candidateMobs = [];
    let candidatePlayers = [];

    // Parse keywords out of the input argument (e.g., "enemy 2" -> label="enemy", num=2)
    const subParts = arg.toLowerCase().split(/\s+/);
    const searchLabel = subParts[0];
    const searchNum = parseInt(subParts[1], 10);

    // --- Gather Potential Mobs inside the Zone ---
    if (area && area.mobs) {
      area.mobs.forEach(m => {
        if (m.hp <= 0) return;
        
        // Calculate grid distance from player to this mob
        const distance = Math.max(Math.abs(m.x - p.x), Math.abs(m.y - p.y));
        
        // Check structural match rules:
        // A) Exact local mob ID match (e.g., "target enemy 2")
        const isExplicitMobId = (searchLabel === 'enemy' && !Number.isNaN(searchNum) && m.mobId === searchNum);
        // B) General keyword match or partial string starts-with check (e.g., "target enemy" or "target ara")
        const isNameMatch = m.name.toLowerCase().startsWith(searchLabel) || (searchLabel === 'enemy' && Number.isNaN(searchNum));

        if (isExplicitMobId || isNameMatch) {
          candidateMobs.push({ obj: m, dist: distance, explicit: isExplicitMobId });
        }
      });
    }

    // --- Gather Potential Human Players inside the Zone ---
    world.players.forEach(other => {
      if (other === p || other.area !== p.area || !other.name) return;
      const distance = Math.max(Math.abs(other.x - p.x), Math.abs(other.y - p.y));
      
      if (other.name.toLowerCase().startsWith(searchLabel)) {
        candidatePlayers.push({ obj: other, dist: distance, explicit: false });
      }
    });

    // --- Sorting Strategy Execution ---
    // Prioritize explicit target configurations first, then closest distance, then lowest ID numbers
    candidateMobs.sort((a, b) => {
      if (a.explicit !== b.explicit) return b.explicit - a.explicit; // Explicit first
      if (a.dist !== b.dist) return a.dist - b.dist;                 // Closest distance first
      return a.obj.mobId - b.obj.mobId;                              // Lowest local ID tie-breaker
    });

    candidatePlayers.sort((a, b) => a.dist - b.dist);

    // Pick the optimal selection (mobs get combat preference over players)
    const match = candidateMobs[0] || candidatePlayers[0];

    if (!match) {
      return world.send(p, '\x1b[31mNo matching target in range.\x1b[0m');
    }

    const selected = match.obj;

    // Self-Targeting Shield Protection
    if (selected.id === p.id) {
      return world.send(p, '\x1b[31mYour targeting systems cannot lock onto your own signature.\x1b[0m');
    }

    // Already Targeted Check
    if (p.target === selected.id) {
      const nameLabel = selected.isMob ? `${selected.name} [Enemy: ${selected.mobId}]` : selected.name;
      return world.send(p, `\x1b[33mYou are already targeting ${nameLabel}.\x1b[0m`);
    }

    // Bind Core Lock
    p.target = selected.id;
    const trackingTag = selected.isMob ? ` [Enemy: ${selected.mobId}]` : '';
    return world.send(p, `\x1b[33mTargeting ${selected.name}${trackingTag}.\x1b[0m`);
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