"use strict";

var EventEmitter = require('events').EventEmitter;

class Timer extends EventEmitter {
    constructor(callback, ms, start) {
        this._handle = undefined;
        this.interval = 500;

        switch (typeof callback) {
            case 'undefined':
                return;
            case 'number':
                start = ms;
                ms = callback;
                callback = undefined;
                break;
            default:
                this.on('timer', callback);
                break;
        }

        if (undefined !== ms) {
            this.interval = ms;
        }

        if (start) {
            this.start();
        }
    }

    delay(ms) {
        this.stop();
        if (undefined === ms) {
            this.start();
        } else {
            this._handle = setTimeout(function () {
                this._handle = undefined;
                this.emit('timer');
                this.start();
            }.bind(this), ms)
        }
        return this;
    }

    start(callback, ms) {
        if (undefined !== callback) {
            this.constructor(callback, ms);
        }
        if (!this._handle) {
            this._handle = setInterval(function () {
                this.emit('timer');
            }.bind(this), this.interval);
        }
        return this;
    }

    stop() {
        clearInterval(this._handle);
        this._handle = undefined;
        return this;
    }
}

module.exports = Timer;
