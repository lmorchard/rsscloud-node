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


function buildXmlrpcHandler (req, res, next) { return function (cb) {

    var data = {};

    cb.onStartDocument(function () {
        util.log("START DOC");
    });

    cb.onStartElementNS(function(elem, attrs, prefix, uri, namespaces) {
        sys.puts("=> Started: " + elem + " uri="+uri +" (Attributes: " + JSON.stringify(attrs) + " )");
    });

    cb.onCharacters(function(chars) {
    });

    cb.onEndElementNS(function(elem, prefix, uri) {
        sys.puts("<= End: " + elem + " uri="+uri + "\n");
    });

    cb.onEndDocument(function () {
        util.log("END DOC");
        req.bodyXml = data;
        next();
    });

    cb.onError(function(msg) {
        util.log("ERROR");
        req.bodyXml = false;
        next();
    });

}};

function parseXmlrpc (req, res, next) {
    var raw = [],
        parser = new xml.SaxParser(buildXmlrpcHandler(req, res, next));

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
        util.log(_(req.bodyXml).keys());
        util.log(req.rawBody);
        util.log(_(req).keys());
        util.log(_(req.headers).keys());
        util.log(req.headers['content-type']);
        res.send("SHOULD BE XMLRPC");
    });

    server.listen(port);
    console.log('Listening on http://0.0.0.0:' + port );
}
