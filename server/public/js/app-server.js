"use strict";

var net = require('net');
var clients = {};
var PORT = 6969;
var EOL = '\n';

var writeLog = function (msg, type) {
    var logElement = $("#output");
    if (logElement) {
        logElement.innerHTML += `<span class=${type}>${msg}</span><br>`;
        logElement.scrollTop = logElement.scrollHeight;
    }
    process.stdout.write(String(msg) + "\n");
};

function $(selector) {
    if ('function' === typeof selector) {
        return document.addEventListener('DOMContentLoaded', selector);
    }
    return document.querySelector(selector);
}

function createUID() {
    return createUID.curUID ? ++createUID.curUID : (createUID.curUID = 1);
}

var server = net.createServer(function (sock) {
    sock.uid = createUID();
    clients[sock.uid] = sock;

    writeLog('client connected ' + sock.uid);

    sock.on('end', function() {
        delete clients[sock.uid]
        writeLog('client disconnected ' + sock.uid);
    });
    sock.write('hello' + EOL);

    // Add a 'data' event handler to this instance of socket
    sock.on('data', function (data) {
        writeLog('DATA ' + sock.remoteAddress + ': ' + data);
        // Write the data back to the socket, the client will receive it as data from the server
        sock.write('You said "' + data + '"');
    });
});

server.listen(PORT, function () { //'listening' listener
    writeLog('server bound');
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
    server.close();
});
