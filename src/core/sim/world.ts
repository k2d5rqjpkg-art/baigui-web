/**
 * PCG 地图生成 —— BSP 房间布局
 *
 * 算法:
 *   1. 用 Mulberry32 做"递归切分"把地图切成 BSP 树 (Binary Space Partition)
 *   2. 每个叶子节点放一个矩形房间
 *   3. 兄弟节点之间用 L 形走廊连接
 *   4. 房间周边 + 走廊 = walls;每个房间中心 = spawnPoints
 *
 * 约束:
 *   - 至少 4 个房间 (split 深度足够即可)
 *   - 同 seed + 同 level → 同布局 (确定性)
 *   - 纯函数:不读全局、不调 I/O
 *
 * BSP 切分参数:
 *   - 最小房间 4x4
 *   - 最小切分宽度 8
 *   - 递归深度上限 6
 */

import type { MapLayout, Room, RNGState } from './types';
import { nextRand, randInt, rand } from './rng';

const MIN_ROOM_SIZE = 4;
const MIN_LEAF_SIZE = 8;
const MAX_DEPTH = 5;
const MAX_ROOMS = 10;

interface Leaf {
  x: number;
  y: number;
  w: number;
  h: number;
  left: Leaf | null;
  right: Leaf | null;
  room: Room | null;
}

function splitLeaf(leaf: Leaf, depth: number, rng: RNGState): { leaf: Leaf; nextRng: RNGState } {
  let currentRng = rng;
  // 已经够深或够小 → 不再切
  const canSplitH = leaf.h >= MIN_LEAF_SIZE * 2;
  const canSplitV = leaf.w >= MIN_LEAF_SIZE * 2;
  if (depth >= MAX_DEPTH || (!canSplitH && !canSplitV)) {
    return { leaf, nextRng: currentRng };
  }

  // 决定切向
  let splitVertical: boolean;
  if (canSplitH && canSplitV) {
    // 长边方向切
    splitVertical = leaf.w > leaf.h;
    const flip = rand(currentRng);
    currentRng = flip.next;
    // 50% 概率翻向 —— 增加多样性
    if (flip.value < 0.5) splitVertical = !splitVertical;
  } else if (canSplitV) {
    splitVertical = true;
  } else {
    splitVertical = false;
  }

  if (splitVertical) {
    const minSplit = MIN_LEAF_SIZE;
    const maxSplit = leaf.w - MIN_LEAF_SIZE;
    const r = randInt(currentRng, minSplit, maxSplit);
    currentRng = r.next;
    const split = r.value;
    const left: Leaf = {
      x: leaf.x,
      y: leaf.y,
      w: split,
      h: leaf.h,
      left: null,
      right: null,
      room: null,
    };
    const right: Leaf = {
      x: leaf.x + split,
      y: leaf.y,
      w: leaf.w - split,
      h: leaf.h,
      left: null,
      right: null,
      room: null,
    };
    leaf.left = left;
    leaf.right = right;
  } else {
    const minSplit = MIN_LEAF_SIZE;
    const maxSplit = leaf.h - MIN_LEAF_SIZE;
    const r = randInt(currentRng, minSplit, maxSplit);
    currentRng = r.next;
    const split = r.value;
    const left: Leaf = {
      x: leaf.x,
      y: leaf.y,
      w: leaf.w,
      h: split,
      left: null,
      right: null,
      room: null,
    };
    const right: Leaf = {
      x: leaf.x,
      y: leaf.y + split,
      w: leaf.w,
      h: leaf.h - split,
      left: null,
      right: null,
      room: null,
    };
    leaf.left = left;
    leaf.right = right;
  }

  // 递归
  const leftRes = splitLeaf(leaf.left!, depth + 1, currentRng);
  leaf.left = leftRes.leaf;
  currentRng = leftRes.nextRng;
  const rightRes = splitLeaf(leaf.right!, depth + 1, currentRng);
  leaf.right = rightRes.leaf;
  currentRng = rightRes.nextRng;

  return { leaf, nextRng: currentRng };
}

/** 在 leaf 内生成房间,留 1 格 padding */
function createRoom(leaf: Leaf, rng: RNGState): { room: Room; nextRng: RNGState } {
  let currentRng = rng;
  const maxW = Math.max(MIN_ROOM_SIZE, leaf.w - 2);
  const maxH = Math.max(MIN_ROOM_SIZE, leaf.h - 2);
  const wRoll = randInt(currentRng, MIN_ROOM_SIZE, maxW);
  currentRng = wRoll.next;
  const hRoll = randInt(currentRng, MIN_ROOM_SIZE, maxH);
  currentRng = hRoll.next;
  const xOffRoll = randInt(currentRng, 1, leaf.w - wRoll.value);
  currentRng = xOffRoll.next;
  const yOffRoll = randInt(currentRng, 1, leaf.h - hRoll.value);
  currentRng = yOffRoll.next;
  return {
    room: {
      x: leaf.x + xOffRoll.value,
      y: leaf.y + yOffRoll.value,
      w: wRoll.value,
      h: hRoll.value,
    },
    nextRng: currentRng,
  };
}

