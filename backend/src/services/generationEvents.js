const EventEmitter = require('events');

const emitter = new EventEmitter();
emitter.setMaxListeners(100);

const EVENT_UPDATE = 'update';

const emitGenerationUpdate = (payload) => {
  emitter.emit(EVENT_UPDATE, payload);
};

const subscribeToGenerationUpdates = (listener) => {
  emitter.on(EVENT_UPDATE, listener);
  return () => emitter.off(EVENT_UPDATE, listener);
};

module.exports = {
  emitGenerationUpdate,
  subscribeToGenerationUpdates,
};
