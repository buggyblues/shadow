import type { SkillType, Tile } from './types.js'

export const DEFAULT_GAME_FPS = 20
export const DEFAULT_MATCH_DURATION_SECONDS = 60

export interface TerrainRule {
  label: string
  tankPassable: boolean
  engineerPassable: boolean
  bombPlaceable: boolean
  blocksShot: boolean
  blocksExplosion: boolean
  destructibleByShot?: Tile
  destructibleByExplosion?: Tile
  hidesUnits?: boolean
  tankOpaque?: boolean
  engineerSwimming?: boolean
}

export interface WarbuddyRules {
  timing: {
    fps: number
    durationSeconds: number
    minFps: number
    maxFps: number
    minDurationSeconds: number
    maxDurationSeconds: number
  }
  script: {
    maxBytes: number
    timeoutMs: number
    blockedTokens: RegExp
  }
  engine: {
    maxActionQueue: number
    maxSpeechPerTank: number
    speechTtlFrames: number
  }
  pickups: {
    starFirstFrame: number
    starSpawnIntervalFrames: number
    flagFirstFrame: number
    flagSpawnIntervalFrames: number
    minSeparation: number
    minUnitDistance: number
    flagTarget: number
    starPowerGlowFrames: number
  }
  units: {
    tank: {
      hitRadius: number
      crushRadius: number
      initialArmor: number
      moveCooldownFrames: number
    }
    engineer: {
      hitRadius: number
      moveCooldownFrames: number
      initialBombRange: number
      maxBombRange: number
      initialMaxBombs: number
      maxBombs: number
      bombCooldownFrames: number
      bombFuseFrames: number
    }
    explosion: {
      ttlFrames: number
    }
  }
  skills: Record<SkillType, { cooldownFrames: number }>
  terrain: Record<Tile, TerrainRule>
}

