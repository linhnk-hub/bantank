/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { GameEngine, NEUTRAL_INPUT } from './gameEngine.ts';
import { VsEngine } from './vsEngine.ts';
import {
  VS_ARENA_MAP,
  computeHazardDamagePerTick,
  computeVsSafeZoneBounds,
  isTankInsideSafeZone,
  validateVsArenaMap,
} from './vsMap.ts';
import { VS_RULES_CONFIG } from './vsTypes.ts';
import { isSupportItemSystemEnabledForMode } from './supportItemSystem.ts';
import { checkHitboxVsTerrain, getTankHitbox, intersectAABB } from './physics.ts';
import type { InputState } from './types.ts';

interface TestResult {
  group: string;
  name: string;
  passed: boolean;
  detail: string;
}

const results: TestResult[] = [];

function assert(cond: boolean, message: string): void {
  if (!cond) {
    throw new Error(message);
  }
}

function runTest(group: string, name: string, fn: () => string | void): void {
  try {
    const detail = fn() ?? 'OK';
    results.push({ group, name, passed: true, detail });
    console.log(`  [PASS] [${group}] ${name}${detail !== 'OK' ? ` — ${detail}` : ''}`);
  } catch (err: any) {
    const msg = err?.message || String(err);
    results.push({ group, name, passed: false, detail: msg });
    console.error(`  [FAIL] [${group}] ${name} — ${msg}`);
  }
}

function makeInput(partial: Partial<InputState>): InputState {
  return { ...NEUTRAL_INPUT, ...partial };
}

console.log('====================================================================');
console.log('  BTO-VS-GAMEPLAY-V1.2 AUTOMATED VERIFICATION SUITE (GROUPS A - I)  ');
console.log('====================================================================');

// =========================================================================
// NHÓM A — CHẾ ĐỘ P1 vs P2
// =========================================================================
runTest('A', 'A1: P1 vs P2 team roster (TEAM_1=P1, TEAM_2=P2, no A.I)', () => {
  const vs = new VsEngine('VS_P1_P2');
  const st = vs.getState();
  assert(st.combatants.length === 2, `Expected 2 combatants, got ${st.combatants.length}`);
  const p1 = vs.getCombatantByRole('P1')!;
  const p2 = vs.getCombatantByRole('P2')!;
  assert(p1.team === 'TEAM_1' && !p1.isAI, 'P1 must be TEAM_1 human');
  assert(p2.team === 'TEAM_2' && !p2.isAI, 'P2 must be TEAM_2 human');
  assert(p1.lives === 3 && p2.lives === 3, 'Both P1 and P2 must start with 3 lives');
  return '2 human tanks, 3 lives each';
});

runTest('A', 'A2: Independent P1 and P2 controls without cross-control', () => {
  const vs = new VsEngine('VS_P1_P2');
  const p1Before = { x: vs.getCombatantByRole('P1')!.tank.x, y: vs.getCombatantByRole('P1')!.tank.y };
  const p2Before = { x: vs.getCombatantByRole('P2')!.tank.x, y: vs.getCombatantByRole('P2')!.tank.y };

  // Move only P1 RIGHT for 10 ticks
  for (let i = 0; i < 10; i++) {
    vs.stepTick(makeInput({ right: true }), NEUTRAL_INPUT);
  }
  const p1After1 = { ...vs.getCombatantByRole('P1')!.tank };
  const p2After1 = { ...vs.getCombatantByRole('P2')!.tank };
  assert(p1After1.x > p1Before.x, 'P1 should move right when p1Input.right=true');
  assert(p2After1.x === p2Before.x && p2After1.y === p2Before.y, 'P2 must NOT move on P1 input');

  // Move only P2 LEFT for 10 ticks
  for (let i = 0; i < 10; i++) {
    vs.stepTick(NEUTRAL_INPUT, makeInput({ left: true }));
  }
  const p1After2 = { ...vs.getCombatantByRole('P1')!.tank };
  const p2After2 = { ...vs.getCombatantByRole('P2')!.tank };
  assert(p1After2.x === p1After1.x && p1After2.y === p1After1.y, 'P1 must NOT move on P2 input');
  assert(p2After2.x < p2After1.x, 'P2 should move left when p2Input.left=true');
  return `P1 x:${p1Before.x}->${p1After1.x}, P2 x:${p2Before.x}->${p2After2.x}`;
});

