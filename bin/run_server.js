#!/usr/bin/env node

var util = require("util"),
    fs = require('fs'),
    net = require("net"),
    repl = require("repl"),
    _ = require('underscore');

var RSSCloud = require('rsscloud');

// Set up pinghub server
var h_server = new RSSCloud.PingHub({
    sync: new RSSCloud.Models.Sync.AlfredSync({
        path: __dirname + '/../data'
    })
});
h_server.listen(9071);

// Set up ping receiver server
var r_server = new RSSCloud.Receiver({});
r_server.listen(9081);

_(global).extend({
    h_server: h_server,
    r_server: r_server,
    util: util,
    _: _
});

// Set up telnet REPL - rlwrap telnet 127.0.0.1 5001
net.createServer(function (socket) {
    var r_srv = repl.start("pinghub> ", socket);
    _(r_srv.context).extend({
    });
}).listen(5001);

util.log("REPL listening on telnet://0.0.0.0:5001");
