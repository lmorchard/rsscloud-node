/**
 * RSSCloud main module
 */
var util = require('util'),
    sys = require('sys'),
    _ = require('underscore'),
    async = require('async'),
    connect = require('connect'), 
    express = require('express'),
    xml = require('node-xml');
    XMLRPC = require('xmlrpc');

function parseXmlrpc (req, res, next) {
    var raw = [],
        parser = new XMLRPC.SaxParser({
            onDone: function (data) {
                req.bodyXMLRPC = data;
                next();
            }, 
            onError: function (msg) { 
                req.bodyXMLRPC = false;
                next();
            }
        });

    req.setEncoding('utf8');
    req.on('data', function(chunk) { 
        raw.push(chunk);
        parser.parseString(chunk);
    });
    req.on('end', function(){
        req.rawBody = raw.join('');
    });

}

exports.createServer = function (options) {
    var port = (options.port || process.env.PORT || 9081);
    var server = express.createServer();

    server.configure(function () {
        server.use(express.methodOverride());
        server.use(parseXmlrpc);
        server.use(express.bodyParser());
        server.use(server.router)
    });

    server.configure('development', function(){
        server.use(express.errorHandler({ dumpExceptions: true, showStack: true }));
    });

    server.get('/', function (req, res) {
        res.send("HELLO WORLD");
    });

    server.post('/RPC2', function (req, res) {
        util.debug(req.rawBody);
        util.debug(util.inspect(req.bodyXMLRPC));
        util.debug(_(req).keys());
        util.debug(_(req.headers).keys());
        util.debug(req.headers['content-type']);
        res.send("SHOULD BE XMLRPC");
    });

    server.listen(port);
    console.log('Listening on http://0.0.0.0:' + port );
}