runTest('A', 'A3: Valid kill, -1 life, 3s respawn, 2s protection (no incoming & no outgoing damage), early win at 0 lives', () => {
  const vs = new VsEngine('VS_P1_P2');
  // Place P1 at (64, 96) facing RIGHT and P2 at (112, 96) facing LEFT (clear row 6 interior)
  vs.debugForceTankPosition('P1', 64, 96, 'RIGHT');
  vs.debugForceTankPosition('P2', 112, 96, 'LEFT');

  // P1 fires at P2
  vs.stepTick(makeInput({ shoot: true }), NEUTRAL_INPUT);
  let killedAtTick = -1;
  for (let i = 0; i < 40; i++) {
    vs.stepTick(NEUTRAL_INPUT, NEUTRAL_INPUT);
    if (vs.getCombatantByRole('P2')!.isDead) {
      killedAtTick = i + 1;
      break;
    }
  }
  const p2AfterKill = vs.getCombatantByRole('P2')!;
  const p1AfterKill = vs.getCombatantByRole('P1')!;
  assert(killedAtTick > 0, 'P2 should be killed by P1 bullet');
  assert(p2AfterKill.lives === 2, `P2 should have 2 lives left, got ${p2AfterKill.lives}`);
  assert(p2AfterKill.respawnTicksRemaining === 180, `Respawn should start at 180 ticks, got ${p2AfterKill.respawnTicksRemaining}`);
  assert(p1AfterKill.kills === 1 && vs.getState().team1.totalKills === 1, 'P1 & TEAM_1 should get 1 kill');

  // Step 179 ticks -> still dead
  for (let i = 0; i < 179; i++) vs.stepTick();
  assert(vs.getCombatantByRole('P2')!.isDead, 'P2 must still be dead at tick 179 of respawn');

  // Step 1 more tick (180th) -> respawns with 120 ticks protection
  vs.stepTick();
  const p2Respawned = vs.getCombatantByRole('P2')!;
  assert(!p2Respawned.isDead && p2Respawned.tank.isAlive, 'P2 must respawn at exact 180th tick');
  assert(p2Respawned.protectionTicksRemaining === 120, `Protection must be 120 ticks (2s), got ${p2Respawned.protectionTicksRemaining}`);

  // While protected: P2 CANNOT shoot, AND enemy bullets deal 0 damage to P2
  vs.stepTick(NEUTRAL_INPUT, makeInput({ shoot: true }));
  assert(vs.getBullets().filter((b) => b.ownerRole === 'P2').length === 0, 'Protected tank must NOT fire bullets');

  // Shoot directly at protected P2 -> bullet hits shield, 0 damage, lives remain 2
  vs.debugForceTankPosition('P1', p2Respawned.tank.x - 24, p2Respawned.tank.y, 'RIGHT');
  vs.stepTick(makeInput({ shoot: true }), NEUTRAL_INPUT);
  for (let i = 0; i < 20; i++) vs.stepTick();
  assert(!vs.getCombatantByRole('P2')!.isDead && vs.getCombatantByRole('P2')!.lives === 2, 'Protected tank must take 0 damage');

  // Finish remaining protection ticks
  const remProt = vs.getCombatantByRole('P2')!.protectionTicksRemaining;
  for (let i = 0; i < remProt; i++) vs.stepTick();
  assert(vs.getCombatantByRole('P2')!.protectionTicksRemaining === 0, 'Protection must expire cleanly after 2s');

  // After protection expires, P2 CAN shoot again
  vs.stepTick(NEUTRAL_INPUT, makeInput({ shoot: true }));
  assert(vs.getBullets().some((b) => b.ownerRole === 'P2'), 'Tank must be able to shoot after protection expires');

  // Drain P2 remaining 2 lives -> early win for TEAM_1
  for (let killNum = 0; killNum < 2; killNum++) {
    vs.debugForceTankPosition('P1', 64, 96, 'RIGHT');
    vs.debugForceTankPosition('P2', 96, 96, 'UP');
    vs.stepTick(makeInput({ shoot: true }), NEUTRAL_INPUT);
    for (let i = 0; i < 30; i++) {
      vs.stepTick();
      if (vs.getCombatantByRole('P2')!.isDead) break;
    }
    if (killNum === 0) {
      // Wait respawn + protection
      for (let i = 0; i < 180 + 120; i++) vs.stepTick();
    }
  }

  const finalSt = vs.getState();
  assert(finalSt.phase === 'FINISHED', `Expected FINISHED, got ${finalSt.phase}`);
  assert(finalSt.outcome !== null, 'Outcome must be locked');
  assert(finalSt.outcome!.winnerTeam === 'TEAM_1', 'TEAM_1 must win early');
  assert(finalSt.outcome!.team1Result === 'WIN' && finalSt.outcome!.team2Result === 'LOSS', 'Strict WIN/LOSS');
  assert(!finalSt.outcome!.decidedByRandom5050 && finalSt.random5050CallCount === 0, 'No 50/50 random on single team elimination');
  return 'Kill->Respawn(180t)->Protect(120t)->NoShootWhileProtected->EarlyWin verified';
});

// =========================================================================
// NHÓM B — CHẾ ĐỘ P1 + A.I vs P2 + A.I
// =========================================================================
runTest('B', 'B1: 2v2 roster, Friendly Fire OFF, and A.I never attacks teammate', () => {
  const vs = new VsEngine('VS_P1_AI_P2_AI');
  const st = vs.getState();
  assert(st.combatants.length === 4, 'Expected 4 tanks in 2v2');
  const p1 = vs.getCombatantByRole('P1')!;
  const ai1 = vs.getCombatantByRole('AI_1')!;
  const p2 = vs.getCombatantByRole('P2')!;
  const ai2 = vs.getCombatantByRole('AI_2')!;
  assert(p1.team === 'TEAM_1' && ai1.team === 'TEAM_1', 'TEAM_1 = P1 + AI_1');
  assert(p2.team === 'TEAM_2' && ai2.team === 'TEAM_2', 'TEAM_2 = P2 + AI_2');
  assert(ai1.lives === 3 && ai2.lives === 3, 'A.I tanks start with 3 lives');

  // Friendly fire test: place P1 right next to AI_1 facing AI_1 and fire
  vs.debugForceTankPosition('P1', 64, 96, 'RIGHT');
  vs.debugForceTankPosition('AI_1', 96, 96, 'RIGHT');
  vs.debugForceTankPosition('P2', 192, 0, 'LEFT');
  vs.debugForceTankPosition('AI_2', 192, 192, 'LEFT');
  vs.stepTick(makeInput({ shoot: true }), NEUTRAL_INPUT);
  for (let i = 0; i < 30; i++) vs.stepTick();
  assert(!vs.getCombatantByRole('AI_1')!.isDead && vs.getCombatantByRole('AI_1')!.lives === 3, 'Friendly fire MUST be OFF (P1 bullet must not harm AI_1)');
  assert(vs.getCombatantByRole('P1')!.deaths === 0, 'AI_1 must not harm P1');
  return '4 tanks, FF OFF, 0 teammate harm';
});

