export function aimHand(world, p, hand) {
  const w = p[hand];
  if (!w) return world.send(p, `\x1b[31mNothing in that hand.\x1b[0m`);
  w.aimed = true;
  world.send(p, `\x1b[33mYou steady your ${w.name} and take aim.\x1b[0m`);
}

export function startFire(world, p, hand) {
  const w = p[hand];
  if (!w) return world.send(p, `\x1b[31mNothing in that hand.\x1b[0m`);

  const area = world.areas.get(p.area);
  
  // LOOK FOR A TARGET PLAYER OR A TARGET MOB SHARING THE LOCKED TARGET ID
  let target = [...world.players].find(o => o.id === p.target && o.area === p.area);
  if (!target && area && area.mobs) {
    target = area.mobs.find(m => m.id === p.target && m.hp > 0);
  }

  if (!target) return world.send(p, `\x1b[31mNo target locked.\x1b[0m`);
  
  // Range check
  const dist = Math.max(Math.abs(target.x - p.x), Math.abs(target.y - p.y));
  if (dist > 8) return world.send(p, `\x1b[31mTarget out of range.\x1b[0m`);

  const hitChance = w.aimed ? 0.85 : 0.55;
  w.aimed = false;

  if (Math.random() > hitChance) {
    world.send(p, `\x1b[90mYou fire your ${w.name} at ${target.name} — miss!\x1b[0m`);
    // Only send the miss alert to the target if it's an actual human player, not an AI drone
    if (!target.isMob) world.send(target, `\x1b[90m${p.name}'s shot whips past you.\x1b[0m`);
    return;
  }

  const dmg = w.dmg[0] + Math.floor(Math.random() * (w.dmg[1] - w.dmg[0] + 1));
  target.hp -= dmg;
  
  world.send(p, `\x1b[91mYour ${w.name} tears into ${target.name} for ${dmg}! (HP: ${target.hp}/${target.maxHp || 35})\x1b[0m`);
  
  // Only send damage notifications if target is an actual human player
  if (!target.isMob) {
    target.dirty = true;
    world.send(target, `\x1b[91m${p.name} hits you for ${dmg}! (HP ${target.hp}/${target.maxHp})\x1b[0m`);
  }

  // --- DEATH RESOLUTION HOCK FOR DROPS AND LOOT ---
  if (target.hp <= 0) {
    if (target.isMob) {
      world.send(p, `\x1b[32mYou have successfully neutralized the ${target.name}! It bursts into corporate sparks.\x1b[0m`);
      p.target = null; // Clear weapon lock
      p.dirty = true;  // Wipe drone character 'D' immediately off player map viewport grid!
    } else {
      // Classic human flatline mechanics remain unchanged
      world.broadcastArea(p.area, 0, 0, `\x1b[95m${target.name} flatlines on the wet concrete.\x1b[0m`);
      target.hp = target.maxHp; target.x = 2; target.y = 2; target.target = null; target.queue = [];
      world.send(target, `\x1b[31m[CRITICAL] System failure. Rebooting vital matrices... Spawning at Safehouse.\x1b[0m`);
      target.dirty = true;
    }
  }
}

/* Old startFire func
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
  }*/

  /* old death resolution conditional
  if (target.hp <= 0) {
    world.broadcastArea(p.area, 0, 0, `\x1b[95m${target.name} flatlines on the wet concrete.\x1b[0m`);
    target.hp = target.maxHp; target.x = 2; target.y = 2; // respawn
    target.dirty = true;
  }
}
*/

// hook for damage-over-time, cooldowns, mob AI, etc.
export function tickCombat(world, now) {
  for (const [areaName, area] of world.areas.entries()) {
    if (!area.mobs || area.mobs.length === 0) continue;

    const activeDrones = area.mobs.filter(m => m.hp > 0 && now >= m.nextActionTime);

    for (const drone of activeDrones) {
      // CRITICAL CRASH SAFETY SHIELD CHECK: 
      // If the drone flatlined earlier in this exact tick cycle, skip it instantly!
      if (drone.hp <= 0) continue; 

      const targetPlayer = [...world.players].find(p => p.area === drone.area && p.x === drone.x && p.y === drone.y && p.hp > 0);

      if (targetPlayer) {
        // ... your damage execution logic blocks below stay exactly the same ...
        const minDmg = drone.damage[0];
        const maxDmg = drone.damage[1];
        const dmg = minDmg + Math.floor(Math.random() * (maxDmg - minDmg + 1));

        targetPlayer.hp -= dmg;
        world.send(targetPlayer, `\x1b[91mThe Arasaka-Drone whirs loudly and shoots you for ${dmg} damage!\x1b[0m`);
        targetPlayer.dirty = true;
        drone.nextActionTime = now + 1500;

        if (targetPlayer.hp <= 0) {
          world.broadcastArea(targetPlayer.area, 0, 0, `\x1b[95m${targetPlayer.name} was flatlined by an Arasaka-Drone.\x1b[0m`);
          targetPlayer.hp = targetPlayer.maxHp;
          targetPlayer.x = 2; targetPlayer.y = 2; targetPlayer.target = null; targetPlayer.queue = [];
          world.send(targetPlayer, `\x1b[31m[CRITICAL] System failure. Rebooting vital matrices... Spawning at Safehouse.\x1b[0m`);
          drone.hp = 0; 
        }
      } else {
        drone.nextActionTime = now + 500;
      }
    }

    area.mobs = area.mobs.filter(m => m.hp > 0);
  }
}