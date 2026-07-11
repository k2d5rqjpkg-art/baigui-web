import * as THREE from 'three';
import { ecs } from './core/ecs';
import { InputManager } from './systems/input';
import { MovementSystem, SpriteRenderSystem, CollisionSystem } from './systems/game-systems';
import { GameScene } from './scenes/game-scene';
import { HUD } from './ui/hud';
import {
  JobType, EnemyType, JOBS, getXpForLevel, getEnemyXp, getEnemyGold,
  Skill, SkillSet, Experience, BuffList, Buff, Projectile,
  Health, Combat, Position, MeshComponent,
} from './core/components';
import {
  createPlayerTexture,
  createEnemyTexture,
  createEntityMesh,
  createProjectileMesh,
} from './entities/sprites';

// ============ 游戏主类 ============

class Game {
  scene: GameScene;
  private input: InputManager;
  hud: HUD;

  private movementSystem = new MovementSystem();
  private collisionSystem = new CollisionSystem();

  playerId!: number;
  enemies: number[] = [];
  private projectiles: { id: number; data: Projectile }[] = [];

  private clock = new THREE.Clock();
  private running = true;
  private rafId = 0;

  // 玩家选择职业
  private selectedJob: JobType = '书生';

  private readonly ENEMY_SPAWN_INTERVAL = 4;
  private spawnTimer = 0;

  constructor(container: HTMLElement) {
    container.innerHTML = '';
    const oldHud = container.parentElement?.querySelector('#hud-container');
    if (oldHud) oldHud.remove();

    this.scene = new GameScene(container);
    this.input = new InputManager();
    this.hud = new HUD(container.parentElement!);

    this.scene.addGrid();
    
    // 选职业界面
    this.showJobSelection();
  }

  private showJobSelection() {
    this.hud.showModal(`
      <div style="text-align:center;padding:20px;color:#f5e6c8;font-family:'Microsoft YaHei',sans-serif">
        <h2 style="margin-bottom:20px;color:#d4a017">选择你的职业</h2>
        <div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap">
          ${(['书生','剑客','术士','医者'] as JobType[]).map(j => {
            const cfg = JOBS[j];
            return `<div onclick="window.__selectJob('${j}')" 
              style="cursor:pointer;background:#1a1a2e;border:2px solid ${cfg.color};border-radius:8px;padding:12px;width:140px;
              transition:transform 0.2s" 
              onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'">
              <div style="font-size:18px;font-weight:bold;color:${cfg.color}">${j}</div>
              <div style="font-size:12px;margin:8px 0;color:#aaa">${cfg.description}</div>
              <div style="font-size:11px;color:#888">HP:${cfg.baseHp} ATK:${cfg.baseAttack} DEF:${cfg.baseDefense}</div>
            </div>`;
          }).join('')}
        </div>
      </div>
    `);

    (window as any).__selectJob = (job: JobType) => {
      this.selectedJob = job;
      this.hud.closeModal();
      this.startGame();
    };
  }

  private startGame() {
    this.spawnPlayer(this.selectedJob);
    this.spawnInitialEnemies();

    this.updateMeshes();
    this.scene.render();

    console.log('[百鬼] 游戏开始', { job: this.selectedJob });

    this.rafId = requestAnimationFrame(this.loop);
  }

  // ============ 生成玩家 ============

