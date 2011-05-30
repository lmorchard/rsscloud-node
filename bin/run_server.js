#!/usr/bin/env node

var util = require("util"),
    fs = require('fs'),
    net = require("net"),
    repl = require("repl"),
    express = require('express'),
    _ = require('underscore');

var RSSCloud = require('rsscloud');

// Set up pinghub server
var h_server = new RSSCloud.PingHub({
    sync: new RSSCloud.Models.Sync.DirtySync({
        path: __dirname + '/../data/rsscloud.db'
    })
});

// TODO: Revert to this
// h_server.listen(9071);

// Some more complex server setup, to get a static middleware in there.
h_server.prepare(function () {
    var port = port || h_server.options.port;
    var server = h_server.server = express.createServer();

    server.configure(function () {
        server.use(express.static(__dirname + '/../www'));
        server.use(express.methodOverride());
        server.use(h_server.defaultToUrlEncodedTypeMiddleware);
        server.use(express.bodyParser());
        server.use(XMLRPC.Middleware);
    });

    server.configure('development', function(){
        server.use(express.logger());
        server.use(express.errorHandler({ 
            dumpExceptions: true, showStack: true 
        }));
        server.enable('devel_mode');
    });

    h_server.wireUpServer(server, '/rsscloud');

    server.listen(port);
    util.log('Dev pinghub listening on http://0.0.0.0:' + port );
});

// Set up ping receiver server
var r_server = new RSSCloud.Receiver({});
r_server.listen(9081);

// Set up telnet REPL - rlwrap telnet 127.0.0.1 5001
_(global).extend({
    h_server: h_server,
    r_server: r_server,
    util: util,
    _: _
});
net.createServer(function (socket) {
    var r_srv = repl.start("pinghub> ", socket);
    _(r_srv.context).extend({
    });
}).listen(5001);
util.log("REPL listening on telnet://0.0.0.0:5001");
