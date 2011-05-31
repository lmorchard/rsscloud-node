/**
 * Test out XMLRPC utils.
 */
var util = require('util'),
    fs = require('fs'),
    _ = require('underscore'),
    nodeunit = require('nodeunit'),
    assert = require('assert'),
    async = require('async'),
    RSSCloud = require('rsscloud'),
    XMLRPC = RSSCloud.xmlrpc,
    Models = RSSCloud.Models,
    Backbone = require('backbone'),
    LocmemSync = RSSCloud.Models.Sync.LocmemSync,
    DirtySync = RSSCloud.Models.Sync.DirtySync;

var test_db_path = __dirname + '/data';

var feed_urls = [
    'http://scripting.com/rss.xml',
    'http://decafbad.com/blog/feed/',
    'http://curry.com/?feed=rss2',
    'http://static.reallysimple.org/users/dave/linkblog.xml',
    'http://example.com/foo.rss',
    'http://example.com/bar.rss',
    'http://example.com/baz.rss'
];

var client_addrs = [
    '127.0.0.1',
    '192.168.123.10',
    '10.0.1.20',
    '66.55.44.33',
    '11.22.33.44',
    '44.33.22.11',
    '12.34.56.78'
];


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
            function (wf_next) {
                fs.readdir(test_db_path, function (err, files) {
                    if (!files) { return wf_next(); }
                    async.forEach(files, function (fn, fe_next) {
                        fs.unlink(test_db_path+'/'+fn, fe_next);
                    }, wf_next);
                });
            }, 
            function (wf_next) {
                var dirty_fn = test_db_path + '/dirty-'+ (new Date().getTime()) + Math.random() +'.db'
                $this.sync = new DirtySync({ path: dirty_fn })
                // $this.sync = new LocmemSync();
                $this.sync.open(
                    function (err, sync) {
                        Backbone.sync = sync;
                        wf_next();
                    }, 
                    function (err) { 
                        test.ok(false, "no sync available"); 
                    }
                );
            },
            function (wf_next) {
                $this.requests = new Models.NotificationRequestCollection();
                wf_next();
            }
        ], function (err) {
            if (!err) { callback(); }
            else { test.ok(false, err); }
        });
    },

    tearDown: function (callback) {
        var $this = this;
        $this.sync.close(callback);
    },

    "Get or create a notification" : function (test) {
        var $this = this;

        var data = {
            'client_addr': '127.0.0.1',
            'feed_url': 'http://decafbad.com/blog/feed',
            'port': '8080',
            'path': '/notifyme',
            'protocol': 'http-post',
            'notify_procedure': null
        };

        async.waterfall([

            function (wf_next) {
                $this.requests.getOrCreate(data, {
                    success: function (stat) { wf_next(null, stat); },
                    error:   function (err)  { wf_next(err); }
                });
            },
            function (stat, wf_next) {
                test.ok(stat.created);
                
                test.ok(stat.instance);
                test.equal(stat.instance.get('client_addr'), '127.0.0.1');
                wf_next();
            },
            function (wf_next) {
                $this.requests.getOrCreate(data, {
                    success: function (stat) {  wf_next(null, stat); },
                    error:   function (err)  { wf_next(err); }
                });
            },
            function (stat, wf_next) {
                test.ok(!stat.created);

                test.ok(stat.instance);
                test.equal(stat.instance.get('client_addr'), '127.0.0.1');
                wf_next();
            },

        ], function (err) {
            if (err) { test.ok(false, err); }
            else { test.done(); }
        });
    },

    "Notification requests can be fetched by feed url": function (test) {
        var $this = this;

        var test_requests = [
            { client_addr: client_addrs[0], feed_url: feed_urls[0] }, 
            { client_addr: client_addrs[1], feed_url: feed_urls[0] }, 
            { client_addr: client_addrs[2], feed_url: feed_urls[0] }, 
            { client_addr: client_addrs[3], feed_url: feed_urls[1] }, 
            { client_addr: client_addrs[4], feed_url: feed_urls[1] }, 
            { client_addr: client_addrs[5], feed_url: feed_urls[2] }, 
            { client_addr: client_addrs[6], feed_url: feed_urls[3] } 
        ];

        async.waterfall([

            // Create the initial set of requests.
            function (next) {
                async.forEach( test_requests, 
                    function (item, fe_next) {
                        $this.requests.create(item, { success: fe_next });
                    }, 
                    function () { next(); }
                );
            }, 

            // Fetch by feed URL and compare against expected results
            function (next) {
                var expected = [ client_addrs[0], client_addrs[1], client_addrs[2] ];
                var result = [];
                $this.requests.fetchByFeedUrl(
                    feed_urls[0],
                    function (r) { 
                        result.push(r.get('client_addr')); 
                    }, 
                    function () {
                        result.sort(); expected.sort();
                        test.deepEqual(expected, result);
                        next();
                    }
                );
            },

        ], function (err) {
            if (err) { test.ok(false, err); }
            else { test.done(); }
        });
    },

    "Notification requests can be fetched by client addr": function (test) {
        var $this = this;

        var test_requests = [
            { client_addr: client_addrs[0], feed_url: feed_urls[0] }, 
            { client_addr: client_addrs[0], feed_url: feed_urls[1] }, 
            { client_addr: client_addrs[0], feed_url: feed_urls[2] }, 
            { client_addr: client_addrs[1], feed_url: feed_urls[3] }, 
            { client_addr: client_addrs[1], feed_url: feed_urls[4] }, 
            { client_addr: client_addrs[2], feed_url: feed_urls[5] }, 
            { client_addr: client_addrs[3], feed_url: feed_urls[6] } 
        ];

        async.waterfall([

            // Create the initial set of requests.
            function (next) {
                async.forEach( test_requests, 
                    function (item, fe_next) {
                        $this.requests.create(item, { success: fe_next });
                    }, 
                    function () { next(); }
                );
            }, 

            // Fetch by feed URL and compare against expected results
            function (next) {
                var expected = [ feed_urls[0], feed_urls[1], feed_urls[2] ];
                var result = [];
                $this.requests.fetchByClientAddr(
                    client_addrs[0],
                    function (r) { 
                        result.push(r.get('feed_url')); 
                    }, 
                    function () {
                        result.sort(); expected.sort();
                        test.deepEqual(expected, result);
                        next();
                    }
                );
            },

        ], function (err) {
            if (err) { test.ok(false, err); }
            else { test.done(); }
        });
    },

    "Notification requests can be fetched by client addr and feed URL": function (test) {
        var $this = this;

        var test_requests = [
            { client_addr: client_addrs[0], feed_url: feed_urls[0], path: '/foo' }, 
            { client_addr: client_addrs[0], feed_url: feed_urls[0], path: '/bar' }, 
            { client_addr: client_addrs[0], feed_url: feed_urls[0], path: '/baz' }, 
            { client_addr: client_addrs[1], feed_url: feed_urls[1], path: '/quux' }, 
            { client_addr: client_addrs[2], feed_url: feed_urls[1], path: '/xyzzy' }, 
            { client_addr: client_addrs[2], feed_url: feed_urls[2], path: '/a' }, 
            { client_addr: client_addrs[3], feed_url: feed_urls[3], path: '/b' }
        ];

        async.waterfall([

            // Create the initial set of requests.
            function (next) {
                async.forEach( test_requests, 
                    function (item, fe_next) {
                        $this.requests.create(item, { success: fe_next });
                    }, 
                    function () { next(); }
                );
            }, 

            // Fetch by feed URL and compare against expected results
            function (next) {
                var expect = [ '/foo', '/bar', '/baz' ];
                var result = [ ];
                $this.requests.fetchByClientAddrAndFeedUrl(
                    { client_addr: client_addrs[0], feed_url: feed_urls[0] },
                    function (r) { result.push(r.get('path')); }, 
                    function () {
                        result.sort(); expect.sort();
                        test.deepEqual(expect, result);
                        next();
                    }
                );
            },

        ], function (err) {
            if (err) { test.ok(false, err); }
            else { test.done(); }
        });
    },

    "Notification requests older than expiration age (i.e. 25 hrs) can be fetched": function (test) {
        var $this = this;

        var max_age = 2999;
        var now = ( new Date() ).getTime();
        var older_than_query = now - max_age;

        var test_requests = [
            { client_addr: client_addrs[0], feed_url: feed_urls[0] }, 
            { client_addr: client_addrs[0], feed_url: feed_urls[1] }, 
            { client_addr: client_addrs[0], feed_url: feed_urls[2] }, 
            { client_addr: client_addrs[1], feed_url: feed_urls[3] }, 
            { client_addr: client_addrs[1], feed_url: feed_urls[4] }, 
            { client_addr: client_addrs[2], feed_url: feed_urls[5] }, 
            { client_addr: client_addrs[3], feed_url: feed_urls[6] }, 
        ];

        // Set up an artificial timeline for these requests.
        _(test_requests).each(function (data, idx) {
            data.created = now - ( 1000 * idx );
        });

        async.waterfall([

            // Create the initial set of requests.
            function (next) {
                async.forEach( test_requests, 
                    function (item, fe_next) {
                        $this.requests.create(item, { success: fe_next });
                    }, 
                    function () { next(); }
                );
            }, 

            // Fetch by feed URL and compare against expected results
            function (next) {
                var expected = [ feed_urls[3], feed_urls[4], feed_urls[5], feed_urls[6] ];
                var result = [];
                $this.requests.fetchOlderThan(
                    older_than_query,
                    function (r) { 
                        result.push(r.get('feed_url')); 
                    }, 
                    function () {
                        result.sort(); expected.sort();
                        test.deepEqual(expected, result);
                        next();
                    }
                );
            },

        ], function (err) {
            if (err) { test.ok(false, err); }
            else { test.done(); }
        });
    },

    "Exercise a sync backend for Backbone": function (test) {
        return test.done();

        var new_sync, requests_1, requests_2;
        var request_1, request_2, request_3, request_4;
        var old_id;

        async.waterfall([

            function (next) {

                requests_1 = new Models.NotificationRequestCollection();
                requests_1.create(
                    { 
                        client_addr: '192.168.123.10', 
                        feed_url: 'http://scripting.com/rss.xml'
                    }, 
                    {
                        success: function (model) { 
                            request_1 = model;
                            next(); 
                        }
                    }
                );

            }, 
            function (next) {

                test.notEqual(typeof(request_1.id), 'undefined');

                request_2 = new Models.NotificationRequest({
                    collection: requests_1,
                    client_addr: '127.0.0.1', 
                    feed_url: 'http://decafbad.com/blog/feed',
                });

                test.equal(typeof(request_2.id), 'undefined');

                request_2.save({}, { success: function (model) { next(); } });

            }, 
            function (next) {

                test.notEqual(typeof(request_2.id), 'undefined');

                request_3 = new Models.NotificationRequest({ 
                    collection: requests_1,
                    client_addr: '192.168.10.20', 
                    protocol: 'http-post', path: '/feed/notify',
                    feed_url: 'http://slashdot.org/feed' 
                });
                request_3.save({}, { success: function (model) { next(); }});

            }, 
            function (next) {

                test.notEqual(typeof(request_3.id), 'undefined');

                requests_2 = new Models.NotificationRequestCollection();
                requests_2.fetch({success: function (collection) { next(); }});

            }, 
            function (next) {

                request_4 = requests_2.get(request_3.id);

                test.equal(request_3.get('client_addr'), '192.168.10.20');
                test.equal(request_4.get('client_addr'), '192.168.10.20');

                request_3.set({ client_addr: '192.168.10.40' });
                request_3.save({}, { success: function (model) { next(); } });

            }, 
            function (next) {

                test.equal(request_3.get('client_addr'), '192.168.10.40');
                test.equal(request_4.get('client_addr'), '192.168.10.20');

                request_4.fetch({success: function (collection) { next(); }});

            /*
            },
            function (next) {

                new_sync.db.notifications.scan(
                    function (err, key, it) {
                        if (!key) { return next(); }
                        if (!it) { return; }
                        util.debug('ALF ' + key + ": " + it.feed_url);
                    }, true
                );
            */

            }, 
            function (next) {

                test.equal(request_4.get('client_addr'), '192.168.10.40');

                old_id = request_1.id;
                request_1.destroy({success: function (collection) { next(); }});

            }, 
            function (next) {

                requests_2.fetch({success: function (collection) { next(); }});

            },

            function (next) {

                var missing = requests_2.get(old_id);
                test.equal(typeof(missing), 'undefined');
                
                next();

            }, 

            function (next) { test.done(); }

        ], function (err) {
            if (err) { test.ok(false, err); }
            else { test.done(); }
        });

    }

});
