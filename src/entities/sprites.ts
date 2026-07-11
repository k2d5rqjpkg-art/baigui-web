import * as THREE from 'three';
import { JobType, EnemyType, JOBS } from '../core/components';

const PALETTE = {
  ink: 0x1a1a2e,
  paper: 0xf5e6c8,
  red: 0xc0392b,
  gold: 0xd4a017,
  jade: 0x2d7d3a,
  ghost: 0x8e44ad,
  water: 0x2980b9,
  skin: 0xe8b87a,
  fox: 0xe67e22,
  yecha: 0x7f8c8d,
};

function buildCanvas(draw: (ctx: CanvasRenderingContext2D, size: number) => void, size = 64): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ff00ff';
  ctx.fillRect(0, 0, size, size);
  draw(ctx, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  return tex;
}

// ============ 玩家角色 - 4个职业 ============

/** 书生（默认） */
export function createPlayerTexture(job: JobType = '书生'): THREE.CanvasTexture {
  switch (job) {
    case '书生': return createScholarTexture();
    case '剑客': return createSwordsmanTexture();
    case '术士': return createSorcererTexture();
    case '医者': return createDoctorTexture();
  }
}

function createScholarTexture(): THREE.CanvasTexture {
  return buildCanvas((ctx, s) => {
    // 身体（长衫）
    ctx.fillStyle = '#e8b87a';
    ctx.fillRect(16, 24, 32, 40);
    // 头
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(18, 8, 28, 20);
    // 帽顶
    ctx.fillStyle = '#c0392b';
    ctx.fillRect(22, 4, 20, 6);
    // 眼睛
    ctx.fillStyle = '#000';
    ctx.fillRect(24, 16, 4, 4);
    ctx.fillRect(36, 16, 4, 4);
    // 腰带
    ctx.fillStyle = '#d4a017';
    ctx.fillRect(16, 50, 32, 4);
    // 右手持笔
    ctx.fillStyle = '#e8b87a';
    ctx.fillRect(8, 30, 8, 6);
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(6, 26, 4, 12);
    ctx.fillStyle = '#c0392b';
    ctx.fillRect(6, 24, 4, 3);
    // 白色边框
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.strokeRect(1, 1, s-3, s-3);
  });
}

function createSwordsmanTexture(): THREE.CanvasTexture {
  return buildCanvas((ctx, s) => {
    // 身体 + 铠甲
    ctx.fillStyle = '#c0392b';
    ctx.fillRect(14, 22, 36, 42);
    // 头
    ctx.fillStyle = '#d4a017';
    ctx.fillRect(18, 6, 28, 20);
    // 头盔
    ctx.fillStyle = '#922b21';
    ctx.fillRect(16, 4, 32, 10);
    // 眼睛
    ctx.fillStyle = '#000';
    ctx.fillRect(24, 14, 4, 4);
    ctx.fillRect(36, 14, 4, 4);
    // 剑
    ctx.fillStyle = '#ecf0f1';
    ctx.fillRect(4, 20, 6, 36);
    ctx.fillStyle = '#d4a017';
    ctx.fillRect(3, 18, 8, 5);
    // 腰带
    ctx.fillStyle = '#7f8c8d';
    ctx.fillRect(14, 50, 36, 4);
    // 色边框
    ctx.strokeStyle = '#e74c3c';
    ctx.lineWidth = 3;
    ctx.strokeRect(1, 1, s-3, s-3);
  });
}

function createSorcererTexture(): THREE.CanvasTexture {
  return buildCanvas((ctx, s) => {
    // 法袍
    ctx.fillStyle = '#8e44ad';
    ctx.fillRect(14, 20, 36, 44);
    // 头
    ctx.fillStyle = '#d5b8e8';
    ctx.fillRect(18, 6, 28, 18);
    // 法师帽
    ctx.fillStyle = '#6c3483';
    ctx.fillRect(16, 2, 32, 14);
    ctx.beginPath();
    ctx.moveTo(20, 12);
    ctx.lineTo(32, 0);
    ctx.lineTo(44, 12);
    ctx.fill();
    // 眼睛
    ctx.fillStyle = '#9b59b6';
    ctx.fillRect(24, 12, 4, 4);
    ctx.fillRect(36, 12, 4, 4);
    // 法杖
    ctx.fillStyle = '#5b2c6f';
    ctx.fillRect(52, 16, 4, 40);
    ctx.fillStyle = '#f39c12';
    ctx.fillRect(50, 14, 8, 6);
    // 边框
    ctx.strokeStyle = '#af7ac5';
    ctx.lineWidth = 3;
    ctx.strokeRect(1, 1, s-3, s-3);
  });
}

function createDoctorTexture(): THREE.CanvasTexture {
  return buildCanvas((ctx, s) => {
    // 白衣
    ctx.fillStyle = '#ecf0f1';
    ctx.fillRect(14, 22, 36, 42);
    // 头
    ctx.fillStyle = '#f5cba7';
    ctx.fillRect(18, 8, 28, 18);
    // 医帽
    ctx.fillStyle = '#2ecc71';
    ctx.fillRect(20, 4, 24, 8);
    // 眼
    ctx.fillStyle = '#000';
    ctx.fillRect(24, 16, 4, 4);
    ctx.fillRect(36, 16, 4, 4);
    // 红十字
    ctx.fillStyle = '#e74c3c';
    ctx.fillRect(28, 28, 8, 4);
    ctx.fillRect(30, 26, 4, 8);
    // 药葫芦
    ctx.fillStyle = '#d4a017';
    ctx.fillRect(4, 36, 8, 14);
    ctx.fillRect(3, 34, 10, 4);
    // 边框
    ctx.strokeStyle = '#2ecc71';
    ctx.lineWidth = 3;
    ctx.strokeRect(1, 1, s-3, s-3);
  });
}

