/**
 * Test out XMLRPC utils.
 */
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
    Backbone = require('backbone'),
    Models = require('rsscloud/models'),
    //AlfredSync = require('rsscloud/models/alfred-sync').AlfredSync,
    AlfredSync = require('rsscloud/models/alfred-sync').AlfredSync;

var test_db_fn = __dirname + '/data';

module.exports = nodeunit.testCase({

    setUp: function (callback) {
        // Create test data dir, if necessary
        fs.stat(test_db_fn, function (err, stats) {
            if (err) {
                fs.mkdir(test_db_fn, 0777, callback);
            } else {
                callback();
            }
        });
    },

    "Model madness": function (test) {

        var new_sync, requests_1, requests_2;
        var request_1, request_2, request_3, request_4;
        var old_id;

        async.waterfall([

            function (next) {

                // Models.LocmemSync('init', null, { success: next });
                // sync = Models.LocmemSync;
                // Models.NotificationRequest.prototype.sync = sync;
                // Models.NotificationRequestCollection.prototype.sync = sync;

                new_sync = new AlfredSync({ path: test_db_fn });
                new_sync.open(
                    function (err, sync) {
                        Models.NotificationRequest.prototype.sync = sync;
                        Models.NotificationRequestCollection.prototype.sync = sync;
                        next();
                    }, 
                    function (err) {
                        test.ok(false, "no sync available");
                    }
                );

            }, function (next) {

                requests_1 = new Models.NotificationRequestCollection();
                requests_1.create(
                    { 
                        client_ip: '192.168.123.10', 
                        feed_url: 'http://scripting.com/rss.xml'
                    }, 
                    {
                        success: function (model) { 
                            request_1 = model;
                            next(); 
                        }
                    }
                );

            }, function (next) {

                test.notEqual(typeof(request_1.id), 'undefined');

                util.log('URL: ' + request_1.url());

                request_2 = new Models.NotificationRequest({
                    collection: requests_1,
                    client_ip: '127.0.0.1', 
                    feed_url: 'http://decafbad.com/blog/feed',
                });

                test.equal(typeof(request_2.id), 'undefined');

                request_2.save({}, { success: function (model) { next(); } });

            }, function (next) {

                test.notEqual(typeof(request_2.id), 'undefined');

                request_3 = new Models.NotificationRequest({ 
                    collection: requests_1,
                    client_ip: '192.168.10.20', 
                    protocol: 'http-post', path: '/feed/notify',
                    feed_url: 'http://slashdot.org/feed' 
                });
                request_3.save({}, { success: function (model) { next(); }});

            }, function (next) {

                test.notEqual(typeof(request_3.id), 'undefined');

                requests_2 = new Models.NotificationRequestCollection();
                requests_2.fetch({success: function (collection) { next(); }});

            }, function (next) {

                request_4 = requests_2.get(request_3.id);

                test.equal(request_3.get('client_ip'), '192.168.10.20');
                test.equal(request_4.get('client_ip'), '192.168.10.20');

                request_3.set({ client_ip: '192.168.10.40' });
                request_3.save({}, { success: function (model) { next(); } });

            }, function (next) {

                test.equal(request_3.get('client_ip'), '192.168.10.40');
                test.equal(request_4.get('client_ip'), '192.168.10.20');

                request_4.fetch({success: function (collection) { next(); }});

            }, function (next) {

                //AlfredSync.db.notifications.scan(
                new_sync.db.notifications.scan(
                    function (err, key, it) {
                        if (!key) { return next(); }
                        if (!it) { return; }
                        util.debug('ALF ' + key + ": " + it.feed_url);
                    }, true
                );

            }, function (next) {

                test.equal(request_4.get('client_ip'), '192.168.10.40');

                old_id = request_1.id;
                request_1.destroy({success: function (collection) { next(); }});

            }, function (next) {

                requests_2.fetch({success: function (collection) { next(); }});

            },
            
            function (next) {

                var missing = requests_2.get(old_id);
                test.equal(typeof(missing), 'undefined');
                
                /*
                var s = AlfredSync.db.notifications.find({ client_ip: { $eq: '127.0.0.1' } }).stream();
                s.on('record', function (it) {
                    util.log("FOUND " + util.inspect(it));
                });
                s.on('end', function () {
                    next(null);
                });
                */

                /*
                AlfredSync.db.notifications.scan(
                    function (err, key, it) {
                        if (!key) { return next(); }
                        if (!it) { return; }
                        util.debug('ALF ' + key + ": " + it.feed_url);
                    }, true
                );
                */
                next();

            }, 

            //function (next) { AlfredSync.db.notifications.compact(next); },
            //function (next) { AlfredSync('close', null, { success: next }); },
            function (next) { new_sync.close(next); },
            function (next) { test.done(); }

        ]);
    }

});
