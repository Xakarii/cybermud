import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer } from 'ws';
import { World } from './game/world.js';
import { handleCommand } from './game/commands.js';
import { tickCombat } from './game/combat.js';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 8080;
const TICK_MS = 100; // 10 ticks per second
// ---- Static file server for the browser client ----
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const server = http.createServer((req, res) => {
  let url = req.url === '/' ? '/index.html' : req.url;
  const file = path.join(__dirname, 'public', decodeURIComponent(url));
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('404'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'text/plain' });
    res.end(data);
  });
});

// ---- Game world ----
const world = new World();
world.loadAreas(path.join(__dirname, 'data', 'areas'));

// ---- WebSocket layer ----
const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  const player = world.createPlayer(ws);
  ws.send(JSON.stringify({ type: 'system', text: '\x1b[36m// NEURAL LINK ESTABLISHED //\x1b[0m' }));
  ws.send(JSON.stringify({ type: 'system', text: 'Enter your handle:' }));
  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    if (msg.type !== 'cmd') return;
    if (!player.name) {
      player.name = String(msg.text).trim().slice(0, 16) || 'runner';
      player.admin = player.name.toLowerCase() === 'admin'; // demo: name "admin" is a builder
      world.spawnPlayer(player);
      return;
    }
    handleCommand(world, player, String(msg.text));
  });
  ws.on('close', () => world.removePlayer(player));
});
// ---- Main game loop ----
setInterval(() => {
  const now = Date.now();



  // Track tick cycles inside the scope to clock down health pulses cleanly
  if (!global.regenTickCounter) global.regenTickCounter = 0;
  global.regenTickCounter++;

  // ---- NEW: NEURAL PATCH HEALTH REGENERATION ----
  // Runs a health tick pulse once every 500ms (Every 5 engine cycles)
  if (global.regenTickCounter % 5 === 0) {
    world.players.forEach((p) => {
      if (p.name && p.hp > 0 && p.hp < p.maxHp) {
        const localTile = world.tileAt(p.area, p.x, p.y);
        
        // If standing on the safe house enclave tile
        if (localTile && localTile.glyph === 'H') {
          p.hp = Math.min(p.maxHp, p.hp + 1); // Restore 1 HP up to their max limit
          world.send(p, `\x1b[32m[SYSTEM] Safehouse medical injectors pulsing... Vital signs recovering. (HP: ${p.hp}/${p.maxHp})\x1b[0m`);
          p.dirty = true; // Refresh dashboard to show health increase
        }
      }
    });
  }

    // ---- NEW: BACKEND AUTOPLAY PATH ROUTER ----
  world.players.forEach((p) => {
    if (p.name && p.isNavigating && p.navTarget) {
      // Stop moving if the player is currently stuck in an action lag queue frame
      if (now < p.nextActionTime) return;

      // Check if we arrived exactly at our goal destination coordinates
      if (p.x === p.navTarget.x && p.y === p.navTarget.y) {
        p.isNavigating = false;
        p.navTarget = null;
        world.send(p, `\x1b[32m[NAV] Waypoint reached successfully.\x1b[0m`);
        p.dirty = true;
        return;
      }

      // Compute heading directional steps toward the target coordinate
      const dx = p.navTarget.x - p.x;
      const dy = p.navTarget.y - p.y;
      
      const stepX = dx === 0 ? 0 : (dx > 0 ? 1 : -1);
      const stepY = dy === 0 ? 0 : (dy > 0 ? 1 : -1);

      // Verify if the next structural step is safe and open
      const nextTile = world.tileAt(p.area, p.x + stepX, p.y + stepY);
      
      if (nextTile && !nextTile.blocked) {
        // Synchronize our body facing direction to match where the navigation system is pulling us
        if (stepX === 1 && stepY === -1) p.facing = 'northeast';
        else if (stepX === -1 && stepY === -1) p.facing = 'northwest';
        else if (stepX === 1 && stepY === 1) p.facing = 'southeast';
        else if (stepX === -1 && stepY === 1) p.facing = 'southwest';
        else if (stepX === 1) p.facing = 'east';
        else if (stepX === -1) p.facing = 'west';
        else if (stepY === 1) p.facing = 'south';
        else if (stepY === -1) p.facing = 'north';


        // Execute step
        world.tryMove(p, stepX, stepY);
        
        // Apply short 200ms walking step lag intervals to prevent instant teleportation exploits
        p.nextActionTime = now + 200; 
      } else {
        // Something solid hit, disengage navigation systems immediately
        p.isNavigating = false;
        p.navTarget = null;
        world.send(p, `\x1b[31m[NAV] Autopilot aborted! Obstacle or map bounds blocking path.\x1b[0m`);
        p.dirty = true;
      }
    }
  });

  // process any queued actions whose lag has expired
  world.players.forEach((p) => world.processQueue(p, now));
  // process any queued actions whose lag has expired
  world.players.forEach((p) => world.processQueue(p, now));
  // resolve ongoing combat
  tickCombat(world, now);
  // push viewport updates to anyone flagged dirty
  world.players.forEach((p) => {
    if (p.name && p.dirty) { world.sendView(p); p.dirty = false; }
  });
}, TICK_MS);
server.listen(PORT, () => console.log(`cyberMUD running on http://localhost:${PORT}`));