runTest('B', 'B2: A.I fights opponents, earns kills for team, and team only loses when BOTH tanks eliminated', () => {
  const vs = new VsEngine('VS_P1_AI_P2_AI');
  // Put AI_1 aligned with P2 in open center row 6 so AI_1 engages P2 directly
  vs.debugForceTankPosition('P1', 0, 0, 'DOWN');
  vs.debugForceTankPosition('AI_1', 64, 96, 'RIGHT');
  vs.debugForceTankPosition('P2', 112, 96, 'UP');
  vs.debugForceTankPosition('AI_2', 192, 192, 'LEFT');

  let p2HitByAi1 = false;
  for (let t = 0; t < 180; t++) {
    vs.stepTick(NEUTRAL_INPUT, NEUTRAL_INPUT);
    if (vs.getCombatantByRole('AI_1')!.kills >= 1) {
      p2HitByAi1 = true;
      break;
    }
  }
  assert(p2HitByAi1, 'AI_1 should actively shoot and kill opponent P2');
  assert(vs.getState().team1.totalKills >= 1, 'AI_1 kill must be credited to TEAM_1');

  // Verify partial elimination does NOT end match: eliminate P2 completely while AI_2 still has 3 lives
  const vs2 = new VsEngine('VS_P1_AI_P2_AI');
  vs2.debugSetTankLives('P2', 1);
  vs2.debugForceTankPosition('P1', 64, 96, 'RIGHT');
  vs2.debugForceTankPosition('AI_1', 0, 0, 'DOWN');
  vs2.debugForceTankPosition('P2', 96, 96, 'UP');
  vs2.debugForceTankPosition('AI_2', 192, 0, 'LEFT');
  vs2.stepTick(makeInput({ shoot: true }), NEUTRAL_INPUT);
  for (let i = 0; i < 30; i++) {
    vs2.stepTick();
    if (vs2.getCombatantByRole('P2')!.eliminatedPermanently) break;
  }
  assert(vs2.getCombatantByRole('P2')!.eliminatedPermanently, 'P2 should be permanently eliminated');
  assert(vs2.getState().phase !== 'FINISHED', 'Match MUST continue while AI_2 is still alive on TEAM_2');
  return 'AI_1 killed P2, credited TEAM_1, match continues with AI_2 alive';
});

// =========================================================================
// NHÓM C — QUẢN LÝ MẠNG SỐNG & HỒI SINH
// =========================================================================
runTest('C', 'C1: Anti-double-decrement when 2 enemy bullets hit the same tank on the exact same tick', () => {
  const vs = new VsEngine('VS_P1_AI_P2_AI');
  vs.debugForceTankPosition('P2', 96, 96, 'UP');
  // Inject two TEAM_1 bullets hitting P2's hitbox on the exact same tick
  vs.debugInjectBullet({
    id: 'test_b1',
    ownerId: 'vs_p1',
    ownerRole: 'P1',
    ownerType: 'player',
    team: 'TEAM_1',
    x: 96,
    y: 102,
    direction: 'RIGHT',
    speed: 160,
    power: 1,
  });
  vs.debugInjectBullet({
    id: 'test_b2',
    ownerId: 'vs_ai1',
    ownerRole: 'AI_1',
    ownerType: 'player',
    team: 'TEAM_1',
    x: 108,
    y: 102,
    direction: 'LEFT',
    speed: 160,
    power: 1,
  });

  vs.stepTick();
  const p2 = vs.getCombatantByRole('P2')!;
  assert(p2.isDead, 'P2 should be killed');
  assert(p2.lives === 2, `Must subtract EXACTLY 1 life (3->2), got ${p2.lives}`);
  assert(p2.deaths === 1, `Must record EXACTLY 1 death, got ${p2.deaths}`);
  assert(vs.getState().team1.totalKills === 1, `Must credit EXACTLY 1 kill, got ${vs.getState().team1.totalKills}`);
  return '2 simultaneous bullets -> strictly -1 life, 1 death, 1 kill';
});

runTest('C', 'C2: Respawn fallback when primary spawn tile is occupied by enemy tank (no overlap, valid tile in team zone)', () => {
  const vs = new VsEngine('VS_P1_P2');
  const p1PrimaryX = 0;
  const p1PrimaryY = 96; // row 6, col 0

  // Kill P1 once
  vs.debugForceTankPosition('P1', 64, 96, 'RIGHT');
  vs.debugForceTankPosition('P2', 96, 96, 'LEFT');
  vs.stepTick(NEUTRAL_INPUT, makeInput({ shoot: true }));
  for (let i = 0; i < 30; i++) {
    vs.stepTick();
    if (vs.getCombatantByRole('P1')!.isDead) break;
  }
  assert(vs.getCombatantByRole('P1')!.isDead, 'P1 must be dead');

  // Move P2 directly onto P1's primary spawn tile (0, 96)
  vs.debugForceTankPosition('P2', p1PrimaryX, p1PrimaryY, 'RIGHT');

  // Wait full 180 ticks for P1 respawn
  for (let i = 0; i < 180; i++) vs.stepTick();
  const p1 = vs.getCombatantByRole('P1')!;
  const p2 = vs.getCombatantByRole('P2')!;
  assert(!p1.isDead && p1.tank.isAlive, 'P1 must respawn at fallback tile');
  assert(!(p1.tank.x === p1PrimaryX && p1.tank.y === p1PrimaryY), 'P1 must NOT spawn overlapping P2 at occupied primary tile');
  assert(p1.tank.x <= 2 * 16, `Fallback spawn must be inside TEAM_1 zone (col<=2), got x=${p1.tank.x}`);
  assert(!intersectAABB(getTankHitbox(p1.tank.x, p1.tank.y), getTankHitbox(p2.tank.x, p2.tank.y)), 'Must NOT overlap P2 hitbox');
  const terr = checkHitboxVsTerrain(getTankHitbox(p1.tank.x, p1.tank.y), vs.getTerrain(), { forBullet: false });
  assert(!terr.collides && !terr.isOutOfBounds, 'Respawn must NOT collide with obstacles');
  return `Occupied (0,96) -> safe fallback (${p1.tank.x},${p1.tank.y})`;
});

