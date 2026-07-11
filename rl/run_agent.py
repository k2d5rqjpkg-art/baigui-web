"""
rl/run_agent.py — 运行 RL agent 连 server (Day6.3)

用法:
  # 终端 1: 先起 server
  cd .. && npm run server:bridge

  # 终端 2: 跑 agent
  .venv/Scripts/python run_agent.py --server http://localhost:8787

Agent:
  - 连 server bridge
  - 用 RandomAgent 每帧发 intent
  - 任务: 存活 + 击杀怪物 + 拾取物品
  - 输出实时 reward / HP / 位置
  - Ctrl+C 停止

设计:
  - 最小: 复用 BaiguiEnv (test_env.py 已有)
  - 无限运行 (不是有限 episode)
  - 记录数据到 CSV (方便后续 PPO 训练)
"""
from __future__ import annotations

import argparse
import csv
import signal
import sys
import time
from pathlib import Path

from agent import RandomAgent
from env import BaiguiEnv


class GracefulKiller:
    """Ctrl+C 优雅停止"""

    def __init__(self):
        self.killed = False
        signal.signal(signal.SIGINT, self._handler)
        signal.signal(signal.SIGTERM, self._handler)

    def _handler(self, *_args):
        self.killed = True
        print("\n[agent] shutting down...")


def parse_args():
    p = argparse.ArgumentParser(description="Run RL agent against server bridge")
    p.add_argument("--server", type=str, default="http://localhost:8787", help="bridge URL")
    p.add_argument("--log-file", type=str, default="", help="CSV log path (default: agent_log_<ts>.csv)")
    p.add_argument("--goal", type=str, default="kill", choices=["kill", "survive"], help="agent goal (Day6.3: kill)")
    return p.parse_args()


def main():
    args = parse_args()
    killer = GracefulKiller()

    env = BaiguiEnv(server_url=args.server, max_steps=999_999)  # 无限
    agent = RandomAgent(env.action_space, seed=42)

    # CSV log
    log_path = args.log_file or f"agent_log_{int(time.time())}.csv"
    log_file = open(log_path, "w", newline="", encoding="utf-8")
    log_writer = csv.writer(log_file)
    log_writer.writerow(["step", "hp", "max_hp", "pos_x", "pos_y",
                          "enemies_alive", "items_nearby",
                          "reward_this_step", "cumulative_reward",
                          "alive", "terminated", "truncated"])

    obs, info = env.reset(seed=42)
    step = 0
    cumulative_reward = 0.0

    print(f"[agent] connected to {args.server}")
    print(f"[agent] logging to {log_path}")
    print(f"[agent] running... Ctrl+C to stop")

    while not killer.killed:
        action = agent.act(obs)
        obs, reward, terminated, truncated, info = env.step(action)

        step += 1
        cumulative_reward += reward

        # 从 obs 提取一些可读信息
        hp = obs[0] * 100  # 归一化 HP
        pos_x = info.get("x", 0)
        pos_y = info.get("y", 0)
        alive = hp > 0

        log_writer.writerow([
            step, hp, 100, pos_x, pos_y,
            info.get("enemies", 0), info.get("items", 0),
            round(reward, 4), round(cumulative_reward, 2),
            alive, terminated, truncated,
        ])

        if step % 50 == 0:
            print(f"[step {step:>6d}] HP={hp:.0f}/100 pos=({pos_x},{pos_y}) "
                  f"reward={cumulative_reward:+.2f} alive={alive}")

        if terminated or truncated:
            # 死亡/完成 → 重置
            print(f"[step {step:>6d}] terminated! total_reward={cumulative_reward:+.2f} "
                  f"alive={alive}")
            obs, info = env.reset()
            step = 0
            cumulative_reward = 0.0

    log_file.close()
    print(f"[agent] done - {step} steps logged to {log_path}")


if __name__ == "__main__":
    main()
