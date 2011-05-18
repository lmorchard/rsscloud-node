//
// ## Local memory sync backend for Backbone
//
// * [l.m.orchard](http://lmorchard.com) / 
//   <mailto:lmorchard@pobox.com> / 
//   [@lmorchard](http://twitter.com/lmorchard)
//
var util = require('util'),
    sys = require('sys'),
    async = require('async'),
    _ = require('underscore'),
    Alfred = require('alfred'),
    Backbone = require('backbone');

require('../../class');

// ### Local memory storage sync provider class for Backbone
var LocmemSync = exports.LocmemSync = Class.extend({

    // #### Initialize
    init: function (options) { 
        this.store = {}; 
    },

    // #### Open any resources needed
    open: function (success, error) { 
        success(null, this.getSync()); 
    },

    // #### Close any resources needed
    close: function (success) { 
        success(); 
    },

    // #### Build a sync function for Backbone
    getSync: function () { 
        return _.bind(this.sync, this); 
    },

    // #### Sync funciton dispatcher
    sync: function (method, model, success, error, options) {

        // Allow dispatch to methods on the object, if found.
        if ('function' == typeof (this['sync_'+method])) {
            return this['sync_'+method](model, success, error, options);
        }

        var data = ('model' in model) ? null : model.toJSON();
        switch (method) {
            case 'create':
                if (!model.id) { 
                    data.id = model.id = model.attributes.id = this._uid();
                }
                if (!data.created) {
                    data.created = model.created = model.attributes.created = 
                        (new Date()).getTime();
                }
            case 'update':
                this.store[model.id] = data;
                return success(model, data);
            case 'delete':
                delete this.store[model.id];
                return success(model, data);
            case 'read':
                if ('model' in model) {
                    return success(_(this.store).values());
                } else {
                    return success(this.store[model.id]);
                }
            default:
                return error("Unimplemented");
        };

    },

    sync_fetchByFeedUrl: function (model, success, error, options) {
        var result = [];
        _(this.store).each(function (data, key) {
            if (data.feed_url == options.query) {
                options.item(data);
            }
        });
        options.done();
    },

    sync_fetchByClientAddr: function (model, success, error, options) {
        var result = [];
        _(this.store).each(function (data, key) {
            if (data.client_addr == options.query) {
                options.item(data);
            }
        });
        options.done();
    },

    sync_fetchByClientAddrAndFeedUrl: function (model, success, error, options) {
        var result = [];
        _(this.store).each(function (data, key) {
            if (data.client_addr == options.query.client_addr && 
                    data.feed_url == options.query.feed_url) {
                options.item(data);
            }
        });
        options.done();
    },

    sync_fetchOlderThan: function (model, success, error, options) {
        var result = [];
        _(this.store).each(function (data, key) {
            if (data.created < options.query) {
                options.item(data);
            }
        });
        options.done();
    },

    // #### Produce a short unique ID
    _uid: function () {
        return (Math.floor(Math.random() * 100000000000000000) 
            + Date.now()).toString(32)
    }

});