// =========================================================================
// NHÓM D — HẾT 180 GIÂY & HIỆP PHỤ SUDDEN DEATH
// =========================================================================
runTest('D', 'D1: 180s timer transitions to SUDDEN DEATH (no draw, does not decide by kills)', () => {
  const vs = new VsEngine('VS_P1_P2');
  assert(vs.getState().normalRemainingSeconds === 180, 'Must start at 180s');
  // Give TEAM_1 a kill lead before 0s
  vs.debugForceTankPosition('P1', 64, 96, 'RIGHT');
  vs.debugForceTankPosition('P2', 96, 96, 'UP');
  vs.stepTick(makeInput({ shoot: true }), NEUTRAL_INPUT);
  for (let i = 0; i < 30; i++) {
    vs.stepTick();
    if (vs.getCombatantByRole('P2')!.isDead) break;
  }
  for (let i = 0; i < 185; i++) vs.stepTick(); // Let P2 finish respawning
  assert(vs.getState().team1.totalKills === 1 && vs.getState().team2.totalKills === 0, 'TEAM_1 leads 1-0 in kills');

  // Fast-forward remaining ticks to 1 tick left, then hit 0s
  vs.debugSetNormalRemainingTicks(1);
  vs.stepTick();
  const st = vs.getState();
  assert(st.normalRemainingTicks === 0, 'Normal timer must reach 0');
  assert(st.phase === 'SUDDEN_DEATH', `Expected SUDDEN_DEATH, got ${st.phase}`);
  assert(st.outcome === null, 'Must NOT declare draw or auto-win by kills on timeout');
  assert(st.safeZone.shrinkLevel === 0, 'Must NOT shrink immediately upon entering SUDDEN_DEATH');
  assert(st.safeZone.ticksUntilNextShrink === 1200, 'Shrink countdown must start at full 1200 ticks (20s)');
  return '180s->0s with 1-0 kill lead -> SUDDEN_DEATH (no draw, no early kill-count win)';
});

runTest('D', 'D2: Pending respawn before 0s finishes during SUDDEN_DEATH_TRANSITION before 20s shrink starts; no new respawns after SD starts', () => {
  const vs = new VsEngine('VS_P1_P2');
  // Kill P2 right before 0s
  vs.debugForceTankPosition('P1', 64, 96, 'RIGHT');
  vs.debugForceTankPosition('P2', 96, 96, 'UP');
  vs.stepTick(makeInput({ shoot: true }), NEUTRAL_INPUT);
  for (let i = 0; i < 30; i++) {
    vs.stepTick();
    if (vs.getCombatantByRole('P2')!.isDead) break;
  }
  assert(vs.getCombatantByRole('P2')!.isDead && vs.getCombatantByRole('P2')!.lives === 2, 'P2 pending respawn');

  // Advance clock to 1 tick left while P2 still has pending respawn
  vs.debugSetNormalRemainingTicks(1);
  vs.stepTick();
  assert(vs.getState().phase === 'SUDDEN_DEATH_TRANSITION', `Expected SUDDEN_DEATH_TRANSITION, got ${vs.getState().phase}`);
  assert(vs.getState().safeZone.ticksUntilNextShrink === 1200, 'Shrink timer must stay at 1200 during transition');

  // Step through remaining respawn ticks
  const remRespawn = vs.getCombatantByRole('P2')!.respawnTicksRemaining;
  for (let i = 0; i < remRespawn; i++) vs.stepTick();

  assert(!vs.getCombatantByRole('P2')!.isDead, 'Pending respawn MUST complete cleanly');
  assert(vs.getState().phase === 'SUDDEN_DEATH', 'Must enter SUDDEN_DEATH once pending respawn completes');
  assert(vs.getState().transitionWaitTicks > 0, 'Transition wait ticks tracked separately');
  assert(vs.getState().safeZone.shrinkLevel === 0, 'Still shrinkLevel 0 right as SUDDEN_DEATH begins');
  assert(vs.getState().safeZone.ticksUntilNextShrink === 1200, 'Full 1200 ticks (20s) shrink timer starts AFTER transition');

  // Wait out P2's 2s protection, then kill P2 in SUDDEN_DEATH -> must be permanently eliminated even though lives was 2!
  for (let i = 0; i < 120; i++) vs.stepTick();
  assert(vs.getCombatantByRole('P2')!.lives === 2, 'Alive tank kept its remaining 2 lives into SD');
  vs.debugForceTankPosition('P1', 64, 96, 'RIGHT');
  vs.debugForceTankPosition('P2', 96, 96, 'UP');
  vs.stepTick(makeInput({ shoot: true }), NEUTRAL_INPUT);
  for (let i = 0; i < 30; i++) {
    vs.stepTick();
    if (vs.getState().phase === 'FINISHED') break;
  }
  assert(vs.getCombatantByRole('P2')!.eliminatedPermanently && vs.getCombatantByRole('P2')!.lives === 0, 'Kill in SD must permanently eliminate tank');
  assert(vs.getState().phase === 'FINISHED' && vs.getState().outcome?.winnerTeam === 'TEAM_1', 'TEAM_1 wins in Sudden Death');
  return 'Transition completed pending respawn without eating 20s shrink clock; SD kill = permanent elimination';
});

