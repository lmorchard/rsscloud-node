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
    XMLRPC = require('xmlrpc');

var deep_equal = function (test, expected, result) {
    if (_(expected).isDate()) {
        test.equals(''+expected, ''+result);
    } else if (_(expected).isArray()) {
        _(expected).each(function (s_expected, idx) {
            deep_equal(test, s_expected, result[idx]);
        });
    } else {
        test.deepEqual(expected, result);
    }
};

module.exports = nodeunit.testCase({

    "Call can be parsed": function (test) {

        var test_xml = [
            "<methodCall>",
            "<methodName>test.method</methodName>",
            "<params>",
            "<param><value>assumed string</value></param>",
            "<param><value><string>explicit string</string></value></param>",
            "<param><i4>1234</i4></param>",
            "<param><int>-1234</int></param>",
            "<param><double>-12.34</double></param>",
            "<param><dateTime.iso8601>20110318T01:23:45Z</dateTime.iso8601></param>",
            "<param><dateTime.iso8601>2011-03-16T02:34:56Z</dateTime.iso8601></param>",
            "<param><base64>dGVzdGluZzEy</base64></param>",
            "<param>",
            "<array>",
            "   <data>",
            "      <value><i4>12</i4></value>",
            "      <value><string>Egypt</string></value>",
            "      <value><boolean>0</boolean></value>",
            "      <value><i4>-31</i4></value>",
            "      </data>",
            "   </array>",
            "</param>",
            "<param>",
            "<struct>",
            "   <member>",
            "      <name>lowerBound</name>",
            "      <value><i4>18</i4></value>",
            "      </member>",
            "   <member>",
            "      <name>upperBound</name>",
            "      <value><i4>139</i4></value>",
            "      </member>",
            "   </struct>",
            "</param>",
            "</params>",
            "</methodCall>"
        ].join("\n");

        var parser = new XMLRPC.SaxParser({
            onDone: function (data) {
                test.equals(false, data.is_response);
                test.equals(false, data.is_fault);
                test.equals('test.method', data.method);

                deep_equal(test,
                    [ 
                        'assumed string', 
                        'explicit string', 
                        1234, 
                        -1234, 
                        -12.34, 
                        new Date("Fri, 18 Mar 2011 01:23:45 GMT"),
                        new Date("Wed, 16 Mar 2011 02:34:56 GMT"),
                        "testing12",
                        [ 12, "Egypt", false, -31 ],
                        { lowerBound: 18, upperBound: 139 }
                    ], 
                    data.params
                );
                
                test.done();
            },

            onError: function (msg) {
                test.ok(false, msg);
                test.done();
            }

        });

        parser.parseString(test_xml).finish();

    },

    "Response can be parsed": function (test) {

        var test_xml = [
            "<methodResponse>",
            "<params>", "<param>",
            "<struct>",
            "   <member>",
            "      <name>lowerBound</name>",
            "      <value><i4>18</i4></value>",
            "      </member>",
            "   <member>",
            "      <name>upperBound</name>",
            "      <value><i4>139</i4></value>",
            "      </member>",
            "   </struct>",
            "</param>", "</params>",
            "</methodResponse>"
        ].join("\n");

        var parser = new XMLRPC.SaxParser({
            onDone: function (data) {
                test.equals(true, data.is_response);
                deep_equal(test, [{ lowerBound: 18, upperBound: 139 }], data.params);
                test.done();
            },
            onError: function (msg) {
                test.ok(false, msg);
                test.done();
            }
        });

        parser.parseString(test_xml).finish();

    },

    "Fault can be parsed": function (test) {

        var test_xml = [
            '<?xml version="1.0"?>',
            "<methodResponse>",
            "   <fault>",
            "      <value>",
            "         <struct>",
            "            <member>",
            "               <name>faultCode</name>",
            "               <value><int>4</int></value>",
            "               </member>",
            "            <member>",
            "               <name>faultString</name>",
            "               <value><string>Too many parameters.</string></value>",
            "               </member>",
            "            </struct>",
            "         </value>",
            "      </fault>",
            "   </methodResponse>"
        ].join("\n");

        var parser = new XMLRPC.SaxParser({
            onDone: function (data) {
                test.equals(true, data.is_fault);
                deep_equal(test, [{ 
                    faultCode: 4, 
                    faultString: "Too many parameters." 
                }], data.params);
                test.done();
            },
            onError: function (msg) {
                test.ok(false, msg);
                test.done();
            }
        });

        parser.parseString(test_xml).finish();

    },

    "Call roundtrip, built and parsed": function (test) {

        var params = [
            'assumed string', 
            'explicit string', 
            1234, 
            -1234, 
            -12.34, 
            new Date("Fri, 18 Mar 2011 01:23:45 GMT"),
            new Date("Wed, 16 Mar 2011 02:34:56 GMT"),
            "testing12",
            [ 12, "Egypt", false, -31 ],
            { lowerBound: 18, upperBound: 139 }
        ];

        var test_xml = new XMLRPC.Call('test.alpha', params).xml();

        var parser = new XMLRPC.SaxParser({
            onDone: function (data) {
                test.equals(false, data.is_response);
                test.equals(false, data.is_fault);
                test.equals('test.alpha', data.method);
                deep_equal(test, params, data.params);
                test.done();
            },
            onError: function (msg) {
                test.ok(false, msg);
            }
        });

        parser.parseString(test_xml).finish();

    },

    "Response roundtrip, built and parsed": function (test) {
        var params = [{ lowerBound: 18, upperBound: 139 }];
        var test_xml = new XMLRPC.Response(params).xml();
        var parser = new XMLRPC.SaxParser({
            onDone: function (data) {
                test.equals(true, data.is_response);
                deep_equal(test, params, data.params);
                test.done();
            },
            onError: function (msg) {
                test.ok(false, msg);
            }
        });
        parser.parseString(test_xml).finish();
    },

    "Fault roundtrip, built and parsed": function (test) {
        var params = [{ 
            faultCode: 4, 
            faultString: "Too many parameters." 
        }];
        var test_xml = new XMLRPC.Fault(4, "Too many parameters.").xml();
        var parser = new XMLRPC.SaxParser({
            onDone: function (data) {
                test.equals(true, data.is_fault);
                deep_equal(test, params, data.params);
                test.done();
            },
            onError: function (msg) {
                test.ok(false, msg);
                test.done();
            }
        });
        parser.parseString(test_xml).finish();
    },

    "Call with a struct containing implicit strings can be parsed": function (test) {
        var test_xml = [
            "<methodCall>",
            "<methodName>test.method</methodName>",
            "<params>",
            "<param>",
            "<struct>",
            "   <member>",
            "      <name>implicitString</name>",
            "      <value>this is a string</value>",
            "      </member>",
            "   <member>",
            "      <name>explicitString</name>",
            "      <value><string>this is also a string</string></value>",
            "      </member>",
            "   </struct>",
            "</param>",
            "</params>",
            "</methodCall>"
        ].join("\n");

        var parser = new XMLRPC.SaxParser({
            onDone: function (data) {
                test.equals(false, data.is_response);
                test.equals(false, data.is_fault);
                test.equals('test.method', data.method);
                deep_equal(test,
                    [ 
                        { 
                            implicitString: "this is a string", 
                            explicitString: "this is also a string" 
                        }
                    ], 
                    data.params
                );
                test.done();
            },
            onError: function (msg) {
                test.ok(false, msg);
                test.done();
            }
        });
        parser.parseString(test_xml).finish();
    },

    "Parsing fails with an error on incomplete input": function (test) {
        var test_xml = [
            "<methodResponse>",
            "<params>", "<param>",
        ].join("\n");
        var parser = new XMLRPC.SaxParser({
            onDone: function (data) {
                test.ok(false, "Parsing this should have failed: " + test_xml);
            },
            onError: function (msg) {
                test.done();
            }
        });
        parser.parseString(test_xml).finish();
    }

});