  private spawnPlayer(job: JobType) {
    const cfg = JOBS[job];

    this.playerId = ecs.createEntity();
    ecs.addComponent<Position>(this.playerId, 'position', { x: 0, y: 0 });
    ecs.addComponent<Velocity>(this.playerId, 'velocity', { x: 0, y: 0 });
    ecs.addComponent<Health>(this.playerId, 'health', { current: cfg.baseHp, max: cfg.baseHp });
    ecs.addComponent<Combat>(this.playerId, 'combat', { attack: cfg.baseAttack, defense: cfg.baseDefense, speed: cfg.baseSpeed });
    ecs.addComponent<PlayerTag>(this.playerId, 'player', { job });

    // 经验 & 等级
    ecs.addComponent<Experience>(this.playerId, 'experience', {
      level: 1, currentXp: 0, nextLevelXp: getXpForLevel(1), totalXp: 0,
    });

    // 技能
    ecs.addComponent<SkillSet>(this.playerId, 'skills', {
      skills: cfg.skills.map(s => ({ ...s, currentCooldown: 0 })),
    });

    // 金币
    ecs.addComponent(this.playerId, 'gold', { gold: 0 });

    // 生成等级/金币UI
    this.hud.showLevel(1);
    this.hud.showGold(0);

    // 显示可用技能
    this.hud.showSkills(cfg.skills);

    const tex = createPlayerTexture(job);
    const mesh = createEntityMesh(tex, 2, 2);
    this.scene.scene.add(mesh);
    ecs.addComponent<MeshComponent>(this.playerId, 'mesh', { mesh, w: 2, h: 2 });
  }

  // ============ 生成敌人 ============

  private spawnEnemy(type: EnemyType, pos?: Position) {
    const id = ecs.createEntity();
    const tex = createEnemyTexture(type);

    let x: number, y: number;
    if (pos) {
      x = pos.x; y = pos.y;
    } else {
      const angle = Math.random() * Math.PI * 2;
      const dist = 4 + Math.random() * 5;
      x = Math.cos(angle) * dist;
      y = Math.sin(angle) * dist;
    }

    const hpMap: Record<EnemyType, number> = { '游魂': 40, '兵煞': 80, '妖狐': 60, '夜叉': 150 };
    const atkMap: Record<EnemyType, number> = { '游魂': 8, '兵煞': 15, '妖狐': 12, '夜叉': 25 };
    const defMap: Record<EnemyType, number> = { '游魂': 2, '兵煞': 5, '妖狐': 3, '夜叉': 8 };
    const playerLevel = ecs.getComponent<Experience>(this.playerId, 'experience')?.level || 1;

    // 难度随等级提升
    const levelScale = 1 + (playerLevel - 1) * 0.15;

    ecs.addComponent<Position>(id, 'position', { x, y });
    ecs.addComponent<Velocity>(id, 'velocity', { x: 0, y: 0 });
    ecs.addComponent<Health>(id, 'health', { current: Math.floor(hpMap[type] * levelScale), max: Math.floor(hpMap[type] * levelScale) });
    ecs.addComponent<Combat>(id, 'combat', { attack: Math.floor(atkMap[type] * levelScale), defense: Math.floor(defMap[type] * levelScale), speed: 5 });
    ecs.addComponent<EnemyTag>(id, 'enemy', { type });

    const mesh = createEntityMesh(tex, 1.5, 1.5);
    this.scene.scene.add(mesh);
    ecs.addComponent<MeshComponent>(id, 'mesh', { mesh, w: 1.5, h: 1.5 });

    this.enemies.push(id);
  }

  private spawnInitialEnemies() {
    // 按等级生成不同类型的敌人
    const level = ecs.getComponent<Experience>(this.playerId, 'experience')?.level || 1;
    const types: EnemyType[] = level < 3
      ? ['游魂', '游魂', '兵煞']
      : level < 5
        ? ['游魂', '兵煞', '妖狐']
        : ['兵煞', '妖狐', '夜叉'];
    for (const t of types) this.spawnEnemy(t);
  }

  // ============ 移动 ============

  private readonly MOVE_SPEED = 3;