// =========================================================================
// NHÓM E — THU HẸP BẢN ĐỒ MỖI 20 GIÂY, VÙNG NGUY HIỂM, A.I & PAUSE
// =========================================================================
runTest('E', 'E1: Exact 20s shrink schedule (20s, 40s, 60s, 80s...), symmetry, escalating danger zone damage', () => {
  const vs = new VsEngine('VS_P1_P2');
  // Place both tanks safely at center (96, 96) and (80, 96) so they survive early shrinks
  vs.debugForceTankPosition('P1', 80, 96, 'RIGHT');
  vs.debugForceTankPosition('P2', 96, 96, 'LEFT');
  vs.debugSetNormalRemainingTicks(1);
  vs.stepTick(); // Enters SUDDEN_DEATH at tick 0 of SD
  assert(vs.getState().safeZone.shrinkLevel === 0, 'Level 0 at SD 0s');

  // Check 19.98s (1199 ticks) -> still Level 0
  for (let i = 0; i < 1199; i++) vs.stepTick();
  assert(vs.getState().safeZone.shrinkLevel === 0, 'Must STILL be Level 0 at 1199 ticks');

  // 1200th tick (20.0s) -> Level 1
  vs.stepTick();
  assert(vs.getState().safeZone.shrinkLevel === 1, 'Must become Level 1 at exact 20s (1200 ticks)');

  // 2400th tick (40.0s) -> Level 2
  for (let i = 0; i < 1200; i++) vs.stepTick();
  assert(vs.getState().safeZone.shrinkLevel === 2, 'Must become Level 2 at exact 40s (2400 ticks)');

  // 3600th tick (60.0s) -> Level 3
  for (let i = 0; i < 1200; i++) vs.stepTick();
  assert(vs.getState().safeZone.shrinkLevel === 3, 'Must become Level 3 at exact 60s (3600 ticks)');

  // 4800th tick (80.0s) -> Level 4
  for (let i = 0; i < 1200; i++) vs.stepTick();
  assert(vs.getState().safeZone.shrinkLevel === 4, 'Must become Level 4 at exact 80s (4800 ticks)');

  // Verify mathematical symmetry and strictly escalating hazard damage across levels 1..7
  for (let lvl = 0; lvl <= 6; lvl++) {
    const b = computeVsSafeZoneBounds(lvl);
    assert(b.minCol === 12 - b.maxCol && b.minRow === 12 - b.maxRow, `Shrink level ${lvl} must be symmetric`);
  }
  for (let lvl = 1; lvl <= 6; lvl++) {
    assert(
      computeHazardDamagePerTick(lvl + 1) > computeHazardDamagePerTick(lvl),
      `Hazard damage must strictly escalate from L${lvl} to L${lvl + 1}`
    );
  }
  return 'Exact shrinks at 1200/2400/3600/4800 ticks; symmetric bounds; strictly escalating hazard damage';
});

runTest('E', 'E2: Danger zone kills human tank standing outside safe zone cleanly with no duplicate kills', () => {
  const vs = new VsEngine('VS_P1_P2');
  vs.debugForceTankPosition('P1', 96, 96, 'RIGHT'); // Center (safe)
  vs.debugForceTankPosition('P2', 192, 96, 'LEFT'); // Outer edge col 12 (danger at L1)
  vs.debugSetNormalRemainingTicks(1);
  vs.stepTick(); // Enter SD
  // Advance 1200 ticks to trigger Shrink Level 1
  for (let i = 0; i < 1200; i++) vs.stepTick();
  assert(vs.getState().safeZone.shrinkLevel === 1, 'Shrink Level 1 active');

  // Step up to 240 ticks (4s) — P2 at outer edge must take hazard damage and die permanently
  for (let i = 0; i < 240; i++) {
    vs.stepTick();
    if (vs.getState().phase === 'FINISHED') break;
  }
  const st = vs.getState();
  assert(st.phase === 'FINISHED', 'P2 must be eliminated by danger zone');
  assert(st.outcome?.winnerTeam === 'TEAM_1', 'TEAM_1 wins when P2 dies to danger zone');
  assert(vs.getCombatantByRole('P2')!.deaths === 1, 'Exactly 1 death event (no duplicates)');
  return 'P2 eliminated cleanly by L1 danger zone in <=4s with 1 death event';
});

runTest('E', 'E3: A.I recognizes Sudden Death safe zone and actively moves inside without getting stuck', () => {
  const vs = new VsEngine('VS_P1_AI_P2_AI');
  // Place humans safe near center, place AI_1 at (0, 128) and AI_2 at (192, 64) outside L2 safe zone
  vs.debugForceTankPosition('P1', 80, 96, 'UP');
  vs.debugForceTankPosition('P2', 112, 96, 'UP');
  vs.debugForceTankPosition('AI_1', 0, 128, 'RIGHT');
  vs.debugForceTankPosition('AI_2', 192, 64, 'LEFT');

  vs.debugSetNormalRemainingTicks(1);
  vs.stepTick(); // Enter SD

  // Advance 1200 ticks to Shrink Level 1 (cols 1..11, rows 1..11) — A.I should already move inward!
  for (let i = 0; i < 1200; i++) vs.stepTick();
  // Give 300 ticks (5s) after shrink L1
  for (let i = 0; i < 300; i++) {
    if (vs.getState().phase === 'FINISHED') break;
    vs.stepTick();
  }
  const ai1 = vs.getCombatantByRole('AI_1')!;
  const ai2 = vs.getCombatantByRole('AI_2')!;
  const bounds = vs.getState().safeZone.bounds;
  if (!ai1.isDead) {
    assert(isTankInsideSafeZone(ai1.tank, bounds), `AI_1 should be inside L1 safe zone, pos=(${ai1.tank.x},${ai1.tank.y})`);
  }
  if (!ai2.isDead) {
    assert(isTankInsideSafeZone(ai2.tank, bounds), `AI_2 should be inside L1 safe zone, pos=(${ai2.tank.x},${ai2.tank.y})`);
  }
  assert(!ai1.isDead || !ai2.isDead, 'A.I should actively navigate inside safe zone rather than dying outside');
  return `AI_1=(${ai1.tank.x.toFixed(0)},${ai1.tank.y.toFixed(0)}) AI_2=(${ai2.tank.x.toFixed(0)},${ai2.tank.y.toFixed(0)}) inside L1 safe zone`;
});

