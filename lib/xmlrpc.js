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
// Documentation extracted from comments via [docco](http://jashkenas.github.com/docco/)
//
// [XML-RPC]: http://www.xmlrpc.com/spec
//
var util = require('util'),
    sys = require('sys'),
    _ = require('underscore'),
    xml = require('node-xml');

//
// ### XML-RPC middleware
// 
// Intended for a server created by express, parses a call from the 
// request body.
//
//     var server = express.createServer();
// 
//     server.configure(function () {
//         server.use(express.methodOverride());
//         server.use(XMLRPC.Middleware);
//         server.use(server.router)
//     });
//
//     server.listen(8080);
//
function XMLRPCMiddleware (req, res, next) {
    var raw = [];
    var parser = new XMLRPCSaxParser({
        onDone: function (data) { 
            req.body_XMLRPC = data; next(); 
        }, 
        onError: function (msg) { 
            req.body_XMLRPC = false; next(); 
        }
    });
    
    // If there's raw body data, try parsing that instead of hooking up events.
    if (req.rawBody) { 
        return parser.parseString(req.rawBody).finish();
        // next();
    }

    // No raw body data, so hook up events to parse.
    req.setEncoding('utf8');
    req.on('data', function(chunk) { 
        util.log("WANG");
        raw.push(chunk);
        parser.parseString(chunk);
    });
    req.on('end', function(){
        util.log("WANG END");
        req.rawBody = raw.join('');
        parser.finish();
    });

}

//
// ### XML-RPC dispatch router handler
//
// Constructs a route handler for an express server which dispatches XML-RPC
// requests to handlers. The return value from a handler is transformed into an
// XML-RPC response and sent.
//
//     server.post('/RPC2', XMLRPC.DispatchHandler({
//         echo: function (success, fault, message) {
//             success("Echo: " + message);
//             // fault(
//         },
//     }));
//
// For common fault codes, see also:
// <http://xmlrpc-epi.sourceforge.net/specs/rfc.fault_codes.php>
// 
function XMLRPCDispatchHandler (handlers, self) {
    return function (req, res) {
        var params = req.body_XMLRPC.params,
            method = req.body_XMLRPC.method;
        var cb = function (err, rv) {
            if (!err) {
                res.send(new XMLRPCResponse([rv]).xml());
            } else {
                res.send(new XMLRPCFault(err.code||0, err.message||err).xml());
            }
        };
        if (handlers.hasOwnProperty(method)) {
            try {
                // TODO: Handle package.module method names as dereferencing objects?
                handlers[method].apply(
                    self||handlers, [cb].concat(params)
                );
            } catch (e) {
                cb({code:-32500, message:"Unexpected exception " + e});
            }
        } else {
            cb({code:-32601, message:"requested method '"+method+"' not found"});
        }
    }
}

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
// ### XML-RPC response constructor
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
// ### XML-RPC fault response constructor
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
// ### XML-RPC message parser constructor
//
// This uses node-xml to parse an XML stream into JS data structures.
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
// The parser is fairly liberal, by way of laziness. Premature end of input is
// watched for, but no attempt is made to validate the actual structure of the
// XML. 
//
// As long as elements are arranged in something roughly close to the proper
// format, this parser should come up with *something*.
//     
function XMLRPCSaxParser(options) {
    this.init(options);
}

