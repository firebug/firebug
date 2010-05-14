/* See license.txt for terms of usage */

// ************************************************************************************************
// Constants

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;

// https://developer.mozilla.org/en/Using_JavaScript_code_modules
var EXPORTED_SYMBOLS = ["Storage", "StorageService"];

/*
 * http://dev.w3.org/html5/webstorage/#storage-0
 * interface Storage {
  readonly attribute unsigned long length;
  getter DOMString key(in unsigned long index);
  getter any getItem(in DOMString key);
  setter creator void setItem(in DOMString key, in any data);
  deleter void removeItem(in DOMString key);
  void clear();
};
 */


function Storage(leafName)
{
    this.leafName = leafName;
    this.objectTable = {};
}

Storage.prototype =
{
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

    clear: function()
    {
        this.objectTable = {};
        StorageService.setStorage(this);
    },

};

/*
 * var store = StorageService.getStorage(leafName);
 * store.setItem("foo", bar);  // writes to disk
 */

var StorageService =
{
    getStorage: function(leafName)
    {
        var store = new Storage(leafName);

        var obj = ObjectPersister.readObject(leafName);
        if (obj)
            store.objectTable = obj;

        return store;
    },

    setStorage: function(store)
    {
        if (!store || !store.leafName || !store.objectTable)
            throw new Error("StorageService.setStorage requires Storage Object argument");

        ObjectPersister.writeObject(store.leafName,  store.objectTable);
    },

    removeStorage: function(leafName)
    {
        ObjectPersister.deleteObject(leafname);
    },
};

//***************** IMPLEMENTATION ********************************************************

const dirService = Cc["@mozilla.org/file/directory_service;1"].getService(Ci.nsIProperties);

var FBTrace = null;

/**
 * @class Represents an internal Firebug persistence service.
 *
 */