runTest('E', 'E4: Pause freezes all VS clocks (match timer, SD timer, 20s shrink timer) and Resume continues with zero jump', () => {
  const eng = new GameEngine();
  eng.startMatch('VS_P1_P2', 'DEFAULT');
  const vsEng = eng.getVsEngine()!;
  vsEng.debugSetNormalRemainingTicks(1);
  eng.stepTick(); // Enter SUDDEN_DEATH
  for (let i = 0; i < 600; i++) eng.stepTick(); // 10s into SD, 600 ticks until next shrink

  const beforePause = eng.getState().vsState!;
  assert(beforePause.phase === 'SUDDEN_DEATH', 'In SUDDEN_DEATH');
  assert(beforePause.safeZone.ticksUntilNextShrink === 600, 'Exactly 600 ticks left to shrink');

  // Pause and try advancing 5 seconds of real time
  assert(eng.pause(), 'Pause must succeed in VS mode');
  eng.advanceTime(2500, NEUTRAL_INPUT);
  eng.advanceTime(2500, NEUTRAL_INPUT);
  eng.stepTick();
  const duringPause = eng.getState().vsState!;
  assert(duringPause.tickCount === beforePause.tickCount, 'Tick count must freeze on Pause');
  assert(duringPause.suddenDeathElapsedTicks === beforePause.suddenDeathElapsedTicks, 'SD clock must freeze on Pause');
  assert(duringPause.safeZone.ticksUntilNextShrink === 600, 'Shrink countdown must freeze on Pause');
  assert(duringPause.safeZone.shrinkLevel === 0, 'No shrink during Pause');

  // Resume and step exactly 1 frame (16.67ms)
  assert(eng.resume(), 'Resume must succeed');
  const ticksRun = eng.advanceTime(16.7, NEUTRAL_INPUT);
  const afterResume = eng.getState().vsState!;
  assert(ticksRun === 1, `Expected 1 tick after resume frame, got ${ticksRun}`);
  assert(afterResume.safeZone.ticksUntilNextShrink === 599, 'Shrink timer resumes smoothly from 600 -> 599 (no jump/multi-shrink)');
  return 'Pause froze all clocks; Resume ticked 600->599 with zero jump';
});

// =========================================================================
// NHÓM F — QUY TẮC RANDOM 50/50 KHI BỊ LOẠI ĐỒNG THỜI
// =========================================================================
runTest('F', 'F1: Simultaneous same-tick elimination calls 50/50 random ONCE, locks outcome forever, never DRAW', () => {
  // Case 1: roll = 0.25 -> TEAM_1 wins
  const vs1 = new VsEngine('VS_P1_P2', { randomFn: () => 0.25 });
  vs1.debugSetTankLives('P1', 1);
  vs1.debugSetTankLives('P2', 1);
  vs1.debugForceTankPosition('P1', 64, 96, 'RIGHT');
  vs1.debugForceTankPosition('P2', 112, 96, 'LEFT');
  // Inject mutually lethal bullets hitting P1 and P2 in the exact same tick
  vs1.debugInjectBullet({
    id: 'sim_b1',
    ownerId: 'vs_p1',
    ownerRole: 'P1',
    ownerType: 'player',
    team: 'TEAM_1',
    x: 112,
    y: 102,
    direction: 'RIGHT',
    speed: 160,
    power: 1,
  });
  vs1.debugInjectBullet({
    id: 'sim_b2',
    ownerId: 'vs_p2',
    ownerRole: 'P2',
    ownerType: 'enemy',
    team: 'TEAM_2',
    x: 74,
    y: 102,
    direction: 'LEFT',
    speed: 160,
    power: 1,
  });

  vs1.stepTick();
  const st1 = vs1.getState();
  assert(st1.phase === 'FINISHED', 'Match must finish immediately');
  assert(st1.random5050CallCount === 1, `Random must be called strictly once, got ${st1.random5050CallCount}`);
  assert(st1.outcome?.decidedByRandom5050 === true, 'Must flag decidedByRandom5050 = true');
  assert(st1.outcome?.winnerTeam === 'TEAM_1' && st1.outcome?.team1Result === 'WIN' && st1.outcome?.team2Result === 'LOSS', 'Roll 0.25 -> TEAM_1 WIN / TEAM_2 LOSS');

  // Attempt to step 300 more ticks -> outcome MUST remain locked, NEVER re-rolled!
  for (let i = 0; i < 300; i++) vs1.stepTick();
  assert(vs1.getState().random5050CallCount === 1, 'Must NEVER re-roll after lock');
  assert(vs1.getState().outcome?.winnerTeam === 'TEAM_1', 'Winner must remain locked as TEAM_1');

  // Case 2: roll = 0.75 -> TEAM_2 wins
  const vs2 = new VsEngine('VS_P1_P2', { randomFn: () => 0.75 });
  vs2.debugSetTankLives('P1', 1);
  vs2.debugSetTankLives('P2', 1);
  vs2.debugForceTankPosition('P1', 64, 96, 'RIGHT');
  vs2.debugForceTankPosition('P2', 112, 96, 'LEFT');
  vs2.debugInjectBullet({
    id: 'sim2_b1',
    ownerId: 'vs_p1',
    ownerRole: 'P1',
    ownerType: 'player',
    team: 'TEAM_1',
    x: 112,
    y: 102,
    direction: 'RIGHT',
    speed: 160,
    power: 1,
  });
  vs2.debugInjectBullet({
    id: 'sim2_b2',
    ownerId: 'vs_p2',
    ownerRole: 'P2',
    ownerType: 'enemy',
    team: 'TEAM_2',
    x: 74,
    y: 102,
    direction: 'LEFT',
    speed: 160,
    power: 1,
  });
  vs2.stepTick();
  const st2 = vs2.getState();
  assert(st2.outcome?.winnerTeam === 'TEAM_2' && st2.outcome?.team2Result === 'WIN' && st2.outcome?.team1Result === 'LOSS', 'Roll 0.75 -> TEAM_2 WIN / TEAM_1 LOSS');
  assert(st2.random5050CallCount === 1, 'Strictly 1 random call');
  return 'Roll 0.25->T1 WIN, Roll 0.75->T2 WIN, callCount=1, locked across 300 subsequent ticks';
});

