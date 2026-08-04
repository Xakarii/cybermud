import { builderCommand } from './builder.js';
import { startFire, aimHand, reloadWeapon } from './combat.js';

// Absolute Compass Translation Maps
const COMPASS = {
  n: { dir: 'north', dx: 0, dy: -1 },
  s: { dir: 'south', dx: 0, dy: 1 },
  e: { dir: 'east',  dx: 1, dy: 0 },
  w: { dir: 'west',  dx: -1, dy: 0 },
  ne: { dir: 'northeast', dx: 1,  dy: -1 },
  nw: { dir: 'northwest', dx: -1, dy: -1 },
  se: { dir: 'southeast', dx: 1,  dy: 1  },
  sw: { dir: 'southwest', dx: -1, dy: 1  }
};

// Relative Translation Matrices fixed to map true vector angles
const RELATIVE_STEERING = {
  north:     { ff: [0, -1],  fb:[0, 1],    fl: [-1, 0],  fr: [1, 0]   },
  south:     { ff: [0, 1],   fb:[0, -1],   fl:[1, 0],    fr: [-1, 0]  },  
  east:      { ff: [1, 0],   fb: [-1, 0],  fl: [0, -1],  fr: [0, 1]   },
  west:      { ff: [-1, 0],  fb:[1, 0],    fl:[0, 1],    fr: [0, -1]  },
  northeast: { ff: [1, -1],  fb: [-1, 1],  fl: [-1, -1], fr: [1, 1]   },
  northwest: { ff: [-1, -1], fb:[1, 1],    fl: [1, -1],  fr: [-1, 1]  },
  southeast: { ff: [1, 1],   fb: [-1, -1], fl: [-1, 1],  fr: [1, -1]  },
  southwest: { ff: [-1, 1],  fb:[1, -1],   fl:[1, 1],    fr: [-1, -1]  }
};

