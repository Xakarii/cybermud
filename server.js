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
// ---- Main game loop ----
setInterval(() => {
  const now = Date.now();

  // FIX: Initialize and increment the tick counter every cycle so math doesn't throw undefined!
  if (!global.regenTickCounter) global.regenTickCounter = 0;
  global.regenTickCounter++;

  // ---- NEURAL PATCH HEALTH REGENERATION ----
  // Runs a health tick pulse once every 500ms (Every 5 engine cycles)
  if (global.regenTickCounter % 5 === 0) {
    world.players.forEach((p) => {
      if (p.name && p.hp > 0 && p.hp < p.maxHp) {
        const localTile = world.tileAt(p.area, p.x, p.y);
        
        // If standing on the safe house enclave tile
        if (localTile && localTile.glyph === 'H') {
          p.hp = Math.min(p.maxHp, p.hp + 1); // Restore 1 HP silently
          p.dirty = true; 
        }
      }
    });
  }

  // ---- Main game loop: Axis-Locked Autoplay Vector Driver ----
  world.players.forEach((p) => {
    if (p.name && p.isNavigating && p.navTarget) {
      if (now < p.nextActionTime) return;

      // Check if we arrived exactly at our goal destination coordinates
      if (p.x === p.navTarget.x && p.y === p.navTarget.y) {
        p.isNavigating = false;
        p.navTarget = null;
        world.send(p, `\x1b[32m[NAV] Destination coordinates reached successfully.\x1b[0m`);
        p.dirty = true;
        return;
      }

      // Calculate remaining distances along each individual plane axis
      const dx = p.navTarget.x - p.x;
      const dy = p.navTarget.y - p.y;
      
      let stepX = 0;
      let stepY = 0;

      // Axis-Locked resolution algorithm 
      if (dx !== 0) {
        stepX = dx > 0 ? 1 : -1;
      } else if (dy !== 0) {
        stepY = dy > 0 ? 1 : -1;
      }

      // Verify structural environment boundaries at our calculated single-axis tile
      const nextTile = world.tileAt(p.area, p.x + stepX, p.y + stepY);
      
      if (nextTile && !nextTile.blocked) {
        if (stepX === 1) p.facing = 'east';
        else if (stepX === -1) p.facing = 'west';
        else if (stepY === 1) p.facing = 'south';
        else if (stepY === -1) p.facing = 'north';

        world.tryMove(p, stepX, stepY);
        p.nextActionTime = now + 200; 
      } else {
        p.isNavigating = false;
        p.navTarget = null;
        world.send(p, `\x1b[31m[NAV] Autopilot aborted! Path blocked by terrain coordinate bounds.\x1b[0m`);
        p.dirty = true;
      }
    }
  });

  // process any queued actions whose lag has expired
  world.players.forEach((p) => world.processQueue(p, now));

  // resolve ongoing combat
  tickCombat(world, now);

  // push viewport updates to anyone flagged dirty
  world.players.forEach((p) => {
    if (p.name && p.dirty) { world.sendView(p); p.dirty = false; }
  });
}, TICK_MS); // <--- Cleanly and safely closes the 100ms game loop interval thread!


server.listen(PORT, () => console.log(`cyberMUD running on http://localhost:${PORT}`));