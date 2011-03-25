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
        $this.pinghub = new PingHub({ sync: new LocmemSync() });
        $this.pinghub.ready(callback);
    },

    tearDown: function (callback) {
        callback();
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
            var res_cb, parser;

            // Replace the usual HTTP module with a mock object
            $this.http = {
                request: function (options, cb) {
                    // Record that a request was performed.
                    did_perform_request = true;
                    // Hang onto the callback to respond later
                    res_cb = cb;
                    // Mock up the specific request methods used by pinghub
                    return {
                        write: function (data) { parser.parseString(data); },
                        end: function () { parser.finish(); }
                    };
                },
            };

            // Set up some stub response events that fail.
            var res_handlers = {
                data: function (chunk) { test.ok(fail); },
                end: function () { test.ok(fail); }
            };

            // Set up a parser for the expected XML-RPC call.
            parser = new XMLRPC.SaxParser({
                onDone: function (data) {
                    // Verify the contents of the call.
                    test.equal('notify', data.method);
                    test.deepEqual([ expected_url ], data.params);
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

            // Finally, allow the original notification method to work.
            PingHub.prototype.notifyOneViaXMLRPC.call($this, cb, nreq, challenge);
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

            // Replace the usual HTTP module with a mock object
            $this.http = {
                request: function (options, cb) {
                    // Record that a request was performed.
                    did_perform_request = true;
                    // Hang onto the callback to respond later
                    res_cb = cb;
                    // Mock up the specific request methods used by pinghub
                    return {
                        write: function (chunk) { req_data += chunk; },
                        end: function () {
                            // Verify the contents of the call.
                            var params = querystring.parse(req_data);
                            test.equal(expected_url, params.url);
                            // Mock up a successful request with on method.
                            res_cb({
                                statusCode: 200,
                                on: function (event, handler) { 
                                    res_handlers[event] = handler; 
                                }
                            });
                            // Send back response data.
                            res_handlers.data(response_msg);
                            res_handlers.end();
                            did_receive_notification = true;
                        }
                    };
                },
            };

            // Finally, allow the original notification method to work.
            PingHub.prototype.notifyOneViaHTTPPOST.call($this, cb, nreq, challenge);
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
            var res_cb, req_data = '';

            // Set up some stub response events that fail.
            var res_handlers = {
                data: function (chunk) { test.ok(fail); },
                end: function () { test.ok(fail); }
            };

            // Replace the usual HTTP module with a mock object
            $this.http = {
                request: function (options, cb) {
                    // Record that a request was performed.
                    did_perform_request = true;
                    // Hang onto the callback to respond later
                    res_cb = cb;
                    // Mock up the specific request methods used by pinghub
                    return {
                        write: function (chunk) { req_data += chunk; },
                        end: function () {
                            // Verify the contents of the call.
                            var params = querystring.parse(options.path.split('?')[1]);
                            test.equal(expected_url, params.url);
                            // Mock up a successful request with on method.
                            res_cb({
                                statusCode: 200,
                                on: function (event, handler) { 
                                    res_handlers[event] = handler; 
                                }
                            });
                            // Send back response data.
                            res_handlers.data(querystring.stringify({
                                challenge: params.challenge
                            }));
                            res_handlers.end();
                            did_receive_notification = true;
                        }
                    };
                },
            };

            // Finally, allow the original notification method to work.
            PingHub.prototype.notifyOneViaHTTPPOST.call($this, cb, nreq, challenge);
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
            var res_cb, req_data = '';

            // Set up some stub response events that fail.
            var res_handlers = {
                data: function (chunk) { test.ok(fail); },
                end: function () { test.ok(fail); }
            };

            // Replace the usual HTTP module with a mock object
            $this.http = {
                request: function (options, cb) {
                    // Record that a request was performed.
                    did_perform_request = true;
                    // Hang onto the callback to respond later
                    res_cb = cb;
                    // Mock up the specific request methods used by pinghub
                    return {
                        write: function (chunk) { req_data += chunk; },
                        end: function () {
                            // Verify the contents of the call.
                            var params = querystring.parse(options.path.split('?')[1]);
                            test.equal(expected_url, params.url);
                            did_receive_notification = true;
                            // Mock up a successful request with on method.
                            res_cb({
                                statusCode: 200,
                                on: function (event, handler) { 
                                    res_handlers[event] = handler; 
                                }
                            });
                            // Send back response data.
                            res_handlers.data(querystring.stringify({
                                challenge: "THIS IS NOT THE CHALLENGE"
                            }));
                            res_handlers.end();
                        }
                    };
                },
            };

            // Finally, allow the original notification method to work.
            PingHub.prototype.notifyOneViaHTTPPOST.call($this, cb, nreq, challenge);
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
    }/*,

    "Registering for multiple feeds at once works": function (test) {
    },

    "Ping notification via HTTP POST with challenge works": function (test) {
    },

    "Ping with associated XML-RPC notification works": function (test) {
    },

    "Ping with associated HTTP POST notification works": function (test) {
    },

    "Ping notification via HTTP POST with un-met challenge fails": function (test) {
    }
    */

});