export function handleCommand(world, p, line) {
  const parts = line.trim().split(/\s+/);
  const cmd = (parts[0] || '').toLowerCase();
  const arg = parts.slice(1).join(' ');

// ---- 1. MANUAL STOP COMMAND BRAKE ----
  if (cmd === 'stop' || cmd === 'abort' || cmd === 'x') {
    if (p.isNavigating || p.navTarget) {
      p.isNavigating = false;
      p.navTarget = null;
      return world.send(p, `\x1b[31m[NAV] Autopilot brakes locked. Route aborted.\x1b[0m`);
    }
    return world.send(p, `\x1b[33mYou aren't currently navigating anywhere.\x1b[0m`);
  }

  // ---- 2. DYNAMIC COMPASS MOVEMENT & INSTANT VECTOR REROUTING ---
  if (COMPASS[cmd]) {
    const turn = COMPASS[cmd];
    const distanceInput = parseInt(parts, 10);

    // Case A: Long Distance Autopilot Macro (e.g., "ne 10")
    if (!Number.isNaN(distanceInput) && distanceInput > 0) {
      p.queue = []; // Wipe out old queued commands instantly

      const basePointX = p.x;
      const basePointY = p.y;

      const destX = basePointX + (turn.dx * distanceInput);
      const destY = basePointY + (turn.dy * distanceInput);
      
      // Update heading state immediately for ALL directional types
      p.facing = turn.dir;

      p.navTarget = { x: destX, y: destY };
      p.isNavigating = true; 

      world.send(p, `\x1b[35m[NAV] Rerouting immediately! Autopilot vector shifted to: (${destX}, ${destY})...\x1b[0m`);
      return; 
    }

    // Case B: NORMAL MANUAL STEP FALLBACK (e.g., typing just "ne")
    world.queueAction(p, () => {
      // FIX: Force p.facing to ALWAYS update to the step direction, including diagonals!
      if (p.facing !== turn.dir) {
        p.facing = turn.dir;
        world.send(p, `\x1b[36mYou pivot to face ${p.facing}.\x1b[0m`);
      }
      p.navTarget = null;
      p.isNavigating = false;
      world.tryMove(p, turn.dx, turn.dy);
    }, 200);
    return;
  }

  // ---- B) RELATIVE STRUCTURAL MOVEMENT (ff, fb, fl, fr based on current heading) ----
  const currentHeadingMatrix = RELATIVE_STEERING[p.facing || 'north'];
  if (currentHeadingMatrix && currentHeadingMatrix[cmd]) {
    const [dx, dy] = currentHeadingMatrix[cmd];
    const actionLabels = { ff: 'forward', fb: 'backward', fl: 'left', fr: 'right' };
    
    world.queueAction(p, () => {
      // Trigger navigation system if they type "ff" and have a valid coordinate saved
      if (cmd === 'ff' && p.navTarget) {
        p.isNavigating = true;
        world.send(p, `\x1b[35m[NAV] Neural path autopilot engaged toward (${p.navTarget.x}, ${p.navTarget.y})...\x1b[0m`);
        return;
      }

      // Normal manually driven fallback step (Clears navigation target)
      p.navTarget = null;
      p.isNavigating = false;
      world.send(p, `\x1b[36mStepping ${actionLabels[cmd]}...\x1b[0m`);
      world.tryMove(p, dx, dy);
    }, 200);
    return;
  }

  // ---- combat ----
   // ---- disable combat on Hub 'H' tiles ----
  if (cmd === 'ra' || cmd === 'rf' || cmd === 'la' || cmd === 'lf') { 
    // Query the map data beneath the player's feet
    const currentTile = world.tileAt(p.area, p.x, p.y);
    
    if (currentTile && currentTile.glyph === 'H') {
      p.target = null; // Instantly drop tracking locks for safety
      return world.send(p, `\x1b[31m[SAFE ZONE] Neural weapons override active. Firepower de-authorized inside the Safehouse.\x1b[0m`);
    }

  if (cmd === 'ra' || cmd === 'rf') { 
    if (cmd === 'ra' || arg.includes('r')) {
      world.queueAction(p, () => aimHand(world, p, 'rightHand'), p.rightHand?.aimLag || 300);
    }
    if (cmd === 'rf' || arg.includes('f')) {
      world.queueAction(p, () => startFire(world, p, 'rightHand'), p.rightHand?.fireLag || 800);
    }
    return;
  }
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

  // ---- ammunition reloading ----
  if (cmd === 'reload' || cmd === 'r') {
    world.queueAction(p, () => reloadWeapon(world, p, 'rightHand'), 400);
    return;
  }

  // ---- UPDATED TARGET SELECTOR: HANDLES BLOCKS LIKE "target 2 -10" ----
  if (cmd === 'target' || cmd === 't') {
    const area = world.areas.get(p.area);
    if (!arg) return world.send(p, 'Usage: target <name>, target <ID>, target enemy, or target enemy <ID>');

    // Check if the user typed coordinate inputs like "target 2 -10"
    const targetX = parseInt(parts[1], 10);
    const targetY = parseInt(parts[2], 10);

    if (!Number.isNaN(targetX) && !Number.isNaN(targetY)) {
      p.navTarget = { x: targetX, y: targetY };
      p.isNavigating = false; // Arm the waypoint, don't execute yet
      return world.send(p, `\x1b[33mNavigation waypoint locked onto absolute grid: (${targetX}, ${targetY}). Type 'ff' to engage autoplay.\x1b[0m`);
    }
    
    let candidateMobs = [];
    let candidatePlayers = [];

    const subParts = arg.toLowerCase().split(/\s+/);
    let searchLabel = subParts[0];
    let searchNum = parseInt(subParts[0], 10);

    if (!Number.isNaN(searchNum)) {
      searchLabel = ''; 
    } else if (subParts.length > 1) {
      searchNum = parseInt(subParts[1], 10);
    }

    if (area && area.mobs) {
      area.mobs.forEach(m => {
        if (m.hp <= 0) return;
        const distance = Math.max(Math.abs(m.x - p.x), Math.abs(m.y - p.y));
        const isExplicitMobId = (!Number.isNaN(searchNum) && m.mobId === searchNum);
        const isNameMatch = searchLabel && (m.name.toLowerCase().startsWith(searchLabel) || searchLabel === 'enemy');

        if (isExplicitMobId || isNameMatch) {
          candidateMobs.push({ obj: m, dist: distance, explicit: isExplicitMobId });
        }
      });
    }

    world.players.forEach(other => {
      if (other === p || other.area !== p.area || !other.name) return;
      const distance = Math.max(Math.abs(other.x - p.x), Math.abs(other.y - p.y));
      const isPlayerIdMatch = (!Number.isNaN(searchNum) && other.id === searchNum);
      const isPlayerNameMatch = searchLabel && other.name.toLowerCase().startsWith(searchLabel);

      if (isPlayerIdMatch || isPlayerNameMatch) {
        candidatePlayers.push({ obj: other, dist: distance, explicit: isPlayerIdMatch });
      }
    });

    candidateMobs.sort((a, b) => {
      if (a.explicit !== b.explicit) return b.explicit - a.explicit; 
      if (a.dist !== b.dist) return a.dist - b.dist;                 
      return a.obj.mobId - b.obj.mobId;                              
    });

    candidatePlayers.sort((a, b) => {
      if (a.explicit !== b.explicit) return b.explicit - a.explicit;
      return a.dist - b.dist;
    });

    const match = candidateMobs[0] || candidatePlayers[0];

    if (!match) {
      return world.send(p, '\x1b[31mNo matching target in range.\x1b[0m');
    }

    const selected = match.obj;

    if (selected.id === p.id) {
      return world.send(p, '\x1b[31mYour targeting systems cannot lock onto your own signature.\x1b[0m');
    }

    if (p.target === selected.id) {
      const nameLabel = selected.isMob ? `${selected.name} [Enemy: ${selected.mobId}]` : selected.name;
      return world.send(p, `\x1b[33mYou are already targeting ${nameLabel}.\x1b[0m`);
    }

    p.target = selected.id;
    const trackingTag = selected.isMob ? ` [Enemy: ${selected.mobId}]` : '';
    return world.send(p, `\x1b[33mTargeting ${selected.name}${trackingTag}.\x1b[0m`);
  }

  // ---- look / info ----
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