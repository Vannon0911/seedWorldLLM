export const mutationMatrixConstraints = Object.freeze({
  'resources.ore': Object.freeze({ type: 'uint32', min: 0, max: 999999, integer: true }),
  'resources.copper': Object.freeze({ type: 'uint32', min: 0, max: 999999, integer: true }),
  'resources.iron': Object.freeze({ type: 'uint32', min: 0, max: 999999, integer: true }),
  'resources.gears': Object.freeze({ type: 'uint32', min: 0, max: 999999, integer: true }),
  'machines.miners': Object.freeze({ type: 'uint16', min: 0, max: 1024, integer: true }),
  'machines.conveyors': Object.freeze({ type: 'uint16', min: 0, max: 4096, integer: true }),
  'machines.assemblers': Object.freeze({ type: 'uint16', min: 0, max: 1024, integer: true }),
  'logistics.storageA': Object.freeze({ type: 'uint32', min: 0, max: 1000000, integer: true }),
  'logistics.storageB': Object.freeze({ type: 'uint32', min: 0, max: 1000000, integer: true }),
  'world.seed': Object.freeze({ type: 'string', minLength: 1, maxLength: 128 }),
  'world.size.width': Object.freeze({ type: 'uint16', min: 1, max: 1024, integer: true }),
  'world.size.height': Object.freeze({ type: 'uint16', min: 1, max: 1024, integer: true }),
  'world.meta': Object.freeze({ type: 'object' }),
  'world.tiles': Object.freeze({ type: 'array' }),
  'meta.lastAction': Object.freeze({ type: 'string', minLength: 0, maxLength: 128 }),
  'meta.revision': Object.freeze({ type: 'uint32', min: 0, max: 4294967295, integer: true })
});

export const mutationMatrixAllowedPaths = Object.freeze(Object.keys(mutationMatrixConstraints));
