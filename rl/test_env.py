"""
rl/test_env.py - 集成测试
=========================

跑通:
  - 创建 BaiguiEnv
  - reset()
  - 用 RandomAgent 跑 N 步
  - 验证 obs 形状 / 累积 reward / 不会崩

用法:
  # 1) 先起服务器
  cd ../ && npm run server:bridge

  # 2) 再跑测试
  python test_env.py
  # 或:
  python test_env.py --steps 200
"""
from __future__ import annotations

import argparse
import sys
import time

import numpy as np

from env import BaiguiEnv
from agent import RandomAgent


def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument("--steps", type=int, default=100, help="每个 episode 跑多少步")
    p.add_argument("--episodes", type=int, default=2, help="一共跑几个 episode")
    p.add_argument("--server", type=str, default="http://localhost:8787")
    p.add_argument("--seed", type=int, default=42)
    return p.parse_args()


def main() -> int:
    args = parse_args()
    print(f"[test] server={args.server}, episodes={args.episodes}, steps/episode={args.steps}")

    env = BaiguiEnv(server_url=args.server, max_steps=args.steps)
    agent = RandomAgent(env.action_space, seed=args.seed)

    print(f"[test] observation_space={env.observation_space}")
    print(f"[test] action_space={env.action_space}")
    # Day1.5: 8 标量 + 5x5=25 网格 = 33 维 (Day1 的 26 是占位值,被 sim 重写后更新)
    assert env.observation_space.shape == (33,), env.observation_space.shape
    assert env.action_space.n == 6

    total_reward = 0.0
    total_steps = 0
    events_collected: list = []

    for ep in range(args.episodes):
        obs, info = env.reset(seed=args.seed + ep)
        assert obs.shape == env.observation_space.shape, (obs.shape, env.observation_space.shape)
        assert obs.dtype == np.float32
        # obs 应该在 [0,1]
        assert obs.min() >= 0.0 and obs.max() <= 1.0, (obs.min(), obs.max())
        ep_reward = 0.0
        ep_steps = 0
        terminated = truncated = False
        seed_used = info.get("seed")

        while not (terminated or truncated):
            action = agent.act(obs)
            obs, reward, terminated, truncated, info = env.step(action)
            ep_reward += reward
            ep_steps += 1
            events_collected.append(info.get("events", []))

        print(
            f"[test] ep={ep:02d} seed={seed_used} steps={ep_steps} "
            f"reward={ep_reward:+.2f} terminated={terminated} truncated={truncated}"
        )
        total_reward += ep_reward
        total_steps += ep_steps

    print(f"[test] total_steps={total_steps} total_reward={total_reward:+.2f}")
    print(f"[test] events_seen_total={sum(len(e) for e in events_collected)}")

    # ---- 断言 / 验收 ----
    # Day1.5: random agent 一击必杀怪物会让 episode 早早 terminate,
    # 所以只要求:每个 episode 至少跑 1 步(env 没崩)、总 step > 0、reward 可计算。
    assert total_steps >= args.episodes, (
        f"实测 {total_steps} 步太少 (≥{args.episodes} 才算 env 正常)"
    )
    assert total_reward != 0 or args.episodes == 0, (
        f"reward 全 0 — env 没在推进事件"
    )
    # 每步平均 reward 应当是有限实数
    print(f"[test] reward_per_step={total_reward / max(1, total_steps):+.4f}")

    env.close()
    print("[PASS] Environment interface verified")
    return 0


if __name__ == "__main__":
    t0 = time.time()
    sys.exit(main())
    print(f"[test] elapsed={time.time()-t0:.2f}s")