runTest('F', 'F2: Statistical fairness check of 50/50 random over N = 10,000 simultaneous eliminations', () => {
  const N = 10000;
  let team1Wins = 0;
  let team2Wins = 0;
  let draws = 0;
  const vs = new VsEngine('VS_P1_P2');

  for (let i = 0; i < N; i++) {
    vs.reset('VS_P1_P2');
    vs.debugSetTankLives('P1', 1);
    vs.debugSetTankLives('P2', 1);
    vs.debugForceTankPosition('P1', 64, 96, 'RIGHT');
    vs.debugForceTankPosition('P2', 112, 96, 'LEFT');
    vs.debugInjectBullet({
      id: `s1_${i}`,
      ownerId: 'vs_p1',
      ownerRole: 'P1',
      ownerType: 'player',
      team: 'TEAM_1',
      x: 112,
      y: 102,
      direction: 'RIGHT',
      speed: 160,
      power: 1,
    });
    vs.debugInjectBullet({
      id: `s2_${i}`,
      ownerId: 'vs_p2',
      ownerRole: 'P2',
      ownerType: 'enemy',
      team: 'TEAM_2',
      x: 74,
      y: 102,
      direction: 'LEFT',
      speed: 160,
      power: 1,
    });
    vs.stepTick();
    const out = vs.getState().outcome;
    assert(out !== null && out.decidedByRandom5050 && vs.getState().random5050CallCount === 1, 'Every sample must resolve once via 50/50');
    if (out!.winnerTeam === 'TEAM_1' && out!.team1Result === 'WIN' && out!.team2Result === 'LOSS') {
      team1Wins++;
    } else if (out!.winnerTeam === 'TEAM_2' && out!.team2Result === 'WIN' && out!.team1Result === 'LOSS') {
      team2Wins++;
    } else {
      draws++;
    }
  }

  const t1Pct = (team1Wins / N) * 100;
  const t2Pct = (team2Wins / N) * 100;
  assert(draws === 0, `Draws must be 0, got ${draws}`);
  assert(t1Pct >= 47.5 && t1Pct <= 52.5, `TEAM_1 win rate ${t1Pct.toFixed(2)}% outside fair 50/50 tolerance [47.5%, 52.5%]`);
  return `N=${N}: TEAM_1=${team1Wins} (${t1Pct.toFixed(2)}%), TEAM_2=${team2Wins} (${t2Pct.toFixed(2)}%), Draws=${draws}`;
});

// =========================================================================
// NHÓM G — BẢN ĐỒ VS & VA CHẠM
// =========================================================================
runTest('G', 'G1: VS Arena Map symmetry, zero Eagle Base, open 3x3 center, walkable across all shrink levels', () => {
  const report = validateVsArenaMap(VS_ARENA_MAP);
  assert(report.isValid, `VS Map invalid: ${report.errors.join('; ')}`);
  assert(report.baseTileCount === 0, 'Must have 0 Eagle Base tiles');
  assert(report.isHorizontallySymmetric && report.isVerticallySymmetric && report.isRotationallySymmetric180, 'Must be 100% symmetric');
  assert(report.center3x3WalkableCount === 9, 'Center 3x3 must be 100% walkable');
  assert(report.allShrinkLevelsHaveWalkableTiles, 'All shrink levels 0..6 must have walkable tiles');

  // Verify initial spawns for both VS modes have 0 terrain collision and 0 tank overlap
  for (const mode of ['VS_P1_P2', 'VS_P1_AI_P2_AI'] as const) {
    const vs = new VsEngine(mode);
    const combatants = vs.getState().combatants;
    for (let i = 0; i < combatants.length; i++) {
      const box = getTankHitbox(combatants[i].tank.x, combatants[i].tank.y);
      const terr = checkHitboxVsTerrain(box, vs.getTerrain(), { forBullet: false });
      assert(!terr.collides && !terr.isOutOfBounds, `${mode} ${combatants[i].role} initial spawn collides with terrain`);
      for (let j = i + 1; j < combatants.length; j++) {
        assert(!intersectAABB(box, getTankHitbox(combatants[j].tank.x, combatants[j].tank.y)), `${mode} initial spawns overlap`);
      }
    }
  }
  return '0 Base tiles, 100% symmetric, 9/9 center walkable, valid spawns';
});

