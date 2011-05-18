//
// ## rssCloud ping hub
//
// * [l.m.orchard](http://lmorchard.com) / 
//   <mailto:lmorchard@pobox.com> / 
//   [@lmorchard](http://twitter.com/lmorchard)
//
var util = require('util'),
    sys = require('sys'),
    url = require('url'),
    querystring = require('querystring'),
    _ = require('underscore'),
    async = require('async'),
    connect = require('connect'), 
    express = require('express'),
    Backbone = require('backbone'),
    Models = require('./models'),
    LocmemSync = require('./models/sync/locmem').LocmemSync,
    AlfredSync = require('./models/sync/alfred').AlfredSync,
    XMLRPC = require('./xmlrpc');

require('./class');

// ### PingHub server class
var PingHub = exports.PingHub = Class.extend({

    // #### Iniitalize
    init: function (options) {
        var $this = this;

        this.options = _({
            port: 9081,
            sync: null,
            sync_class: LocmemSync,
            sync_options: {}, 
            http: null,
            notify_queue_concurrency: 4
        }).extend(options);

        this.sync = this.options.sync ? this.options.sync : 
            new this.options.sync_class(this.options.sync_options);

        // Allow override of http module, mainly for testing.
        this.http = this.options.http ? this.options.http : require('http');

        this.is_ready = false;
    },

    // #### Prepare the server for use
    //
    // Opens any databases necessary, etc.
    prepare: function (cb) {
        var $this = this;

        if ($this.is_ready) { return cb(); }
        $this.is_ready = true;

        // Set up an async queue for notifications from a ping.
        this.notify_one_queue = async.queue(function (request, cb) {
            cb = cb || function () { /* no-op */ };
            $this.notifyOne(cb, request.toJSON()); 
        }, $this.options.notify_queue_concurrency);

        async.waterfall([
            
            function (next) {
                util.log("WOOOOGY");
                $this.sync.open(function (err, sync_fn) {
                    util.log("WOOOOGY OPEN");
                    Backbone.sync = sync_fn;
                    $this.notification_requests = new Models.NotificationRequestCollection();
                    next(err, $this);
                }, function (err) { next(err); });
            }, 

        ], cb);
    },

    // #### Shut the server down
    //
    // Closes any databases, etc.
    shutdown: function (cb) {
        var $this = this;
        if (!$this.is_ready) { return cb(); }
        $this.sync.close(cb);
    },

    // #### Start listening as a server
    listen: function (port) {
        var $this = this;

        $this.prepare(function () {

            var port = port || $this.options.port;
            var server = $this.server = express.createServer();

            server.configure(function () {
                server.use(express.methodOverride());
                server.use($this.defaultToUrlEncodedTypeMiddleware);
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

            $this.wireUpServer(server, '/rsscloud');

            server.listen(port);
            util.log('Pinghub listening on http://0.0.0.0:' + port );
        
        }, function (err) {
            util.log("Error making server ready " + err);
        });

    },

    // #### Given an express server, wire it up with routes for this pinghub
    wireUpServer: function (server, prefix) {
        var $this = this;
        server.post(prefix + '/pleaseNotify', 
            _($this.httppost_pleaseNotify).bind($this));
        server.post(prefix + '/ping', 
            _($this.httppost_ping).bind($this));
        server.post(prefix + '/RPC2', XMLRPC.DispatchHandler({
            'dump': 
                _($this.xmlrpc_dump).bind($this),
            'echo': 
                _($this.xmlrpc_echo).bind($this),
            'rssCloud.ping': 
                _($this.xmlrpc_ping).bind($this),
            'rssCloud.pleaseNotify': 
                _($this.xmlrpc_pleaseNotify).bind($this),
            // 'rssCloud.saveRss':
            //    _($this.xmlrpc_saveRss).bind($this)
        }));
    },

    xmlrpc_dump: function (req, res, cb) {
        var $this = this;
        if ($this.server.enabled('devel_mode')) {
            if ($this.sync instanceof LocmemSync) {
                util.debug("STORE " + util.inspect($this.sync.store));
                return cb(null, true);
            }
        }
        return cb(null, false);
    },

    xmlrpc_echo: function (req, res, cb) {
        cb(null, Array.prototype.splice.call(arguments,1) );
    },

    // #### Handle pleaseNotify request via http-post
    httppost_pleaseNotify: function (req, res) {
        var $this = this;

        res.setHeader('Content-Type', 'text/xml');

        // Ensure required parameters are sent
        var param_names = ['notifyProcedure','port','path','protocol','url1'];
        for (var i=0,name; name=param_names[i]; i++) {
            if (!req.body[name]) {
                res.statusCode = 400;
                return res.send('<notifyResult success="false" '+
                    'msg="required parameter '+name+' missing"/>')
            }
        }

        // Gather up feed URL list from params url1, url2, ..., urlN
        var url_list = [];
        for (var i=1,url; url = req.body['url'+i]; i++) {
            url_list.push(url);
        }

        var client_addr = req.connection.remoteAddress;
        var domain = req.body.domain || client_addr;
        var needs_challenge = ( domain != client_addr );

        util.log("WOOO " + client_addr + " :: " + domain);

        var cb = function (err, requests) {
            if (err) {
                res.statusCode = 400;
                res.send('<notifyResult success="false" msg="'+err+'" />');
            } else {
                res.statusCode = 200;
                res.send('<notifyResult success="true" ' +
                    'msg="Thanks for the registration. It worked." />');
            }
        };

        $this.pleaseNotify(cb, 
            req.body.notifyProcedure, req.body.port,
            req.body.path, req.body.protocol, 
            url_list, domain, needs_challenge);
    },

    // #### Handle pleaseNotify via XML-RPC
    xmlrpc_pleaseNotify: function (req, res, rpc_cb, notify_procedure, port, path, protocol, url_list) {
        var $this = this;

        var notify_cb = function (err, requests) {
            if (err) {
                rpc_cb({ code: 400, message: err }, false);
            } else {
                rpc_cb(null, true);
            }
        };

        $this.pleaseNotify(notify_cb, notify_procedure, port, path, protocol,
            url_list, req.connection.remoteAddress, false);
    },

    // #### Register a request to be notified when a feed is updated
    pleaseNotify: function (cb, notify_procedure, port, path, protocol, 
            url_list, client_addr, needs_challenge) {
        var $this = this;

        switch (protocol) {
            case 'xml-rpc': 
            case 'http-post': 
                break;
            default:
                return cb("Can't accept the notification request because "+
                    "the protocol, \"" + protocol + "\", is unsupported.");
        };

        var requests = [], request = null;
        async.forEach(url_list, function (feed_url, fe_next) {
            async.waterfall([

                // Verify the feed in question is reachable
                function (wf_next) {
                    $this.verifyFeedExists(wf_next, feed_url);
                },

                // Test the handler by issuing a first notification
                function (wf_next) {
                    request = { 
                        notify_procedure: notify_procedure, port: port, 
                        path: path, protocol: protocol, feed_url: feed_url, 
                        client_addr: client_addr, needs_challenge: needs_challenge
                    };
                    $this.notifyOne(wf_next, request);
                },

                // Look for existing duplicates of this request
                function (resp_msg, wf_next) {
                    var existing = [];
                    // TODO: Need more model indices? Only querying by
                    // client_addr and feed_url to narrow things down, then
                    // comparing the rest of the attributes here.
                    $this.notification_requests.fetchByClientAddrAndFeedUrl(
                        { feed_url: feed_url, client_addr: client_addr },
                        function (item) {
                            var names = [
                                'port', 'path', 'protocol',
                                'notify_procedure', 'needs_challenge'
                            ];
                            for (var i=0,n; n=names[i]; i++) {
                                if (request[n] != item.get(n)) { return; }
                            }
                            existing.push(item);
                        },
                        function () { wf_next(null, resp_msg, existing); }
                    );
                },

                // Update or create a notification request record
                function (resp_msg, existing, wf_next) {
                    if (existing.length > 0) {
                        existing[0].save({}, {
                            success: function (r)   { requests.push(r); wf_next(); },
                            error:   function (err) { wf_next(err); }
                        });
                        // TODO: What if there are more than 1 existing duplicates? delete?
                    } else {
                        $this.notification_requests.create(request, { 
                            success: function (r)   { requests.push(r); wf_next(); },
                            error:   function (err) { wf_next(err); }
                        });
                    }
                }

            ], fe_next);

        }, function (err) { cb(err, requests); });

    },

    // #### Handle pleaseNotify request via http-post
    httppost_ping: function (req, res) {
        var $this = this;

        res.setHeader('Content-Type', 'text/xml');

        // Ensure required parameters are sent
        if (!req.body.url) {
            res.statusCode = 400;
            return res.send('<result success="false" '+
                'msg="required parameter url missing"/>')
        }

        var cb = function (err, requests) {
            if (err) {
                res.statusCode = 400;
                res.send('<result success="false" msg="'+err+'" />');
            } else {
                res.statusCode = 200;
                // Shamelessly stolen from davewiner's rssCloudWebsite.pleaseNotify
                res.send('<result success="true" msg="It worked!" />');
            }
        };

        $this.ping(cb, req.body.url, false);
    },

    xmlrpc_ping: function (req, res, rpc_cb, feed_url) {
        var $this = this;

        var notify_cb = function (err, requests) {
            if (err) {
                rpc_cb({ code: 400, message: err }, false);
            } else {
                rpc_cb(null, true);
            }
        };

        var domain = null;

        $this.ping(notify_cb, feed_url);
    },

    // #### Receive ping for feed update
    ping: function (cb, feed_url, wait_for_queue) {
        var $this = this;
        var requests = [];

        if (!wait_for_queue) {
            // Not waiting for queue to complete, so fire and forget
            // notifications.
            $this.notification_requests.fetchByFeedUrl(feed_url,
                function (r) { $this.notify_one_queue.push(r, null); },
                function () { cb(); }
            );
        } else {
            // Waiting for queue tasks to complete, so collect the whole set of
            // registered requests and wait for each to complete before
            // proceeding to callback.
            async.waterfall([
                function (wf_next) {
                    $this.notification_requests.fetchByFeedUrl(feed_url,
                        function (r) { requests.push(r); },
                        function () { wf_next(); }
                    );
                },
                function (wf_next) {
                    async.forEach(requests, function (request, fe_next) {
                        $this.notify_one_queue.push(request, wf_next);
                    }, wf_next);
                }
            ], cb);
        }
    },

    // #### Notify a subscriber
    notifyOne: function (cb, nreq) {
        var $this = this;
        var challenge = nreq.needs_challenge ? 
            $this.generateChallengeString() : null;
        switch (nreq.protocol) {
            case 'http-post':
                $this.notifyOneViaHTTPPOST(cb, nreq, challenge); break;
            case 'xml-rpc':
                $this.notifyOneViaXMLRPC(cb, nreq, challenge); break;
            default:
                return cb("UNKNOWN PROTOCOL " + nreq.protocol);
        };
    },

    // #### Notify a subscriber via XML-RPC
    notifyOneViaXMLRPC: function (cb, nreq, challenge, http) {
        var $this = this;
        http = http || $this.http;

        var msg = new XMLRPC.Call(nreq.notify_procedure, [ nreq.feed_url ]);

        var options = {
            method: "POST",
            host: nreq.client_addr,
            port: nreq.port,
            path: nreq.path
        };
        
        var parser = new XMLRPC.SaxParser({
            onDone: function (data) {
                cb(null, data); 
            },
            onError: function (msg) { cb(msg); }
        });
        
        var res_cb = function (res) {
            res.on('data', function (chunk) { parser.parseString(chunk); });
            res.on('end', function () { parser.finish(); });
        };
        
        var client = http.createClient(options.port, options.host);
        var req = client.request(options.method, options.path);

        client.on('error', function (err) {
            cb('Error connecting to '+options.host+':'+options.port);
        });
        req.on('error', function (err) {
            cb('Error in '+options.method+' notification to '+
                options.host+':'+options.port+'/'+options.path);
        });
        req.on('response', res_cb);

        req.write(msg.xml());
        req.end();
    },

    // #### Notify a subscriber via HTTP POST
    notifyOneViaHTTPPOST: function (cb, nreq, challenge, http) {
        var $this = this;
        http = http || $this.http;
        
        var params = { url: nreq.feed_url };
        if (challenge) { params.challenge = challenge; }
        var q_params = querystring.stringify(params);

        var options = {
            method: challenge ? "GET" : "POST",
            host: nreq.client_addr,
            port: nreq.port,
            path: nreq.path + ( challenge ? '?'+q_params : '' )
        };

        var data = '';
        var res_cb = function (res) {
            res.on('data', function (chunk) { data += chunk; });
            res.on('end', function () { 
                if (200 != res.statusCode) {
                    return cb('HTTP request failed with status '+
                        res.statusCode+'; '+data);
                }
                if (challenge && (-1 === data.indexOf(challenge))) {
                    cb('Bad challenge response');
                } else {
                    cb(null, data);
                }
            });
        };

        var client = http.createClient(options.port, options.host);
        var req = client.request(options.method, options.path);

        client.on('error', function (err) {
            cb('Error connecting to '+options.host+':'+options.port);
        });
        req.on('error', function (err) {
            cb('Error in '+options.method+' notification to '+
                options.host+':'+options.port+'/'+options.path);
        });
        req.on('response', res_cb);
        
        if ('POST' == options.method) { req.write(q_params); }
        req.end();
    },

    // #### Generate a random string for a challenge.
    generateChallengeString: function () {
        return (Math.floor(Math.random() * 100000000000000000000) 
            + Date.now()).toString(32);
    },

    // #### Verify the given feed URL is accessible
    verifyFeedExists: function (cb, feed_url, http) {
        var $this = this;
        http = http || $this.http;

        var parts = url.parse(feed_url);
        var options = {
            method: 'GET',
            host: parts.hostname,
            port: parts.port || 80,
            path: parts.pathname
        };

        var client = http.createClient(options.port, options.host);
        var req = client.request(options.method, options.path);

        client.on('error', function (err) {
            cb('The subscription was cancelled because there was an error ' +
                'connecting to the server at URL ' + feed_url);
        });
        req.on('error', function (err) {
            cb('The subscription was cancelled because there was an error ' +
                'reading the resource at URL ' + feed_url);
        });
        req.on('response', function (res) {
            cb(null);
        });

        req.end();
    },

    // #### On a POST with no Content-Type, default to
    // application/x-www-form-urlencoded
    defaultToUrlEncodedTypeMiddleware: function (req, res, next) {
        if ('POST' != req.method) { return next(); }
        var ct = req.headers['content-type'] || '';
        var mime = ct.split(';')[0];
        if (!mime) { 
            req.headers['content-type'] = 
                'application/x-www-form-urlencoded'; 
        }
        next();
    },

    EOF: null
});
