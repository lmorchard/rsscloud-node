#!/usr/bin/env node
/**
 * Server launch script.
 */
require(__dirname + "/lib/setup")
    .ext( __dirname + "/lib")
    .ext( __dirname + "/deps")
    .ext( __dirname + "/deps/express/support");

var RSSCloud = require('rsscloud');

var server = RSSCloud.createServer({
});
