# Baigui RL Environment

Gymnasium 兼容的最小 RL 环境,通过 HTTP 与 `../server/bridge.ts` 通信。
**不直接 import TS 代码**,纯 HTTP 客户端。

## 安装

```bash
cd rl/
# 系统装了 uv 后:
uv venv .venv
uv pip install -r requirements.txt
```

或者用系统 python:
```bash
python -m pip install -r requirements.txt
```

> pip 在 Hermes `venv` 里没有,用 `uv venv` 后 `uv pip install` 是最稳的路径。

## 启动流程

**终端 1 - 起 HTTP bridge**
```bash
cd ../            # 回到 baigui-web/
npm run server:bridge        # 端口 8787 (默认)
```

**终端 2 - 跑测试**
```bash
cd rl/
.venv/Scripts/activate           # Windows
python test_env.py               # 跑 2 episodes × 100 steps
python test_env.py --steps 500 --episodes 3
```

## 模块

| 文件 | 作用 |
|------|------|
| `env.py` | `class BaiguiEnv(gym.Env)` - 26-dim obs Box, Discrete(6) action space |
| `agent.py` | `class RandomAgent` - Day1 验证用,Day2 换 DQN/PPO |
| `test_env.py` | 集成测试 (验证 env 不崩,obs 形状对,reward 累积合理) |
| `requirements.txt` | gymnasium + requests + numpy |

## Observation

`Box(low=0, high=1, shape=(26,))`:
- `[0]` - player HP / maxHP ratio
- `[1..25]` - 周围 5×5 网格,float:
  - `0.0` 空
  - `0.5` 拾取物
  - `0.6` 其他玩家
  - `0.8` 敌人
  - `1.0` 玩家自己 (网格中心)

视野半径 = 8 世界单位。

## Action

`Discrete(6)`:
- 0=up 1=down 2=left 3=right 4=attack 5=pickup

## Reward

| 事件 | 奖励 |
|------|------|
| deal damage | +10 |
| take damage | -5 |
| kill enemy | +50 |
| pickup item | +5 |
| per-step time penalty | -0.1 |
| death | -5 |

> random agent + -0.1/step 默认会累积负 reward (Day1 验证用,不要求 > 0);
> 这是为了让 user 看到 env 在真实推进。

## HTTP 接口契约

详见 `../server/README.md` HTTP Bridge 章节。RL 只关心 3 个端点:
- `GET /reset?seed=xx` → 重置
- `POST /action` `{action, entityId}` → 推进一帧,返回 `{tick, entities, events, reward}`
- `GET /state` → 当前 snapshot

## 验收

```bash
python test_env.py
# 应该看到:
#   [test] total_steps=200 total_reward=-20.xx
#   [test] events_seen_total=xxx
#   [test] ✓ passed
```