// ### XML-RPC message parser
XMLRPCSaxParser.prototype = {

    // #### Initialize the parser object
    init: function (options) {
        // No options, so far, but maybe someday.
        this.options = options;
        // Using SaxParser from [node-xml](https://github.com/robrighter/node-xml)
        this.parser = new xml.SaxParser(this.buildHandler());
        // This is the data parsed out of the XML.
        this.data = { 
            method: false, 
            is_response: false,
            is_fault: false,
            params: [] 
        };
        // Flag whether available input has finished.
        this.finished = false;
        // Flag whether parsing has completed successfully
        this.complete = false;
        // Flag whether the current value being parsed ends up being an implicit string.
        this.is_implicit_string = false;
        // Keep track of the stack of open elements
        this.element_stack = [];
        // Keep a stack of CDATA collected for open elements
        this.cdata_stack = [[]];
        // Stack of values kept during the course of constructing structs
        this.value_stack = [];
        // Stack of names kept during the course of constructing structs
        this.name_stack = [];
    },

    // #### Parse a string chunk
    parseString: function (str) {
        // Just proxy to the SaxParser method. 
        // TODO: Maybe someday implement a parseFile?
        this.parser.parseString(str);
        return this;
    },

    // #### Signal a finish to parsing
    finish: function () {
        var $this = this;

        // The flag `this.finished` serves to debounce this function, which
        // could be called multiple times: eg, in response to the successful
        // completion of a document or the end of input (possibly premature).
        if ($this.finished) { return $this; }
        $this.finished = true;

        // XML parsing is all async, so this needs to be as well.
        setTimeout(function () {
            if ($this.complete) {
                $this.options.onDone($this.data);
            } else {
                // Would an error code be better than an english message here?
                $this.options.onError('End of input reached before document complete');
            }
        }, 0);

        return this;
    },

    // #### Build the handler for use by the node-xml SaxParser
    buildHandler: function () {
        var $this = this;

        return function (cb) {

            cb.onStartDocument(function () {
                // No response to document start, since parser state was
                // established in the constructor. Of course, this means
                // parsers are not reusable.
            });

            // React to the start of elements, detects responses and faults, as
            // well as initializing a new struct or array in progress.
            cb.onStartElementNS(function(elem, attrs, prefix, uri, namespaces) {
                // Push the current element name onto the stack, along with a
                // collector for CDATA.
                $this.element_stack.push(elem);
                $this.cdata_stack.push([]);
                switch (elem) {
                    // Detect a methodResponse.
                    case 'methodResponse': $this.data.is_response = true; break;
                    // Detect a response that's a fault.
                    case 'fault': $this.data.is_fault = true; break;
                    // Push an empty object onto the stack to collect members
                    case 'struct': $this.value_stack.push({}); break;
                    // Push an empty array onto the stack to collect values
                    case 'array': $this.value_stack.push([]); break;
                    // Assume an implicit string, to begin with.
                    case 'value': $this.is_implicit_string = true; break;
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
                    // The end of a call or response means a successful end of parsing, 
                    case 'methodCall':
                    case 'methodResponse':
                        $this.complete = true;
                        $this.finish();
                        break;
                    // Record the method name from CDATA, when encountered.
                    case 'methodName':
                        $this.data.method = cdata; break;
                    // The end of a param element or a fault means the current
                    // value on the stack is complete.
                    case 'param':
                    case 'fault':
                        $this.data.params.push($this.value_stack.pop()); break;
                    // Push this member name onto the stack for safekeeping
                    // until a value comes along.
                    case 'name':
                        $this.name_stack.push(cdata); break;
                    // The end of a member is where we pick up the last
                    // encountered name and value and stick the pair into the
                    // current struct under construction
                    case 'member':
                        var curr_name = $this.name_stack.pop(),
                            curr_value = $this.value_stack.pop();
                        $this.value_stack[$this.value_stack.length-1][curr_name] = curr_value;
                        break;
                    // Explicit string, i4, int, and double values are treated the same. 
                    // TODO: Should these be parsed more strictly?
                    // TODO: Lots of repetition here, feels icky.
                    case 'string':
                    case 'i4': 
                    case 'int':
                    case 'double':
                        $this.is_implicit_string = false;
                        $this.value_stack.push(cdata); break;
                    // Parse a boolean into the JS equivalent.
                    case 'boolean':
                        $this.is_implicit_string = false;
                        $this.value_stack.push(( 'true' == cdata ) || ( 1 == cdata )); break;
                    // Parse a date from its ISO 8601 representation.
                    case 'dateTime.iso8601':
                        $this.is_implicit_string = false;
                        $this.value_stack.push(parseISO8601(cdata)); break;
                    // Decode a base64 into its binary form.
                    case 'base64':
                        $this.is_implicit_string = false;
                        $this.value_stack.push(decodeBase64(cdata)); break;
                    // The end of a value can mean the end of an implicit
                    // string and also the end of an array item.
                    case 'value':
                        if ($this.is_implicit_string) {
                            // No type element found within the value element,
                            // so assume an implicit string.
                            $this.value_stack.push(cdata);
                        }
                        if ('data' == $this.element_stack[$this.element_stack.length-1]) {
                            // Nested inside a data element, so assume an array.
                            var curr_value = $this.value_stack.pop();
                            $this.value_stack[$this.value_stack.length-1].push(curr_value);
                        } 
                        break;
                }
            });

            // React to end of document by calling the onDone handler 
            cb.onEndDocument(function () {
                $this.finish();
            });

            // React to an error by calling the onError handler 
            cb.onError(function (msg) {
                $this.options.onError(msg);
            });

        };

    },

    EOF:null

}

// 
// ### XML-RPC message prototype
//
// I should probably just dump this whole object-oriented thing and just make
// the constructors return XML drectly.
//
// Also, building XML with string concatenation makes me feel funny. Maybe do
// some array concatenation here, at least? Any good XML composition libs in
// node?
// 
XMLRPCMessage.prototype = {

    // #### Render XML-RPC message as XML
    // Based on [work by Scott Andrew LePera](http://www.scottandrew.com/xml-rpc), 
    // back in 2001. Though derivative, I'll probably replace the whole lot eventually.
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
        } else {
            xml += "</methodResponse>";
        }
        return xml;
    }

};

// Again, with the object-oriented stuff that works but is kind of icky.
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

// ### Module exports
// Kinda wish these were at the top, but here's what the module exports.
// TODO: set the exports as these things are defined along the way.
module.exports = {
    Middleware: XMLRPCMiddleware,
    DispatchHandler: XMLRPCDispatchHandler,
    SaxParser: XMLRPCSaxParser,
    Message: XMLRPCMessage,
    Call: XMLRPCCall,
    Response: XMLRPCResponse,
    Fault: XMLRPCFault,
    dateToISO8601: dateToISO8601
};
