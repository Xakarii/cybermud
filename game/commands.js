import { builderCommand } from './builder.js';
import { startFire, aimHand, reloadWeapon } from './combat.js';

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

  
  // ---- NEW: RELOAD INPUT ASSIGNMENTS ----
  if (cmd === 'reload' || cmd === 'r') {
    world.queueAction(p, () => reloadWeapon(world, p, 'rightHand'), 400);
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
    if (!arg) return world.send(p, 'Usage: target <name>, target <ID>, target enemy, or target enemy <ID>');

    let candidateMobs = [];
    let candidatePlayers = [];

    // Cleanly split our arguments array up
    const subParts = arg.toLowerCase().split(/\s+/);
    
    // SMART ARGUMENT PARSING:
    // Case A: User typed a single number like "t 1" -> searchNum = 1, searchLabel = "enemy" (or blank)
    // Case B: User typed "t enemy 1" -> searchLabel = "enemy", searchNum = 1
    // Case C: User typed a string like "t ara" -> searchLabel = "ara", searchNum = NaN
    let searchLabel = subParts[0];
    let searchNum = parseInt(subParts[0], 10);

    // If the first argument typed was actually a standalone number (e.g., "t 1")
    if (!Number.isNaN(searchNum)) {
      searchLabel = ''; // Clear label so it doesn't try to string-match the name to "1"
    } else if (subParts.length > 1) {
      // If they typed two words (e.g., "enemy 1"), grab the second word as the target number
      searchNum = parseInt(subParts[1], 10);
    }

    // --- Gather Potential Mobs inside the Zone ---
    if (area && area.mobs) {
      area.mobs.forEach(m => {
        if (m.hp <= 0) return;
        
        // Calculate grid distance from player to this mob index space
        const distance = Math.max(Math.abs(m.x - p.x), Math.abs(m.y - p.y));
        
        // Determine matching rules:
        // A) Explicit numeric local mob ID match (Matches "t 1" or "t enemy 1")
        const isExplicitMobId = (!Number.isNaN(searchNum) && m.mobId === searchNum);
        
        // B) Keyword or partial text string match (Matches "t ara" or "t enemy")
        const isNameMatch = searchLabel && (m.name.toLowerCase().startsWith(searchLabel) || searchLabel === 'enemy');

        if (isExplicitMobId || isNameMatch) {
          candidateMobs.push({ obj: m, dist: distance, explicit: isExplicitMobId });
        }
      });
    }

    // --- Gather Potential Human Players inside the Zone ---
    world.players.forEach(other => {
      if (other === p || other.area !== p.area || !other.name) return;
      const distance = Math.max(Math.abs(other.x - p.x), Math.abs(other.y - p.y));
      
      // Allow targeting players by global system ID number (e.g. "t 1") or partial handle name string strings
      const isPlayerIdMatch = (!Number.isNaN(searchNum) && other.id === searchNum);
      const isPlayerNameMatch = searchLabel && other.name.toLowerCase().startsWith(searchLabel);

      if (isPlayerIdMatch || isPlayerNameMatch) {
        candidatePlayers.push({ obj: other, dist: distance, explicit: isPlayerIdMatch });
      }
    });

    // --- Sorting Priority Loop ---
    // 1. Explicit ID matches go first
    // 2. Closest distance goes second
    // 3. Lowest local ID number acts as the ultimate tie-breaker metrics
    candidateMobs.sort((a, b) => {
      if (a.explicit !== b.explicit) return b.explicit - a.explicit; 
      if (a.dist !== b.dist) return a.dist - b.dist;                 
      return a.obj.mobId - b.obj.mobId;                              
    });

    candidatePlayers.sort((a, b) => {
      if (a.explicit !== b.explicit) return b.explicit - a.explicit;
      return a.dist - b.dist;
    });

    // Mobs automatically take targeting priority over players if both match up
    const match = candidateMobs[0] || candidatePlayers[0];

    if (!match) {
      return world.send(p, '\x1b[31mNo matching target in range.\x1b[0m');
    }

    const selected = match.obj;

    // Self-Targeting Shield Protection Guard check
    if (selected.id === p.id) {
      return world.send(p, '\x1b[31mYour targeting systems cannot lock onto your own signature.\x1b[0m');
    }

    // Already Targeted Notification Notice Validation
    if (p.target === selected.id) {
      const nameLabel = selected.isMob ? `${selected.name} [Enemy: ${selected.mobId}]` : selected.selected.name;
      return world.send(p, `\x1b[33mYou are already targeting ${nameLabel}.\x1b[0m`);
    }

    // Apply Core Selection Lock Registry
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

