/**
 *
 */
require(__dirname + "/../lib/setup")
    .ext( __dirname + "/../lib")
    .ext( __dirname + "/../extlib")
    .ext( __dirname + "/../deps")
    .ext( __dirname + "/../deps/express/support");

var 
    util = require('util'),
    fs = require('fs'),
    nodeunit = require('nodeunit'),
    assert = require('assert'),
    async = require('async'),
    XMLRPC = require('xmlrpc'),
    Alfred = require('alfred'),
    _ = require('underscore'),
    XMLRPC = require('xmlrpc');

var test_db_fn = __dirname + '/data';

var uid = function () {
    return (Math.floor(Math.random() * 100000000000000000) + Date.now()).toString(32)
};

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

    tearDown: function (callback) {
        callback();
    },

    "Play with test": function (test) {

        var db;
        var Item, items = [];

        async.waterfall([
            
            function (next) {
                
                Alfred.open(test_db_fn, next);

            }, function (db_opened, next) {

                db = db_opened;
                db.ensure('items', function (err, km) {
                    async.parallel([
                        function (cb) {
                            db.items.addIndex('title', function (item) {
                                return item.title;
                            }, cb);
                        },
                        function (cb) {
                            db.items.addIndex('description', function (item) {
                                return item.description;
                            }, cb);
                        },
                        function (cb) {
                            db.items.addIndex('modified', function (item) {
                                return item.modified;
                            }, cb);
                        }
                    ], next);
                });

            }, function (results, next) {

                async.forEach(
                    [ 'one', 'two', 'three', 'four' ],
                    function (key, sub_next) {
                        var an_item = {
                            id: key, // uid()
                            title: "Title " + key,
                            description: "Description " + key,
                            modified: new Date()
                        };
                        items.push(an_item);
                        db.items.put(an_item.id, an_item, sub_next);
                    },
                    function (err) {
                        util.log("WE DONE");
                        next();
                    }
                );

            }, function (next) {

                _(items).each(function (item) {
                    util.log("ITEM " + item.id);
                });

                var s = db.items.find({ 
                    title: {$eq:'Title three'} 
                }).stream();

                s.on('record', function (it) {
                    util.log("FOUND " + util.inspect(it));
                });
                s.on('end', function () {
                    next(null);
                });


            }, function (next) {

                db.items.get(items[1].id, function (err, it) {
                    util.log("GOT " + util.inspect(it));
                    next();
                });

            }, 
            
            // function (next) { db.items.compact(next); }, 
            function (next) { db.close(next); },
            function (next) { test.done(); }

        ], function (err) {
            if (!err) { test.done(); } 
            else { util.log('FAILURE ' + err); }
        });
        

    }

});
