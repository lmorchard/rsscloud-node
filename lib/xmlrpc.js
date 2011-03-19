//
// ## XML-RPC utilities for node.js
//
// * [l.m.orchard](http://lmorchard.com) / 
//   <mailto:lmorchard@pobox.com> / 
//   [@lmorchard](http://twitter.com/lmorchard)
// 
// This is a quick-and-dirty library to build and parse [XML-RPC][] calls and
// responses. I am thoroughly embarrassed by this code and have stolen
// liberally from others. But, it seems to work and even passes some nodeunit
// tests.
//
// Documentation provided by [docco](http://jashkenas.github.com/docco/)
//
// [XML-RPC]: http://www.xmlrpc.com/spec
//
var util = require('util'),
    sys = require('sys'),
    _ = require('underscore'),
    xml = require('node-xml');

//
// ### XML-RPC method call constructor
//
// Expects a method name and list of parameters:
//
//     var msg = new XMLRPC.Call(
//         'test.echo', 
//         [ "one", "two", "three" ]
//     );
//     var xml = msg.xml();
//
function XMLRPCMessage (methodname, params){
    this.method = methodname || "system.listMethods";
    this.params = params || [];
    return this;
}
XMLRPCCall = XMLRPCMessage;

//
// ### XML-RPC method response constructor
//
// Expects a list of parameters:
//
//     var resp = new XMLRPC.Response(
//         [ "one", "two", "three" ]
//     );
//     var xml = msg.xml();
//
function XMLRPCResponse (params) {
    this.method = false;
    this.is_fault = false;
    this.params = params || [];
}

//
// ### XML-RPC method fault response constructor
//
// Expects a fault code and message string:
//
//     var fault = new XMLRPC.Fault(404, "Method not found");
//     var xml = msg.xml();
//
function XMLRPCFault (fault_code, fault_string) {
    this.method = false;
    this.is_fault = true;
    this.params = [{
        faultString: fault_string,
        faultCode: fault_code
    }];
}

//
// ### XML-RPC message parser
//
// This uses node-xml to parse an XML stream into JS data structures. It is
// very fragile at the moment, and does not check for errors at all. (FIXME)
//
//     var parser = new XMLRPC.SaxParser({
//         onDone: function (data) {
//             // data.method
//             // data.params
//             // data.is_response
//             // data.is_fault
//         },
//         onError: function (msg) {
//             // msg = description of problem
//         }
//     });
//     
//     parser.parseString(test_xml);
//     
function XMLRPCSaxParser(options) {
    this.init(options);
}