export const DEFAULT_TANK_STRATEGY_CODE = `function aligned(a, b) {
  return a && b && (Math.abs(a[0] - b[0]) < 0.45 || Math.abs(a[1] - b[1]) < 0.45);
}

var DELTAS = { up: [0, -1], right: [1, 0], down: [0, 1], left: [-1, 0] };

function cell(position) {
  return [Math.floor(position[0]), Math.floor(position[1])];
}

function tileAt(game, position) {
  var grid = cell(position);
  var column = game.map[grid[0]];
  return column && column[grid[1]];
}

function open(game, position) {
  var tile = tileAt(game, position);
  return tile === "." || tile === "o";
}

function shotOpen(game, position) {
  var tile = tileAt(game, position);
  return tile === "." || tile === "o" || tile === "w";
}

function engineerOpen(game, position) {
  var tile = tileAt(game, position);
  return tile === "." || tile === "o" || tile === "w";
}

function ahead(unit) {
  var delta = DELTAS[unit.direction];
  return [unit.position[0] + delta[0], unit.position[1] + delta[1]];
}

function lineClear(game, from, to) {
  var dx = to[0] - from[0];
  var dy = to[1] - from[1];
  var length = Math.max(Math.abs(dx), Math.abs(dy));
  var steps = Math.max(1, Math.ceil(length * 3));
  for (var i = 1; i < steps; i += 1) {
    var point = [from[0] + (dx * i) / steps, from[1] + (dy * i) / steps];
    if (!shotOpen(game, point)) return false;
  }
  return true;
}

function shotDirection(game, from, to) {
  if (!aligned(from, to) || !lineClear(game, from, to)) return null;
  var dx = to[0] - from[0];
  var dy = to[1] - from[1];
  if (Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? "right" : "left";
  return dy > 0 ? "down" : "up";
}

function distance(a, b) {
  var dx = a[0] - b[0];
  var dy = a[1] - b[1];
  return Math.sqrt(dx * dx + dy * dy);
}

function angleTo(from, to) {
  return Math.atan2(to[1] - from[1], to[0] - from[0]) * 180 / Math.PI;
}

function softObstacleBetween(game, from, to) {
  var dx = to[0] - from[0];
  var dy = to[1] - from[1];
  var length = Math.max(Math.abs(dx), Math.abs(dy));
  var steps = Math.max(1, Math.ceil(length * 8));
  var lastKey = "";
  for (var i = 1; i <= steps; i += 1) {
    var point = [from[0] + (dx * i) / steps, from[1] + (dy * i) / steps];
    var grid = cell(point);
    var key = grid[0] + ":" + grid[1];
    if (key === lastKey) continue;
    lastKey = key;
    var tile = tileAt(game, point);
    if (!tile || tile === "x") return null;
    if (tile === "m") return [grid[0] + 0.5, grid[1] + 0.5];
  }
  return null;
}

function clearSoftObstacle(tank, target, game) {
  var obstacle = target && softObstacleBetween(game, tank.position, target);
  if (!obstacle) return false;
  tank.faceAngle(angleTo(tank.position, obstacle));
  tank.fire();
  return true;
}

function bombPlan(engineer, game) {
  var origin = cell(engineer.position);
  var cells = [[origin[0], origin[1]]];
  var opensSoft = false;
  for (var direction in DELTAS) {
    var delta = DELTAS[direction];
    for (var step = 1; step <= engineer.bombRange; step += 1) {
      var grid = [origin[0] + delta[0] * step, origin[1] + delta[1] * step];
      var tile = game.map[grid[0]] && game.map[grid[0]][grid[1]];
      if (!tile || tile === "x") break;
      cells.push(grid);
      if (tile === "m") {
        opensSoft = true;
        break;
      }
    }
  }
  return { cells: cells, opensSoft: opensSoft };
}

function cellInList(grid, cells) {
  for (var i = 0; i < cells.length; i += 1) {
    if (cells[i][0] === grid[0] && cells[i][1] === grid[1]) return true;
  }
  return false;
}

function positionInBombCells(position, cells) {
  return cellInList(cell(position), cells);
}

function bombHasEscape(engineer, game, cells) {
  for (var direction in DELTAS) {
    var delta = DELTAS[direction];
    var clear = true;
    for (var step = 1; step <= engineer.bombRange + 3; step += 1) {
      var next = [engineer.position[0] + delta[0] * step, engineer.position[1] + delta[1] * step];
      if (!engineerOpen(game, next)) {
        clear = false;
        break;
      }
    }
    if (!clear) continue;
    var escape = [
      engineer.position[0] + delta[0] * (engineer.bombRange + 3),
      engineer.position[1] + delta[1] * (engineer.bombRange + 3),
    ];
    if (!cellInList(cell(escape), cells)) return true;
  }
  return false;
}

function safeBombPlan(engineer, game, squad) {
  var plan = bombPlan(engineer, game);
  if (squad && squad.tank && positionInBombCells(squad.tank.position, plan.cells)) return null;
  if (!bombHasEscape(engineer, game, plan.cells)) return null;
  return plan;
}

function safeBombOpensSoft(engineer, game, squad) {
  var plan = safeBombPlan(engineer, game, squad);
  return !!(plan && plan.opensSoft);
}

function safeBombCoversTarget(engineer, game, squad, target) {
  if (!target) return false;
  var plan = safeBombPlan(engineer, game, squad);
  return !!(plan && positionInBombCells(target, plan.cells));
}

function tankAdvance(tank, game) {
  var choices = [tank.direction, "right", "down", "left", "up"];
  for (var i = 0; i < choices.length; i += 1) {
    var direction = choices[i];
    var delta = DELTAS[direction];
    var next = [tank.position[0] + delta[0], tank.position[1] + delta[1]];
    if (!open(game, next)) continue;
    if (direction === tank.direction) tank.step(direction);
    else tank.face(direction);
    return;
  }
  tank.face("right");
}

function moveTankToward(tank, target, game) {
  if (clearSoftObstacle(tank, target, game)) {
    return;
  }
  if (target && tank.moveTo(target[0], target[1])) {
    return;
  }
  tankAdvance(tank, game);
}

function engage(tank, target, game) {
  var direction = target && shotDirection(game, tank.position, target.position);
  if (!direction) return false;
  if (tank.direction === direction) tank.fire();
  else tank.face(direction);
  return true;
}

function onTankIdle(tank, enemy, game, squad) {
  var enemyTank = enemy.tank && !enemy.tank.crashed ? enemy.tank : null;
  var enemyEngineer = enemy.engineer && enemy.engineer.alive ? enemy.engineer : null;
  if (enemyTank && !enemy.status.shielded && engage(tank, enemyTank, game)) {
    return;
  }
  if (enemyEngineer && engage(tank, enemyEngineer, game)) {
    return;
  }
  if (squad.skill.remainingCooldownFrames === 0 && squad.skill.type === "shield" && enemy.bullet) {
    tank.shield();
    return;
  }
  var pressureTarget =
    (enemyTank && distance(tank.position, enemyTank.position) <= 7 && enemyTank.position) ||
    (enemyEngineer && distance(tank.position, enemyEngineer.position) <= 5 && enemyEngineer.position);
  var target = pressureTarget || game.flag || game.star || (enemyTank && enemyTank.position) || (enemyEngineer && enemyEngineer.position);
  moveTankToward(tank, target, game);
}

function onEngineerIdle(engineer, enemy, game, squad) {
  var target = game.flag || game.star || (enemy.tank && enemy.tank.position) || (enemy.engineer && enemy.engineer.position);
  if (!target && safeBombOpensSoft(engineer, game, squad)) {
    engineer.bomb();
    return;
  }
  if (target) {
    engineer.moveTo(target[0], target[1]);
    return;
  }
  engineer.step(engineer.direction);
}`

