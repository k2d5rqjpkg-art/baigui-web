/**
 * 键盘输入管理器
 */
export class InputManager {
  private keys = new Set<string>();
  private justPressed = new Set<string>();

  constructor() {
    window.addEventListener('keydown', (e) => {
      if (!this.keys.has(e.code)) {
        this.justPressed.add(e.code);
      }
      this.keys.add(e.code);
      // 阻止方向键滚动页面
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
        e.preventDefault();
      }
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
    });
  }

  isDown(key: string): boolean {
    return this.keys.has(key);
  }

  wasPressed(key: string): boolean {
    return this.justPressed.has(key);
  }

  /** 在每帧末尾调用，清空 justPressed */
  endFrame() {
    this.justPressed.clear();
  }

  /** 方向向量 for 移动 */
  getDirection(): { x: number; y: number } {
    let x = 0,
      y = 0;
    if (this.isDown('ArrowLeft') || this.isDown('KeyA')) x -= 1;
    if (this.isDown('ArrowRight') || this.isDown('KeyD')) x += 1;
    if (this.isDown('ArrowUp') || this.isDown('KeyW')) y -= 1;
    if (this.isDown('ArrowDown') || this.isDown('KeyS')) y += 1;
    // 归一化
    const len = Math.sqrt(x * x + y * y);
    if (len > 0) {
      x /= len;
      y /= len;
    }
    return { x, y };
  }
}
