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


var API_Handlers = {

    echo: function (/* argv */) {
        return Array.prototype.splice.call(arguments,0);
    },

    "rssCloud.ping": function (feed_url) {
        return "Hello there, "+feed_url+"!";
    },

    "rssCloud.saveRss": function (username, password, rsstxt) {
    },

    "rssCloud.pleaseNotify": function (notify_procedure, port, path, protocol, urllist) {
    }

};

function xmlrpcMiddleware (req, res, next) {
    var raw = [],
        parser = new XMLRPC.SaxParser({
            onDone: function (data) { 
                req.body_XMLRPC = data; next(); 
            }, 
            onError: function (msg) { 
                req.body_XMLRPC = false; next(); 
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
        server.use(xmlrpcMiddleware);
        server.use(express.bodyParser());
        server.use(server.router)
    });

    server.configure('development', function(){
        server.use(express.errorHandler({ 
            dumpExceptions: true, showStack: true 
        }));
    });

    server.get('/', function (req, res) {
        res.send("HELLO WORLD");
    });

    server.post('/rsscloud/pleaseNotify', function (req, res) {
        // TODO
    });

    server.post('/rsscloud/ping', function (req, res) {
        // TODO
    });

    server.post('/RPC2', function (req, res) {
        var params = req.body_XMLRPC.params,
            method = req.body_XMLRPC.method;
        if (API_Handlers.hasOwnProperty(method)) {
            try {
                var rv = API_Handlers[method].apply(API_Handlers, params);
                res.send(new XMLRPC.Response([rv]).xml());
            } catch (e) {
                res.send(new XMLRPC.Fault(500, 'Unexpected exception ' + e).xml());
            }
        } else {
            res.send(new XMLRPC.Fault(404, 'Unknown method '+method).xml());
        }
    });

    server.listen(port);
    console.log('Listening on http://0.0.0.0:' + port );
}