XMLRPCSaxParser.prototype = {

    // #### Initialize the parser object
    init: function (options) {
        this.options = options;
        this.parser = new xml.SaxParser(this.buildHandler());
        this.reset();
    },

    // #### Parse a string chunk
    parseString: function (str) {
        this.parser.parseString(str);
    },

    // #### Reset the parser's state
    reset: function () {
        // This is the data parsed out of the XML.
        this.data = { 
            method: false, 
            is_response: false,
            is_fault: false,
            params: [] 
        };
        // Keep track of the stack of open elements
        this.element_stack = [];
        // Keep a stack of CDATA collected for open elements
        this.cdata_stack = [[]];
        // Stack of values kept during the course of constructing structs
        this.value_stack = [];
        // Stack of names kept during the course of constructing structs
        this.name_stack = [];
    },

    // #### Build the handler for use by the node-xml SaxParser
    buildHandler: function () {
        var $this = this;
        return function (cb) {

            // Reset the parser state on document start.
            cb.onStartDocument(function () {
                $this.reset();
            });

            // React to the start of elements, detects responses and faults, as
            // well as initializing a new struct or array in progress.
            cb.onStartElementNS(function(elem, attrs, prefix, uri, namespaces) {
                $this.element_stack.push(elem);
                $this.cdata_stack.push([]);
                switch (elem) {
                    case 'methodCall': break;
                    case 'methodResponse': $this.data.is_response = true; break;
                    case 'fault': $this.data.is_fault = true; break;
                    case 'params': break;
                    case 'param': break;
                    case 'struct': $this.value_stack.push({}); break;
                    case 'array': break;
                    case 'data': $this.value_stack.push([]); break;
                }
            });

            // Collect CDATA if we're in an element
            cb.onCharacters(function(chars) {
                if ($this.cdata_stack.length) {
                    $this.cdata_stack[$this.cdata_stack.length-1].push(chars);
                }
            });

            // React to the end of elements.
            cb.onEndElementNS(function(elem, prefix, uri) {
                var cdata = $this.cdata_stack.pop().join('').trim(),
                    last_elem = $this.element_stack.pop();
                switch (elem) {
                    case 'methodName':
                        $this.data.method = cdata; break;
                    case 'param':
                    case 'fault':
                        $this.data.params.push($this.value_stack.pop()); break;
                    case 'name':
                        $this.name_stack.push(cdata); break;
                    case 'member':
                        var curr_name = $this.name_stack.pop(),
                            curr_value = $this.value_stack.pop();
                        $this.value_stack[$this.value_stack.length-1][curr_name] = curr_value;
                        break;
                    case 'value':
                        if ('data' == $this.element_stack[$this.element_stack.length-1]) {
                            // Nested inside a <data>, so assume an array.
                            var curr_value = $this.value_stack.pop();
                            $this.value_stack[$this.value_stack.length-1].push(curr_value);
                        } else if ('member' == $this.element_stack[$this.element_stack.length-1]) {
                        } else if (cdata.length) {
                            // CDATA outside a type, so assume string.
                            $this.value_stack.push(cdata);
                        }
                        break;
                    case 'string':
                        $this.value_stack.push(cdata); break;
                    case 'i4': 
                    case 'int':
                    case 'double':
                        $this.value_stack.push(cdata); break;
                    case 'boolean':
                        $this.value_stack.push(( 'true' == cdata ) || ( 1 == cdata )); break;
                    case 'dateTime.iso8601':
                        $this.value_stack.push(parseISO8601(cdata)); break;
                    case 'base64':
                        $this.value_stack.push(decodeBase64(cdata)); break;
                }
            });

            // React to end of document by calling the onDone handler supplied
            // in options. 
            // TODO: Find a way to detect incomplete document as error.
            cb.onEndDocument(function () {
                if ($this.options.onDone) { 
                    $this.options.onDone($this.data);
                }
            });

            // React to an error by calling the onError handler supplied in
            // options. 
            // TODO: This doesn't ever seem to get called.
            cb.onError(function(msg) {
                if ($this.options.onError) {
                    $this.options.onError(msg);
                }
            });

        };

    },

    EOF:null

}

// 
// ### XML-RPC message prototype
//
// You know, I should probably just dump this whole object-oriented thing and
// just make the constructors return XML drectly.
//
// Also, building XML with string concatenation makes me feel funny. Maybe do
// some array concatenation here, at least? Any good XML composition libs in
// node?
// 
XMLRPCMessage.prototype = {

    // #### Render XML-RPC message as XML
    xml: function () {
        var method = this.method;
        var xml = "<?xml version=\"1.0\"?>\n";
        if (this.method) {
            xml += "<methodCall>\n";
            xml += "<methodName>" + method+ "</methodName>\n";
        } else {
            xml += "<methodResponse>\n";
        }
        if (!this.is_fault) {
            xml += "<params>\n";
        } else {
            xml += "<fault>\n";
        }
        for (var i = 0; i < this.params.length; i++){
            var data = this.params[i];
            if (!this.is_fault) { xml += "<param>\n"; }
            xml += "<value>" + XMLRPCMessage.getParamXML(data) + "</value>\n";
            if (!this.is_fault) { xml += "</param>\n"; }
        }
        if (!this.is_fault) {
            xml += "</params>\n";
        } else {
            xml += "</fault>\n";
        }
        if (this.method) {
            xml += "</methodCall>";
        } else if (!this.is_fault) {
            xml += "</methodResponse>";
        }
        return xml;
    }

};

