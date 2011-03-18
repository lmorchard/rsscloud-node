/**
 * Test out XMLRPC utils.
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
        callback();
    },

    tearDown: function (callback) {
        callback();
    },

    "Play with XMLRPC": function (test) {

        async.waterfall(
            [
                function (next) {
                    var msg = new XMLRPC.Message('hello', [
                        "one", "two", { three: 1 }, 
                        new Date(),
                        [ 'here', { garg: '1' }, 'is', 'an', 'array' ],
                        { foo: 'bar', alpha: { one: 1, two: 2 },  baz: 'quux' }
                    ]);

                    var xml = msg.xml();

                    util.debug(xml);

                    var parser = new XMLRPC.SaxParser({ 
                        onDone: function () {
                            util.debug("DATA " + util.inspect(parser.data, false, 10));
                            next();
                        },
                        onError: function () {
                            util.debug("ERROR");
                        }
                    }); 
                    parser.parseString(xml);

                }, function (next) {

                    // util.debug(msg.xml());
                    
                    var resp = new XMLRPC.Response([ 'one', 'two', 'three' ]);
                    var parser = new XMLRPC.SaxParser({ 
                        onDone: function () {
                            util.debug("RESPONSE " + util.inspect(parser.data, false, 10));
                            next();
                        },
                        onError: function () {
                            util.debug("ERROR");
                        }
                    }); 
                    parser.parseString(resp.xml());

                }, function (next) {

                    var fault = new XMLRPC.Fault([ 'one', 'two', 'three' ]);
                    var parser = new XMLRPC.SaxParser({ 
                        onDone: function () {
                            util.debug("FAULT " + util.inspect(parser.data, false, 10));
                            next();
                        },
                        onError: function () {
                            util.debug("ERROR");
                        }
                    }); 
                    parser.parseString(fault.xml());
                
                }
            ], 
            function (err) {
                if (!err) {
                    test.done();
                } else {
                    util.log('FAILURE ' + err);
                }
            }
        );

    }

});