  private handleInput(delta: number) {
    const dir = this.input.getDirection();
    const vel = ecs.getComponent<Velocity>(this.playerId, 'velocity');
    const combat = ecs.getComponent<Combat>(this.playerId, 'combat');
    const speed = combat ? 3 + combat.speed * 0.1 : this.MOVE_SPEED;
    if (vel) {
      vel.x = dir.x * speed;
      vel.y = dir.y * speed;
    }
    // 技能快捷键: 1/2/3
    for (let i = 1; i <= 3; i++) {
      if (this.input.wasPressed(`Digit${i}`) || this.input.wasPressed(`Numpad${i}`)) {
        this.useSkill(i - 1);
      }
    }
    if (this.input.wasPressed('Space') || this.input.wasPressed('KeyJ')) {
      this.useSkill(0); // 默认技能
    }
    if (this.input.wasPressed('KeyE')) {
      this.tryInteract();
    }
  }

  // ============ 技能系统 ============

  private useSkill(index: number) {
    const skills = ecs.getComponent<SkillSet>(this.playerId, 'skills');
    if (!skills || index >= skills.skills.length) return;

    const skill = skills.skills[index];
    if (skill.currentCooldown > 0) {
      this.hud.showMessage(`${skill.name} 冷却中 (${skill.currentCooldown.toFixed(1)}s)`, 1);
      return;
    }

    const playerPos = ecs.getComponent<Position>(this.playerId, 'position');
    const combat = ecs.getComponent<Combat>(this.playerId, 'combat');
    if (!playerPos || !combat) return;

    skill.currentCooldown = skill.cooldown;

    switch (skill.type) {
      case 'melee': {
        const nearest = this.collisionSystem.findNearest(this.playerId, 'enemy');
        if (nearest === null) { this.hud.showMessage('没有敌人在攻击范围内', 1); return; }
        const enemyPos = ecs.getComponent<Position>(nearest);
        if (!enemyPos) return;
        const dx = enemyPos.x - playerPos.x;
        const dy = enemyPos.y - playerPos.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > skill.range) { this.hud.showMessage('敌人太远了', 1); return; }
        this.dealDamage(nearest, Math.floor(combat.attack * skill.damageMultiplier), skill);
        break;
      }
      case 'ranged': {
        const nearest = this.collisionSystem.findNearest(this.playerId, 'enemy');
        if (nearest === null) { this.hud.showMessage('没有目标', 1); return; }
        const enemyPos = ecs.getComponent<Position>(nearest);
        if (!enemyPos) return;
        const dx = enemyPos.x - playerPos.x;
        const dy = enemyPos.y - playerPos.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > skill.range) { this.hud.showMessage('超出射程', 1); return; }
        this.fireProjectile(nearest, combat.attack * skill.damageMultiplier, skill.color);
        break;
      }
      case 'aoe': {
        // 范围伤害: 伤害所有附近敌人
        let hitCount = 0;
        for (const eid of this.enemies) {
          const enemyPos = ecs.getComponent<Position>(eid);
          if (!enemyPos) continue;
          const dx = enemyPos.x - playerPos.x;
          const dy = enemyPos.y - playerPos.y;
          if (Math.sqrt(dx * dx + dy * dy) <= skill.range) {
            this.dealDamage(eid, Math.floor(combat.attack * skill.damageMultiplier * 0.8), skill);
            hitCount++;
          }
        }
        if (hitCount === 0) this.hud.showMessage('范围内没有敌人', 1);
        else this.hud.showMessage(`${skill.name} 击中 ${hitCount} 个敌人！`, 1.5);
        break;
      }
      case 'heal': {
        const health = ecs.getComponent<Health>(this.playerId, 'health');
        if (!health) return;
        const healAmount = Math.floor(Math.abs(skill.damageMultiplier) * combat.attack);
        health.current = Math.min(health.max, health.current + healAmount);
        this.hud.showMessage(`恢复 ${healAmount} 生命！`, 1.5);
        break;
      }
      case 'buff': {
        // 不同的buff
        const buffs = ecs.getComponent<BuffList>(this.playerId, 'buffs');
        let buff: Buff;
        switch (skill.id) {
          case 'calligraphy_shield':
          case 'mana_shield':
            buff = { id: skill.id, name: skill.name, duration: 5, remaining: 5, defenseBonus: 5 };
            break;
          case 'battle_cry':
            buff = { id: skill.id, name: skill.name, duration: 6, remaining: 6, attackBonus: 5 };
            break;
          case 'revitalize':
            buff = { id: skill.id, name: skill.name, duration: 8, remaining: 8, attackBonus: 3, defenseBonus: 3 };
            break;
          default:
            buff = { id: skill.id, name: skill.name, duration: 4, remaining: 4, defenseBonus: 3 };
        }
        if (!buffs) {
          ecs.addComponent<BuffList>(this.playerId, 'buffs', { buffs: [buff] });
        } else {
          const existing = buffs.buffs.findIndex(b => b.id === buff.id);
          if (existing >= 0) buffs.buffs[existing].remaining = buff.duration;
          else buffs.buffs.push(buff);
        }
        this.hud.showMessage(`使用 ${skill.name}！`, 1.5);
        break;
      }
    }

    // 刷新技能显示
    this.hud.showSkills(skills.skills);
  }

  // ============ 投射物 ============

  private fireProjectile(targetId: number, damage: number, color: string) {
    const playerPos = ecs.getComponent<Position>(this.playerId);
    const targetPos = ecs.getComponent<Position>(targetId);
    if (!playerPos || !targetPos) return;

    const mesh = createProjectileMesh(color);
    mesh.position.set(playerPos.x, -playerPos.y, 0.5);
    this.scene.scene.add(mesh);

    const proj: Projectile = {
      mesh, targetX: targetPos.x, targetY: targetPos.y,
      speed: 8, damage, fromEntity: this.playerId,
      lifetime: 2, alive: true,
    };
    const projId = ecs.createEntity();
    ecs.addComponent<Projectile>(projId, 'projectile', proj);
    this.projectiles.push({ id: projId, data: proj });
  }

  private updateProjectiles(delta: number) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const { data: p } = this.projectiles[i];
      if (!p || !p.alive) {
        this.projectiles.splice(i, 1);
        continue;
      }

      const pos = ecs.getComponent<Position>(this.playerId);
      // 移动投射物向目标
      const dx = p.targetX - (p.mesh.position.x);
      const dy = -p.targetY - (p.mesh.position.y); // 注意 y 翻转
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < 0.3) {
        // 命中
        p.alive = false;
        this.scene.scene.remove(p.mesh);
        this.projectiles.splice(i, 1);
        // 找目标敌人
        const nearest = this.collisionSystem.findNearest(p.fromEntity, 'enemy');
        if (nearest !== null) {
          this.dealDamage(nearest, Math.floor(p.damage), null);
        }
      } else {
        const speed = p.speed * delta;
        p.mesh.position.x += (dx / dist) * speed;
        p.mesh.position.y += (dy / dist) * speed;
        p.lifetime -= delta;
        if (p.lifetime <= 0) {
          p.alive = false;
          this.scene.scene.remove(p.mesh);
          this.projectiles.splice(i, 1);
        }
      }
    }
  }

  // ============ 伤害处理 ============

  private dealDamage(targetId: number, rawDamage: number, skill: Skill | null) {
    const enemyHealth = ecs.getComponent<Health>(targetId);
    const enemyCombat = ecs.getComponent<Combat>(targetId);
    const enemyTag = ecs.getComponent<EnemyTag>(targetId);
    if (!enemyHealth) return;

    const def = enemyCombat?.defense || 0;
    const damage = Math.max(1, rawDamage - def);
    enemyHealth.current -= damage;

    // 伤害浮动文字（通过HUD）
    const enemyPos = ecs.getComponent<Position>(targetId);
    if (enemyPos) {
      this.hud.showDamageNumber(damage, enemyPos.x, -enemyPos.y);
    }

    const name = skill?.name || '攻击';
    this.hud.showMessage(`${name}！${damage} 点伤害 [${enemyTag?.type || '未知'}]`, 1);

    if (enemyHealth.current <= 0) {
      this.onEnemyKilled(targetId);
    }
  }

  private onEnemyKilled(id: number) {
    const enemyTag = ecs.getComponent<EnemyTag>(id);
    const type = enemyTag?.type || '游魂';

    // 奖励
    const xpGain = getEnemyXp(type as EnemyType);
    const goldGain = getEnemyGold(type as EnemyType);

    const exp = ecs.getComponent<Experience>(this.playerId, 'experience');
    if (exp) {
      exp.currentXp += xpGain;
      exp.totalXp += xpGain;
      // 升级检测
      while (exp.currentXp >= exp.nextLevelXp) {
        exp.currentXp -= exp.nextLevelXp;
        exp.level++;
        exp.nextLevelXp = getXpForLevel(exp.level);
        this.onLevelUp();
      }
      this.hud.showXP(exp.currentXp, exp.nextLevelXp);
      this.hud.showLevel(exp.level);
    }

    const gold = ecs.getComponent<{ gold: number }>(this.playerId, 'gold');
    if (gold) {
      gold.gold += goldGain;
      this.hud.showGold(gold.gold);
    }

    // 尝试生成更高等级的敌人
    if (Math.random() < 0.3) {
      const nextTier: EnemyType[] = ['兵煞', '妖狐', '夜叉'];
      const idx = nextTier.indexOf(type as EnemyType);
      if (idx >= 0 && idx < nextTier.length - 1 && exp && exp.level >= 3) {
        // 有时生成更强的
      }
    }

    this.hud.showMessage(`击杀 ${type}！+${xpGain}经验 +${goldGain}金`, 2);
    this.destroyEnemy(id);

    // 补一个敌人
    this.spawnEnemy(type as EnemyType);
  }

  private onLevelUp() {
    const health = ecs.getComponent<Health>(this.playerId, 'health');
    const combat = ecs.getComponent<Combat>(this.playerId, 'combat');
    const exp = ecs.getComponent<Experience>(this.playerId, 'experience');

    if (health) {
      health.max += 15;
      health.current = health.max; // 升级回满
    }
    if (combat) {
      combat.attack += 3;
      combat.defense += 1;
    }

    this.hud.showMessage(`升级！等级 ${exp?.level || '?'}`, 3);

    // 升级特效
    this.scene.flashEffect('#d4a017', 500);
  }

  private tryInteract() {
    const nearest = this.collisionSystem.findNearest(this.playerId, 'enemy');
    if (nearest !== null) {
      const eData = ecs.getComponent<EnemyTag>(nearest, 'enemy');
      const health = ecs.getComponent<Health>(nearest);
      if (eData && health) {
        this.hud.showMessage(`${eData.type} HP: ${Math.ceil(health.current)}/${health.max}`, 2);
      }
    } else {
      this.hud.showMessage('四周一片寂静...', 2);
    }
  }

  // ============ 敌人 AI ============

  private updateEnemyAI(delta: number) {
    const playerPos = ecs.getComponent<Position>(this.playerId);
    if (!playerPos) return;

    // Buff影响
    const buffs = ecs.getComponent<BuffList>(this.playerId, 'buffs');
    let defBonus = 0, atkBonus = 0;
    if (buffs) {
      for (const b of buffs.buffs) {
        b.remaining -= delta;
        if (b.remaining > 0) {
          defBonus += b.defenseBonus || 0;
          atkBonus += b.attackBonus || 0;
        }
      }
      buffs.buffs = buffs.buffs.filter(b => b.remaining > 0);
    }

    const combat = ecs.getComponent<Combat>(this.playerId, 'combat');
    if (combat) {
      combat.attack = (JOBS[ecs.getComponent<PlayerTag>(this.playerId, 'player')?.job || '书生'].baseAttack +
        (ecs.getComponent<Experience>(this.playerId, 'experience')?.level || 1) * 3) + atkBonus;
      combat.defense = (JOBS[ecs.getComponent<PlayerTag>(this.playerId, 'player')?.job || '书生'].baseDefense +
        (ecs.getComponent<Experience>(this.playerId, 'experience')?.level || 1)) + defBonus;
    }

    // 敌人生成（根据等级）
    this.spawnTimer += delta;
    const level = ecs.getComponent<Experience>(this.playerId, 'experience')?.level || 1;
    const maxEnemies = Math.min(12, 6 + level);
    if (this.spawnTimer >= this.ENEMY_SPAWN_INTERVAL && this.enemies.length < maxEnemies) {
      this.spawnTimer = 0;
      const pool: EnemyType[] = level < 3
        ? ['游魂', '游魂', '兵煞']
        : level < 5
          ? ['游魂', '兵煞', '妖狐']
          : ['兵煞', '妖狐', '妖狐', '夜叉'];
      this.spawnEnemy(pool[Math.floor(Math.random() * pool.length)]);
    }

    // 每个敌人 AI
    const ids = [...this.enemies];
    ecs.forEach('enemy', (id) => {
      // 如果已死亡，跳过
      if (!this.enemies.includes(id)) return;
      const pos = ecs.getComponent<Position>(id);
      if (!pos) return;

      const dx = playerPos.x - pos.x;
      const dy = playerPos.y - pos.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // 切换目标：靠近玩家
      if (dist < 7 && dist > 1.0) {
        const speed = 1.2 + Math.random() * 0.5;
        pos.x += (dx / dist) * speed * delta;
        pos.y += (dy / dist) * speed * delta;
      }

      // 攻击玩家
      if (dist < 1.0) {
        const playerHp = ecs.getComponent<Health>(this.playerId, 'health');
        const eCombat = ecs.getComponent<Combat>(id);
        if (playerHp && eCombat && Math.random() < delta * 2) {
          const dmg = Math.max(1, eCombat.attack - combat!.defense);
          playerHp.current = Math.max(0, playerHp.current - dmg);
          this.hud.showMessage(`受到 ${dmg} 点伤害！`, 1);
        }
      }
    });
  }

  // ============ 技能冷却 ============

  private updateCooldowns(delta: number) {
    const skills = ecs.getComponent<SkillSet>(this.playerId, 'skills');
    if (!skills) return;
    let needRefresh = false;
    for (const skill of skills.skills) {
      if (skill.currentCooldown > 0) {
        skill.currentCooldown = Math.max(0, skill.currentCooldown - delta);
        needRefresh = true;
      }
    }
    // 冷却好了才刷新显示
    if (needRefresh && skills.skills.some(s => s.currentCooldown <= 0.03)) {
      this.hud.showSkills(skills.skills);
    }
  }

  // ============ 更新位置 ============

  private updateMeshes() {
    ecs.forEach('mesh', (id, meshData) => {
      const pos = ecs.getComponent<Position>(id);
      if (!pos) return;
      const m = meshData as MeshComponent;
      m.mesh.position.set(pos.x, -pos.y, 0);
    });
  }

  // ============ 销毁敌人 ============

  private destroyEnemy(id: number) {
    const meshData = ecs.getComponent<MeshComponent>(id, 'mesh');
    if (meshData) {
      this.scene.scene.remove(meshData.mesh);
      meshData.mesh.material.dispose();
      if (meshData.mesh.geometry) meshData.mesh.geometry.dispose();
    }
    ecs.destroyEntity(id);
    this.enemies = this.enemies.filter(e => e !== id);
  }

  // ============ 游戏循环 ============

  private loop = (now: number) => {
    if (!this.running) return;

    const dt = Math.min(this.clock.getDelta(), 0.05);

    this.handleInput(dt);
    this.updateCooldowns(dt);
    this.updateEnemyAI(dt);
    this.movementSystem.update(dt);
    this.updateMeshes();
    this.updateProjectiles(dt);

    const hp = ecs.getComponent<Health>(this.playerId, 'health');
    if (hp) this.hud.setHP(hp.current, hp.max);
    this.hud.update(dt);

    if (hp && hp.current <= 0) {
      this.hud.showMessage('你已阵亡...按下 R 键重新开始', 999);
    }

    this.scene.render();
    this.input.endFrame();

    this.rafId = requestAnimationFrame(this.loop);
  };

  // ============ 生命周期 ============

  stop() {
    this.running = false;
    cancelAnimationFrame(this.rafId);
    this.scene.dispose();
  }

  restart() {
    for (const id of [...this.enemies]) {
      this.destroyEnemy(id);
    }
    const hp = ecs.getComponent<Health>(this.playerId, 'health');
    if (hp) {
      const job = ecs.getComponent<PlayerTag>(this.playerId, 'player')?.job || '书生';
      hp.current = JOBS[job].baseHp;
      hp.max = JOBS[job].baseHp;
    }
    const pos = ecs.getComponent<Position>(this.playerId, 'position');
    if (pos) { pos.x = 0; pos.y = 0; }
    const exp = ecs.getComponent<Experience>(this.playerId, 'experience');
    if (exp) { exp.level = 1; exp.currentXp = 0; exp.nextLevelXp = getXpForLevel(1); exp.totalXp = 0; }
    this.spawnInitialEnemies();
    this.spawnTimer = 0;
    this.hud.showMessage('卷土重来！', 2);
    if (exp) {
      this.hud.showLevel(1);
      this.hud.showXP(0, getXpForLevel(1));
    }
  }
}