// Again, with the object-oriented stuff that I probably shouldn't bother with.
XMLRPCCall.prototype = XMLRPCMessage.prototype;
XMLRPCResponse.prototype = XMLRPCMessage.prototype;
XMLRPCFault.prototype = XMLRPCMessage.prototype;

// Dispatch to generate the XML appropriate for a given data type.
XMLRPCMessage.getParamXML = function(data){
    var xml, type = XMLRPCMessage.dataTypeOf(data);
    switch (type){
        case "date":
            xml = XMLRPCMessage.doDateXML(data); break;
        case "array":
            xml = XMLRPCMessage.doArrayXML(data); break;
        case "struct":
            xml = XMLRPCMessage.doStructXML(data); break;
        case "boolean":
            xml = XMLRPCMessage.doBooleanXML(data); break;
        default:
            xml = XMLRPCMessage.doValueXML(type,data); break;
    }
    return xml;
}

// TODO: This could probably be done better with Underscore.
XMLRPCMessage.dataTypeOf = function (o){
    var type = typeof(o);
    type = type.toLowerCase();
    switch(type){
        case "number":
            if (Math.round(o) == o) type = "i4";
            else type = "double";
            break;
        case "object":
            var con = o.constructor;
            if (con == Date) type = "date";
            else if (con == Array) type = "array";
            else type = "struct";
            break;
    }
    return type;
}

XMLRPCMessage.doValueXML = function(type,data){
    var xml = "<" + type + ">" + data + "</" + type + ">";
    return xml;
}

XMLRPCMessage.doBooleanXML = function(data){
    var value = (data==true)?1:0;
    var xml = "<boolean>" + value + "</boolean>";
    return xml;
}

XMLRPCMessage.doDateXML = function(data){
    var xml = "<dateTime.iso8601>";
    xml += dateToISO8601(data);
    xml += "</dateTime.iso8601>";
    return xml;
}

XMLRPCMessage.doArrayXML = function(data){
    var xml = "<array><data>\n";
    for (var i = 0; i < data.length; i++){
        xml += "<value>" + XMLRPCMessage.getParamXML(data[i]) + "</value>\n";
    }
    xml += "</data></array>\n";
    return xml;
}

XMLRPCMessage.doStructXML = function(data){
    var xml = "<struct>\n";
    for (var i in data){
        xml += "<member>\n";
        xml += "<name>" + i + "</name>\n";
        xml += "<value>" + XMLRPCMessage.getParamXML(data[i]) + "</value>\n";
        xml += "</member>\n";
    }
    xml += "</struct>\n";
    return xml;
}

// 
// ### Decode Base64
//
// Original Idea & Code by <thomas@saltstorm.net>
// from [Soya.Encode.Base64](http://soya.saltstorm.net)
//
function decodeBase64 (sEncoded){
    // Input must be dividable with 4.
    if(!sEncoded || (sEncoded.length % 4) > 0) { return sEncoded; }
    else if(typeof(atob) != 'undefined') { return atob(sEncoded); }

    var nBits, i, sDecoded = '';
    var base64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
    sEncoded = sEncoded.replace(/\W|=/g, '');

    for(i=0; i < sEncoded.length; i += 4){
        nBits =
            (base64.indexOf(sEncoded.charAt(i))   & 0xff) << 18 |
            (base64.indexOf(sEncoded.charAt(i+1)) & 0xff) << 12 |
            (base64.indexOf(sEncoded.charAt(i+2)) & 0xff) <<  6 |
             base64.indexOf(sEncoded.charAt(i+3)) & 0xff;
        sDecoded += String.fromCharCode(
            (nBits & 0xff0000) >> 16, (nBits & 0xff00) >> 8, nBits & 0xff);
    }

    // not sure if the following statement behaves as supposed under
    // all circumstances, but tests up til now says it does.
    return sDecoded.substring(0, sDecoded.length -
        ((sEncoded.charCodeAt(i - 2) == 61) ? 2 :
        (sEncoded.charCodeAt(i - 1) == 61 ? 1 : 0)));
}

