/**
 * src/render/building-mesh.ts
 *
 * v3.2: 把 building-gen 输出转成 Three.js Mesh
 */
import * as THREE from 'three';
import {
  generateBuilding,
  generateSettlement,
  type BuildingMesh as BuildingData,
} from './building-gen';

/** BuildingData → Three.js Mesh */
export function buildingToMesh(b: BuildingData): THREE.Mesh {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(b.vertices, 3));
  geometry.setIndex(b.indices);
  geometry.computeVertexNormals();

  const material = new THREE.MeshLambertMaterial({
    color: b.materialColor,
    flatShading: true,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** 村庄 → 多个 mesh */
export function settlementToMeshes(
  centerX: number,
  centerZ: number,
  count: number,
  seed: number,
  radius: number = 20,
): THREE.Mesh[] {
  const buildings = generateSettlement(centerX, centerZ, count, seed, radius);
  return buildings.map(buildingToMesh);
}
