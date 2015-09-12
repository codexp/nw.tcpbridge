"use strict";

var gui = require('nw.gui');
var win = gui.Window.get();

var $ = function (selector) {
    return document.querySelector(selector);
};
