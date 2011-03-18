/**
 * XMLRPC utilities for node.js
 *
 * I am wholly embarrassed by this code, but it's working.
 */
var util = require('util'),
    sys = require('sys'),
    _ = require('underscore'),
    async = require('async'),
    connect = require('connect'), 
    express = require('express'),
    xml = require('node-xml');

function XMLRPCMessage(methodname, params){
  this.method = methodname||"system.listMethods";
  this.params = params||[]; //LMO
  return this;
}

XMLRPCMessage.prototype = {

    xml: function () {

      var method = this.method;
      
      // assemble the XML message header
      var xml = "";
      
      xml += "<?xml version=\"1.0\"?>\n";

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
      
      // do individual parameters
      for (var i = 0; i < this.params.length; i++){
        var data = this.params[i];
        if (!this.is_fault) { xml += "<param>\n"; }

        xml += "<value>" + XMLRPCMessage.getParamXML(XMLRPCMessage.dataTypeOf(data),data) + "</value>\n";
        
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
      
      return xml; // for now
  
   }

};

XMLRPCMessage.dataTypeOf = function (o){
  // identifies the data type
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
    xml += "<value>" + XMLRPCMessage.getParamXML(XMLRPCMessage.dataTypeOf(data[i]),data[i]) + "</value>\n";
  }
  xml += "</data></array>\n";
  return xml;
}

XMLRPCMessage.doStructXML = function(data){
  var xml = "<struct>\n";
  for (var i in data){
    xml += "<member>\n";
    xml += "<name>" + i + "</name>\n";
    xml += "<value>" + XMLRPCMessage.getParamXML(XMLRPCMessage.dataTypeOf(data[i]),data[i]) + "</value>\n";
    xml += "</member>\n";
  }
  xml += "</struct>\n";
  return xml;
}

XMLRPCMessage.getParamXML = function(type,data){
  var xml;
  switch (type){
    case "date":
      xml = XMLRPCMessage.doDateXML(data);
      break;
    case "array":
      xml = XMLRPCMessage.doArrayXML(data);
      break;
    case "struct":
      xml = XMLRPCMessage.doStructXML(data);
      break;
	  case "boolean":
      xml = XMLRPCMessage.doBooleanXML(data);
      break;
    default:
      xml = XMLRPCMessage.doValueXML(type,data);
      break;
  }
  return xml;
}

/** http://delete.me.uk/2005/03/iso8601.html */
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
  
function leadingZero(n){
  // pads a single number with a leading zero. Heh.
  if (n.length==1) n = "0" + n;
  return n;
}

function XMLRPCCall (methodname, params) {
    this.method = methodname || "system.listMethods";
    this.params = params || [];
}
XMLRPCCall.prototype = XMLRPCMessage.prototype;

function XMLRPCResponse (params) {
    this.method = false;
    this.is_fault = false;
    this.params = params || [];
}
XMLRPCResponse.prototype = XMLRPCMessage.prototype;

function XMLRPCFault (fault_code, fault_string) {
    this.method = false;
    this.is_fault = true;
    this.params = [{
        faultString: fault_string,
        faultCode: fault_code
    }];
}
XMLRPCFault.prototype = XMLRPCMessage.prototype;



function XMLRPCSaxParser(options) {
    this.init(options);
}
XMLRPCSaxParser.prototype = {

    /** Initialize the parser object */
    init: function (options) {
        this.options = options;
        this.parser = new xml.SaxParser(this.buildHandler());
        this.reset();
    },

    /** Parse a string chunk */
    parseString: function (str) {
        this.parser.parseString(str);
    },

    reset: function () {
        this.data = { 
            method: false, 
            is_response: false,
            is_fault: false,
            params: [] 
        };
        this.stack = [];
        this.flags = {};
        this.element_stack = [];
        this.cdata_stack = [[]];
        this.value_stack = [];
        this.name_stack = [];
    },

    buildHandler: function () {
        var $this = this;

        return function (cb) {

            cb.onStartDocument(function () {
                $this.reset();
            });

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

            cb.onCharacters(function(chars) {
                if ($this.cdata_stack.length) {
                    // Collect characters only if we're in an element
                    $this.cdata_stack[$this.cdata_stack.length-1].push(chars);
                }
            });

            cb.onEndElementNS(function(elem, prefix, uri) {
                var cdata = $this.cdata_stack.pop().join('').trim(),
                    last_elem = $this.element_stack.pop();
                switch (elem) {
                    case 'methodName':
                        $this.data.method = cdata; break;
                    case 'param':
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
                        $this.value_stack.push(new Date(cdata)); break;
                    case 'base64':
                        $this.value_stack.push($this.decodeBase64(cdata)); break;
                }
            });

            cb.onEndDocument(function () {
                if ($this.options.onDone) { 
                    $this.options.onDone($this.data);
                }
            });

            cb.onError(function(msg) {
                if ($this.options.onError) {
                    $this.options.onError(msg);
                }
            });

        };

    },

    /*** Decode Base64 ******
     * Original Idea & Code by thomas@saltstorm.net
     * from Soya.Encode.Base64 [http://soya.saltstorm.net]
     **/
    decodeBase64 : function(sEncoded){
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
    },

    EOF:null

}

module.exports = {
    SaxParser: XMLRPCSaxParser,
    Message: XMLRPCMessage,
    Call: XMLRPCCall,
    Response: XMLRPCResponse,
    Fault: XMLRPCFault,
    dateToISO8601: dateToISO8601
};
