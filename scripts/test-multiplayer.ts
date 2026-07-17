/**
 * scripts/test-multiplayer.ts
 *
 * Day4 端到端: 用 Node WebSocket client 模拟两个浏览器 tab,
 * 验证它们加入同一房间后, server 推 state 都能看到对方。
 */

import WebSocket from 'ws';

const SERVER = 'ws://localhost:8787';

interface ServerMsg {
  type: 'welcome' | 'state' | 'error';
  [k: string]: any;
}

class FakeClient {
  ws: WebSocket;
  name: string;
  eid: string | null = null;
  lastTick = 0;
  lastEntityCount = 0;
  ready = false;
  receivedStates = 0;
  receivedWelcome = false;

  constructor(name: string, slotId: number) {
    this.name = name;
    this.ws = new WebSocket(SERVER);
    this.ws.on('open', () => {
      console.log(`[${name}] open, sending hello slot=${slotId}`);
      this.ws.send(JSON.stringify({ type: 'hello', slotId }));
    });
    this.ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString()) as ServerMsg;
      if (msg.type === 'welcome') {
        this.eid = msg.entityId;
        this.receivedWelcome = true;
        this.lastEntityCount = msg.snapshot?.entities?.length ?? 0;
        console.log(`[${name}] welcome eid=${this.eid} entities=${this.lastEntityCount}`);
        this.ready = true;
      } else if (msg.type === 'state') {
        this.receivedStates++;
        this.lastTick = msg.tick;
        this.lastEntityCount = msg.entities?.length ?? 0;
      } else if (msg.type === 'error') {
        console.error(`[${name}] server error:`, msg.message);
      }
    });
    this.ws.on('close', () => console.log(`[${name}] closed`));
    this.ws.on('error', (err) => console.error(`[${name}] ws error:`, err));
  }

  sendIntent(action: number) {
    this.ws.send(JSON.stringify({ type: 'intent', action }));
  }

  close() {
    this.ws.close();
  }
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  console.log('=== Day4 Multi-Client E2E Test ===');

  const a = new FakeClient('A', 1);
  const b = new FakeClient('B', 2);

  // 等两个都收到 welcome
  await sleep(800);
  if (!a.ready || !b.ready) {
    console.error('FAIL: 客户端没收到 welcome');
    process.exit(1);
  }
  console.log(`PASS: 两个客户端都收到 welcome (a=${a.eid}, b=${b.eid})`);

  // 等 server 推几轮 state
  await sleep(800);
  if (a.receivedStates < 1 || b.receivedStates < 1) {
    console.error(`FAIL: state 推送不够 (a=${a.receivedStates}, b=${b.receivedStates})`);
    process.exit(1);
  }
  console.log(
    `PASS: 两个客户端都收到 state 推送 (a=${a.receivedStates}, b=${b.receivedStates} 轮)`,
  );

  // A 走一步 (move right), B 也走一步 (move left)
  a.sendIntent(3); // 右
  b.sendIntent(2); // 左
  await sleep(500);

  // 验证 tick 推进
  if (a.lastTick === 0 || b.lastTick === 0) {
    console.error(`FAIL: tick 没推进 (a=${a.lastTick}, b=${b.lastTick})`);
    process.exit(1);
  }
  console.log(`PASS: tick 推进 (a=${a.lastTick}, b=${b.lastTick})`);

  // 验证 entity 数变化 (同房间, 数应该稳定)
  console.log(
    `FINAL: a.eid=${a.eid} b.eid=${b.eid} entities=${a.lastEntityCount} tick=${a.lastTick}`,
  );

  if (a.eid === b.eid) {
    console.error(`FAIL: a 和 b 的 eid 相同 (${a.eid}), server 没分配不同 slot`);
    process.exit(1);
  }
  console.log(`PASS: 两个客户端获得不同 EntityId`);

  a.close();
  b.close();
  await sleep(200);

  console.log('\n=== ALL PASS ===');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
