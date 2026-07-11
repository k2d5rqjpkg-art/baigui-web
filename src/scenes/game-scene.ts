import * as THREE from 'three';

/**
 * 游戏场景：管理 Three.js 的场景、相机、灯光
 * 2D 正交投影，像素风格
 */
export class GameScene {
  scene: THREE.Scene;
  camera: THREE.OrthographicCamera;
  renderer: THREE.WebGLRenderer;
  private container: HTMLElement;

  constructor(container: HTMLElement) {
    this.container = container;

    // 渲染器
    this.renderer = new THREE.WebGLRenderer({
      antialias: false,
      alpha: false,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x333366);
    container.appendChild(this.renderer.domElement);

    // 场景
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x333366);

    // 正交相机
    const aspect = container.clientWidth / container.clientHeight;
    const viewSize = 4;
    this.camera = new THREE.OrthographicCamera(
      -viewSize * aspect, viewSize * aspect,
      viewSize, -viewSize,
      0.1, 100
    );
    this.camera.position.set(0, 0, 10);
    this.camera.lookAt(0, 0, 0);

    // 窗口大小自适应
    window.addEventListener('resize', () => this.handleResize());
    this.handleResize();
  }

  private handleResize() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.renderer.setSize(w, h, false);
    const aspect = w / h;
    const viewSize = 4; // 跟构造函数保持一致
    this.camera.left = -viewSize * aspect;
    this.camera.right = viewSize * aspect;
    this.camera.top = viewSize;
    this.camera.bottom = -viewSize;
    this.camera.updateProjectionMatrix();
  }

  /** 网格背景（可选地砖效果）*/
  addGrid() {
    // 简单的格子地板——用 LineSegments 画网格
    const size = 20;
    const divisions = 20;
    const step = size / divisions;
    const points: THREE.Vector3[] = [];
    for (let i = -divisions/2; i <= divisions/2; i++) {
      const p = i * step;
      points.push(new THREE.Vector3(p, -size/2, 0));
      points.push(new THREE.Vector3(p, size/2, 0));
      points.push(new THREE.Vector3(-size/2, p, 0));
      points.push(new THREE.Vector3(size/2, p, 0));
    }
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    const mat = new THREE.LineBasicMaterial({
      color: 0x444488,
      transparent: true,
      opacity: 0.5,
    });
    const grid = new THREE.LineSegments(geo, mat);
    grid.position.z = -1;
    this.scene.add(grid);
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  /** 闪光特效（升级/受击） */
  flashEffect(color: string, duration = 300) {
    const div = document.createElement('div');
    div.style.cssText = `
      position:fixed;inset:0;pointer-events:none;z-index:5;
      background:${color};opacity:0.3;transition:opacity ${duration}ms ease-out;
    `;
    document.body.appendChild(div);
    requestAnimationFrame(() => { div.style.opacity = '0'; });
    setTimeout(() => div.remove(), duration);
  }

  dispose() {
    this.renderer.dispose();
    this.scene.clear();
  }
}
