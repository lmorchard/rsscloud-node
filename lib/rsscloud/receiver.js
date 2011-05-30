//
// ## rssCloud ping receiver
//
// * [l.m.orchard](http://lmorchard.com) / 
//   <mailto:lmorchard@pobox.com> / 
//   [@lmorchard](http://twitter.com/lmorchard)
//
var util = require('util'),
    sys = require('sys'),
    url = require('url'),
    querystring = require('querystring'),
    timers = require('timers'),
    _ = require('underscore'),
    async = require('async'),
    connect = require('connect'), 
    express = require('express'),
    xml = require('node-xml');
    Backbone = require('backbone'),
    Models = require('./models'),
    LocmemSync = require('./models/sync/locmem').LocmemSync,
    XMLRPC = require('./xmlrpc');

require('./class');

// ### Receiver server class
var Receiver = exports.Receiver = Class.extend({

    init: function (options) {
        var $this = this;

        this.options = _({
            port: 9071,
            http: null
        }).extend(options);
    },

    prepare: function (cb) {
        cb();
    },

    shutdown: function (cb) {
        cb();
    },

    listen: function (port) {
        var $this = this;

        $this.prepare(function () {

            var port = port || $this.options.port;
            var server = $this.server = express.createServer();

            server.configure(function () {
                server.use(express.methodOverride());
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

            if (server.enabled('devel_mode')) {
                if ($this.sync instanceof LocmemSync) {
                    timers.setInterval(function () {
                        util.debug("STORE " + util.inspect($this.sync.store));
                    }, 25000);
                }
            }

            server.get('/', function (req, res) {
                util.debug("GET IT / ");
                res.send("HELLO WORLD");
            });

            server.post('/RPC2', 
                XMLRPC.DispatchHandler($this.rpc_handlers, $this));

            server.post('/notifyme', function (req, res) {
                util.log("NOTIFYME");
                res.send("THANKEE");
            });

            server.get('/notifyme', function (req, res) {
                var q = require('url').parse(req.url, true).query;
                util.log("NOTIFYME " + util.inspect(q));
                res.send(q.challenge);
            });

            server.listen(port);
            util.log('Receiver listening on http://0.0.0.0:' + port );
        
        }, function (err) {

            util.log("Error making server ready " + err);
        
        });

    },

    rpc_handlers: {
        
        echo: function (cb) {
            cb(null, Array.prototype.splice.call(arguments,1) );
        }

    },

    EOF: null
});
