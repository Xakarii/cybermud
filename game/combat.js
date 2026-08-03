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


export function tickCombat(world, now) {
  for (const [areaName, area] of world.areas.entries()) {
    if (!area.mobs || area.mobs.length === 0) continue;

    const activeDrones = area.mobs.filter(m => m.hp > 0 && now >= m.nextActionTime);

    for (const drone of activeDrones) {
      if (drone.hp <= 0) continue; 

      // 1. RADAR SCAN: Find any living player in the same area zone
      // (If you want them to lock onto the player who triggered them, look up target IDs)
      const targetPlayer = [...world.players].find(p => p.area === drone.area && p.hp > 0 && p.name);

      if (targetPlayer) {
        // 2. DISTANCE METRIC: Calculate current tile separation
        const dx = targetPlayer.x - drone.x;
        const dy = targetPlayer.y - drone.y;
        const dist = Math.max(Math.abs(dx), Math.abs(dy));

        // Drone weapon range fallback limit (defaults to 3 tiles (meters in gameplay) if undefined)
        const attackRange = drone.range || 3;

        if (dist <= attackRange) {
          // ---- ACTION A: PLAYER IS IN RANGE -> FIRE WEAPONS ----
          const minDmg = drone.damage[0];
          const maxDmg = drone.damage[1];
          const dmg = minDmg + Math.floor(Math.random() * (maxDmg - minDmg + 1));

          targetPlayer.hp -= dmg;
          world.send(targetPlayer, `\x1b[91mThe Arasaka-Drone whirs loudly and shoots you from ${dist} meters away for ${dmg} damage!\x1b[0m`);
          targetPlayer.dirty = true;
          
          // Apply standard weapon fire cooldown (1.5 seconds)
          drone.nextActionTime = now + 1500;

          // Death handler evaluation 
          if (targetPlayer.hp <= 0) {
            world.broadcastArea(targetPlayer.area, 0, 0, `\x1b[95m${targetPlayer.name} was flatlined by an Arasaka-Drone.\x1b[0m`);
            targetPlayer.hp = targetPlayer.maxHp;
            targetPlayer.x = 2; targetPlayer.y = 2; targetPlayer.target = null; targetPlayer.queue = [];
            world.send(targetPlayer, `\x1b[31m[CRITICAL] System failure. Rebooting vital matrices... Spawning at Safehouse.\x1b[0m`);
            drone.hp = 0; 
          }
        } else {
          // ---- ACTION B: OUT OF RANGE -> PURSUE THE RUNNER ----
          // Compute normalized step vector (-1, 0, or 1) along each vector path
          const stepX = dx === 0 ? 0 : (dx > 0 ? 1 : -1);
          const stepY = dy === 0 ? 0 : (dy > 0 ? 1 : -1);

          const nextX = drone.x + stepX;
          const nextY = drone.y + stepY;

          // Spatial map safety guard: verify target path tile layout exists and isn't blocked
          const targetTile = world.tileAt(drone.area, nextX, nextY);
          
          if (targetTile && !targetTile.blocked) {
            drone.x = nextX;
            drone.y = nextY;
            
            // Alert players in range that the threat is moving
            world.send(targetPlayer, `\x1b[90mThe Arasaka-Drone thrusters hiss as it moves closer... (${drone.x}, ${drone.y})\x1b[0m`);
            targetPlayer.dirty = true;
          }

          // Apply pursuit movement cycle lag delay (600ms engine step delay)
          // Adjust this variable to make drones chase faster or slower!
          drone.nextActionTime = now + 600;
        }
      } else {
        // Passive standby scan rate if no organic targets inhabit the map space
        drone.nextActionTime = now + 500;
      }
    }

    // Scrub destroyed arrays clean
    area.mobs = area.mobs.filter(m => m.hp > 0);
  }
}