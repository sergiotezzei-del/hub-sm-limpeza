import type { MasterMapNodeDimension, MasterMapPositionPatch } from "./masterMapLayoutTypes";

export type MasterMapCollision = {
  firstNodeId: string;
  secondNodeId: string;
  overlapX: number;
  overlapY: number;
};

export function detectMasterMapLayoutCollisions(
  positions: MasterMapPositionPatch[],
  dimensions: Map<string, MasterMapNodeDimension>,
  tolerance = 2,
) {
  const collisions: MasterMapCollision[] = [];

  for (let firstIndex = 0; firstIndex < positions.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < positions.length; secondIndex += 1) {
      const first = getBox(positions[firstIndex], dimensions);
      const second = getBox(positions[secondIndex], dimensions);
      const overlapX = Math.min(first.right, second.right) - Math.max(first.left, second.left);
      const overlapY = Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top);
      if (overlapX > tolerance && overlapY > tolerance) {
        collisions.push({
          firstNodeId: positions[firstIndex].id,
          secondNodeId: positions[secondIndex].id,
          overlapX,
          overlapY,
        });
      }
    }
  }

  return collisions;
}

export function mergeMasterMapPositions(
  currentPositions: MasterMapPositionPatch[],
  nextPositions: MasterMapPositionPatch[],
) {
  const nextById = new Map(nextPositions.map((position) => [position.id, position]));
  return currentPositions.map((position) => nextById.get(position.id) ?? position);
}

export function createMasterMapPositionSnapshot(positions: MasterMapPositionPatch[]) {
  return positions.map((position) => ({ ...position }));
}

function getBox(position: MasterMapPositionPatch, dimensions: Map<string, MasterMapNodeDimension>) {
  const dimension = dimensions.get(position.id);
  const width = Math.max(1, dimension?.width ?? 270);
  const height = Math.max(1, dimension?.height ?? 140);

  return {
    left: position.positionX,
    top: position.positionY,
    right: position.positionX + width,
    bottom: position.positionY + height,
  };
}
