#!/usr/bin/env node
//
// rssCloud pinghub server launch script
//
require(__dirname + "/lib/setup")
    .ext( __dirname + "/lib")
    .ext( __dirname + "/extlib")
    .ext( __dirname + "/deps")
    .ext( __dirname + "/deps/express/support");

var RSSCloud = require('rsscloud');

var server = new RSSCloud.PingHub({
    //sync: new AlfredSync({
    //    path: __dirname + '/data'
    //})
});
server.listen();
