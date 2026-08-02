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
  /* old makeDefaultArea loop
  _makeDefaultArea(dir) {
    const area = {
      name: 'downtown', width: 20, height: 20,
      _file: path.join(dir, 'downtown.json'),
      // tiles keyed by "x,y" -> { glyph, name, desc, blocked }
      tiles: {},
      mobs: [] // { proto } spawns handled at load; simple demo below
    };
    for (let x = 0; x < 20; x++)
      for (let y = 0; y < 20; y++)
        area.tiles[`${x},${y}`] = { glyph: '.', name: 'Cracked asphalt', desc: 'Neon reflects in puddles of rain.', blocked: false };
    // a few walls
    for (let x = 5; x < 15; x++) { area.tiles[`${x},10`].glyph = '#'; area.tiles[`${x},10`].blocked = true; area.tiles[`${x},10`].name = 'Chrome wall'; }
    this.areas.set(area.name, area);
    this.saveArea(area);
  } */

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
//Use code with c
  /* old spawnPlayer function
  spawnPlayer(p) {
    this.send(p, `\x1b[32mWelcome to Night City, ${p.name}.${p.admin ? ' [BUILDER MODE]' : ''}\x1b[0m`);
    p.dirty = true;
  }
  */

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
  }
  // ---- ASCII viewport render ----
  /*  Old sendView function
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
        const t = area.tiles[`${x},${y}`];
        row += t ? this._glyphColor(t.glyph) : ' ';
      }
      rows.push(row);
    }
    const here = area.tiles[`${p.x},${p.y}`];
    this.send(p, rows.join('\n'));
    this.send(p, `\x1b[90m(${p.x},${p.y}) ${here ? here.name : ''}  HP:${p.hp}/${p.maxHp}\x1b[0m`);
  }
  */

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
        const t = area.tiles[`${x},${y}`];
        row += t ? this._glyphColor(t.glyph) : ' ';
      }
      rows.push(row);
    }
    const here = area.tiles[`${p.x},${p.y}`];
    
    // BUILD ONE SINGLE STRING WITH ALL DATA MERGED
    const mapGridText = rows.join('\n');
    const infoFooterText = `\n\x1b[90m(${p.x},${p.y}) ${here ? here.name : ''}  HP:${p.hp}/${p.maxHp}\x1b[0m`;
    
    // Fire off ONE single network packet instead of two loose ones!
    this.send(p, mapGridText + infoFooterText);
  }
  
  _glyphColor(g) {
    if (g === '#') return `\x1b[37m#\x1b[0m`; // White walls
    if (g === '.') return `\x1b[90m.\x1b[0m`; // Gray asphalt
    if (g === '~') return `\x1b[32m~\x1b[0m`; // Vibrant green sludge pools!
    if (g === '=') return `\x1b[91m=\x1b[0m`; // Red hazardous laser barricades!
    return g;
  }
  
  /* old _glyphColor function
  _glyphColor(g) {
    if (g === '#') return `\x1b[37m#\x1b[0m`;
    if (g === '.') return `\x1b[90m.\x1b[0m`;
    return g;
  }
  */
}