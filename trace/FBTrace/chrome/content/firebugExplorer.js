/* See license.txt for terms of usage */

define([], function() {

// ********************************************************************************************* //
// Constants 

// ********************************************************************************************* //
// Explorer Implementation

TraceConsole.FirebugExplorer =
{
    dump: function()
    {
        var firebugWindow;
        FBL.iterateBrowserWindows("navigator:browser", function(win)
        {
            if (win.Firebug)
            {
                firebugWindow = win;
                return true;
            }
        });

        var contentView = FBL.getContentView(firebugWindow);
        if (!contentView)
        {
            FBTrace.sysout("No Browser with Firebug found!");
            return;
        }

        var messageInfo = {
            obj: this.getObjects(contentView.Firebug),
            type: "firebug-explorer",
            scope: null,
            time: (new Date()).getTime()
        };

        var message = new Firebug.TraceModule.TraceMessage(
            messageInfo.type, "Firebug Explorer", messageInfo.obj, messageInfo.scope,
            messageInfo.time);

        Firebug.TraceModule.dump(message, TraceConsole);

        this.cleanUp(contentView.Firebug);
    },

    getObjects: function(root)
    {
        function insert(root, path, value)
        {
            var steps = path.split(".");
            for (var p in steps)
            {
                var label = steps[p];
                var branch = root[label];
                if (!branch)
                    branch = root[label] = {};
                root = branch;
            }
        }

        var result = {};
        var results = [];
        var iter = new FirebugIterator();
        iter.iterate(root, "Firebug", function(obj, path)
        {
            if (obj.hasOwnProperty("__explored"))
                return false;

            if (FirebugReps.Arr.isArray(obj))
                obj.__explored = obj.length;
            else
                obj.__explored = true;

            var value = "";
            try {
                value = (obj.toString ? obj.toString() : "")
            } catch (e) {}

            insert(result, path, value);

            //results.push(path);
            return true;
        });

        return result;
    },

    cleanUp: function(root)
    {
        var iter = new FirebugIterator();
        iter.iterate(root, "Firebug", function(obj, path)
        {
            if (!obj.hasOwnProperty("__explored"))
                return false;

            delete obj.__explored;

            return true;
        });
    }
}

// ********************************************************************************************* //
// Object Iterator

/**
 * Recursively iterates all children objects.
 */
function FirebugIterator()
{
}

FirebugIterator.prototype =
/** @lends FirebugIterator */
{
    /**
     * Recursive iteration over all children of given object
     * @param {Object} obj The object to iterate
     * @param {String} path helper path for logging.
     * @param {Function} callback Callback function executed for each object.
     */
    iterate: function(obj, path, callback)
    {
        if (!callback.apply(this, [obj, path]))
            return;

        if (typeof(obj) !== "object")
            return;

        var names = Object.keys(obj);
        for (var i=0; i<names.length; i++)
        {
            var name = names[i];
            var child = obj[name];

            // Ignore built-in objects
            if (FBL.isDOMMember(obj, name) || FBL.isDOMConstant(obj, name))
                continue;

            if (name == "__explored" || name == "prototype" ||
                name == "__proto__" || name == "window" || name == "tabBrowser")
                continue;

            if (typeof(child) == "function")
                continue;

            try
            {
                this.iterate(child, path + "." + name, callback);
            }
            catch (exc)
            {
                FBTrace.sysout("iterate EXCEPTION " + path + "." + name, exc);
                break;
            }
        }
    },
};

// ********************************************************************************************* //

return TraceConsole.FirebugExplorer;

// ********************************************************************************************* //
});
