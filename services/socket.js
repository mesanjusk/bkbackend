let ioInstance = null;

function setIO(io) {
  ioInstance = io;
}

function emitEvent(event, payload) {
  if (ioInstance) {
    ioInstance.emit(event, payload);
  }
}

module.exports = { setIO, emitEvent };
