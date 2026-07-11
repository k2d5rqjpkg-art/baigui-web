"""
rl/env.py - Gymnasium RL 环境 (Day1.5 适配)
============================================

通过 HTTP 调用 baigui-web/server/bridge.ts,不直接 import TS 代码。
RL 训练 agent 时与人类玩家共享同一个 room (通过 ROOM_PLAYER_ID = 'e_player_1')。

Obs 形状 (26 维,Box(low=0, high=1, dtype=float32)):
    [0]           : player.hp / player.maxHp
    [1]           : player.atk / 50 (归一化)
    [2]           : player.def / 50
    [3]           : 最近 enemy dx / 3 (clamp)
    [4]           : 最近 enemy dy / 3 (clamp)
    [5]           : 最近 enemy.hp / 100
    [6]           : 最近 item dx / 3 (clamp)
    [7]           : 最近 item dy / 3 (clamp)
    [8..25]       : 5x5 视野网格 (3 通道 one-hot: enemy / item / self)

Action 空间:
    Discrete(6)  →  0=up 1=down 2=left 3=right 4=attack 5=pickup
                   (服务器自动找最近 enemy/item)

Reward shaping (与 server/bridge.ts computeRewardFromEvents 一致):
    +10 deal damage (source===self)
     -5 take damage (target===self)
    +50 kill       (death event source===self)
     +5 pickup     (source===self)
     -0.1 per step (time penalty)
"""
from __future__ import annotations

from typing import Any, Tuple, Dict, Optional

import gymnasium as gym
import numpy as np
import requests
from gymnasium import spaces


DEFAULT_SERVER = "http://localhost:8787"
PLAYER_ID = "e_player_1"   # 与 server/state.ts ROOM_PLAYER_ID 一致 (Day1.5 改为字符串字面量)
VIEW_RADIUS = 8.0
GRID = 5

# 视野网格 one-hot 通道值 (3 通道在最后一维堆叠 → 5*5*3 = 75,但我们只用 5*5 单通道做兼容)
# Day1.5: 按任务文档用 1 通道,enemy > item > self 优先级
ENEMY_CH = 0.8
ITEM_CH = 0.5
SELF_CH = 1.0
EMPTY_CH = 0.0


