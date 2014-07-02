/* See license.txt for terms of usage */

// ********************************************************************************************* //
// Constants

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;
const Cu = Components.utils;

const dirService = Cc["@mozilla.org/file/directory_service;1"].getService(Ci.nsIProperties);

// https://developer.mozilla.org/en/Using_JavaScript_code_modules
var EXPORTED_SYMBOLS = ["Storage", "StorageService", "TextService"];

Cu.import("resource://firebug/fbtrace.js");
Cu.import("resource://gre/modules/FileUtils.jsm");

var wm = Cc["@mozilla.org/appshell/window-mediator;1"].getService(Ci.nsIWindowMediator);

try
{
    Cu["import"]("resource://gre/modules/PrivateBrowsingUtils.jsm");
}
catch (err)
{
}

// ********************************************************************************************* //
// Implementation

// xxxHonza: the entire JSM should be converted into AMD.
// But there could be extensions
// see: https://groups.google.com/d/msg/firebug/C5dlQ2S1e0U/ZJ76nxtUAAMJ

/**
 * http://dev.w3.org/html5/webstorage/#storage-0
 * interface Storage {
 *     readonly attribute unsigned long length;
 *     getter DOMString key(in unsigned long index);
 *     getter any getItem(in DOMString key);
 *     setter creator void setItem(in DOMString key, in any data);
 *     deleter void removeItem(in DOMString key);
 *     void clear();
 * };
 */
function Storage(leafName, win)
{
    this.leafName = leafName;
    this.win = win;

    this.objectTable = {};
}

