const EventEmitter = require('events');

const emitter = new EventEmitter();
emitter.setMaxListeners(200);

const EVENT_NAME = 'automation-update';

const emitAutomationUpdate = (payload) => {
  emitter.emit(EVENT_NAME, payload);
};

const subscribeToAutomationUpdates = (listener) => {
  emitter.on(EVENT_NAME, listener);
  return () => emitter.off(EVENT_NAME, listener);
};

module.exports = {
  emitAutomationUpdate,
  subscribeToAutomationUpdates,
};