// =========================================================================
// NHÓM H — CÔ LẬP HOÀN TOÀN VỚI CAMPAIGN & HỆ THỐNG VẬT PHẨM
// =========================================================================
runTest('H', 'H1: Zero Support Items, zero Campaign 30-enemies, 0 XP/Stars/Coins in VS; SOLO/CO-OP unaffected', () => {
  assert(isSupportItemSystemEnabledForMode('VS_P1_P2') === false, 'VS_P1_P2 must disable Support Items');
  assert(isSupportItemSystemEnabledForMode('VS_P1_AI_P2_AI') === false, 'VS_P1_AI_P2_AI must disable Support Items');
  assert(isSupportItemSystemEnabledForMode('SOLO') === true, 'SOLO must keep Support Items enabled');
  assert(isSupportItemSystemEnabledForMode('TWO_PLAYERS_AI') === true, 'CO-OP AI must keep Support Items enabled');
  assert(isSupportItemSystemEnabledForMode('TWO_PLAYERS_ONLINE') === true, 'CO-OP ONLINE must keep Support Items enabled');

  const eng = new GameEngine();
  eng.startMatch('VS_P1_AI_P2_AI', 'DEFAULT');
  // Simulate past all 4 Campaign item waves (10s=600, 30s=1800, 50s=3000, 70s=4200 -> 4500 ticks)
  for (let i = 0; i < 4500; i++) {
    if (eng.getState().matchState === 'SUMMARY_STATS') break;
    eng.stepTick();
  }
  const st = eng.getState();
  assert(st.itemSystem?.enabled === false, 'itemSystem.enabled must be false in VS');
  assert((st.itemSystem?.totalSpawnedCount ?? 0) === 0, '0 support items spawned in VS');
  assert((st.itemSystem?.activeItems.length ?? 0) === 0, '0 active support items in VS');
  assert(st.enemies.length === 0 && st.enemyQueue.length === 0, '0 Campaign enemies in VS');
  assert(st.vsState?.xpGranted === 0 && st.vsState?.starsGranted === 0 && st.vsState?.coinsGranted === 0, '0 XP/Stars/Coins in VS');

  // Switch back to SOLO Campaign -> verify 30 enemies + Eagle Base + Support Items intact
  eng.startMatch('SOLO', 'DEFAULT', { stageId: 1, enforceProgression: false });
  const soloSt = eng.getState();
  assert(soloSt.vsState === undefined || soloSt.vsState === null, 'SOLO must have no vsState');
  assert(soloSt.enemyQueue.length === 30, `SOLO must restore 30-enemy queue, got ${soloSt.enemyQueue.length}`);
  assert(soloSt.itemSystem?.enabled === true, 'SOLO must restore Support Items');
  return '0 items across 4500 ticks, 0 enemies, 0 XP/Stars/Coins, SOLO regression clean';
});

// =========================================================================
// NHÓM I — VÒNG ĐỜI TRẬN ĐẤU (RESTART & QUIT TO MENU)
// =========================================================================
runTest('I', 'I1: Restart resets VS cleanly; Quit to Menu halts simulation & clears state', () => {
  const eng = new GameEngine();
  eng.startMatch('VS_P1_P2', 'DEFAULT');
  const vsEng = eng.getVsEngine()!;
  vsEng.debugSetTankLives('P2', 1);
  vsEng.debugForceTankPosition('P1', 64, 96, 'RIGHT');
  vsEng.debugForceTankPosition('P2', 96, 96, 'UP');
  eng.stepTick(makeInput({ shoot: true }), NEUTRAL_INPUT);
  for (let i = 0; i < 30; i++) eng.stepTick();
  assert(eng.getState().matchState === 'SUMMARY_STATS', 'Match should be finished');
  assert(eng.getState().vsState?.phase === 'FINISHED', 'VS phase FINISHED');

  // Restart
  eng.restartStage();
  const restarted = eng.getState();
  assert(restarted.matchState === 'PLAYING', 'Restart must enter PLAYING');
  assert(restarted.vsState?.phase === 'NORMAL', 'Restart must reset phase to NORMAL');
  assert(restarted.vsState?.normalRemainingSeconds === 180, 'Restart must reset timer to 180s');
  assert(restarted.vsState?.safeZone.shrinkLevel === 0, 'Restart must reset shrinkLevel to 0');
  assert(restarted.vsState?.outcome === null, 'Restart must clear outcome');
  assert(
    Boolean(
      restarted.vsState?.combatants.every(
        (c) => c.lives === 3 && !c.isDead && c.kills === 0 && c.deaths === 0
      )
    ),
    'All tanks reset to 3 lives, 0 kills/deaths'
  );

  // Quit to Menu
  eng.quitToMenu();
  const afterQuitTicks = eng.getState().tickCount;
  for (let i = 0; i < 60; i++) eng.stepTick(makeInput({ right: true, shoot: true }));
  assert(eng.getState().matchState === 'MENU', 'Match state must be MENU');
  assert(eng.getState().tickCount === afterQuitTicks, 'No ticks should execute after quitToMenu');
  assert(eng.getState().bullets.length === 0, 'Bullets cleared on quitToMenu');
  return 'Restart clean (180s/3 lives/0 shrink/null outcome); Quit halts ticks & clears bullets';
});

// Summary
const passedCount = results.filter((r) => r.passed).length;
const failedCount = results.filter((r) => !r.passed).length;
console.log('--------------------------------------------------------------------');
console.log(`  BTO-VS-GAMEPLAY-V1.2 RESULT: ${passedCount}/${results.length} PASSED, ${failedCount} FAILED`);
console.log('====================================================================');

if (failedCount > 0) {
  process.exit(1);
}