Storage.prototype =
{
    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Read

    get length()
    {
        return this.key(-1);
    },

    key: function(index)
    {
        var i = 0;
        for (var p in this.objectTable)
        {
            if (i === index)
                return p;
            i++;
        }
        return (index < 0 ? i : null);
    },

    getItem: function(key)
    {
        return this.objectTable[key];
    },

    getKeys: function()
    {
        var keys = [];

        for (var p in this.objectTable)
            if (this.objectTable.hasOwnProperty(p))
                keys.push(p);

        return keys;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Write

    setItem: function(key, data)
    {
        this.objectTable[key] = data;
        StorageService.setStorage(this);
    },

    removeItem: function(key)
    {
        delete this.objectTable[key];
        StorageService.setStorage(this);
    },

    clear: function(now)
    {
        this.objectTable = {};
        StorageService.setStorage(this, now);
    }
};

// ********************************************************************************************* //

/**
 * var store = StorageService.getStorage(leafName);
 * store.setItem("foo", bar);  // writes to disk
 */
var StorageService =
{
    getStorage: function(leafName, win)
    {
        var store = new Storage(leafName, win);

        try
        {
            var obj = ObjectPersister.readObject(leafName);
            if (obj)
                store.objectTable = obj;
        }
        catch (err)
        {
            if (FBTrace.DBG_ERRORS || FBTrace.DBG_STORAGE)
            {
                FBTrace.sysout("StorageService.getStorage; EXCEPTION for " + leafName +
                    ": " + err, err);
            }
        }

        return store;
    },

    setStorage: function(store, now)
    {
        if (!store || !store.leafName || !store.objectTable)
            throw new Error("StorageService.setStorage requires Storage Object argument");

        // xxxHonza: writeNow() doesn't check private browsing mode, which is not safe.
        // But |now| is currently set to true only in clear() method, which works
        // (and should work I guess) even in private browsing mode.
        if (now)
            ObjectPersister.writeNow(store.leafName,  store.objectTable);
        else
            ObjectPersister.writeObject(store.leafName,  store.objectTable, store.win);
    },

    removeStorage: function(leafName)
    {
        ObjectPersister.deleteObject(leafName);
    },

    hasStorage: function(leafName)
    {
        var file = ObjectPersister.getFile(leafName);
        return file.exists();
    }
};

// ********************************************************************************************* //
// Implementation

/**
 * @class Represents an internal Firebug persistence service.
 */
var ObjectPersister =
{
    readObject: function(leafName)
    {
        if (FBTrace.DBG_STORAGE)
            FBTrace.sysout("ObjectPersister read from leafName "+leafName);

        var file = this.getFile(leafName);

        if (!file.exists())
        {
            file.create(Ci.nsIFile.NORMAL_FILE_TYPE, 0666);
            if (FBTrace.DBG_STORAGE)
                FBTrace.sysout("ObjectPersister.readTextFromFile file created " + file.path);
            return;
        }

        var obj = this.readObjectFromFile(file);
        return obj;
    },

    readObjectFromFile: function(file)
    {
        var text = ObjectPersister.readTextFromFile(file);
        if (!text)
            return null;

        var obj = JSON.parse(text);
        if (!obj)
            return;

        if (FBTrace.DBG_STORAGE)
            FBTrace.sysout("PersistedObject loaded from " + file.path+" got text "+text, obj);

        return obj;
    },

    readTextFromFile: function(file)
    {
        try
        {
            var inputStream = Cc["@mozilla.org/network/file-input-stream;1"]
                .createInstance(Ci.nsIFileInputStream);
            var cstream = Cc["@mozilla.org/intl/converter-input-stream;1"]
                .createInstance(Ci.nsIConverterInputStream);

            // Initialize input stream.
            inputStream.init(file, 0x01 | 0x08, 0666, 0); // read, create
            cstream.init(inputStream, "UTF-8", 0, 0);

            // Load  json.
            var json = "";
            var data = {};
            while (cstream.readString(-1, data) != 0)
                json += data.value;

            inputStream.close();

            return json;
        }
        catch (err)
        {
            if (FBTrace.DBG_ERRORS || FBTrace.DBG_STORAGE)
                FBTrace.sysout("ObjectPersister.initialize; EXCEPTION", err);
        }
    },

    getFile: function(leafName)
    {
        return FileUtils.getFile("ProfD", ["firebug", leafName]);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    // Batch the writes for each event loop
    writeDelay: 250,

    writeObject: function(leafName, obj, win)
    {
        if (this.isPrivateBrowsing(win))
            return;

        // xxxHonza: see https://code.google.com/p/fbug/issues/detail?id=7561#c8
        //throw new Error("No storage is written while in private browsing mode");

        if (ObjectPersister.flushTimeout)
            return;

        ObjectPersister.flushTimeout = Cc["@mozilla.org/timer;1"].createInstance(Ci.nsITimer);

        var writeOnTimeout = ObjectPersister.getWriteOnTimeout(leafName, obj);
        ObjectPersister.flushTimeout.init(writeOnTimeout, ObjectPersister.writeDelay,
            Ci.nsITimer.TYPE_ONE_SHOT);
    },

    getWriteOnTimeout: function(leafName, obj)
    {
        var writerClosure =
        {
            leafName: leafName,
            obj: obj,
            observe: function(timer, topic, data)
            {
                ObjectPersister.writeNow(writerClosure.leafName, writerClosure.obj);
                delete ObjectPersister.flushTimeout;
            }
        };
        return writerClosure;
    },

    writeNow: function(leafName, obj)
    {
        try
        {
            // Convert data to JSON.
            var jsonString = JSON.stringify(obj);
            var file = this.getFile(leafName);
            ObjectPersister.writeTextToFile(file, jsonString);
        }
        catch(exc)
        {
            if (FBTrace.DBG_ERRORS || FBTrace.DBG_STORAGE)
                FBTrace.sysout("ObjectPersister.writeNow; EXCEPTION for " + leafName + ": " +
                    exc, {exception: exc, obj: obj});
        }
    },

    writeTextToFile: function(file, string)
    {
        try
        {
            // Initialize output stream.
            var outputStream = Cc["@mozilla.org/network/file-output-stream;1"]
                .createInstance(Ci.nsIFileOutputStream);
            outputStream.init(file, 0x02 | 0x08 | 0x20, 0666, 0); // write, create, truncate

            // Store JSON
            outputStream.write(string, string.length);
            outputStream.close();

            if (FBTrace.DBG_STORAGE)
                FBTrace.sysout("ObjectPersister.writeNow to " + file.path, string);

            return file.path;
        }
        catch (err)
        {
            if (FBTrace.DBG_ERRORS || FBTrace.DBG_STORAGE)
                FBTrace.sysout("ObjectPersister.writeTextToFile; EXCEPTION for " + file.path +
                    ": "+err, {exception: err, string: string});
        }
    },

    deleteObject: function(leafName)
    {
        var file = this.getFile(leafName);
        return file.remove(false);
    },

    // xxxHonza: this entire method is duplicated from firebug/lib/privacy module
    // As soon as this JSM is AMD we should just use firebug/lib/privacy.
    isPrivateBrowsing: function(win)
    {
        try
        {
            // If |win| is null, the top most window is used to figure out
            // whether the private mode is on or off.
            if (!win)
                win = wm.getMostRecentWindow("navigator:browser");
        }
        catch (e)
        {
            if (FBTrace.DBG_ERRORS)
                FBTrace.sysout("storageService.isPrivateBrowsing; EXCEPTION " + e, e);
        }

        try
        {
            // Get firebugFrame.xul and check privaate mode (it's the same as
            // for the top parent window).
            if (typeof PrivateBrowsingUtils != "undefined")
                return PrivateBrowsingUtils.isWindowPrivate(win);
        }
        catch (e)
        {
        }

        try
        {
            // Unfortunatelly the "firebug/chrome/privacy" module can't be used
            // since this scope is JavaScript code module.
            // xxxHonza: storageService should be converted into AMD (but it's used
            // in firebug-service.js, which is also JS code module).
            // firebug-service.js is gone in JSD2 branch
            var pbs = Components.classes["@mozilla.org/privatebrowsing;1"]
                .getService(Components.interfaces.nsIPrivateBrowsingService);
            return pbs.privateBrowsingEnabled;
        }
        catch (e)
        {
        }

        return false;
    }
};

// ********************************************************************************************* //

var TextService =
{
    readText: ObjectPersister.readTextFromFile,
    writeText: ObjectPersister.writeTextToFile
};

// ********************************************************************************************* //
