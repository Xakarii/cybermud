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
    const { _file, ...clean } = area;
    fs.writeFileSync(area._file, JSON.stringify(clean, null, 2));
  }

  // ---- players ----
  createPlayer(ws) {
    const p = {
      id: nextId++, ws, name: null, admin: false,
      area: 'downtown', x: 2, y: 2,
      hp: 100, maxHp: 100,
      rightHand: { name: 'Militech pistol', dmg: [8, 14], aimLag: 300, fireLag: 800, aimed: false },
      leftHand: null,
      queue: [], nextActionTime: 0, target: null, dirty: false,
    };
    this.players.add(p);
    return p;
  }

  // ---- random enemy encounters ----
  spawnEncounter(p, x, y) {
    const area = this.areas.get(p.area);
    if (!area) return;

    const drone = {
      id: nextId++,
      mobId: area._nextMobId++, // Local enemy ID (1, 2, 3...)
      isMob: true,
      name: 'Arasaka-Drone',
      area: p.area,
      x: p.x, 
      y: p.y,
      hp: 35,
      maxHp: 35,
      damage: [7,12],
      nextActionTime: Date.now() + 1000 // 1 second before its first attack tick
    };

    // Initialize the mobs array if it doesn't exist, then add the drone
    if (!area.mobs) area.mobs = [];
    area.mobs.push(drone);

    // Notify the player
    this.send(p, '\x1b[31m[WARNING] A security drone drops from a neon billboard, weapons armed!\x1b[0m');
    
    // Automatically set the player's combat target to this drone's ID for convenience
    p.target = drone.id;
    this.send(p, `\x1b[33mTarget locked onto ${drone.name}.\x1b[0m`);

    // Force a map refresh so the player sees the enemy symbol immediately
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
    p.x = nx; p.y = ny;
    p.dirty = true;

    // --- ENCOUNTER TRIGGER HOOK ---
    // If stepping into a neon alleyway, run a 15% chance to trigger a drone ambush
    if (t.glyph === ',') {
      const area = this.areas.get(p.area);
      // Only spawn an ambush if there isn't already a living drone on this exact tile
      const droneExists = (area.mobs || []).some(m => m.x === nx && m.y === ny && m.hp > 0);
      
      if (!droneExists && Math.random() < 0.15) {
        this.spawnEncounter(p, nx, ny);
      }
    }
  }


  // ---- ASCII viewport render ----
  sendView(p) {
    const area = this.areas.get(p.area);
    const R = 5; // radius -> 11x11 viewport
    let rows = [];
    for (let y = p.y - R; y <= p.y + R; y++) {
      let row = '';
      for (let x = p.x - R; x <= p.x + R; x++) {
        if (x === p.x && y === p.y) { row += '\x1b[93m@\x1b[0m'; continue; }
        const occupant = [...this.players].find(o => o.area === p.area && o.x === x && o.y === y);
        if (occupant) { row += '\x1b[91mP\x1b[0m'; continue; }
        const mobOccupant = (area.mobs || []).find(m => m.x === x && m.y === y && m.hp > 0);
        if (mobOccupant) { row += '\x1b[38;5;196mD\x1b[0m'; continue; } // Red 'D' for Drone
        const t = area.tiles[`${x},${y}`];
        row += t ? this._glyphColor(t.glyph) : ' ';
      }
      rows.push(row);
    }
    const here = area.tiles[`${p.x},${p.y}`];
    
// Scan if there are any active hostile entities standing right on your current index tile
    const localMobs = (area.mobs || []).filter(m => m.x === p.x && m.y === p.y && m.hp > 0);
    const mobLabels = localMobs.map(m => `${m.name}(Enemy:${m.mobId})`).join(', ');
    const enemyStatusText = mobLabels ? ` | Enemies: ${mobLabels}` : '';

    // BUILD ONE SINGLE STRING WITH ALL DATA MERGED
    const mapGridText = rows.join('\n');
    const infoFooterText = `\n\x1b[90m(${p.x},${p.y}) ${here ? here.name : ''}  HP:${p.hp}/${p.maxHp}\x1b[0m`;
    
    // Fire off ONE single network packet instead of two loose ones!
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
  /* using old color codes
  _glyphColor(g) {
    if (g === '#') return `\x1b[37m#\x1b[0m`; // White walls
    if (g === '.') return `\x1b[90m.\x1b[0m`; // Gray asphalt
    if (g === '~') return `\x1b[32m~\x1b[0m`; // Vibrant green sludge pools!
    if (g === '=') return `\x1b[91m=\x1b[0m`; // Red hazardous laser barricades!
    return g;
  }
    */
  
  /* old _glyphColor function
  _glyphColor(g) {
    if (g === '#') return `\x1b[37m#\x1b[0m`;
    if (g === '.') return `\x1b[90m.\x1b[0m`;
    return g;
  }
  */
}