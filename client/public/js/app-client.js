"use strict";

var gui = require('nw.gui');
var customTray = new require('../public/js/tray-menu');
var util = require('util');
var net = require('net');
var client = new net.Socket();
var Timer = require('../public/js/timer');
var autoConnector = new Timer(3000);
var autoConnect = true;
var ui = {
        btn: {}
    };

var HOST = '127.0.0.1';
var PORT = 6969;

// Extend application menu for Mac OS
if (process.platform == "darwin") {
    var menu = new gui.Menu({type: "menubar"});
    menu.createMacBuiltin && menu.createMacBuiltin(window.document.title);
    gui.Window.get().menu = menu;
}

function $(selector) {
    if ('function' === typeof selector) {
        return document.addEventListener('DOMContentLoaded', selector);
    }
    return document.querySelector(selector);
}

function writeLog(msg, type) {
    var logElement = $("#output");
    if (logElement) {
        logElement.innerHTML += `<span class=${type}>${msg}</span><br>`;
        logElement.scrollTop = logElement.scrollHeight;
    }
    process.stdout.write(String(msg) + "\n");
}

function updateAutoConnectCaption() {
    if (autoConnect) {
        ui.btn.autoconnect.innerText = '✖';
        ui.btn.autoconnect.setAttribute('title', 'stop autoconnect');
    } else {
        ui.btn.autoconnect.innerText = '✔';
        ui.btn.autoconnect.setAttribute('title', 'enable autoconnect');
    }
}

function updateConnectCaption() {
    if (client.connected) {
        ui.btn.connect.innerText = 'disconnect';
    } else {
        ui.btn.connect.innerText = 'connect';
    }
}

// Add a 'data' event handler for the client socket
// data is what the server sent to this socket
client.on('data', function (data) {
    writeLog('DATA: ' + data);
    // Close the client socket completely
    //client.destroy();
});

// Add a 'close' event handler for the client socket
client.on('connect', function () {
    client.connected = true;
    writeLog('connected to: ' + HOST + ':' + PORT);
    // Write a message to the socket as soon as the client is connected, the server will receive it as message from the client
    client.write('I am Chuck Norris!');
    updateConnectCaption();
});

client.on('close', function (hadError) {
    client.connected = false;
    writeLog('connection closed' + (hadError ? ' (error)' : ''));
    updateConnectCaption();
});

client.on('error', function (err) {
    // consume error
});

$(function () {
    /*
     * init ui elements
     */
    ui.btn.connect      = $('#connect');
    ui.btn.autoconnect  = $('#autoconnect');

    updateAutoConnectCaption();

    autoConnector
        .on('timer', function () {
            if (autoConnect && !client.connected) {
                client.connect(PORT, HOST);
            }
        }.bind(autoConnector))
        .start();

    ui.btn.autoconnect.addEventListener('click', function () {
        autoConnect = !autoConnect;
        updateAutoConnectCaption();
    });

    ui.btn.connect.addEventListener('click', function () {
        if (client.connected) {
            client.end();
            autoConnector.stop();
        } else {
            client.connect(PORT, HOST);
            autoConnector.delay();
        }
    });

    // bring window to front when open via terminal
    gui.Window.get().focus();

    // for nw-notify frameless windows
    gui.Window.get().on('close', function () {
        gui.App.quit();
    });
});

process.on('log', function (message) {
    writeLog(message);
});

// print error message in log window
process.on('uncaughtException', function (exception) {
    var stack = exception.stack.split("\n");
    stack.forEach(function (line) {
        writeLog(line, 'error');
    });
});

process.on('exit', function (code) {
    if (customTray) {
        customTray.remove();
        customTray = undefined;
    }
});
