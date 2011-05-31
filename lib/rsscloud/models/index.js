//
// ## rssCloud models
//
// * [l.m.orchard](http://lmorchard.com) / 
//   <mailto:lmorchard@pobox.com> / 
//   [@lmorchard](http://twitter.com/lmorchard)
//
var util = require('util'),
    sys = require('sys'),
    crypto = require('crypto'),
    _ = require('underscore'),
    Backbone = require('backbone'),
    xml = require('node-xml');

require('../class');

exports.Sync = {
    DirtySync:  require('./sync/dirty').DirtySync,
    LocmemSync: require('./sync/locmem').LocmemSync
};

// ### Notification request model
exports.NotificationRequest = Backbone.Model.extend({
    defaults: {
        notify_procedure: 'rssCloud.pleaseNotify',
        port: 5337,
        path: '/RPC2',
        protocol: 'xml-rpc', // 'soap', 'http-post'
        feed_url: null,
        client_addr: null,
        needs_challenge: false,
        
        ct_updates: 0,
        when_last_update: null,
        ct_errors: 0,
        ct_consecutive_errors: 0,
        when_last_error: null,
        when_expires: null,

        created: null,
        modified: null
    },
    initialize: function (attributes, options) {
        if (!attributes.created) {
            this.set({ 
                'created': (new Date()).getTime(),
                'modified': (new Date()).getTime() 
            });
        }
    },
    save: function (attributes, options) {
        this.set({
            'modified': (new Date()).getTime() 
        });
        Backbone.Model.prototype.save.call(this, attributes, options);
    },
    // #### Produce a short unique ID
    hash: function (data) {
        var $this = this;
        data = data || $this.toJSON();
        var md5 = crypto.createHash('md5');
        md5.update(
            _([ 'feed_url', 'client_addr', 'port', 'path', 'protocol',
                'notify_procedure', 'needs_challenge' ])
            .map(function (name) { return data[name]; } )
            .join("\0")
        )
        var hash = md5.digest('hex');
        return hash;
    }
});

// ### Notification request collection
exports.NotificationRequestCollection = Backbone.Collection.extend({

    url: 'notifications',

    model: exports.NotificationRequest,

    _collectFetch: function (method, query, item_cb, done_cb) {
        var $this = this;
        (Backbone.sync || $this.sync)(method, $this.model, null, null, { 
            query: query, 
            item: function (data) {
                var item = new $this.model(data);
                $this.add(item);
                item_cb(item);
            }, 
            done: done_cb 
        });
    },

    getOrCreate: function (data, options) {
        var $this = this;
        options.collection = $this;
        options.data = data;
        (Backbone.sync || $this.sync)(
            'getOrCreate', $this.model,
            function (stat) {
                stat.instance = new $this.model(stat.data);
                $this.add(stat.instance, { silent: !stat.created });
                options.success(stat);
            },
            options.error, options
        );
    },

    fetchByFeedUrl: function (query, item_cb, done_cb) {
        this._collectFetch('fetchByFeedUrl', query, item_cb, done_cb);
    },

    fetchByClientAddr: function (query, item_cb, done_cb) {
        this._collectFetch('fetchByClientAddr', query, item_cb, done_cb);
    },

    fetchByClientAddrAndFeedUrl: function (query, item_cb, done_cb) {
        this._collectFetch('fetchByClientAddrAndFeedUrl', query, item_cb, done_cb);
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
    url: 'savedfeeds',
    model: exports.SavedFeed
});
