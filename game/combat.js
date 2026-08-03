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

    // Filter to find active drones whose turn timer has popped
    const activeDrones = area.mobs.filter(m => m.hp > 0 && now >= m.nextActionTime);

    for (const drone of activeDrones) {
      if (drone.hp <= 0) continue;

      // Find the closest active target player in the area
      const targetPlayer = [...world.players].find(p => p.area === drone.area && p.hp > 0 && p.name);

      if (targetPlayer) {
        const dx = targetPlayer.x - drone.x;
        const dy = targetPlayer.y - drone.y;
        const dist = Math.max(Math.abs(dx), Math.abs(dy));
        const attackRange = drone.range || 3;

        // Run our Line of Sight Raycaster
        const canSeePlayer = hasLineOfSight(world, drone.area, drone.x, drone.y, targetPlayer.x, targetPlayer.y);

        if (canSeePlayer && dist <= attackRange) {
          // ---- CHOICE A: IN RANGE & HAS LINE OF SIGHT -> SHOOT! ----
          const minDmg = drone.damage[0] || 6;
          const maxDmg = drone.damage[1] || 12;
          const dmg = minDmg + Math.floor(Math.random() * (maxDmg - minDmg + 1));

          targetPlayer.hp -= dmg;
          world.send(targetPlayer, `\x1b[91mThe Arasaka-Drone whirs loudly and shoots you from ${dist} tiles away for ${dmg} damage!\x1b[0m`);
          targetPlayer.dirty = true;
          drone.nextActionTime = now + 1500;

          if (targetPlayer.hp <= 0) {
            world.broadcastArea(targetPlayer.area, 0, 0, `\x1b[95m${targetPlayer.name} was flatlined by an Arasaka-Drone.\x1b[0m`);
            targetPlayer.hp = targetPlayer.maxHp;
            targetPlayer.x = 2; targetPlayer.y = 2; targetPlayer.target = null; targetPlayer.queue = [];
            world.send(targetPlayer, `\x1b[31m[CRITICAL] System failure. Rebooting vital matrices... Spawning at Safehouse.\x1b[0m`);
            drone.hp = 0;
          }
        } 
        else if (canSeePlayer && dist > attackRange) {
          // ---- CHOICE B: SEES PLAYER BUT TOO FAR -> ADVANCE DIRECTLY ----
          const stepX = dx === 0 ? 0 : (dx > 0 ? 1 : -1);
          const stepY = dy === 0 ? 0 : (dy > 0 ? 1 : -1);
          const nextX = drone.x + stepX;
          const nextY = drone.y + stepY;

          const targetTile = world.tileAt(drone.area, nextX, nextY);
          if (targetTile && !targetTile.blocked) {
            drone.x = nextX;
            drone.y = nextY;
            world.send(targetPlayer, `\x1b[90mThe Arasaka-Drone advances on your position... (${drone.x}, ${drone.y})\x1b[0m`);
            targetPlayer.dirty = true;
          }
          drone.nextActionTime = now + 700;
        } 
        else {
          // ---- CHOICE C: LINE OF SIGHT BROKEN -> PURSUE CORNER BREADCRUMBS ----
          const currentTrail = [...targetPlayer.trail];

          // Look for the absolute NEWEST trail node the drone can see (to establish pursuit vector)
          const newestVisibleStep = [...currentTrail].reverse().find(step => 
            hasLineOfSight(world, drone.area, drone.x, drone.y, step.x, step.y)
          );

          // SAFEGUARD: Track if that matched step is the coordinate the drone is currently standing on
          const droneIsOnMatchedScent = newestVisibleStep && (newestVisibleStep.x === drone.x && newestVisibleStep.y === drone.y);

          // Initialize our tracking target pointer coordinate variable
          let chaseTarget = null;

          if (newestVisibleStep && !droneIsOnMatchedScent) {
            // If the drone sees a step ahead of it, chase it directly
            chaseTarget = newestVisibleStep;
          } 
          else if (newestVisibleStep && droneIsOnMatchedScent) {
            // CORE CORNER CORRECTION FIX: If the drone is sitting precisely on your scent node, 
            // search chronologically (OLDEST to NEWEST) for the next node it can see.
            chaseTarget = currentTrail.find(step => 
              (step.x !== drone.x || step.y !== drone.y) && 
              hasLineOfSight(world, drone.area, drone.x, drone.y, step.x, step.y)
            );
          }

          // ---- EXECUTE DYNAMIC CORNER MOVEMENT STEP ----
          if (chaseTarget) {
            const chaseDx = chaseTarget.x - drone.x;
            const chaseDy = chaseTarget.y - drone.y;
            
            const stepX = chaseDx === 0 ? 0 : (chaseDx > 0 ? 1 : -1);
            const stepY = chaseDy === 0 ? 0 : (chaseDy > 0 ? 1 : -1);
            
            const nextX = drone.x + stepX;
            const nextY = drone.y + stepY;

            const targetTile = world.tileAt(drone.area, nextX, nextY);
            if (targetTile && !targetTile.blocked) {
              drone.x = nextX;
              drone.y = nextY;
              world.send(targetPlayer, `\x1b[90mYou hear clicking thrusters around the corner... The drone is tracking your footprints.\x1b[0m`);
              targetPlayer.dirty = true;
            }
            drone.nextActionTime = now + 650; 
          } else {
            // ---- CHOICE D: LOST THE TRAIL ENTIRELY -> DESPAWN ----
            world.send(targetPlayer, `\x1b[32mThe Arasaka-Drone loses your biological signature and terminates search vectors. [Despawned]\x1b[0m`);
            
            if (targetPlayer.target === drone.id) {
              targetPlayer.target = null;
            }
            
            drone.hp = 0; 
            targetPlayer.dirty = true;
          }
          // SAFEGUARD: Don't chase footprints if the user has sprinted too far away
          const targetDist = Math.max(Math.abs(targetPlayer.x - drone.x), Math.abs(targetPlayer.y - drone.y));
          
          if (targetDist > 5) { // If player is further than 5 tiles away from the drone around corners, break tracking
            world.send(targetPlayer, `\x1b[32mYou managed to slip away into the neon haze. The Arasaka-Drone loses your trail. [Despawned]\x1b[0m`);
            if (targetPlayer.target === drone.id) targetPlayer.target = null;
            drone.hp = 0;
            targetPlayer.dirty = true;
            continue;
          }
        }
      
      } // Ends "if (targetPlayer)"
      else {
        // Safe tracking rate fallback if player disconnects mid-chase
        drone.nextActionTime = now + 500;
      }
    } // Ends "for (drone of activeDrones)"

    // Safely purge flatlined or lost/despawned drones out of memory arrays
    area.mobs = area.mobs.filter(m => m.hp > 0);
  } // Ends "for (area of world.areas)"
}


