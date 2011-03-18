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
    XMLRPC = require('xmlrpc');

require('underscore');
require('class');

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

    tearDown: function (callback) {
        callback();
    },

    "Play with test": function (test) {

        async.waterfall([
            
            function (next) {
                Alfred.open(test_db_fn, 
                    function (err, db) { next(err, db); }
                );
            }, function (db, next) {
                var Item = db.define('Item', {
                    indexes: [
                        { name: 'modified', fn: function (item) {
                            return item.modified; 
                        } }
                    ]
                });

                test.done();
            }

        ], function (err) {
            if (!err) {
                test.done();
            } else {
                util.log('FAILURE ' + err);
            }
        });
        

    }

});
