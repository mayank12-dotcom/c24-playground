import * as THREE from 'three';

/**
 * Shared matte finish for the office's static architecture and furniture.
 * Lambert shading keeps light continuous across smooth vertex normals without
 * adding toon bands, texture downloads, or a specular/environment-map pass.
 * Callers retain ownership of resource registration and disposal.
 */
export function createOfficeMaterial(color, options = {}) {
  return new THREE.MeshLambertMaterial({ color, ...options });
}