class BaiguiEnv(gym.Env):
    """Day1.5 Baigui RL 环境 - 通过 HTTP bridge 与 server 通信"""

    metadata = {"render_modes": []}

    def __init__(self, server_url: str = DEFAULT_SERVER, max_steps: int = 500):
        super().__init__()
        self.server_url = server_url.rstrip("/")
        self.max_steps = max_steps

        # observation: 33 floats ∈ [0, 1]
        # [0..7] 标量特征 (8), [8..32] = 5x5 = 25 网格 (3 通道简化为 1 通道)
        # Day1.5 适配: 任务原文说 [8..25] 是 18,但 5x5=25 更自然。
        # 我们用 8 + 25 = 33,test_env.py 的 (26,) 断言需要同步更新 (Day1 stale)。
        self.observation_space = spaces.Box(
            low=0.0, high=1.0, shape=(8 + GRID * GRID,), dtype=np.float32
        )
        # action: 6 discrete
        self.action_space = spaces.Discrete(6)

        self._step_count = 0

    # ---------- HTTP ----------
    def _request(self, method: str, path: str, json: Optional[dict] = None, timeout: float = 5.0):
        url = f"{self.server_url}{path}"
        resp = requests.request(method, url, json=json, timeout=timeout)
        resp.raise_for_status()
        return resp.json()

    # ---------- 实体提取 ----------
    def _extract_player(self, entities) -> Optional[dict]:
        for e in entities:
            if e.get("id") == PLAYER_ID:
                return e
        return None

    def _find_nearest(self, entities, kind: str, px: float, py: float) -> Optional[dict]:
        best = None
        best_d = float("inf")
        for e in entities:
            if e.get("kind") != kind:
                continue
            # monster 死了不算
            if kind == "monster" and e.get("hp", 0) <= 0:
                continue
            ex = e.get("pos", {}).get("x", 0)
            ey = e.get("pos", {}).get("y", 0)
            d = abs(ex - px) + abs(ey - py)
            if d < best_d:
                best_d = d
                best = e
        return best

    # ---------- 26 维 obs 构建 ----------
    def _build_obs(self, entities) -> Tuple[np.ndarray, dict]:
        player = self._extract_player(entities)

        # 1..7 标量 (无 player 时填 0)
        if player is None:
            scalars = np.zeros(8, dtype=np.float32)
        else:
            px, py = player["pos"]["x"], player["pos"]["y"]
            max_hp = max(1, player.get("maxHp", 100))
            hp_ratio = np.clip(player.get("hp", 0) / max_hp, 0.0, 1.0)
            atk_norm = np.clip(player.get("atk", 0) / 50.0, 0.0, 1.0)
            def_norm = np.clip(player.get("def", 0) / 50.0, 0.0, 1.0)

            # 最近 enemy
            enemy = self._find_nearest(entities, "monster", px, py)
            if enemy is not None:
                ex = enemy["pos"]["x"] - px
                ey = enemy["pos"]["y"] - py
                enemy_dx = np.clip(ex / 3.0, -1.0, 1.0) * 0.5 + 0.5  # 归一到 [0,1]
                enemy_dy = np.clip(ey / 3.0, -1.0, 1.0) * 0.5 + 0.5
                enemy_hp = np.clip(enemy.get("hp", 0) / 100.0, 0.0, 1.0)
            else:
                enemy_dx = enemy_dy = enemy_hp = 0.5

            # 最近 item
            item = self._find_nearest(entities, "item", px, py)
            if item is not None:
                ix = item["pos"]["x"] - px
                iy = item["pos"]["y"] - py
                item_dx = np.clip(ix / 3.0, -1.0, 1.0) * 0.5 + 0.5
                item_dy = np.clip(iy / 3.0, -1.0, 1.0) * 0.5 + 0.5
            else:
                item_dx = item_dy = 0.5

            scalars = np.array([
                hp_ratio,
                atk_norm,
                def_norm,
                enemy_dx,
                enemy_dy,
                enemy_hp,
                item_dx,
                item_dy,
            ], dtype=np.float32)

        # 8..25 5x5 视野网格 (1 通道: enemy > item > self 优先级)
        grid = np.full((GRID * GRID,), EMPTY_CH, dtype=np.float32)
        if player is not None:
            px, py = player["pos"]["x"], player["pos"]["y"]
            cell_size = (VIEW_RADIUS * 2) / GRID  # 3.2
            center = GRID // 2  # 2

            # 先标自己
            grid[center * GRID + center] = SELF_CH

            # 然后 enemy (覆盖 self 之外的格)
            for e in entities:
                if e.get("kind") != "monster":
                    continue
                if e.get("hp", 0) <= 0:
                    continue
                ex = e.get("pos", {}).get("x", 0) - px
                ey = e.get("pos", {}).get("y", 0) - py
                gx = int((ex + VIEW_RADIUS) / cell_size)
                gy = int((ey + VIEW_RADIUS) / cell_size)
                if 0 <= gx < GRID and 0 <= gy < GRID:
                    if gx == center and gy == center:
                        continue  # 中心格保留 self
                    grid[gy * GRID + gx] = ENEMY_CH

            # 最后 item (覆盖 enemy 之外)
            for e in entities:
                if e.get("kind") != "item":
                    continue
                ex = e.get("pos", {}).get("x", 0) - px
                ey = e.get("pos", {}).get("y", 0) - py
                gx = int((ex + VIEW_RADIUS) / cell_size)
                gy = int((ey + VIEW_RADIUS) / cell_size)
                if 0 <= gx < GRID and 0 <= gy < GRID:
                    if gx == center and gy == center:
                        continue
                    cur = grid[gy * GRID + gx]
                    # 只在空格里覆盖 enemy 之外的格
                    if cur < ENEMY_CH:
                        grid[gy * GRID + gx] = ITEM_CH

        obs = np.concatenate([scalars, grid]).astype(np.float32)
        assert obs.shape == (8 + GRID * GRID,), obs.shape
        # 防御性: 全部 clip 到 [0,1] (偶尔负值会因负相对位置后 +1 但被乘以 0.5 还原)
        obs = np.clip(obs, 0.0, 1.0).astype(np.float32)
        return obs, {"player": player}

    # ---------- Gymnasium API ----------
    def reset(self, *, seed: Optional[int] = None, options: Optional[dict] = None) -> Tuple[np.ndarray, dict]:
        super().reset(seed=seed)

        seed_val: int
        if seed is None:
            seed_val = options.get("seed") if options else None  # type: ignore
            if seed_val is None:
                seed_val = int.from_bytes(np.random.bytes(4), "little") % (2**31)
        else:
            seed_val = int(seed) % (2**31)

        snap = self._request("GET", f"/reset?seed={seed_val}")
        entities = snap.get("snapshot", {}).get("entities", [])
        self._step_count = 0
        obs, info = self._build_obs(entities)
        info["seed"] = seed_val
        return obs, info

    def step(self, action: int) -> Tuple[np.ndarray, float, bool, bool, dict]:
        action = int(action)
        if not self.action_space.contains(action):
            raise ValueError(f"action must be in [0..5], got {action}")

        self._step_count += 1

        # 调用 /action (entityId 用字符串字面量,与 server 一致)
        resp = self._request("POST", "/action", json={
            "action": action,
            "entityId": PLAYER_ID,
        })

        entities = resp.get("entities", [])
        events = resp.get("events", [])
        reward = float(resp.get("reward", 0.0))

        terminated = False
        truncated = False

        # 找 player 状态
        player = self._extract_player(entities)
        # Day1.5: player 用 hp 字段判断死活
        monsters_alive = sum(1 for e in entities if e.get("kind") == "monster" and e.get("hp", 0) > 0)
        if player is None or player.get("hp", 0) <= 0:
            terminated = True
            reward -= 5.0  # 死亡额外惩罚
        elif monsters_alive == 0:
            terminated = True
            reward += 20.0  # 击杀所有敌人奖励
        elif self._step_count >= self.max_steps:
            truncated = True

        obs, info = self._build_obs(entities)
        info["events"] = events
        info["tick"] = resp.get("tick", 0)
        return obs, reward, terminated, truncated, info

    def close(self):
        pass