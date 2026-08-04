import fs from 'fs';
import path from 'path';
import { MAPS } from './maps.js';

let nextId = 1;
export class World {
  constructor() {
    this.areas = new Map();   // name -> area object
    this.players = new Set(); // active player objects
  }
  loadAreas(dir) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    for (const file of fs.readdirSync(dir)) {
      if (!file.endsWith('.json')) continue;
      const area = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
      area._file = path.join(dir, file);
      this.areas.set(area.name, area);
    }
    if (this.areas.size === 0) this._makeDefaultArea(dir);
  }

   _makeDefaultArea(dir) {
    const mapBlueprint = MAPS.downtown;
    
    const area = {
      name: mapBlueprint.name,
      width: mapBlueprint.grid[0].length, // Automatically grabs width from string length
      height: mapBlueprint.grid.length,    // Automatically grabs height from array length
      _file: path.join(dir, 'downtown.json'),
      tiles: {},
      mobs: []
    };

    // Cycle through rows (Y axis) and columns (X axis) to convert the visual text grid
    for (let y = 0; y < area.height; y++) {
      for (let x = 0; x < area.width; x++) {
        const glyph = mapBlueprint.grid[y][x];
        const template = mapBlueprint.legend[glyph] || { name: 'Void', desc: 'Empty space.', blocked: true };
        
        // Match your engine's exact "x,y" string dictionary key data blueprint style
        area.tiles[`${x},${y}`] = {
          glyph: glyph,
          name: template.name,
          desc: template.desc,
          blocked: template.blocked
        };
      }
    }

    this.areas.set(area.name, area);
    this.saveArea(area);
  }
