import { calculateMasterMapElkLayout } from "./masterMapElkLayout";
import { calculateMasterMapMindMapLayout } from "./masterMapMindMapLayout";
import type { MasterMapLayoutInput, MasterMapLayoutResult } from "./masterMapLayoutTypes";

export async function calculateMasterMapLayout(input: MasterMapLayoutInput): Promise<MasterMapLayoutResult> {
  await waitForIdleLayoutFrame();

  if (input.preferences.layoutMode === "manual") {
    return {
      positions: input.nodes
        .filter((node) => input.affectedNodeIds.has(node.id))
        .map((node) => ({ id: node.id, positionX: node.positionX, positionY: node.positionY })),
      affectedNodeIds: new Set(input.affectedNodeIds),
    };
  }

  if (input.preferences.layoutMode === "mind") {
    return calculateMasterMapMindMapLayout(input);
  }

  return calculateMasterMapElkLayout(input);
}

function waitForIdleLayoutFrame() {
  return new Promise<void>((resolve) => {
    if (typeof window === "undefined") {
      resolve();
      return;
    }
    const schedule = window.requestIdleCallback ?? ((callback: IdleRequestCallback) => window.setTimeout(() => callback({
      didTimeout: false,
      timeRemaining: () => 8,
    } as IdleDeadline), 16));
    schedule(() => resolve(), { timeout: 120 });
  });
}
