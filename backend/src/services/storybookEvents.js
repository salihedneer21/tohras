const EventEmitter = require('events');

const emitter = new EventEmitter();
emitter.setMaxListeners(100);

const EVENT_NAME = 'storybook-update';

const emitStorybookUpdate = (payload) => {
  emitter.emit(EVENT_NAME, payload);
};

const subscribeToStorybookUpdates = (listener) => {
  emitter.on(EVENT_NAME, listener);
  return () => emitter.off(EVENT_NAME, listener);
};

module.exports = {
  emitStorybookUpdate,
  subscribeToStorybookUpdates,
};