saveArea(area) {
    // FIXED SERIALIZATION: Exclude both _file path strings, runtime mobs, AND old counters from being written to disk!
    const { _file, mobs, _nextMobId, ...clean } = area;
    
    // Explicitly enforce that the saved JSON data file always remains clean
    clean.mobs = [];
    
    fs.writeFileSync(area._file, JSON.stringify(clean, null, 2));
  }

  // ---- players ----
  createPlayer(ws) {
    const p = {
      id: nextId++, ws, name: null, admin: false,
      area: 'downtown', x: 2, y: 2,
      hp: 100, maxHp: 100,
      rightHand: { 
        name: 'Rusty old pistol', 
        dmg:[2,10], 
        aimLag: 300, 
        fireLag: 800, 
        aimed: false, 
        ammo: 6,        // Loaded inside the active clip magazine
        maxAmmo: 6,     // Maximum clip capability
        reserveAmmo: 24 // Spare ammunition carried in reserve pockets
      },
      leftHand: null,
      queue: [], nextActionTime: 0, target: null, dirty: false,
      lastEncounterTime: 0,
      facing: 'north', // <--- INITIAL COMPASS ORIENTATION
      navTarget: null, // Will hold { x: X, y: Y } when active
      isNavigating: false
    };  
    this.players.add(p);
    return p;
  }

  // ---- random enemy encounters ----
  spawnEncounter(p, x, y) {
    const area = this.areas.get(p.area);
    if (!area) return;

    if (!area.mobs) area.mobs = [];

    // ---- DYNAMIC LOWEST ID CALCULATION ----
    const activeMobIds = new Set(
      area.mobs.filter(m => m.hp > 0).map(m => m.mobId)
    );

    let assignedMobId = 1;
    while (activeMobIds.has(assignedMobId)) {
      assignedMobId++;
    }

    // Determine an adjacent spawn tile so they never drop straight onto your coordinate grid
    let spawnX = p.x + 1;
    let spawnY = p.y;
    const testTile = this.tileAt(p.area, spawnX, spawnY);
    if (!testTile || testTile.blocked) {
      spawnX = p.x;
      spawnY = p.y;
    }

    // ---- GENERALIZED ENEMY CONSTRUCTOR BLOCK ----
    const enemy = {
      id: nextId++, 
      mobId: assignedMobId, 
      isMob: true,
      name: 'Rogue AI Drone',
      area: p.area,
      x: spawnX, 
      y: spawnY,
      hp: 35,
      maxHp: 35,
      damage: (4, 10), // <-- SWAP THESE PARENTHESIS TO SQUARE BRACKETS IN YOUR WRITER!
      range: 3,
      nextActionTime: Date.now() + 1000,
      facing: 'south',
      hasAlertedTracking: false,
      attackAction: 'whirs loudly and shoots you',
      obstacleSound: 'clicking thrusters around the corner'
    };

    area.mobs.push(enemy);

    this.send(p, `\x1b[31m[WARNING] A ${enemy.name} drops from a neon billboard, weapons armed!\x1b[0m`);
    
    p.target = enemy.id;
    this.send(p, `\x1b[33mTarget locked onto ${enemy.name} [Enemy: ${enemy.mobId}].\x1b[0m`);

    p.dirty = true;
  }
  spawnPlayer(p) {
    this.send(p, `\x1b[32mWelcome to Night City, ${p.name}.${p.admin ? ' [BUILDER MODE]' : ''}\x1b[0m`);
    p.dirty = true;
    
    // Broadcast a narrative message to everyone else in the area
    this.broadcastArea(p.area, p.x, p.y, `\x1b[33m[NET] ${p.name} has jacked into the grid.\x1b[0m`, p);
    
    // Force everyone else's map viewport to update immediately so they see the new player symbol!
    for (const other of this.players) {
      if (other.area === p.area && other !== p) {
        other.dirty = true;
      }
    }
  }

  removePlayer(p) { this.players.delete(p); }
  send(p, text) {
    if (p.ws.readyState === 1) p.ws.send(JSON.stringify({ type: 'text', text }));
  }

  broadcastArea(area, x, y, text, except) {
    for (const p of this.players)
      if (p.area === area && p !== except) this.send(p, text);
  }

  // ---- action queue with per-action lag ----
  queueAction(p, fn, lag) {
    p.queue.push({ fn, lag });
  }

  processQueue(p, now) {
    if (now < p.nextActionTime) return;      // still lagged from last action
    const act = p.queue.shift();
    if (!act) return;
    act.fn();                                 // execute the action
    p.nextActionTime = now + act.lag;         // apply this action's delay
  }

  // ---- movement ----
  tileAt(areaName, x, y) {
    const area = this.areas.get(areaName);
    if (!area || x < 0 || y < 0 || x >= area.width || y >= area.height) return null;
    return area.tiles[`${x},${y}`] || null;
  }

  tryMove(p, dx, dy) {
    const nx = p.x + dx, ny = p.y + dy;
    const t = this.tileAt(p.area, nx, ny);
    if (!t) { this.send(p, '\x1b[31mThe grid ends here.\x1b[0m'); return; }
    if (t.blocked) { this.send(p, '\x1b[31mSomething solid blocks the way.\x1b[0m'); return; }
    
        // --- ADD SAFETY INITIALIZATION GUARD SHIELD ---
    if (!p.trail) {
      p.trail = []; 
    }
    // --- ADD BREADCRUMB BEFORE CHANGING POSITION ---
    p.trail.push({ x: p.x, y: p.y });
    if (p.trail.length > 15) {
      p.trail.shift(); // Keep only the last 6 steps to prevent infinite memory growth
    }
    p.x = nx; p.y = ny;
    p.dirty = true;

    // --- New paced ENCOUNTER TRIGGER HOOK ---
    if (t.glyph === ',') {
      const area = this.areas.get(p.area);
      const now = Date.now();

      // Look up what tile the player is standing on right now after the move step
      const currentTile = this.tileAt(p.area, p.x, p.y);
      
      // SAFEGUARD: If the player managed to step onto a Safehouse tile ('H'), do not allow a drone roll!
      if (currentTile && currentTile.glyph === 'H') {
        return;
      }
      
      // 1. Gather all active hostiles in the zone
      const activeMobs = (area.mobs || []).filter(m => m.hp > 0);
      // 2. Map-level safety guard: Cap total cluster spawns at 4 so the grid stays playable
      const areaIsTooCrowded = activeMobs.length >= 4;
      // 3. Pacing check: Ensure at least 3 seconds have passed since this player's last ambush
      const isInsideBreatherWindow = (now - (p.lastEncounterTime || 0)) < 3000;
      
      // 4. Local tile check: Don't spawn a drone if one is already standing on your target coordinate
      const droneOnTile = activeMobs.some(m => m.x === nx && m.y === ny);
      
      // Roll the dice (6% chance) only if all spatial and pacing criteria pass
      if (!droneOnTile && !areaIsTooCrowded && !isInsideBreatherWindow && Math.random() < 0.06) {
        // Lock the timestamp before spawning so the clock starts ticking instantly
        p.lastEncounterTime = now;
        this.spawnEncounter(p, nx, ny);
      }
    }

  }


  // ---- ASCII viewport render with Multi-Line Stacked HUD ----
  sendView(p) {
    const area = this.areas.get(p.area);
    if (!area) return;

    const R = 5; // radius -> 11x11 viewport
    let rows = [];

    for (let y = p.y - R; y <= p.y + R; y++) {
      let row = '';
      for (let x = p.x - R; x <= p.x + R; x++) {
        
        // 1. Check ALL entities present on this specific grid tile
        const isMe = (x === p.x && y === p.y);
        const otherPlayer = [...this.players].find(o => o.area === p.area && o.x === x && o.y === y && o !== p && o.name);
        const activeMob = (area.mobs || []).find(m => m.x === x && m.y === y && m.hp > 0);

        // 2. Strict Stacking Priority Matrix
        if (isMe) { 
          row += '\x1b[93m@\x1b[0m'; 
        } else if (activeMob) { 
          row += '\x1b[38;5;196mD\x1b[0m'; // Red 'D' for Drone
        } else if (otherPlayer) { 
          row += '\x1b[91mP\x1b[0m';        // Red 'P' for Player
        } else {
          const t = area.tiles[`${x},${y}`];
          row += t ? this._glyphColor(t.glyph) : ' ';
        }
      }
      rows.push(row);
    }

    const here = area.tiles[`${p.x},${p.y}`];
    
    // 3. Shared Occupancy Status Header
    const localMobs = (area.mobs || []).filter(m => m.x === p.x && m.y === p.y && m.hp > 0);
    const mobLabels = localMobs.map(m => `${m.name}(ID:${m.mobId})`).join(', ');
    const enemyStatusText = mobLabels ? ` | HOSTILE: ${mobLabels}` : '';

    const otherPlayersHere = [...this.players].filter(o => o.area === p.area && o.x === p.x && o.y === p.y && o !== p && o.name);
    const playerLabels = otherPlayersHere.map(o => o.name).join(', ');
    const playerStatusText = playerLabels ? ` | Runners: ${playerLabels}` : '';

    // Merge map array strings into the grid block
    const mapGridText = rows.join('\n');
    
    // Check if player's active firearm slot processes ammo resource values
    const rGun = p.rightHand;
    const hasAmmo = rGun && rGun.ammo !== undefined;
    const ammoHudText = hasAmmo ? `AMMO: ${rGun.ammo}/${rGun.maxAmmo} (Reserve: ${rGun.reserveAmmo})` : '';

    // Map your full internal string variables to tight, clear panel icons
    const facingIcons = {
      north: 'N', south: 'S', east: 'E', west: 'W',
      n: 'N', s: 'S', e: 'E', w: 'W',
      northeast: 'NE', northwest: 'NW', southeast: 'SE', southwest: 'SW',
      ne: 'NE', nw: 'NW', se: 'SE', sw: 'SW'
    };
    const compassIcon = facingIcons[p.facing || 'north'] || 'N';

    // ---- VERTICALLY STACKED CYBERDECK METRICS INFOBAR ----
    // Line 1: Coordinates and Current Facing Vector (Crucial for client.js match trigger)
    const line1Nav = `(${p.x},${p.y}) facing: [${compassIcon}]`;
    
    // Line 2: Room Tracking Profile & Local Occupancy Lists
    const line2Zone = `ZONE: ${here ? here.name : 'Unknown'}${enemyStatusText}${playerStatusText}`;
    
    // Line 3: Vital signs readout block (Contains 'HP:' to trigger client.js sorting)
    const line3Vitals = `Vitals: HP:${p.hp}/${p.maxHp}`;
    
    // Line 4: Ammunition payload configurations
    const line4Ammo = hasAmmo ? `\n${ammoHudText}` : '';

    // Wrap everything sequentially inside your clean tech-gray ANSI block wrapper
    // The \n characters stack your data layers perfectly into vertical rows
    const infoFooterText = `\n\x1b[90m${line1Nav}\n${line2Zone}\n${line3Vitals}${line4Ammo}\x1b[0m`;
    
    this.send(p, mapGridText + infoFooterText);
  }

  
 _glyphColor(g) {
    if (g === '#') return '\x1b[38;5;242m\x1b[48;5;234m#\x1b[0m'; // Sleek dark corporate walls
    if (g === '.') return '\x1b[38;5;45m\x1b[48;5;235m.\x1b[0m';  // Cyan reflection on wet asphalt
    if (g === ',') return '\x1b[38;5;201m\x1b[48;5;53m,\x1b[0m';  // HOT NEON PINK / DARK PURPLE BACKING!
    if (g === '~') return '\x1b[38;5;82m\x1b[48;5;22m~\x1b[0m';   // Glowing green toxic waste pools
    if (g === '=') return '\x1b[38;5;196m\x1b[48;5;52m=\x1b[0m';  // Pulsing crimson laser security fences
    return g;
  }

}