export function builderCommand(world, p, line) {
  const parts = line.split(/\s+/);
  const sub = (parts[0] || '').toLowerCase();
  const area = world.areas.get(p.area);
  const key = `${p.x},${p.y}`;
  const tile = area.tiles[key];
  switch (sub) {
    case 'dig': { // @dig <glyph> <name...>
      const glyph = parts[1] || '.';
      const name = parts.slice(2).join(' ') || 'Unnamed';
      area.tiles[key] = { glyph: glyph[0], name, desc: tile?.desc || '', blocked: glyph[0] === '#' };
      world.send(p, `\x1b[32mTile (${key}) set to '${glyph[0]}' — ${name}\x1b[0m`);
      p.dirty = true; break;
    }
    case 'desc': { // @desc <text...>
      if (!tile) return world.send(p, 'No tile here. @dig first.');
      tile.desc = parts.slice(1).join(' ');
      world.send(p, '\x1b[32mDescription updated.\x1b[0m'); break;
    }
    case 'wall':
      if (tile) { tile.glyph = '#'; tile.blocked = true; tile.name = 'Chrome wall'; }
      world.send(p, '\x1b[32mWall raised.\x1b[0m'); p.dirty = true; break;
    case 'clear':
      area.tiles[key] = { glyph: '.', name: 'Cracked asphalt', desc: '', blocked: false };
      world.send(p, '\x1b[32mTile cleared.\x1b[0m'); p.dirty = true; break;
    case 'teleport': { // @teleport <x> <y>
      const nx = parseInt(parts[1], 10), ny = parseInt(parts[2], 10);
      if (Number.isNaN(nx) || Number.isNaN(ny)) return world.send(p, 'Usage: @teleport x y');
      p.x = nx; p.y = ny; p.dirty = true;
      world.send(p, `\x1b[32mBlinked to (${nx},${ny}).\x1b[0m`); break;
    }
    case 'save':
      world.saveArea(area);
      world.send(p, '\x1b[32mArea persisted to disk.\x1b[0m'); break;
    default:
      world.send(p, 'Builder: @dig @desc @wall @clear @teleport @save');
  }
}