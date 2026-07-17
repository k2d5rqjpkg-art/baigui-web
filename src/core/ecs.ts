import * as THREE from 'three';

/**
 * 简单的组件-实体系统
 * 实体 = number id，通过组件表查询
 */
type Component<T = any> = { type: string; data: T };

class ECS {
  private nextId = 1;
  private entities = new Set<number>();
  private components = new Map<string, Map<number, any>>();

  createEntity(): number {
    const id = this.nextId++;
    this.entities.add(id);
    return id;
  }

  destroyEntity(id: number) {
    this.entities.delete(id);
    for (const map of this.components.values()) {
      map.delete(id);
    }
  }

  addComponent<T>(entity: number, type: string, data: T) {
    if (!this.components.has(type)) {
      this.components.set(type, new Map());
    }
    this.components.get(type)!.set(entity, data);
  }

  getComponent<T>(entity: number, type: string): T | undefined {
    return this.components.get(type)?.get(entity) as T | undefined;
  }

  hasComponent(entity: number, type: string): boolean {
    return this.components.get(type)?.has(entity) ?? false;
  }

  query(...types: string[]): number[] {
    const results: number[] = [];
    for (const id of this.entities) {
      if (types.every((t) => this.hasComponent(id, t))) {
        results.push(id);
      }
    }
    return results;
  }

  forEach(type: string, fn: (entity: number, data: any) => void) {
    const map = this.components.get(type);
    if (!map) return;
    for (const [id, data] of map) {
      fn(id, data);
    }
  }
}

export const ecs = new ECS();
export default ECS;
