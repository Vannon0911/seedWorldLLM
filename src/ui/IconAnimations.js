/**
 * IconAnimations.js
 * Re-exportiert Spielkonstanten und Tick-Logik aus der game-Domain.
 * Eigene UI-Animation-Logik kann hier ergänzt werden.
 */
export const IconAnimations = Object.freeze({
  mine: {
    swing(tick = 0) {
      return Math.sin(Number(tick) / 4) * 8;
    },
    pickaxe(tick = 0, isActive = false) {
      const wobble = Math.sin(Number(tick) / 5) * (isActive ? 0.08 : 0.03);
      return `scale(${(1 + wobble).toFixed(3)})`;
    }
  },
  factory: {
    rotate(tick = 0) {
      return (Number(tick) * 4) % 360;
    },
    opacity(isActive = false) {
      return isActive ? 1 : 0.78;
    }
  },
  connector: {
    pulseFlow(tick = 0) {
      return Math.sin(Number(tick) / 3) * 6;
    }
  }
});
// Keep explicit export for TileGridRenderer runtime animation hooks.

export {
  TICKS_PER_SECOND,
  MS_PER_TICK,
  ORE_PER_MINER_CYCLE,
  SMELTER_INPUT_ORE,
  SMELTER_OUTPUT_IRON,
  BASE_STORAGE_CAPACITY,
  STORAGE_CAPACITY_BONUS,
  getStorageCapacity,
  advanceTickState
} from "../game/gameConstants.js";
