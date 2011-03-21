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

require('class');

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
    sync: function (method, model, options) {

        // Allow dispatch to methods on the object, if found.
        if ('function' == typeof (this['sync_'+method])) {
            return this['sync_'+method](model, options);
        }

        var data = ('model' in model) ? null : model.toJSON();
        switch (method) {
            case 'create':
                if (!model.id) { 
                    data.id = model.id = model.attributes.id = this._uid();
                }
            case 'update':
                this.store[model.id] = data;
                return options.success(model, data);
            case 'delete':
                delete this.store[model.id];
                return options.success(model, data);
            case 'read':
                if ('model' in model) {
                    return options.success(_(this.store).values());
                } else {
                    return options.success(this.store[model.id]);
                }
            default:
                return options.error("Unimplemented");
        };

    },

    sync_fetchByFeedUrl: function (model, options) {
        var result = [];
        _(this.store).each(function (data, key) {
            if (data.feed_url == options.query) {
                options.item(data);
            }
        });
        options.done();
    },

    sync_fetchByClientIp: function (model, options) {
        var result = [];
        _(this.store).each(function (data, key) {
            if (data.client_ip == options.query) {
                options.item(data);
            }
        });
        options.done();
    },

    sync_fetchOlderThan: function (model, options) {
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
