"use strict";

var EventEmitter = require('events').EventEmitter;
var TrayMenu = require('@codexp/nw.tray-menu');
var JSONBufferParser = require('@codexp/buffer-segment-parser').JSON;
var Timer = require('@codexp/timer');
var gui = require('nw.gui');
var util = require('util');
var net = require('net');

var EOL = '\n';
var HOST = '127.0.0.1';
var PORT = 6969;

class ClientApp extends EventEmitter {
    constructor() {
        var $ = ClientApp.$;
        var $app = this;
        var win = gui.Window.get();
        var tray = new TrayMenu();
        var client = new net.Socket();
        var autoConnector = new Timer(3000);

        this.win = win;
        this.tray = tray;
        this.client = client;
        this.autoConnector = autoConnector;
        this.autoConnect = true;
        this.ui = {
            btn: {}
        };

        // Extend application menu for Mac OS
        if ('darwin' === process.platform) {
            var menu = new gui.Menu({type: "menubar"});
            menu.createMacBuiltin && menu.createMacBuiltin(window.document.title);
            gui.Window.get().menu = menu;
        }

        // Add a 'close' event handler for the client socket
        client.on('connect', function () {
            client.connected = true;
            client._buf = '';
            $app.writeLog('connected to: ' + HOST + ':' + PORT);
            // Authorization
            client.write(JSON.stringify({ auth: { password: 'password' }}) + EOL);
            $app.updateConnectCaption();
        });

        client.on('close', function (hadError) {
            client.connected = false;
            $app.writeLog('connection closed' + (hadError ? ' (error)' : ''));
            $app.updateConnectCaption();
        });

        client.on('error', function (err) {
            // consume error
        });

        var parser = new JSONBufferParser();
        client.on('data', parser.parser());
        parser
            .on('json', $app.onCommand.bind($app))
            .on('error', function (err) {
                $app.writeLog('error: invalid command');
            });

        process.on('log', function (message) {
            $app.writeLog(message);
        });

        // print error message in log window
        process.on('uncaughtException', function (exception) {
            var stack = exception.stack.split("\n");
            stack.forEach(function (line) {
                $app.writeLog(line, 'error');
            });
        });

        process.on('exit', function (code) {
            if (tray) {
                tray.remove();
                tray = undefined;
            }
        });

        $(function () {
            /*
             * init ui elements
             */
            this.ui.btn.connect = $('#connect');
            this.ui.btn.autoconnect = $('#autoconnect');
            this.ui.out = $("#output");

            this.updateAutoConnectCaption();

            autoConnector
                .on('timer', function () {
                    if ($app.autoConnect && !client.connected) {
                        client.connect(PORT, HOST);
                    }
                }.bind(autoConnector))
                .start();

            this.ui.btn.autoconnect.addEventListener('click', function () {
                $app.autoConnect = !$app.autoConnect;
                $app.updateAutoConnectCaption();
            });

            this.ui.btn.connect.addEventListener('click', function () {
                if (client.connected) {
                    client.end();
                    autoConnector.stop();
                } else {
                    client.connect(PORT, HOST);
                    autoConnector.delay();
                }
            });

            // for nw-notify frameless windows
            win.on('close', function () {
                gui.App.quit();
            });

            // bring window to front when open via terminal
            win.focus();
        }.bind(this));
    }

    onCommand(cmd) {
        var $app = this;
        process.emit('log', 'cmd: ' + util.inspect(cmd));
    }

    writeLog(msg, type) {
        if (this.ui.out) {
            this.ui.out.innerHTML += `<span class=${type}>${msg}</span><br>`;
            this.ui.out.scrollTop = this.ui.out.scrollHeight;
        }
        process.stdout.write(String(msg) + "\n");
    }

    updateAutoConnectCaption() {
        if (this.autoConnect) {
            this.ui.btn.autoconnect.innerText = '✖';
            this.ui.btn.autoconnect.setAttribute('title', 'stop autoconnect');
        } else {
            this.ui.btn.autoconnect.innerText = '✔';
            this.ui.btn.autoconnect.setAttribute('title', 'enable autoconnect');
        }
    }

    updateConnectCaption() {
        if (this.client.connected) {
            this.ui.btn.connect.innerText = 'disconnect';
        } else {
            this.ui.btn.connect.innerText = 'connect';
        }
    }

    static $(selector) {
        if ('function' === typeof selector) {
            return document.addEventListener('DOMContentLoaded', selector);
        }
        return document.querySelector(selector);
    }
}

var app = new ClientApp();
