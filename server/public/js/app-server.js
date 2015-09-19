"use strict";

var EventEmitter = require('events').EventEmitter;
var TrayMenu = require('../../client/public/js/tray-menu');
var gui = require('nw.gui');
var util = require('util');
var net = require('net');
var PORT_BRIDGE  = 6969;
var PORT_CHANNEL = 7979;
var EOL = '\n';

function createUID(name) {
    if (undefined === name) {
        name = 'curUID';
    }
    return createUID[name] ? ++createUID[name] : (createUID[name] = 1);
}

class BridgeServerError extends Error {
    constructor(code, msg) {
        if (undefined === msg) {
            msg = BridgeServerError.MSG[code] || ('Error ' + code);
        }
        this.code = code;
        this.message = msg;
    }
}
BridgeServerError.ERR = {
     AUTH_REQUIRED: 401,
     AUTH_FAILED: '401.2'
};
BridgeServerError.MSG = (function (EC) {
    var EM = {};
    EM[EC.AUTH_REQUIRED]    = 'Authorization required!';
    EM[EC.AUTH_FAILED]      = 'Authorization failed!';
    return EM;
}(BridgeServerError.ERR));

class BridgeServer extends EventEmitter {
    constructor(sock) {
        var $srv = this;

        $srv.uid = createUID('bridge');
        $srv.auth = false;
        $srv.sock = sock;

        sock.on('end', function(err) {
            $srv.shutdown(err);
        });

        sock._buf = '';
        sock.on('data', function (data) {
            sock._buf += data.toString();
            // see if there is one or more complete messages
            if (sock._buf.indexOf(EOL) >= 0) {
                // slice up the buffer into messages
                var msgs = sock._buf.split(EOL);
                for (var i = 0; i < msgs.length - 1; ++i) {
                    $srv.onCommand(msgs[i]);
                }
                // keep unterminated message in buffer
                sock._buf = msgs[i];
            }
        });

        $srv.timeOutHandle = setTimeout(function () {
            if (!$srv.auth) {
                $srv.shutdown(new BridgeServerError(BridgeServerError.ERR.AUTH_REQUIRED));
            }
        }, BridgeServer.UNAUTHORIZED_CONN_TIMEOUT)
    }

    onCommand(data) {
        var $srv = this;
        var cmd;

        try {
            cmd = JSON.parse(data);
        } catch (err) {
            process.emit('log', 'error: invalid bridge command');
            if (!$srv.auth) {
                $srv.shutdown(new BridgeServerError(BridgeServerError.ERR.AUTH_REQUIRED));
            }
            return;
        }

        if ($srv.auth) {
            process.emit('log', 'error: invalid bridge command');
        } else {
            if (cmd.auth) {
                if ('password' === cmd.auth.password) {
                    $srv.auth = cmd.auth;
                    clearTimeout($srv.timeOutHandle);
                    $srv.afterAuthentication();
                } else {
                    $srv.shutdown(new BridgeServerError(BridgeServerError.ERR.AUTH_FAILED));
                }
            } else {
                $srv.shutdown(new BridgeServerError(BridgeServerError.ERR.AUTH_REQUIRED));
            }
        }
    }

    afterAuthentication() {
        var $srv = this;

        process.emit('log', 'bridge authorized ' + $srv.uid);

        $srv.channelServer = net.createServer($srv.onChannelConnection.bind($srv));
        $srv.channelServer.on('error', function (err) {
            if ('EADDRINUSE' === err.code) {
                $srv.shutdown(err);
            } else {
                throw err;
            }
        });
        $srv.channelServer.listen(PORT_CHANNEL, function () {
            $srv.channels = {};
            process.emit('log', 'channel server is up for bridge ' + $srv.uid);
        });
    }

    onChannelConnection(sock) {
        var $srv = this;

        sock.uid = createUID('channel');
        $srv.channels[sock.uid] = sock;

        process.emit('log', 'channel client connected ' + sock.uid);

        sock.on('end', function () {
            delete $srv.channels[sock.uid];
            process.emit('log', 'channel client disconnected ' + sock.uid);
        });

        sock.on('data', function (data) {
            process.emit('log', 'DATA ' + sock.remoteAddress + ': ' + data);
            sock.write('You said "' + data + '"');
        });

        $srv.channelServer.close();
    }

    shutdown(err) {
        var $srv = this;

        clearTimeout($srv.timeOutHandle);

        if (err) {
            process.emit('log', 'shutting down bridge server ' + $srv.uid + ' because of an error:');
            process.emit('log', util.inspect(err));
        }

        if ($srv.channelServer) {
            $srv.channelServer.close();
            if ($srv.channels) {
                Object.keys($srv.channels).forEach(function (chan) {
                    chan.destroy();
                });
            }
        }

        $srv.sock.destroy();

        $srv.emit('close', err);
    }
}

BridgeServer.UNAUTHORIZED_CONN_TIMEOUT = 10000;

class ServerApp extends EventEmitter {
    constructor() {
        var $ = ServerApp.$;
        var $app = this;
        var win = gui.Window.get();
        var tray = new TrayMenu();

        $app.bridges = {};
        $app.win = win;
        $app.tray = tray;
        $app.ui = {
            btn: {}
        };

        // Extend application menu for Mac OS
        if ('darwin' === process.platform) {
            var menu = new gui.Menu({type: "menubar"});
            menu.createMacBuiltin && menu.createMacBuiltin(window.document.title);
            gui.Window.get().menu = menu;
        }

        $app.on('msg', function (msg) {
            process.emit('log', 'msg: ' + msg);
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

        $app.bridge = net.createServer($app.onBridgeConnection.bind($app));
        $app.bridge.listen(PORT_BRIDGE, function () {
            $app.writeLog('bridge server bound');
        });

        $(function () {
            /*
             * init ui elements
             */
            this.ui.out = $("#output");

            // for nw-notify frameless windows
            win.on('close', function () {
                gui.App.quit();
            });

            // bring window to front when open via terminal
            win.focus();
        }.bind(this));
    }

    onBridgeConnection(sock) {
        var $app = this;
        var bridge = new BridgeServer(sock);

        $app.bridges[bridge.uid] = bridge;

        bridge.on('close', function () {
            delete $app.bridges[bridge.uid];
            $app.writeLog('bridge is down ' + bridge.uid);
        });

        $app.writeLog('bridge is up ' + bridge.uid);
    }

    writeLog(msg, type) {
        if (this.ui.out) {
            this.ui.out.innerHTML += `<span class=${type}>${msg}</span><br>`;
            this.ui.out.scrollTop = this.ui.out.scrollHeight;
        }
        process.stdout.write(String(msg) + "\n");
    }

    static $(selector) {
        if ('function' === typeof selector) {
            return document.addEventListener('DOMContentLoaded', selector);
        }
        return document.querySelector(selector);
    }
}

var app = new ServerApp();