// ---- FIXED LINE OF SIGHT CHECK (With strict diagonal corner leak protection) ----
function hasLineOfSight(world, areaName, x0, y0, x1, y1) {
  let cx = x0;
  let cy = y0;

  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  
  let err = dx - dy;

  while (cx !== x1 || cy !== y1) {
    const prevX = cx;
    const prevY = cy;

    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      cx += sx;
    }
    if (e2 < dx) {
      err += dx;
      cy += sy;
    }

    // 1. VOID AND Chrome WALL GUARD
    const tile = world.tileAt(areaName, cx, cy);
    if (!tile || tile.blocked) {
      return false; // Break sight instantly if it hits a wall or out-of-bounds
    }

    // 2. STRICTOR DIAGONAL CORNER LEAK PROTECTION
    // If our tracking pointer changed BOTH X and Y components in this loop step,
    // it moved diagonally. We must scan the two flanking tiles we stepped past.
    if (cx !== prevX && cy !== prevY) {
      const flank1 = world.tileAt(areaName, cx, prevY);
      const flank2 = world.tileAt(areaName, prevX, cy);

      // If either flanking diagonal wall tile is blocked or a void null gap,
      // the vision ray is attempting to squeeze through a closed corner seam!
      if (!flank1 || flank1.blocked || !flank2 || flank2.blocked) {
        return false; 
      }
    }
  }
  return true;
}