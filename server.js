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