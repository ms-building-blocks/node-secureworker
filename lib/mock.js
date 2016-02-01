var vm = require('vm');
var events = require('events');
var crypto = require('crypto');
var Promise = require('../vendor/promise-polyfill/Promise');
var subtle = require('subtle');

var SecureWorker = function SecureWorker(contentKey) {
  var self = this;

  if (!(self instanceof SecureWorker)) {
    return new SecureWorker.apply(null, arguments);
  }

  self._eventsFromOutside = new events.EventEmitter();
  self._eventsFromInside = new events.EventEmitter();

  var code = this.constructor._resolveContentKey(contentKey);
  var sandbox = this.constructor._sandboxContext(self);

  self._context = vm.createContext(sandbox);

  vm.runInContext(code, self._context, {
    filename: contentKey,
    displayErrors: true
  });

  return self;
};

SecureWorker.prototype.onMessage = function onMessage(listener) {
  var self = this;

  self._eventsFromInside.addListener('message', listener);

  return listener;
};

SecureWorker.prototype.removeOnMessage = function removeOnMessage(listener) {
  var self = this;

  self._eventsFromInside.removeListener('message', listener);
};

SecureWorker.prototype.postMessage = function postMessage(message) {
  var self = this;

  // We want to simulate asynchronous messaging.
  setImmediate(function () {
    self._eventsFromOutside.emit('message', message);
  });
};

SecureWorker.prototype.terminate = function terminate() {
  var self = this;

  // TODO: Is there a way to implement this using "vm"?
  // A noop in this mock implementation.
};

// Class method for this mock implementation which should be overridden by the user of the package.
SecureWorker._resolveContentKey = function _resolveContentKey() {
  throw new Error("Not implemented.");
};

// Class method for this mock implementation to allow specifying sandbox context.
SecureWorker._sandboxContext = function _sandboxContext(secureWorker) {
  var sandbox = {
    // Our internal trusted API.
    F: {
      ready: Promise.resolve(),

      onMessage: function onMessage(listener) {
        secureWorker._eventsFromOutside.addListener('message', listener);

        return listener;
      },

      removeOnMessage: function removeOnMessage(listener) {
        secureWorker._eventsFromOutside.removeListener('message', listener);
      },

      postMessage: function postMessage(message) {
        // We want to simulate asynchronous messaging.
        setImmediate(function () {
          secureWorker._eventsFromInside.emit('message', message);
        });
      },

      close: function close() {
        secureWorker.terminate();
      },

      importScripts: function importScripts(/* args */) {
        for (var i = 0; i < arguments.length; i++) {
          var contentKey = arguments[i];
          var code = SecureWorker._resolveContentKey(contentKey);

          vm.runInContext(code, secureWorker._context, {
            filename: contentKey,
            displayErrors: true
          });
        }
      }
    },

    Promise: Promise,

    crypto: {
      subtle: subtle,

      // Based on: https://github.com/KenanY/get-random-values
      getRandomValues: function getRandomValues(typedArray) {
        if (typedArray.byteLength > 65536) {
          var error = new Error();
          error.code = 22;
          error.message = 'Failed to execute \'getRandomValues\' on \'Crypto\': The ' +
            'ArrayBufferView\'s byte length (' + typedArray.byteLength  + ') exceeds the ' +
            'number of bytes of entropy available via this API (65536).';
          error.name = 'QuotaExceededError';
          throw error;
        }
        var bytes = crypto.randomBytes(typedArray.byteLength);
        typedArray.set(bytes);
        return typedArray;
      }
    }
  };

  sandbox.self = sandbox;

  return sandbox;
};

module.exports = SecureWorker;