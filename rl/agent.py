"""
rl/agent.py - 随机策略 agent (Day1 验证用)
===============================================

跑通 HTTP bridge 链路 + Gymnasium API 之后,
Day2 可以换成 DQN / PPO / SAC 等正式算法。
"""
from __future__ import annotations

import numpy as np


class RandomAgent:
    """从 action_space 均匀采样,完全无视 obs"""

    def __init__(self, action_space, seed: int | None = None):
        self.action_space = action_space
        self.rng = np.random.default_rng(seed)

    def act(self, obs: np.ndarray) -> int:
        return int(self.action_space.sample())