// ============ 入口 ============

const CONTAINER_ID = 'game-container';
const INSTANCE_KEY = '__baigui_game';

function startGame() {
  const container = document.getElementById(CONTAINER_ID);
  if (!container) { console.error('[百鬼] 找不到容器 #' + CONTAINER_ID); return; }

  const oldGame = (window as any)[INSTANCE_KEY];
  if (oldGame) { oldGame.stop(); }

  try {
    const game = new Game(container);
    (window as any)[INSTANCE_KEY] = game;
    (window as any).game = game;

    // 调试覆盖层
    const debugDiv = document.createElement('div');
    debugDiv.id = 'debug-overlay';
    debugDiv.style.cssText = 'position:fixed;bottom:10px;left:10px;z-index:9999;color:#0f0;font:12px monospace;background:rgba(0,0,0,0.7);padding:8px;border-radius:4px;pointer-events:none;';
    document.body.appendChild(debugDiv);
    const updateDebug = () => {
      const p = new Uint8Array(4);
      const gl = game.scene.renderer.domElement.getContext('webgl2');
      if (gl) gl.readPixels(400, 300, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, p);
      debugDiv.innerHTML =
        `raf:${game.rafId>0?'OK':'X'} obj:${game.scene.scene.children.length} enemy:${game.enemies.length}<br>` +
        `px:(${p[0]},${p[1]},${p[2]})`;
      requestAnimationFrame(updateDebug);
    };
    requestAnimationFrame(updateDebug);
  } catch (e) {
    console.error('[百鬼] 启动失败:', e);
    document.body.innerHTML += `<div style="color:red;font-size:24px">致命错误: ${e}</div>`;
  }
}

startGame();

if (import.meta.hot) {
  import.meta.hot.accept(() => {});
}

window.addEventListener('beforeunload', () => {
  (window as any)[INSTANCE_KEY]?.stop();
});

window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyR') {
    const game = (window as any)[INSTANCE_KEY];
    if (game) {
      const hp = ecs.getComponent<Health>(game.playerId, 'health');
      if (hp && hp.current <= 0) game.restart();
    }
  }
});
