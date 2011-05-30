//
// ## Enhancements on top of backbone-dirty / node-dirty
//
// * [l.m.orchard](http://lmorchard.com) / 
//   <mailto:lmorchard@pobox.com> / 
//   [@lmorchard](http://twitter.com/lmorchard)
//
var util = require('util'),
    fs = require('fs'),
    sys = require('sys'),
    async = require('async'),
    _ = require('underscore'),
    Backbone = require('backbone'),
    BackboneDirty = require('backbone-dirty');

require('../../class');

// ### Local memory storage sync provider class for Backbone
var DirtySync = exports.DirtySync = Class.extend({

    // #### Initialize
    init: function (options) { 
        this.path = options.path;
    },

    // #### Open any resources needed
    open: function (success, error) { 
        var $this = this;

        // HACK around issue in dirty. Make sure the file exists.
        try { fs.lstatSync(this.path).isFile() }
        catch (e) { fs.writeFileSync(this.path, ""); }

        this.bd = BackboneDirty(this.path);
        var cb = function () { success(null, $this.getSync()); };
        if (global.__backbone_dirty__[this.path].loaded) { 
            cb(); 
        } else { 
            this.bd.dirty.on('load', cb); 
        }
    },

    // #### Close any resources needed
    close: function (success) { 
        global.__backbone_dirty__[this.path]._flush();
        delete global.__backbone_dirty__[this.path];
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
        } else {
            switch (method) {
                case 'create':
                    if (!model.attributes.id) { 
                        model.id = model.attributes.id = this._uid();
                    }
                    if (!model.attributes.created) {
                        model.attributes.created = (new Date()).getTime();
                    }
                case 'update':
                    model.attributes.updated = (new Date()).getTime();
                    break;
            }
            return this.bd.sync(method, model, success, error);
        }
    },

    sync_fetchByFeedUrl: function (model, success, error, options) {
        this.bd.dirty.forEach(function (key, data) {
            if (!data) { return; }
            if (data.feed_url == options.query) {
                options.item(data);
            }
        });
        options.done();
    },

    sync_fetchByClientAddr: function (model, success, error, options) {
        this.bd.dirty.forEach(function (key, data) {
            if (!data) { return; }
            if (data.client_addr == options.query) {
                options.item(data);
            }
        });
        options.done();
    },

    sync_fetchByClientAddrAndFeedUrl: function (model, success, error, options) {
        this.bd.dirty.forEach(function (key, data) {
            if (!data) { return; }
            if (data.client_addr == options.query.client_addr && 
                    data.feed_url == options.query.feed_url) {
                options.item(data);
            }
        });
        options.done();
    },

    sync_fetchOlderThan: function (model, success, error, options) {
        this.bd.dirty.forEach(function (key, data) {
            if (!data) { return; }
            if (data.created < options.query) {
                options.item(data);
            }
        });
        options.done();
    },

    // #### Produce a short unique ID
    _uid: function () {
        return the_id = (Math.floor(Math.random() * 10000000000000) 
            + Date.now()).toString(32)
    }

});