// ============ 敌人 - 4种类型 ============

export function createEnemyTexture(type: EnemyType): THREE.CanvasTexture {
  switch (type) {
    case '游魂': return createGhostTexture();
    case '兵煞': return createSoldierTexture();
    case '妖狐': return createFoxTexture();
    case '夜叉': return createYechaTexture();
  }
}

function createGhostTexture(): THREE.CanvasTexture {
  return buildCanvas((ctx, s) => {
    ctx.fillStyle = 'rgba(142, 68, 173, 0.9)';
    ctx.beginPath();
    ctx.ellipse(32, 28, 20, 24, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(142, 68, 173, 0.6)';
    ctx.beginPath();
    ctx.ellipse(32, 56, 12, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f5e6c8';
    ctx.fillRect(22, 20, 8, 8);
    ctx.fillRect(34, 20, 8, 8);
    ctx.fillStyle = '#c0392b';
    ctx.fillRect(26, 24, 4, 4);
    ctx.fillRect(38, 24, 4, 4);
    ctx.strokeStyle = '#ff00ff';
    ctx.lineWidth = 3;
    ctx.strokeRect(1, 1, s-3, s-3);
  });
}

function createSoldierTexture(): THREE.CanvasTexture {
  return buildCanvas((ctx, s) => {
    ctx.fillStyle = '#555';
    ctx.fillRect(12, 16, 40, 40);
    ctx.fillStyle = '#777';
    ctx.fillRect(16, 4, 32, 14);
    ctx.fillStyle = '#444';
    ctx.fillRect(20, 10, 24, 8);
    ctx.fillStyle = '#c0392b';
    ctx.fillRect(22, 12, 6, 4);
    ctx.fillRect(36, 12, 6, 4);
    ctx.fillStyle = '#aaa';
    ctx.fillRect(4, 16, 4, 28);
    ctx.fillStyle = '#ddd';
    ctx.fillRect(2, 16, 2, 24);
    ctx.strokeStyle = '#00ffff';
    ctx.lineWidth = 3;
    ctx.strokeRect(1, 1, s-3, s-3);
  });
}

function createFoxTexture(): THREE.CanvasTexture {
  return buildCanvas((ctx, s) => {
    // 狐狸身体
    ctx.fillStyle = '#e67e22';
    ctx.beginPath();
    ctx.ellipse(32, 30, 18, 16, 0, 0, Math.PI * 2);
    ctx.fill();
    // 头
    ctx.fillStyle = '#d35400';
    ctx.beginPath();
    ctx.ellipse(32, 18, 12, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    // 耳朵
    ctx.fillStyle = '#e67e22';
    ctx.beginPath();
    ctx.moveTo(22, 12);
    ctx.lineTo(26, 2);
    ctx.lineTo(30, 10);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(34, 10);
    ctx.lineTo(38, 2);
    ctx.lineTo(42, 12);
    ctx.fill();
    // 眼睛
    ctx.fillStyle = '#c0392b';
    ctx.fillRect(26, 14, 4, 4);
    ctx.fillRect(36, 14, 4, 4);
    // 尾巴x2
    ctx.fillStyle = '#d35400';
    ctx.beginPath();
    ctx.ellipse(14, 40, 6, 14, -0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(50, 40, 6, 14, 0.3, 0, Math.PI * 2);
    ctx.fill();
    // 边框
    ctx.strokeStyle = '#f39c12';
    ctx.lineWidth = 3;
    ctx.strokeRect(1, 1, s-3, s-3);
  });
}

function createYechaTexture(): THREE.CanvasTexture {
  return buildCanvas((ctx, s) => {
    // 庞大身体
    ctx.fillStyle = '#7f8c8d';
    ctx.fillRect(8, 12, 48, 44);
    // 头 + 角
    ctx.fillStyle = '#5d6d7e';
    ctx.fillRect(14, 2, 36, 14);
    ctx.fillStyle = '#34495e';
    ctx.beginPath();
    ctx.moveTo(16, 8);
    ctx.lineTo(22, 0);
    ctx.lineTo(24, 8);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(40, 8);
    ctx.lineTo(46, 0);
    ctx.lineTo(48, 8);
    ctx.fill();
    // 红眼
    ctx.fillStyle = '#e74c3c';
    ctx.fillRect(22, 6, 6, 6);
    ctx.fillRect(36, 6, 6, 6);
    // 武器
    ctx.fillStyle = '#95a5a6';
    ctx.fillRect(2, 20, 6, 30);
    ctx.fillRect(56, 20, 6, 30);
    // 边框
    ctx.strokeStyle = '#e74c3c';
    ctx.lineWidth = 3;
    ctx.strokeRect(1, 1, s-3, s-3);
  });
}

// ============ 投射物 ============

export function createProjectileMesh(color: string = '#f39c12'): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(0.4, 0.4);
  const canvas = document.createElement('canvas');
  canvas.width = 16;
  canvas.height = 16;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(8, 8, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(8, 8, 2, 0, Math.PI * 2);
  ctx.fill();
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
  return new THREE.Mesh(geo, mat);
}

// ============ 通用 Mesh 创建 ============

export function createEntityMesh(texture: THREE.Texture, width = 2, height = 2): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(width, height);
  const mat = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  return new THREE.Mesh(geo, mat);
}

export { PALETTE };