export const DEFAULT_WARBUDDY_RULES: WarbuddyRules = {
  timing: {
    fps: DEFAULT_GAME_FPS,
    durationSeconds: DEFAULT_MATCH_DURATION_SECONDS,
    minFps: 1,
    maxFps: 60,
    minDurationSeconds: 4,
    maxDurationSeconds: 120,
  },
  script: {
    maxBytes: 24_000,
    timeoutMs: 25,
    blockedTokens:
      /\b(?:constructor|document|eval|fetch|Function|global|globalThis|import|process|prototype|require|WebSocket|window|Worker|XMLHttpRequest)\b|__proto__/u,
  },
  engine: {
    maxActionQueue: 12,
    maxSpeechPerTank: 32,
    speechTtlFrames: 18,
  },
  pickups: {
    starFirstFrame: 120,
    starSpawnIntervalFrames: 150,
    flagFirstFrame: 180,
    flagSpawnIntervalFrames: 210,
    minSeparation: 5,
    minUnitDistance: 3,
    flagTarget: 3,
    starPowerGlowFrames: 36,
  },
  units: {
    tank: {
      hitRadius: 0.68,
      crushRadius: 0.82,
      initialArmor: 1,
      moveCooldownFrames: 5,
    },
    engineer: {
      hitRadius: 0.58,
      moveCooldownFrames: 6,
      initialBombRange: 2,
      maxBombRange: 5,
      initialMaxBombs: 1,
      maxBombs: 3,
      bombCooldownFrames: 12,
      bombFuseFrames: 18,
    },
    explosion: {
      ttlFrames: 6,
    },
  },
  skills: {
    shield: { cooldownFrames: 30 },
    freeze: { cooldownFrames: 34 },
    stun: { cooldownFrames: 25 },
    overload: { cooldownFrames: 32 },
    cloak: { cooldownFrames: 35 },
    poison: { cooldownFrames: 25 },
    teleport: { cooldownFrames: 40 },
    boost: { cooldownFrames: 31 },
  },
  terrain: {
    '.': {
      label: 'open ground',
      tankPassable: true,
      engineerPassable: true,
      bombPlaceable: true,
      blocksShot: false,
      blocksExplosion: false,
    },
    o: {
      label: 'grass',
      tankPassable: true,
      engineerPassable: true,
      bombPlaceable: true,
      blocksShot: false,
      blocksExplosion: false,
      destructibleByExplosion: '.',
      hidesUnits: true,
    },
    w: {
      label: 'water',
      tankPassable: false,
      engineerPassable: true,
      bombPlaceable: false,
      blocksShot: false,
      blocksExplosion: false,
      engineerSwimming: true,
    },
    m: {
      label: 'dirt mound',
      tankPassable: false,
      engineerPassable: false,
      bombPlaceable: false,
      blocksShot: true,
      blocksExplosion: false,
      destructibleByShot: '.',
      destructibleByExplosion: '.',
    },
    x: {
      label: 'wall',
      tankPassable: false,
      engineerPassable: false,
      bombPlaceable: false,
      blocksShot: true,
      blocksExplosion: true,
      tankOpaque: true,
    },
  },
}

export function terrainRule(tile: Tile | null | undefined, rules = DEFAULT_WARBUDDY_RULES) {
  return tile ? (rules.terrain[tile] ?? null) : null
}

export function canTankEnterTile(tile: Tile | null | undefined, rules = DEFAULT_WARBUDDY_RULES) {
  return terrainRule(tile, rules)?.tankPassable ?? false
}

export function canEngineerEnterTile(
  tile: Tile | null | undefined,
  rules = DEFAULT_WARBUDDY_RULES,
) {
  return terrainRule(tile, rules)?.engineerPassable ?? false
}

export function canPlaceBombOnTerrain(
  tile: Tile | null | undefined,
  rules = DEFAULT_WARBUDDY_RULES,
) {
  return terrainRule(tile, rules)?.bombPlaceable ?? false
}

export function terrainBlocksShot(tile: Tile | null | undefined, rules = DEFAULT_WARBUDDY_RULES) {
  return terrainRule(tile, rules)?.blocksShot ?? true
}

export function terrainBlocksExplosion(
  tile: Tile | null | undefined,
  rules = DEFAULT_WARBUDDY_RULES,
) {
  return terrainRule(tile, rules)?.blocksExplosion ?? true
}

export function terrainHidesUnits(tile: Tile | null | undefined, rules = DEFAULT_WARBUDDY_RULES) {
  return terrainRule(tile, rules)?.hidesUnits ?? false
}
