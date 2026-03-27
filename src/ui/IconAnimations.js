export const TICKS_PER_SECOND = 25;
export const MS_PER_TICK = 40;

function clamp01(value) {
  if (value <= 0) {
    return 0;
  }

  if (value >= 1) {
    return 1;
  }

  return value;
}

function cyclePosition(currentTick, periodTicks) {
  const safePeriod = periodTicks > 0 ? periodTicks : 1;
  const tick = Number.isFinite(currentTick) ? currentTick : 0;
  const normalized = (tick % safePeriod) / safePeriod;
  return normalized < 0 ? normalized + 1 : normalized;
}

function sineDegrees(currentTick, periodTicks, amplitudeDegrees, phaseOffset = 0) {
  const position = cyclePosition(currentTick + phaseOffset, periodTicks);
  return Math.sin(position * Math.PI * 2) * amplitudeDegrees;
}

function triangleWave(currentTick, periodTicks) {
  const position = cyclePosition(currentTick, periodTicks);
  return position < 0.5 ? position * 2 : (1 - position) * 2;
}

function pulseOpacity(currentTick, periodTicks, minOpacity, maxOpacity) {
  const wave = triangleWave(currentTick, periodTicks);
  return minOpacity + (maxOpacity - minOpacity) * wave;
}

export const IconAnimations = {
  mine: {
    swing(currentTick) {
      return sineDegrees(currentTick, Math.round(TICKS_PER_SECOND * 1.5), 5);
    },

    pickaxe(currentTick, isActive) {
      if (!isActive) {
        return "scale(1)";
      }

      const periodTicks = Math.max(1, Math.round(TICKS_PER_SECOND * 0.3));
      const wave = triangleWave(currentTick, periodTicks);
      const scale = 0.8 + wave * 0.3;
      const rotate = -6 + wave * 12;
      return `rotate(${rotate.toFixed(2)}deg) scale(${scale.toFixed(3)})`;
    }
  },

  factory: {
    rotate(currentTick) {
      const periodTicks = TICKS_PER_SECOND * 3;
      return cyclePosition(currentTick, periodTicks) * 360;
    },

    opacity(isActive) {
      return isActive ? 1 : 0.5;
    }
  },

  connector: {
    pulseFlow(currentTick) {
      const periodTicks = TICKS_PER_SECOND * 2;
      return cyclePosition(currentTick, periodTicks) * 100;
    },

    blink(currentTick, isEmpty) {
      if (!isEmpty) {
        return 1;
      }

      return clamp01(pulseOpacity(currentTick, TICKS_PER_SECOND, 0.3, 1));
    }
  }
};
