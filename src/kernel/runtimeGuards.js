function createDeterminismError(message) {
  return new Error(`[KERNEL_GUARD] ${message}`);
}

let activeGuardScope = null;

function patch(target, key, replacement) {
  const hadOwn = Object.prototype.hasOwnProperty.call(target, key);
  const previousDescriptor = hadOwn ? Object.getOwnPropertyDescriptor(target, key) : undefined;

  try {
    if (previousDescriptor && "value" in previousDescriptor) {
      Object.defineProperty(target, key, {
        ...previousDescriptor,
        value: replacement,
        writable: false
      });
    } else {
      Object.defineProperty(target, key, {
        configurable: true,
        enumerable: false,
        writable: false,
        value: replacement
      });
    }
  } catch {
    throw createDeterminismError(`Konnte Guard fuer ${String(key)} nicht erzwingen.`);
  }

  if (target[key] !== replacement) {
    throw createDeterminismError(`Konnte Guard fuer ${String(key)} nicht erzwingen.`);
  }

  return () => {
    if (hadOwn) {
      Object.defineProperty(target, key, previousDescriptor);
      return;
    }

    delete target[key];
  };
}

function createGuardedDate(OriginalDate) {
  function GuardedDate(...args) {
    if (!new.target) {
      throw createDeterminismError("`Date()` als Funktion ist im deterministischen Kernel verboten.");
    }

    if (args.length === 0) {
      throw createDeterminismError("`Date()` ohne festen Input ist im Kernel verboten.");
    }

    return Reflect.construct(OriginalDate, args, new.target || OriginalDate);
  }

  GuardedDate.prototype = OriginalDate.prototype;
  GuardedDate.parse = OriginalDate.parse.bind(OriginalDate);
  GuardedDate.UTC = OriginalDate.UTC.bind(OriginalDate);
  GuardedDate.now = () => {
    throw createDeterminismError("`Date.now()` ist im deterministischen Kernel verboten.");
  };
  Object.freeze(GuardedDate);

  return GuardedDate;
}

export async function withDeterminismGuards(run) {
  // @doc-anchor KERNEL-GUARDS
  // @mut-point MUT-GUARD-API
  if (activeGuardScope !== null) {
    throw createDeterminismError("Determinismus-Guards laufen bereits in einem aktiven Scope.");
  }

  const guardScope = Symbol("determinism-guard");
  activeGuardScope = guardScope;
  const restore = [];

  const originalDate = globalThis.Date;
  const originalMathRandom = Math.random;
  const originalDateConstructor = originalDate.prototype.constructor;
  const performanceProto = globalThis.performance ? Object.getPrototypeOf(globalThis.performance) : null;
  const cryptoProto = globalThis.crypto ? Object.getPrototypeOf(globalThis.crypto) : null;
  const originalPerformanceNow = performanceProto && typeof performanceProto.now === "function" ? performanceProto.now : null;
  const originalCryptoGetRandomValues =
    cryptoProto && typeof cryptoProto.getRandomValues === "function" ? cryptoProto.getRandomValues : null;
  const originalCryptoRandomUUID = cryptoProto && typeof cryptoProto.randomUUID === "function" ? cryptoProto.randomUUID : null;

  try {
    const guardedDate = createGuardedDate(originalDate);

    restore.push(patch(globalThis, "Date", guardedDate));
    restore.push(patch(originalDate.prototype, "constructor", guardedDate));

    restore.push(
      patch(Math, "random", () => {
        throw createDeterminismError("`Math.random()` ist im deterministischen Kernel verboten.");
      })
    );

    if (performanceProto && typeof performanceProto.now === "function") {
      restore.push(
        patch(performanceProto, "now", () => {
          throw createDeterminismError("`performance.now()` ist im deterministischen Kernel verboten.");
        })
      );
    }

    if (cryptoProto && typeof cryptoProto.getRandomValues === "function") {
      restore.push(
        patch(cryptoProto, "getRandomValues", () => {
          throw createDeterminismError("`crypto.getRandomValues()` ist im deterministischen Kernel verboten.");
        })
      );
    }

    if (cryptoProto && typeof cryptoProto.randomUUID === "function") {
      restore.push(
        patch(cryptoProto, "randomUUID", () => {
          throw createDeterminismError("`crypto.randomUUID()` ist im deterministischen Kernel verboten.");
        })
      );
    }

    return await run();
  } finally {
    let restoreError = null;
    while (restore.length > 0) {
      const undo = restore.pop();
      try {
        undo();
      } catch (error) {
        if (restoreError === null) {
          restoreError = error;
        }
      }
    }

    activeGuardScope = null;

    if (restoreError) {
      throw restoreError;
    }

    if (Math.random !== originalMathRandom || globalThis.Date !== originalDate) {
      throw createDeterminismError("Determinismus-Guards konnten nicht sauber zurueckgesetzt werden.");
    }

    if (originalDate.prototype.constructor !== originalDateConstructor) {
      throw createDeterminismError("Date.prototype.constructor konnte nicht sauber zurueckgesetzt werden.");
    }

    if (performanceProto && performanceProto.now !== originalPerformanceNow) {
      throw createDeterminismError("performance.now konnte nicht sauber zurueckgesetzt werden.");
    }

    if (cryptoProto && cryptoProto.getRandomValues !== originalCryptoGetRandomValues) {
      throw createDeterminismError("crypto.getRandomValues konnte nicht sauber zurueckgesetzt werden.");
    }

    if (cryptoProto && cryptoProto.randomUUID !== originalCryptoRandomUUID) {
      throw createDeterminismError("crypto.randomUUID konnte nicht sauber zurueckgesetzt werden.");
    }
  }
}
