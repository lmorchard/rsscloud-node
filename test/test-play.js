/**
 * Not really tests, just experiments that I probably checked in accidentally.
 */
var util = require('util'),
    fs = require('fs'),
    nodeunit = require('nodeunit'),
    assert = require('assert'),
    async = require('async'),
    _ = require('underscore'),
    XMLRPC = require('rsscloud').xmlrpc;

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
       test.done(); 
    }

});