var ObjectPersister =
{
    getFileByName: function(leafName)
    {
        // Get persistence file stored within the profile directory.
        var file = dirService.get("ProfD", Ci.nsIFile);
        file.append("firebug");
        file.append(leafName);
        if (FBTrace.DBG_STORAGE)
            FBTrace.sysout("ObjectPersister getFileByName("+leafName+")="+file.path);

        return file;
    },

    readObject: function(leafName)
    {
        FBTrace = Cc["@joehewitt.com/firebug-trace-service;1"]
            .getService(Ci.nsISupports).wrappedJSObject.getTracer("extensions.firebug");

        if (FBTrace.DBG_STORAGE)
            FBTrace.sysout("ObjectPersister read");

        var file = ObjectPersister.getFileByName(leafName);

        var obj = this.readObjectFromFile(file);
        return obj;
    },

    readObjectFromFile: function(file)
    {
        try
        {
            if (!file.exists())
            {
                file.create(Ci.nsIFile.NORMAL_FILE_TYPE, 0666);
                if (FBTrace.DBG_STORAGE)
                    FBTrace.sysout("ObjectPersister.readObjectFromFile file created " + file.path);
                return;
            }

            var inputStream = Cc["@mozilla.org/network/file-input-stream;1"]
                .createInstance(Ci.nsIFileInputStream);
            var cstream = Cc["@mozilla.org/intl/converter-input-stream;1"]
                .createInstance(Ci.nsIConverterInputStream);

            // Initialize input stream.
            inputStream.init(file, 0x01 | 0x08, 0666, 0); // read, create
            cstream.init(inputStream, "UTF-8", 0, 0);

            // Load  json.
            var data = {};
            cstream.readString(-1, data);
            inputStream.close();
            if (!data.value.length)
                return;

            var nativeJSON = Cc["@mozilla.org/dom/json;1"].createInstance(Ci.nsIJSON);
            var obj = nativeJSON.decode(data.value);
            if (!obj)
                return;

            if (FBTrace.DBG_STORAGE)
                FBTrace.sysout("PersistedObject loaded from " + file.path, obj);

            return obj;
        }
        catch (err)
        {
            if (FBTrace.DBG_ERRORS || FBTrace.DBG_STORAGE)
                FBTrace.sysout("ObjectPersister.initialize; EXCEPTION", err);
        }
    },

    // Batch the writes for each event loop
    writeDelay: 250,

    writeObject: function(leafName, obj)
    {
        if (ObjectPersister.flushTimeout)
            return;

        ObjectPersister.flushTimeout = Cc["@mozilla.org/timer;1"].createInstance(Ci.nsITimer);

        var writeOnTimeout = ObjectPersister.getWriteOnTimeout(leafName, obj);
        ObjectPersister.flushTimeout.init(writeOnTimeout, ObjectPersister.writeDelay, Ci.nsITimer.TYPE_ONE_SHOT);
    },

    getWriteOnTimeout: function(leafName, obj)
    {
        let writerClosure =
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
            var file = ObjectPersister.getFileByName(leafName);

            // Initialize output stream.
            var outputStream = Cc["@mozilla.org/network/file-output-stream;1"]
                .createInstance(Ci.nsIFileOutputStream);
            outputStream.init(file, 0x02 | 0x08 | 0x20, 0666, 0); // write, create, truncate

            // Convert data to JSON.
            var jsonString = JSON.stringify(obj);

            // Store JSON
            outputStream.write(jsonString, jsonString.length);
            outputStream.close();

            if (FBTrace.DBG_STORAGE)
                FBTrace.sysout("ObjectPersister.writeNow to " +
                    file.path, jsonString);
        }
        catch (err)
        {
            if (FBTrace.DBG_ERRORS || FBTrace.DBG_STORAGE)
                FBTrace.sysout("ObjectPersister.flush; EXCEPTION for "+leafName+": "+err, {exception: err, object: obj, jsonString: jsonString});
        }
    },

};
//THE FOLLOWING THREE FUNCTIONS ARE MODIFIED FUNCTIONS FROM http://www.json.org/json2.js
var myJSON = {
stringify : function(value, replacer, space)
{
    var i;
    var gap = '';
    var indent = '';

    if (typeof space === 'number') {
        for (i = 0; i < space; i += 1) {
            indent += ' ';
        }
    } else if (typeof space === 'string') {
        indent = space;
    }

    if (replacer && typeof replacer !== 'function' &&
            (typeof replacer !== 'object' ||
             typeof replacer.length !== 'number')) {
        throw new Error('JSON.stringify');
    }

    var seen = new Array(25);

    return this.str('', {'': value}, replacer, gap, indent, seen);
},

quote : function (string) {
    var escapable = /[\\\"\x00-\x1f\x7f-\x9f\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g,
        meta = {    // table of character substitutions
        '\b': '\\b',
        '\t': '\\t',
        '\n': '\\n',
        '\f': '\\f',
        '\r': '\\r',
        '"' : '\\"',
        '\\': '\\\\'
        };

    escapable.lastIndex = 0;
    return escapable.test(string) ?
        '"' + string.replace(escapable, function (a) {
            var c = meta[a];
            return typeof c === 'string' ? c :
                '\\u' + ('0000' + a.charCodeAt(0).toString(16)).slice(-4);
        }) + '"' :
        '"' + string + '"';
},

depth: 0,      // call depth
str : function (key, holder, rep, gap, indent, seen) {
    this.depth++;
    FBTrace.sysout("str depth "+this.depth+' key '+key, holder);
    if (key === "scriptsWithBreakpoint")
    	return "FAILED";
    if (this.depth > 2000)
    	debugger;
    var rc = this.strTrue(key, holder, rep, gap, indent, seen);
    this.depth--;
    return rc;
},

strTrue : function (key, holder, rep, gap, indent, seen) {
    var i,          // The loop counter.
        k,          // The member key.
        v,          // The member value.
        length,
        mind = gap,
        partial,
        thomas,
        value = holder[key];

    if (value && typeof value === 'object' &&
            typeof value.toJSON === 'function') {
        value = value.toJSON(key);
    }

    if (typeof rep === 'function') {
        value = rep.call(holder, key, value);
    }

    switch (typeof value) {
    case 'string':
        return this.quote(value);

    case 'number':
        return isFinite(value) ? String(value) : 'null';

    case 'boolean':
    case 'null':
        return String(value);

    case 'object':

        if (!value) {
            return 'null';
        }

        if (seen.indexOf(value)!= -1)
            return '*** Cycle detected, ending here ***';

        seen.push(value);

        gap += indent;
        partial = [];

        if (Object.prototype.toString.apply(value) === '[object Array]') {
            length = value.length;
            for (i = 0; i < length; i += 1) {
                partial[i] = this.str(i, value, rep, gap, indent, seen.slice(0)) || 'null';
            }

            v = partial.length === 0 ? '[]' :
                gap ? '[\n' + gap +
                        partial.join(',\n' + gap) + '\n' +
                            mind + ']' :
                      '[' + partial.join(',') + ']';
            gap = mind;
            return v;
        }

        if (rep && typeof rep === 'object') {
            length = rep.length;
            for (i = 0; i < length; i += 1) {
                k = rep[i];
                if (typeof k === 'string') {
                    v = this.str(k, value, rep, gap, indent, seen.slice(0));
                    if (v) {
                        partial.push(this.quote(k) + (gap ? ': ' : ':') + v);
                    }
                }
            }
        } else {

            for (k in value) {
                if (Object.hasOwnProperty.call(value, k)) {
                    v = this.str(k, value, rep, gap, indent, seen.slice(0));
                    if (v) {
                        partial.push(this.quote(k) + (gap ? ': ' : ':') + v);
                    }
                }
            }
        }
        v = partial.length === 0 ? '{}' :
            gap ? '{\n' + gap + partial.join(',\n' + gap) + '\n' +
                    mind + '}' : '{' + partial.join(',') + '}';
        gap = mind;
        return v;
    }
}
}
