// ## tests for pinghub
//
// TODO: Refactor HTTP mock objects. Lots of copypasta reuse and awkward crap.
//
require(__dirname + "/../lib/setup")
    .ext( __dirname + "/../lib")
    .ext( __dirname + "/../extlib")
    .ext( __dirname + "/../deps")
    .ext( __dirname + "/../deps/express/support");

var util = require('util'),
    fs = require('fs'),
    _ = require('underscore'),
    nodeunit = require('nodeunit'),
    assert = require('assert'),
    async = require('async'),
    XMLRPC = require('xmlrpc'),
    url = require('url'),
    querystring = require('querystring'),
    Backbone = require('backbone'),
    Models = require('rsscloud/models'),
    LocmemSync = require('rsscloud/models/sync/locmem').LocmemSync,
    AlfredSync = require('rsscloud/models/sync/alfred').AlfredSync,
    PingHub = require('rsscloud/pinghub').PingHub;

var test_db_path = __dirname + '/data';


module.exports = nodeunit.testCase({

    setUp: function (callback) {
        var $this = this;
        async.waterfall([
            function (next) {
                // Create test data dir, if necessary
                fs.stat(test_db_path, function (err, stats) {
                    if (err) { fs.mkdir(test_db_path, 0777, next); } 
                    else { next(); }
                });
            },
            function (next) {
                $this.sync = new AlfredSync({ path: test_db_path })
                // $this.sync = new LocmemSync();
                $this.pinghub = new PingHub({ 
                    sync: $this.sync,
                    notify_queue_concurrency: 20
                });
                $this.pinghub.prepare(function (err) {
                    if (!err) { callback(); }
                    else { test.ok(false, err); }
                });
            }
        ]);
    },

    tearDown: function (callback) {
        var $this = this;
        // Shutdown the pinghub and wipe the contents of the data directory,
        // in case we're using something other than LocmemSync();
        $this.pinghub.shutdown(function (err) {
            fs.readdir(test_db_path, function (err, files) {
                async.forEach(files, function (fn, fe_next) {
                    fs.unlink(test_db_path+'/'+fn, fe_next);
                }, function () {
                    fs.rmdir(test_db_path, callback);
                });
            });
        });
    },

    "Registering for notification of non-existent feed fails": function (test) {
        var $this = this;
        $this.pinghub.verifyFeedExists = function (cb, feed_url) {
            cb('Forced failure');
        };
        var url_list = [ 'http://scriptingbrews.decafbad.com/rss.xml' ];
        var cb = function (err, requests) {
            if (err) { return test.done(); }
            test.ok(false, "There should have been an error"); 
            return test.done();
        };
        $this.pinghub.pleaseNotify(cb, 'notify', '5337', '/RPC2', 'xml-rpc', 
            url_list, 'decafbad.com');
    },

    "Registering for notification with unsupported protocol fails": function (test) {
        var $this = this;
        $this.pinghub.verifyFeedExists = function (cb, feed_url) {
            util.debug("Mock verifyFeedExists " + feed_url);
            cb(null);
        }
        var url_list = [ 'http://scriptingbrews.decafbad.com/rss.xml' ];
        var cb = function (err, requests) {
            if (err) { return test.done(); }
            test.ok(false, "There should have been an error"); 
            return test.done();
        };
        $this.pinghub.pleaseNotify(cb, 'notify', '5337', '/RPC2', 'foo-bar', 
            url_list, 'decafbad.com');
    },

    "Registering for a feed notification via XML-RPC works": function (test) {
        var $this = this;

        var did_verify = false;
        var did_perform_request = false;
        var did_receive_xmlrpc_notification = false;

        var expected_url = 'http://scripting.com/rss.xml';
        var response_msg = 'Thanks for the notification.';

        // Mock out verifyFeedExists to avoid a real HTTP request
        $this.pinghub.verifyFeedExists = function (cb, feed_url) {
            did_verify = true; cb(null);
        }

        // Replace the original notify method with a mock wrapper.
        $this.pinghub.notifyOneViaXMLRPC = function (cb, nreq, challenge) {
            var $this = this;
            var res_cb;

            // Set up some stub response events that fail.
            var res_handlers = {
                data: function (chunk) { test.ok(fail); },
                end: function () { test.ok(fail); }
            };
            var m_res = {
                statusCode: 200,
                on: function (event, handler) { 
                    res_handlers[event] = handler; 
                }
            };

            // Set up a parser for the expected XML-RPC call.
            var parser = new XMLRPC.SaxParser({
                onDone: function (data) {
                    // Verify the contents of the call.
                    test.equal('notify', data.method);
                    test.deepEqual([ expected_url ], data.params);
                    // Mock up a successful request with on method.
                    res_cb(m_res);
                    // Send back response data.
                    res_handlers.data(new XMLRPC.Response([response_msg]).xml());
                    res_handlers.end();
                    did_receive_xmlrpc_notification = true;
                },
                onError: function (msg) {
                    // Bail on error.
                    test.ok(false, msg);
                    test.done();
                }
            });

            // Mock up the specific request methods used by pinghub
            var m_req = {
                on: function (ev_name, cb) {
                    // Hang onto the callback to respond later
                    if ('response' == ev_name) { res_cb = cb; }
                },
                write: function (data) { parser.parseString(data); },
                end: function () {
                    did_perform_request = true;
                    parser.finish(); 
                }
            };
            var m_client = {
                on: function (name, cb) { },
                request: function (method, path) { return m_req; }
            };
            var m_http = {
                createClient: function (port, host) { return m_client; }
            };

            // Finally, allow the original notification method to work.
            PingHub.prototype.notifyOneViaXMLRPC.call($this, cb, nreq, challenge, m_http);
        };

        var cb = function (err, result) {
            if (err) { test.ok(false); test.done(); }
            test.equal(true, did_verify);
            test.equal(true, did_perform_request);
            test.equal(true, did_receive_xmlrpc_notification);
            test.equal(1, result.length);
            test.equal(expected_url, result[0].get('feed_url'));
            test.done();
        };

        $this.pinghub.pleaseNotify(cb, 'notify', '5337', '/RPC2', 'xml-rpc', 
            [ expected_url ], 'decafbad.com');
    },

    "Registering for a feed notification via HTTP POST works": function (test) {
        var $this = this;

        var did_verify = false;
        var did_perform_request = false;
        var did_receive_notification = false;

        var expected_url = 'http://scripting.com/rss.xml';
        var response_msg = 'Thanks for the notification.';

        // Mock out verifyFeedExists to avoid a real HTTP request
        $this.pinghub.verifyFeedExists = function (cb, feed_url) {
            did_verify = true; cb(null);
        }

        // Replace the original notify method with a mock wrapper.
        $this.pinghub.notifyOneViaHTTPPOST = function (cb, nreq, challenge) {
            var $this = this;
            var res_cb, req_data = '';

            // Set up some stub response events that fail.
            var res_handlers = {
                data: function (chunk) { test.ok(fail); },
                end: function () { test.ok(fail); }
            };

            // Mock up the specific request methods used by pinghub
            var m_res = {
                statusCode: 200,
                on: function (event, handler) { 
                    res_handlers[event] = handler; 
                }
            };
            var m_req = {
                on: function (ev_name, cb) {
                    // Hang onto the callback to respond later
                    if ('response' == ev_name) { res_cb = cb; }
                },
                write: function (chunk) { req_data += chunk; },
                end: function () {
                    did_perform_request = true;
                    // Verify the contents of the call.
                    var params = querystring.parse(req_data);
                    test.equal(expected_url, params.url);
                    // Mock up a successful request with on method.
                    res_cb(m_res);
                    // Send back response data.
                    res_handlers.data(response_msg);
                    res_handlers.end();
                    did_receive_notification = true;
                }
            };
            var m_client = {
                on: function (name, cb) { },
                request: function (method, path) { return m_req; }
            };
            var m_http = {
                createClient: function (port, host) { return m_client; }
            };

            // Finally, allow the original notification method to work, with a
            // substitute for the usual http module.
            PingHub.prototype.notifyOneViaHTTPPOST.call($this, cb, nreq, challenge, m_http);
        };

        var cb = function (err, result) {
            if (err) { test.ok(false); test.done(); }
            test.equal(true, did_verify);
            test.equal(true, did_perform_request);
            test.equal(true, did_receive_notification);
            test.equal(1, result.length);
            test.equal(expected_url, result[0].get('feed_url'));
            test.done();
        };

        $this.pinghub.pleaseNotify(cb, 'notify', '5337', '/notify', 'http-post', 
            [ expected_url ], 'decafbad.com');
    },

    "Registering for a feed notification via HTTP POST with challenge works": function (test) {
        var $this = this;

        var did_verify = false;
        var did_perform_request = false;
        var did_receive_notification = false;

        var expected_url = 'http://scripting.com/rss.xml';
        var response_msg = 'Thanks for the notification.';

        // Mock out verifyFeedExists to avoid a real HTTP request
        $this.pinghub.verifyFeedExists = function (cb, feed_url) {
            did_verify = true; cb(null);
        }

        // Replace the original notify method with a mock wrapper.
        $this.pinghub.notifyOneViaHTTPPOST = function (cb, nreq, challenge) {
            var $this = this;
            var res_cb, req_data = '', req_path;

            // Set up some stub response events that fail.
            var res_handlers = {
                data: function (chunk) { test.ok(fail); },
                end: function () { test.ok(fail); }
            };
            var m_res = {
                statusCode: 200,
                on: function (event, handler) { 
                    res_handlers[event] = handler; 
                }
            };
            var m_req = {
                on: function (ev_name, cb) {
                    if ('response' == ev_name) { res_cb = cb; }
                },
                write: function (chunk) { req_data += chunk; },
                end: function () {
                    did_perform_request = true;
                    // Verify the contents of the call.
                    var params = querystring.parse(req_path.split('?')[1]);
                    test.equal(expected_url, params.url);
                    // Mock up a successful request with on method.
                    res_cb(m_res);
                    // Send back response data.
                    res_handlers.data(querystring.stringify({
                        challenge: params.challenge
                    }));
                    res_handlers.end();
                    did_receive_notification = true;
                }
            };
            var m_client = {
                on: function (name, cb) { },
                request: function (method, path) { 
                    req_path = path; return m_req; 
                }
            };
            var m_http = {
                createClient: function (port, host) { return m_client; }
            };

            // Finally, allow the original notification method to work, with a
            // replacement for the http module.
            PingHub.prototype.notifyOneViaHTTPPOST.call($this, cb, nreq, challenge, m_http);
        };

        var cb = function (err, result) {
            if (err) { test.ok(false); test.done(); }
            test.equal(true, did_verify);
            test.equal(true, did_perform_request);
            test.equal(true, did_receive_notification);
            test.ok('undefined' != typeof(result[0]));
            test.equal(expected_url, result[0].get('feed_url'));
            test.done();
        };

        $this.pinghub.pleaseNotify(cb, 'notify', '5337', '/notify', 'http-post', 
            [ expected_url ], 'decafbad.com', true);
    },

    "Registering for a feed notification via HTTP POST with un-met challenge fails": function (test) {
        var $this = this;

        var did_verify = false;
        var did_perform_request = false;
        var did_receive_notification = false;

        var expected_url = 'http://scripting.com/rss.xml';
        var response_msg = 'Thanks for the notification.';

        // Mock out verifyFeedExists to avoid a real HTTP request
        $this.pinghub.verifyFeedExists = function (cb, feed_url) {
            did_verify = true; cb(null);
        }

        // Replace the original notify method with a mock wrapper.
        $this.pinghub.notifyOneViaHTTPPOST = function (cb, nreq, challenge) {
            var $this = this;
            var res_cb, req_data = '', req_path;

            // Set up some stub response events that fail.
            var res_handlers = {
                data: function (chunk) { test.ok(fail); },
                end: function () { test.ok(fail); }
            };
            var m_res = {
                statusCode: 200,
                on: function (event, handler) { 
                    res_handlers[event] = handler; 
                }
            };
            var m_req = {
                on: function (ev_name, cb) {
                    if ('response' == ev_name) { res_cb = cb; }
                },
                write: function (chunk) { req_data += chunk; },
                end: function () {
                    did_perform_request = true;
                    // Verify the contents of the call.
                    var params = querystring.parse(req_path.split('?')[1]);
                    test.equal(expected_url, params.url);
                    did_receive_notification = true;
                    // Mock up a successful request with on method.
                    res_cb(m_res);
                    // Send back response data.
                    res_handlers.data(querystring.stringify({
                        challenge: "THIS IS NOT THE CHALLENGE"
                    }));
                    res_handlers.end();
                }
            };
            var m_client = {
                on: function (name, cb) { },
                request: function (method, path) { 
                    req_path = path; return m_req; 
                }
            };
            var m_http = {
                createClient: function (port, host) { return m_client; }
            };

            // Finally, allow the original notification method to work, with a
            // replacement for the http module.
            PingHub.prototype.notifyOneViaHTTPPOST.call($this, cb, nreq, challenge, m_http);
        };

        var cb = function (err, result) {
            test.equal(true, did_verify);
            test.equal(true, did_perform_request);
            test.equal(true, did_receive_notification);
            test.equal(0, result.length);
            test.done();
        };

        $this.pinghub.pleaseNotify(cb, 'notify', '5337', '/notify', 'http-post', 
            [ expected_url ], 'decafbad.com', true);
    },

    "Ping with registered notifications works, both HTTP POST and XML-RPC": function (test) {
        var $this = this;

        var response_msg = 'Thanks for the notification.';

        var test_registration_keys = [ 'client_addr', 'port', 'path', 'protocol', 'notify_procedure', 'feed_url' ];

        var test_registrations_values = [
            [ 'decafbad.com', '8080', 'resty', 'http-post', null, 'http://scripting.com/rss.xml'], 
            [ 'decafbad.com', '8080', 'RPC2', 'xml-rpc', 'notify', 'http://curry.com/?feed=rss2'], 
            [ 'example.com', '80', 'blah', 'http-post', null, 'http://curry.com/?feed=rss2'],
            [ 'example.com', '80', 'RPC2', 'xml-rpc', 'hitme', 'http://static.reallysimple.org/users/dave/linkblog.xml'],
            [ 'example.com', '80', 'foo', 'http-post', null, 'http://curry.com/?feed=rss2'],
            [ 'example.com', '80', 'RPC2', 'xml-rpc', 'hotcha', 'http://example.com/foo.rss']
        ];

        // Convert registration values into objects, and collect all known feed URLs for pings.
        var feed_urls_seen = {};
        var test_registrations = _(test_registrations_values).map(function (values, idx) {
            var request = { protocol: 'http-post', notify_procedure: null };
            _(test_registration_keys).each(function (name, idx) {
                request[name] = values[idx];
            });
            feed_urls_seen[request.feed_url] = 1;
            return request;
        });
        var feed_urls = _(feed_urls_seen).keys();

        // Cheating a lil here by endeavoring to make the resulting recorded
        // pings look like the registration source values.
        var expected_pings = test_registrations_values;

        // Track pings seen throughout the course of issuing notifications.
        var pings_seen = [];

        // Replace the original notify method with a mock wrapper.
        $this.pinghub.notifyOneViaHTTPPOST = function (cb, nreq, challenge) {
            var $this = this;
            var res_cb, req_data = '', options = {};

            // Set up some stub response events that fail.
            var res_handlers = {
                data: function (chunk) { test.ok(fail); },
                end: function () { test.ok(fail); }
            };
            var m_res = {
                statusCode: 200,
                on: function (event, handler) { 
                    res_handlers[event] = handler; 
                }
            };
            var m_req = {
                on: function (ev_name, cb) {
                    if ('response' == ev_name) { res_cb = cb; }
                },
                write: function (chunk) { req_data += chunk; },
                end: function () {
                    var params = querystring.parse(req_data || options.path.split('?')[1]);
                    did_perform_request = true;

                    // Record the ping as seen.
                    var ping = [ 
                        options.host, options.port, options.path, 'http-post', null,
                        params.url 
                    ];
                    pings_seen.push(ping);

                    res_cb({
                        statusCode: 200,
                        on: function (event, handler) { 
                            res_handlers[event] = handler; 
                        }
                    });
                    res_handlers.data(querystring.stringify({
                        challenge: params.challenge
                    }));
                    res_handlers.end();

                }
            };
            var m_client = {
                on: function (name, cb) { },
                request: function (method, path) { 
                    options.path = path; 
                    options.method = method;
                    return m_req; 
                }
            };
            var m_http = {
                createClient: function (port, host) { 
                    options.port = port;
                    options.host = host;
                    return m_client; 
                }
            };

            // Finally, allow the original notification method to work, with a
            // replacement for the http module.
            PingHub.prototype.notifyOneViaHTTPPOST.call($this, cb, nreq, challenge, m_http);
        };

        // Replace the original notify method with a mock wrapper.
        $this.pinghub.notifyOneViaXMLRPC = function (cb, nreq, challenge) {
            var $this = this;
            var res_cb, options = {};

            // Set up a parser for the expected XML-RPC call.
            var parser = new XMLRPC.SaxParser({
                onDone: function (data) {
                    // Record the ping as seen.
                    var ping = [ 
                        options.host, options.port, options.path, 'xml-rpc', data.method,
                        data.params[0]
                    ];
                    pings_seen.push(ping);

                    // Mock up a successful request with on method.
                    res_cb({
                        statusCode: 200,
                        on: function (event, handler) { 
                            res_handlers[event] = handler; 
                        }
                    });
                    // Send back response data.
                    res_handlers.data(new XMLRPC.Response([response_msg]).xml());
                    res_handlers.end();
                    did_receive_xmlrpc_notification = true;
                },
                onError: function (msg) {
                    // Bail on error.
                    test.ok(false, msg);
                    test.done();
                }
            });
            var res_handlers = {
                data: function (chunk) { test.ok(fail); },
                end: function () { test.ok(fail); }
            };
            var m_res = {
                statusCode: 200,
                on: function (event, handler) { 
                    res_handlers[event] = handler; 
                }
            };
            var m_req = {
                on: function (ev_name, cb) {
                    if ('response' == ev_name) { res_cb = cb; }
                },
                write: function (data) { parser.parseString(data); },
                end: function () { parser.finish(); }
            };
            var m_client = {
                on: function (name, cb) { },
                request: function (method, path) { 
                    options.path = path; 
                    options.method = method;
                    return m_req; 
                }
            };
            var m_http = {
                createClient: function (port, host) { 
                    options.port = port;
                    options.host = host;
                    return m_client; 
                }
            };

            // Finally, allow the original notification method to work.
            PingHub.prototype.notifyOneViaXMLRPC.call($this, cb, nreq, challenge, m_http);
        };

        async.waterfall([

            // Set up the test notification requests.
            function (wf_next) {
                async.forEach(test_registrations, function (request, fe_next) {
                    $this.pinghub.notification_requests.create(request, { 
                        success: function (r) { fe_next(); },
                        error: function (err) { fe_next(err); }
                    });
                }, wf_next);
            },

            // Ping for each of the known feed URLs
            function (wf_next) {
                async.forEach(feed_urls, function (feed_url, fe_next) {
                    // Make sure to wait for queued notifications
                    $this.pinghub.ping(fe_next, feed_url, false);
                }, function () {
                    // HACK: Yield to allow queued ping notifications to run.
                    setTimeout(wf_next, 1);
                });
            },

            function (wf_next) {

                // Sort the expected pings and pings seen, since order is unimportant here.
                var cmp = function (x) { return x.join(' '); };
                expected_pings = _(expected_pings).sortBy(cmp);
                pings_seen = _(pings_seen).sortBy(cmp);

                // test.deepEqual isn't that deep, so can't compare the lists directly
                _(pings_seen).each(function (ping_seen, idx) {
                    test.deepEqual(expected_pings[idx], ping_seen);
                });

                wf_next();
            }
        
        ], function (err) { 
            if (err) { test.ok(false, err); }        
            test.done();
        });

    },

    "Ensure repeat/refreshed registration results in just one updated record": function (test) {
        var $this = this;

        var result_counts = {};
        var expect_counts = {};

        var test_feed = 'http://scripting.com/rss.xml'
        var cols = ['client_addr','port','path','protocol','notify_procedure','feed_url'];
        var rows = [
            ['decafbad.com', '8080', 'resty', 'http-post', null, test_feed], 
            ['decafbad.com', '8080', 'resty', 'http-post', null, test_feed], 
            ['decafbad.com', '8080', 'resty', 'http-post', null, test_feed], 
            ['decafbad.com', '9000', 'resty', 'http-post', null, test_feed], 
            ['decafbad.com', '9000', 'resty', 'http-post', null, test_feed], 
            ['decafbad.com', '9000', 'foo',   'http-post', null, test_feed], 
            ['decafbad.com', '9000', 'foo',   'http-post', null, test_feed], 
            ['example.com',  '80',   'blah',  'http-post', null, test_feed]
        ];
        var test_registrations = [];
        for (var i=0,row; row=rows[i]; i++) {

            var r = { uniq: row.join('$') };
            result_counts[r.uniq] = 0;
            expect_counts[r.uniq] = 1;
       
            for (var j=0,col; col=cols[j]; j++) { r[col] = row[j]; }
            test_registrations.push(r);

        }

        // Mock out verifyFeedExists to avoid a real HTTP request
        $this.pinghub.verifyFeedExists = function (cb, feed_url) { cb(null); }

        // Wrap notifyOneViaXMLRPC with a minimally functional http mock
        $this.pinghub.notifyOneViaHTTPPOST = function (cb, nreq, challenge) {
            var $this = this;
            var res_cb;

            var res_handlers = { };
            var m_res = {
                statusCode: 200,
                on: function (event,handler) { res_handlers[event]=handler; }
            };
            var m_req = {
                on: function (ev_name, cb) {
                    if ('response' == ev_name) { res_cb = cb; }
                },
                write: function (chunk) { },
                end: function () { res_cb(m_res); res_handlers.end(); }
            };
            var m_client = {
                on: function (name, cb) { /* No-op */ },
                request: function (method, path) { return m_req; }
            };
            var m_http = {
                createClient: function (port, host) { return m_client; }
            };

            PingHub.prototype.notifyOneViaHTTPPOST.call($this, cb, nreq, challenge, m_http);
        };

        async.waterfall([

            // Register notifications for each test item.
            function (wf_next) {
                async.forEachSeries(test_registrations, function (r, fe_next) {
                    $this.pinghub.pleaseNotify(fe_next, 
                        r.notify_procedure, r.port, r.path, r.protocol, 
                        [ r.feed_url ], r.client_addr, false);
                }, wf_next);
            },

            // Iterate through all notifications for the test feed, count the uniques.
            function (wf_next) {
                $this.pinghub.notification_requests.fetchByFeedUrl(
                    test_feed,
                    function (item) {
                        var uniq = _(cols)
                            .map(function (v) { return item.get(v) })
                            .join('$');
                        if (!result_counts[uniq]) { result_counts[uniq] = 1; }
                        else { result_counts[uniq]++; }
                    },
                    wf_next
                );
            },

            // Compare expected counts with result counts.
            function (wf_next) {
                test.deepEqual(expect_counts, result_counts);
                wf_next();
            }

        ], function (err) { 
            if (err) { test.ok(false, err); }        
            test.done();
        });
    
    }/*,

    "Ping notification via HTTP POST with un-met challenge fails": function (test) {
        // TODO: De-register a notification if the challenge is unmet
        //
    }
    */

});
