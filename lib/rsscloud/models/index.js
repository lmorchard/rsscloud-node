/**
 * rssCloud models
 */
var util = require('util'),
    sys = require('sys'),
    _ = require('underscore'),
    Backbone = require('backbone'),
    xml = require('node-xml');

// Generate four random hex digits.
function S4() {
   return (((1+Math.random())*0x10000)|0).toString(16).substring(1);
};

// Generate a pseudo-GUID by concatenating random hexadecimal.
function guid() {
   return (S4()+S4()+"-"+S4()+"-"+S4()+"-"+S4()+"-"+S4()+S4()+S4());
};
exports.guid = guid;

exports.NotificationRequest = Backbone.Model.extend({
    defaults: {
        notify_procedure: 'rssCloud.pleaseNotify',
        port: 5337,
        path: '/RPC2',
        protocol: 'xml-rpc', // 'soap', 'http-post'
        feed_url: null,
        client_ip: null,
        created: null
    },
    initialize: function () {
        this.set({ 'created': (new Date()).getTime() });
    }
});

exports.NotificationRequestCollection = Backbone.Collection.extend({
    model: exports.NotificationRequest,
    url: 'notifications'
});

exports.SavedFeed = Backbone.Model.extend({
    defaults: {
        rsstext: ''
    },
    initialize: function () {
    }
});

exports.SavedFeedCollection = Backbone.Collection.extend({
    model: exports.SavedFeed,
    url: 'savedfeeds'
});

var LocmemSync = exports.LocmemSync = function (method, model, options) {
    var self = arguments.callee;
    if (method in self.handlers) {
        self.handlers[method].call(self, model, options);
    } else {
        self.handlers.default.call(self, method, model, options);
    }
};

LocmemSync.handlers = {
    init: function (model, options) {
        this.store = {};
        options.success(null, this);
    },
    create: function (model, options) {
        if (!model.id) model.id = model.attributes.id = guid();
        var data = model.toJSON();
        this.store[model.id] = data;
        options.success(model, data);
    },
    update: function (model, options) {
        var data = model.toJSON();
        this.store[model.id] = data;
        options.success(model, data);
    },
    delete: function (model, options) {
        var data = model.toJSON();
        delete this.store[model.id];
        options.success(model, data);
    },
    read: function (model_or_collection, options) {
        if ('model' in model_or_collection) {
            options.success(_(this.store).values());
        } else {
            options.success(this.store[model_or_collection.id]);
        }
    },
    default: function (method, model, options) {
        options.error("Unimplemented");
    }
    /*,
    query: function (model, options) {
        util.log("LOCMEM QUERY " + util.inspect({ model: model, options: options }));
    }*/
};
