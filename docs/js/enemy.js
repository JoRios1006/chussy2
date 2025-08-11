import { GAME_CONFIG } from "./utils.js";
import { player } from "./player.js";
import { checkWallCollision, castRay } from "./map.js";
import { calculateDistance, spriteCache, worldToScreen } from "./utils.js";
import { findPath } from "./pathfinding.js";
import { handlePlayerDeath } from "./game.js";

export function spawnEnemy(state) {
  if (!state.enemies || !Array.isArray(state.enemies)) {
    state.enemies = [];
  }

  // Find valid spawn position
  let x, y;
  const safeSpawnPoints = [
    { x: 3.5, y: 3.5 },
    { x: 8.5, y: 3.5 },
    { x: 3.5, y: 8.5 },
    { x: 8.5, y: 8.5 },
  ];
  const spawnPoint =
    safeSpawnPoints[Math.floor(Math.random() * safeSpawnPoints.length)];
  x = spawnPoint.x + (Math.random() * 2 - 1);
  y = spawnPoint.y + (Math.random() * 2 - 1);

  // Only spawn if position is valid (not in a wall)
  if (!checkWallCollision(x, y)) {
    state.enemies.push({
      x: x,
      y: y,
      health: 100,
      type: "ENEMY_1",
      lastMove: Date.now(),
      lastPathUpdate: 0,
      pathIndex: 0,
      path: null,
    });
  }
}

export function updateEnemies(state, player) {
  if (!state.gameOver && state.enemies && Array.isArray(state.enemies)) {
    // Sort enemies by distance for proper z-indexing
    state.enemies.sort((a, b) => {
      if (!a || !b) return 0;
      const distA = Math.sqrt(
        Math.pow(a.x - player.x, 2) + Math.pow(a.y - player.y, 2),
      );
      const distB = Math.sqrt(
        Math.pow(b.x - player.x, 2) + Math.pow(b.y - player.y, 2),
      );
      return distB - distA; // Sort furthest to closest
    });

    for (let i = state.enemies.length - 1; i >= 0; i--) {
      const enemy = state.enemies[i];
      if (!enemy || typeof enemy.x !== "number" || typeof enemy.y !== "number")
        continue;

      const dx = player.x - enemy.x;
      const dy = player.y - enemy.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // Damage player and remove enemy on collision
      if (dist < 0.5) {
        player.health = Math.max(0, player.health - 25); // Reduce health by 25
        state.enemies.splice(i, 1);
        if (player.health <= 0) {
          handlePlayerDeath();
        }
        continue;
      }

      // Update pathfinding more frequently for smoother movement
      const now = Date.now();
      if (now - enemy.lastPathUpdate > 100) {
        // Reduced from 500ms to 100ms
        enemy.path = findPath(enemy.x, enemy.y, player.x, player.y);
        enemy.lastPathUpdate = now;
        enemy.pathIndex = 0;
      }

      // Follow path if available with improved movement
      if (
        enemy.path &&
        enemy.path.length > 0 &&
        enemy.pathIndex < enemy.path.length
      ) {
        const target = enemy.path[enemy.pathIndex];
        const tdx = target.x - enemy.x;
        const tdy = target.y - enemy.y;
        const tdist = Math.sqrt(tdx * tdx + tdy * tdy);

        if (tdist < 0.1) {
          enemy.pathIndex++;
        } else {
          // Smoother movement with proper collision radius
          const speed = 0.003;
          const newX = enemy.x + (tdx / tdist) * speed;
          const newY = enemy.y + (tdy / tdist) * speed;

          // Check collision with entity radius
          if (!checkWallCollision(newX, newY, 0.3)) {
            enemy.x = newX;
            enemy.y = newY;
          } else {
            // Try sliding along walls if direct path is blocked
            if (!checkWallCollision(newX, enemy.y, 0.3)) {
              enemy.x = newX;
            } else if (!checkWallCollision(enemy.x, newY, 0.3)) {
              enemy.y = newY;
            }
          }
        }
      }
    }
  }
}

// Enemy rendering with health bars
export function renderEnemy(ctx, enemy, player, canvas) {
  if (!enemy || typeof enemy.x !== "number" || typeof enemy.y !== "number")
    return;

  const { screenX, screenY, size, distance } = worldToScreen(
    enemy.x,
    enemy.y,
    player.x,
    player.y,
    player.angle,
    canvas,
  );

  // Simplified visibility check using normalized angles
  const dx = enemy.x - player.x;
  const dy = enemy.y - player.y;
  const angle = Math.atan2(dy, dx);
  const relativeAngle =
    ((angle - player.angle + Math.PI * 3) % (Math.PI * 2)) - Math.PI;

  // Check if enemy is in field of view
  if (Math.abs(relativeAngle) > GAME_CONFIG.FOV / 2) return;

  // Check if enemy is behind a wall
  const wallDist = castRay(angle, player.x, player.y, player.angle);
  if (distance > wallDist) return;

  // Skip if outside view with margin
  const margin = size * 0.5;
  if (screenX < -margin || screenX > canvas.width + margin) return;

  // Draw enemy with proper z-indexing and health bar
  ctx.save();
  const sprite = spriteCache[enemy.type];
  if (sprite) {
    const width = Math.max(16, size);
    const height = width;
    ctx.drawImage(
      sprite,
      screenX - width / 2,
      screenY - height / 2,
      width,
      height,
    );
  }

  // Draw health bar
  const healthBarWidth = size / 2;
  const healthBarHeight = size / 10;
  const healthPercent = enemy.health / 100;

  ctx.fillStyle = "#000000";
  ctx.fillRect(
    screenX - healthBarWidth / 2,
    screenY - size / 3,
    healthBarWidth,
    healthBarHeight,
  );
  ctx.fillStyle = "#00ff00";
  ctx.fillRect(
    screenX - healthBarWidth / 2,
    screenY - size / 3,
    healthBarWidth * healthPercent,
    healthBarHeight,
  );

  ctx.restore();
}
