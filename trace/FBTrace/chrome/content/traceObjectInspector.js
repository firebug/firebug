/* See license.txt for terms of usage */

// ********************************************************************************************* //
// Firebug Trace Inspector

/**
 * A trace inspector is intended to iterate entire Firebug data structure and look
 * for specific references. Can be useful for tracking down memory leaks.
 */
var TraceObjectInspector =
{
    inspect: function()
    {
        var browser = this.getFirebugBrowser();
        var win = this.getCurrentPage(browser);

        FBTrace.sysout("traceObjectInspector; Inspection started");
        FBTrace.time("INSPECTING_TIME");

        // Iterate entire Firebug structure.
        this.refs = [];
        this.mark(win, browser.Firebug, function(obj, path)
        {
            if (!(obj instanceof win.Window || obj instanceof win.Document ||
                obj instanceof win.Element))
            {
                return;
            }

            var info = path;
            if (obj.dispatchName)
                path += " (" + obj.dispatchName + ")";

            if (obj instanceof win.Window)
                path += ", " + FBL.safeGetWindowLocation(obj);

            if (obj instanceof win.Document)
                path += ", " + obj.location;

            if (obj instanceof win.Element)
                path += ", " + obj.localName;

            this.refs.push(path);
        });

        FBTrace.timeEnd("INSPECTING_TIME");
        FBTrace.sysout("traceObjectInspector; Inspection finished (" + this.refs.length +
            ")", this.refs);
    },

    mark: function(win, root, callback)
    {
        var iter = new ObjectIterator();
        iter.iterate(win, root, "firebug", "firebug", function(obj, path)
        {
            callback.apply(TraceObjectInspector, [obj, path]);

            // Continue with children
            return true;
        });
    },

    getFirebugBrowser: function()
    {
        // Select the first browser window by default.
        var firebugWin;
        FBL.iterateBrowserWindows("navigator:browser", function(win)
        {
            firebugWin = win;
            return true
        });

        return firebugWin;
    },

    getCurrentPage: function(topWin)
    {
        var browser = topWin.getBrowser();
        return browser.mCurrentTab.linkedBrowser._contentWindow;
    },
};

// ********************************************************************************************* //
// Object Iterator

/**
 * Recursively iterates all children objects.
 */
function ObjectIterator()
{
    this.visited = [];
}

ObjectIterator.prototype =
/** @lends ObjectIterator */
{
    /**
     * Recursive iteration over all children of given object
     * @param {Object} obj The object to iterate
     * @param {String} path helper path for logging.
     * @param {Function} callback Callback function executed for each object.
     */
    iterate: function(win, obj, name, path, callback)
    {
        if (!callback.apply(this, [obj, path]))
            return;

        // Ignore built-in objects
        if (FBL.isDOMMember(obj, name) || FBL.isDOMConstant(obj, name))
            return;

        if (obj instanceof win.Window ||
            obj instanceof win.Document ||
            obj instanceof win.Comment ||
            obj instanceof win.CDATASection ||
            obj instanceof win.Text ||
            obj instanceof win.DocumentType ||
            obj instanceof Ci.nsISupports ||
            obj instanceof win.Element)
        {
            return;
        }

        if (obj == null)
            return;

        var names = Object.keys(obj);
        for (var i=0; i<names.length; i++)
        {
            var name = names[i];

            try
            {
                var child = obj[name];

                // Ignore memory-profiler helper fields
                if (this.isVisited(child))
                    continue;

                this.visited.push(child);

                // Recursion
                if (typeof(child) === "object" || typeof(child) === "function")
                    this.iterate(win, child, name, path + "." + name, callback);
            }
            catch (exc)
            {
                FBTrace.sysout("traceObjectInspector; iteration fails on " + path +
                    "." + name, exc);
            }
        }
    },

    isVisited: function(obj)
    {
        for (var i=0; i<this.visited.length; i++)
        {
            if (this.visited[i] === obj)
                return true;
        }
        return false;
    }
};

// ********************************************************************************************* //