// 
// ### Parse an ISO 8601 date
//
// Stolen from <http://delete.me.uk/2005/03/iso8601.html>, but tweaked to
// account for optional hyphens in dates.
//
function parseISO8601 (string) {
    var regexp = "([0-9]{4})(-?([0-9]{2})(-?([0-9]{2})" +
        "(T([0-9]{2}):([0-9]{2})(:([0-9]{2})(\.([0-9]+))?)?" + 
        "(Z|(([-+])([0-9]{2}):([0-9]{2})))?)?)?)?";
        
    var d = string.match(new RegExp(regexp));

    var offset = 0;
    var date = new Date(d[1], 0, 1);

    if (d[3]) { date.setMonth(d[3] - 1); }
    if (d[5]) { date.setDate(d[5]); }
    if (d[7]) { date.setHours(d[7]); }
    if (d[8]) { date.setMinutes(d[8]); }
    if (d[10]) { date.setSeconds(d[10]); }
    if (d[12]) { date.setMilliseconds(Number("0." + d[12]) * 1000); }
    if (d[14]) {
        offset = (Number(d[16]) * 60) + Number(d[17]);
        offset *= ((d[15] == '-') ? 1 : -1);
    }

    offset -= date.getTimezoneOffset();
    time = (Number(date) + (offset * 60 * 1000));
    var d_out = new Date();
    d_out.setTime(Number(time));

    return d_out;
}

// 
// ### Format a date as ISO 8601
//
// Stolen from <http://delete.me.uk/2005/03/iso8601.html>.
//
function dateToISO8601 (date_in, format, offset) {
    /* accepted values for the format [1-6]:
     1 Year:
       YYYY (eg 1997)
     2 Year and month:
       YYYY-MM (eg 1997-07)
     3 Complete date:
       YYYY-MM-DD (eg 1997-07-16)
     4 Complete date plus hours and minutes:
       YYYY-MM-DDThh:mmTZD (eg 1997-07-16T19:20+01:00)
     5 Complete date plus hours, minutes and seconds:
       YYYY-MM-DDThh:mm:ssTZD (eg 1997-07-16T19:20:30+01:00)
     6 Complete date plus hours, minutes, seconds and a decimal
       fraction of a second
       YYYY-MM-DDThh:mm:ss.sTZD (eg 1997-07-16T19:20:30.45+01:00)
    */
    if (!format) { var format = 6; }
    if (!offset) {
        var offset = 'Z';
        var date = date_in;
    } else {
        var d = offset.match(/([-+])([0-9]{2}):([0-9]{2})/);
        var offsetnum = (Number(d[2]) * 60) + Number(d[3]);
        offsetnum *= ((d[1] == '-') ? -1 : 1);
        var date = new Date(Number(Number(date_in) + (offsetnum * 60000)));
    }

    var zeropad = function (num) { return ((num < 10) ? '0' : '') + num; }

    var str = "";
    str += date.getUTCFullYear();
    if (format > 1) { str += "-" + zeropad(date.getUTCMonth() + 1); }
    if (format > 2) { str += "-" + zeropad(date.getUTCDate()); }
    if (format > 3) {
        str += "T" + zeropad(date.getUTCHours()) +
               ":" + zeropad(date.getUTCMinutes());
    }
    if (format > 5) {
        var secs = Number(date.getUTCSeconds() + "." +
                   ((date.getUTCMilliseconds() < 100) ? '0' : '') +
                   zeropad(date.getUTCMilliseconds()));
        str += ":" + zeropad(secs);
    } else if (format > 4) { str += ":" + zeropad(date.getUTCSeconds()); }

    if (format > 3) { str += offset; }
    return str;
}
  
// Pads a single number with a leading zero. Heh.
function leadingZero(n){
  if (n.length==1) n = "0" + n;
  return n;
}

// Kinda wish these were at the top, but here's what the module exports.
// TODO: set the exports as these things are defined along the way.
module.exports = {
    SaxParser: XMLRPCSaxParser,
    Message: XMLRPCMessage,
    Call: XMLRPCCall,
    Response: XMLRPCResponse,
    Fault: XMLRPCFault,
    dateToISO8601: dateToISO8601
};
