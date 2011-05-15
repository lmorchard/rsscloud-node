//
// ## Alfred sync backend for Backbone
//
// * [l.m.orchard](http://lmorchard.com) / 
//   <mailto:lmorchard@pobox.com> / 
//   [@lmorchard](http://twitter.com/lmorchard)
//
// Not currently generic or abstract by any means, but it could be with a
// little more work.
//
var util = require('util'),
    sys = require('sys'),
    async = require('async'),
    _ = require('underscore'),
    Alfred = require('alfred'),
    Backbone = require('backbone');

require('class');

// ### Alfred storage sync provider class for Backbone
var AlfredSync = exports.AlfredSync = Class.extend({
    
    // #### Initialize the sync backend
    init: function (options) {
        this.path = options.path;
    },

    // #### Open the sync backend databases
    open: function (success, error) {
        var $this = this;
        Alfred.open($this.path, function (err, db) {
            if (err) { return error(err); }
            $this.db = db;
            $this._setupDatabase(success, error);
        });
    },

    // #### Close the sync backend databases
    close: function (callback) {
        this.db.close(callback);
    },

    // #### Return a Backbone sync function
    //
    // Basically just a utility to bind this.sync.
    getSync: function () {
        return _.bind(this.sync, this);
    },

    // #### Backbone sync provider function
    sync: function (method, model, options) {
        
        // Allow dispatch to methods on the object, if found.
        if ('function' == typeof (this['sync_'+method])) {
            return this['sync_'+method](model, options);
        }

        var $this = this;
        var key = this._getCollectionKey(model);
        // Only grab JSON for models, not collections.
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
                $this.db[key].put(model.id, data, function (err) {
                    if (err) { options.error(err); }
                    else { options.success(model, data); }
                });
                break;
            case 'delete':
                $this.db[key].destroy(model.id, function (err) {
                    if (err) { options.error(err); }
                    else { options.success(model, data); }
                });
                break;
            case 'read':
                if ('model' in model) {
                    // This "model" is actually a collection.
                    var items = [];
                    $this.db[key].scan(
                        function (err, key, data) {
                            if (!key) { return options.success(items); }
                            if (!data) { return; }
                            items.push(data);
                        }, true
                    );
                } else {
                    // This is an individual model.
                    $this.db[key].get(model.id, function (err, data) {
                        if (err) { options.error(err); }
                        else { options.success(data); }
                    });
                }
                break;
            default:
                return options.error("Unimplemented");
        };
    },

    sync_fetchByFeedUrl: function (model, options) {
        var s = this.db.notifications.find({
            feed_url: { $eq: options.query }
        }).stream();
        s.on('record', function (key, data) {
            options.item(data); 
        });
        s.on('end', options.done);
    },

    sync_fetchByClientAddr: function (model, options) {
        var s = this.db.notifications.find({
            client_addr: { $eq: options.query }
        }).stream();
        s.on('record', function (key, data) {
            options.item(data); 
        });
        s.on('end', options.done);
    },

    sync_fetchByClientAddrAndFeedUrl: function (model, options) {
        var s = this.db.notifications.find({
            feed_url: { $eq: options.query.feed_url },
            client_addr: { $eq: options.query.client_addr }
        }).stream();
        s.on('record', function (key, data) {
            options.item(data); 
        });
        s.on('end', options.done);
    },

    sync_fetchOlderThan: function (model, options) {
        var s = this.db.notifications.find({
            created: { $lt: options.query }
        }).stream();
        s.on('record', function (key, data) {
            options.item(data); 
        });
        s.on('end', options.done);
    },

    // #### Set up the Alfred database
    //
    // This initializes the key-maps and any necessary indexes.
    _setupDatabase: function (success, error) {
        var $this = this;
        // TODO: Can this be made generic / abstract given a set of backbone models?
        async.parallel([
            function (p_cb) {
                // Set up the notifications keymap
                $this.db.ensure('notifications', function (err, km) {
                    async.forEach(
                        [ 'created', 'feed_url', 'client_addr' ],
                        function (key, fe_cb) {
                            // HACK: Feels icky, but Alfred stringifies index
                            // transform functions and destroys closures.
                            var fn = new Function('i', 'return i.'+key);
                            $this.db.notifications.ensureIndex(key, {}, fn, fe_cb);
                        }, 
                        p_cb
                    );
                });
            }
            // TODO: Set up the savedfeeds keymap
        ], function (err, results) { 
            if (err) { error(err); }
            else { success(null, $this.getSync()); }
        });
    },

    // #### Generate a short alphanumeric UID.
    _uid: function () {
        return (Math.floor(Math.random() * 100000000000000000) + Date.now()).toString(32)
    },

    // #### Derive a key-map name from a collection or model.
    //
    // Given a model or a collection, attempt to come up with an Alfred key-map
    // name, based on the collection's URL.
    _getCollectionKey: function (model) {
        var collection = null;
        if ('collection' in model) {
            collection = model.collection;
        } else if ('attributes' in model && 'collection' in model.attributes) {
            collection = model.attributes.collection;
        } else if ('url' in model) {
            collection = model;
        }
        return collection ? collection.url : null;
    }

});
