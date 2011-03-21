//
// ## rssCloud models
//
// * [l.m.orchard](http://lmorchard.com) / 
//   <mailto:lmorchard@pobox.com> / 
//   [@lmorchard](http://twitter.com/lmorchard)
//
var util = require('util'),
    sys = require('sys'),
    _ = require('underscore'),
    Backbone = require('backbone'),
    xml = require('node-xml');

require('class');

// ### Notification request model
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
    initialize: function (attributes, options) {
        if (!attributes.created) {
            this.set({ 'created': (new Date()).getTime() });
        }
    }
});

// ### Notification request collection
exports.NotificationRequestCollection = Backbone.Collection.extend({

    url: 'notifications',

    model: exports.NotificationRequest,

    _collectFetch: function (method, query, item_cb, done_cb) {
        var $this = this;
        $this.sync(method, $this.model, { 
            query: query, 
            item: function (data) {
                var item = new $this.model(data);
                $this.add(item);
                item_cb(item);
            }, 
            done: done_cb 
        });
    },

    fetchByFeedUrl: function (query, item_cb, done_cb) {
        this._collectFetch('fetchByFeedUrl', query, item_cb, done_cb);
    },

    fetchByClientIp: function (query, item_cb, done_cb) {
        this._collectFetch('fetchByClientIp', query, item_cb, done_cb);
    },

    fetchOlderThan: function (query, item_cb, done_cb) {
        query = query || (new Date()).time();
        this._collectFetch('fetchOlderThan', query, item_cb, done_cb);
    }

});

exports.SavedFeed = Backbone.Model.extend({
    defaults: {
        rsstext: ''
    },
    initialize: function () {
    }
});

exports.SavedFeedCollection = Backbone.Collection.extend({
    url: 'savedfeeds'
    model: exports.SavedFeed,
});