/** 收集所有 leaf,每个建一个房间 */
function buildRooms(leaf: Leaf, rng: RNGState): { rooms: Room[]; nextRng: RNGState } {
  let currentRng = rng;
  const rooms: Room[] = [];
  function walk(l: Leaf) {
    if (l.left === null && l.right === null) {
      // leaf
      const r = createRoom(l, currentRng);
      l.room = r.room;
      currentRng = r.nextRng;
      rooms.push(r.room);
    } else {
      if (l.left) walk(l.left);
      if (l.right) walk(l.right);
    }
  }
  walk(leaf);
  return { rooms, nextRng: currentRng };
}

/** 收集所有房间中心 */
function roomCenter(room: Room): { x: number; y: number } {
  return { x: Math.floor(room.x + room.w / 2), y: Math.floor(room.y + room.h / 2) };
}

/** 走廊:L 形,先水平再垂直 */
function carveCorridor(
  from: { x: number; y: number },
  to: { x: number; y: number },
  walls: Set<string>,
  floors: Set<string>,
): void {
  // 水平段
  const x0 = Math.min(from.x, to.x);
  const x1 = Math.max(from.x, to.x);
  for (let x = x0; x <= x1; x++) {
    const key = `${x},${from.y}`;
    floors.add(key);
    walls.delete(key);
  }
  // 垂直段
  const y0 = Math.min(from.y, to.y);
  const y1 = Math.max(from.y, to.y);
  for (let y = y0; y <= y1; y++) {
    const key = `${to.x},${y}`;
    floors.add(key);
    walls.delete(key);
  }
}

/** 给定两个矩形求它们之间的"中心点连线" */
function connectRooms(leaf: Leaf, rooms: Room[], floors: Set<string>, walls: Set<string>): void {
  if (leaf.left === null && leaf.right === null) return;

  // 找每个子树最近的房间
  const findRoom = (l: Leaf): Room => {
    if (l.room) return l.room;
    if (l.left) return findRoom(l.left);
    if (l.right) return findRoom(l.right);
    // 兜底 —— 不该发生
    return rooms[0]!;
  };

  if (leaf.left && leaf.right) {
    const a = findRoom(leaf.left);
    const b = findRoom(leaf.right);
    const ca = roomCenter(a);
    const cb = roomCenter(b);
    carveCorridor(ca, cb, walls, floors);
    connectRooms(leaf.left, rooms, floors, walls);
    connectRooms(leaf.right, rooms, floors, walls);
  }
}

/**
 * 生成地图
 * @param seed RNG seed (Mulberry32 状态)
 * @param level 关卡等级 (用来缩放地图大小)
 */
export function worldGen(seed: RNGState, level: number): MapLayout {
  // 地图大小按等级增长:基线 40x30,每级 +2/+1,封顶 80x60
  const width = Math.min(80, 40 + Math.max(0, level - 1) * 2);
  const height = Math.min(60, 30 + Math.max(0, level - 1) * 1);

  let rng = seed;

  // 1. 初始化根 leaf
  const root: Leaf = {
    x: 1,
    y: 1,
    w: width - 2,
    h: height - 2,
    left: null,
    right: null,
    room: null,
  };

  // 2. 递归切分
  const splitRes = splitLeaf(root, 0, rng);
  rng = splitRes.nextRng;

  // 3. 建房间
  const roomRes = buildRooms(splitRes.leaf, rng);
  rng = roomRes.nextRng;
  let rooms = roomRes.rooms;

  // 兜底:若房间数 < 4 (极少见,因为 MIN_LEAF_SIZE * 2 很小),手画 4 个
  if (rooms.length < 4) {
    rooms = [
      { x: 2, y: 2, w: 6, h: 5 },
      { x: width - 10, y: 2, w: 6, h: 5 },
      { x: 2, y: height - 9, w: 6, h: 5 },
      { x: width - 10, y: height - 9, w: 6, h: 5 },
    ];
  }

  // 4. 初始全部是墙
  const walls = new Set<string>();
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      walls.add(`${x},${y}`);
    }
  }
  const floors = new Set<string>();

  // 5. 把房间标为 floor
  for (const r of rooms) {
    for (let x = r.x; x < r.x + r.w; x++) {
      for (let y = r.y; y < r.y + r.h; y++) {
        const key = `${x},${y}`;
        floors.add(key);
        walls.delete(key);
      }
    }
  }

  // 6. BSP 兄弟节点走廊连接
  connectRooms(splitRes.leaf, rooms, floors, walls);

  // 7. 收集 spawnPoints —— 每个房间一个 (BSP 通常产出 4-12 个 leaf)
  const spawnPoints = rooms.map(roomCenter);

  // 8. walls 列表 —— 只保留非 floor 的
  const wallList: Array<{ x: number; y: number }> = [];
  for (const key of walls) {
    const [xs, ys] = key.split(',');
    wallList.push({ x: Number(xs), y: Number(ys) });
  }

  return { width, height, rooms, walls: wallList, spawnPoints };
}

// 抑制 lint 警告 nextRand 未使用 —— 保留为公共 API 给上层用
export { nextRand };
