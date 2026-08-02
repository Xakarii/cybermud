export function aimHand(world, p, hand) {
  const w = p[hand];
  if (!w) return world.send(p, `\x1b[31mNothing in that hand.\x1b[0m`);
  w.aimed = true;
  world.send(p, `\x1b[33mYou steady your ${w.name} and take aim.\x1b[0m`);
}
export function startFire(world, p, hand) {
  const w = p[hand];
  if (!w) return world.send(p, `\x1b[31mNothing in that hand.\x1b[0m`);
  const target = [...world.players].find(o => o.id === p.target && o.area === p.area);
  if (!target) return world.send(p, `\x1b[31mNo target locked.\x1b[0m`);
  // range check on the grid
  const dist = Math.max(Math.abs(target.x - p.x), Math.abs(target.y - p.y));
  if (dist > 8) return world.send(p, `\x1b[31mTarget out of range.\x1b[0m`);
  // aimed shots are more accurate
  const hitChance = w.aimed ? 0.85 : 0.55;
  w.aimed = false;
  if (Math.random() > hitChance) {
    world.send(p, `\x1b[90mYou fire your ${w.name} at ${target.name} — miss!\x1b[0m`);
    world.send(target, `\x1b[90m${p.name}'s shot whips past you.\x1b[0m`);
    return;
  }
  const dmg = w.dmg[0] + Math.floor(Math.random() * (w.dmg[1] - w.dmg[0] + 1));
  target.hp -= dmg;
  world.send(p, `\x1b[91mYour ${w.name} tears into ${target.name} for ${dmg}!\x1b[0m`);
  world.send(target, `\x1b[91m${p.name} hits you for ${dmg}! (HP ${target.hp}/${target.maxHp})\x1b[0m`);
  target.dirty = true;

  if (target.hp <= 0) {
    // 1. Alert the entire area
    world.broadcastArea(p.area, 0, 0, `\x1b[95m${target.name} flatlines on the wet concrete.\x1b[0m`);
    
    // 2. Clear target properties and position variables
    target.hp = target.maxHp; 
    target.x = 2; 
    target.y = 2; 
    target.target = null; // Clear their old combat lock target
    target.queue = [];    // Empty out any actions they had queued while dying
    
    // 3. Send a clear system alert directly to the dead player
    world.send(target, `\x1b[31m[CRITICAL] System failure. Rebooting vital matrices... Spawning at Safehouse.\x1b[0m`);
    
    // 4. Force their interface dashboard to redraw immediately!
    target.dirty = true;
  }
  /* old death resolution conditional
  if (target.hp <= 0) {
    world.broadcastArea(p.area, 0, 0, `\x1b[95m${target.name} flatlines on the wet concrete.\x1b[0m`);
    target.hp = target.maxHp; target.x = 2; target.y = 2; // respawn
    target.dirty = true;
  }
  */

}
// hook for damage-over-time, cooldowns, mob AI, etc.
export function tickCombat(world, now) {
  const area = world.areas.get('downtown');
  if (!area || !area.mobs) return;

  // Let spawned mobs process an AI routine
  area.mobs.forEach(mob => {
    if (now < mob.nextActionTime) return;

    // AI Check: If a player is standing on the same tile, attack them!
    const targetPlayer = [...world.players].find(p => p.area === mob.area && p.x === mob.x && p.y === mob.y);
    if (targetPlayer && targetPlayer.hp > 0) {
      const dmg = 5 + Math.floor(Math.random() * 5);
      targetPlayer.hp -= dmg;
      world.send(targetPlayer, `\x1b[31mAn automated defense turret tracks you and fires for ${dmg} damage!\x1b[0m`);
      targetPlayer.dirty = true;
      mob.nextActionTime = now + 1500; // 1.5-second attack cooldown
    }
  });
}