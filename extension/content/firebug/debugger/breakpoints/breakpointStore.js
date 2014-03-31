/* See license.txt for terms of usage */

define([
    "firebug/lib/trace",
    "firebug/firebug",
    "firebug/chrome/module",
    "firebug/lib/object",
    "firebug/remoting/debuggerClient",
    "firebug/debugger/breakpoints/breakpoint",
],
function(FBTrace, Firebug, Module, Obj, DebuggerClient, Breakpoint) {

// ********************************************************************************************* //
// Constants

var Cc = Components.classes;
var Ci = Components.interfaces;
var Cu = Components.utils;

var storageScope = {}, StorageService;
Cu.import("resource://firebug/storageService.js", storageScope);
StorageService = storageScope.StorageService;

var BP_NORMAL = 1;
var BP_MONITOR = 2;
var BP_UNTIL = 4;
var BP_ONRELOAD = 8;  // XXXjjb: This is a mark for the UI to test
var BP_ERROR = 16;
var BP_TRACE = 32; // BP used to initiate traceCalls

var Trace = FBTrace.to("DBG_BREAKPOINTSTORE");
var TraceError = FBTrace.toError();

// ********************************************************************************************* //
// Breakpoint Store

/**
 * @Module BreakpointStore module is responsible for breakpoint persistence across Firefox
 * sessions (restarts). This object implements saving and loading of breakpoint records from
 * a JSON file.
 *
 * This object is a singleton and every {@link TabContext} needs to ensure that breakpoints are
 * properly set on the current {@link ThreadClient} (back end).
 */
var BreakpointStore = Obj.extend(Module,
/** @lends BreakpointStore */
{
    dispatchName: "BreakpointStore",

    breakpoints: {},

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Breakpoint Types

    BP_NORMAL: BP_NORMAL,
    BP_MONITOR: BP_MONITOR,
    BP_UNTIL: BP_UNTIL,
    BP_ONRELOAD: BP_ONRELOAD,
    BP_ERROR: BP_ERROR,
    BP_TRACE: BP_TRACE,

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Module

    initialize: function()
    {
        Module.initialize.apply(this, arguments);

        // Restore breakpoints from a file. This should be done only if it's necessary
        // (i.e. when the Debugger tool is actually activated.
        this.storage = StorageService.getStorage("breakpoints.json");
        this.restore();

        Trace.sysout("breakpointStore.initialize; ", this.breakpoints);
    },

    initializeUI: function()
    {
        Module.initializeUI.apply(this, arguments);
    },

    shutdown: function()
    {
        Module.shutdown.apply(this, arguments);

        this.storage = null;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Options

    resetAllOptions: function()
    {
        this.clear();
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Breakpoint Store

    clear: function()
    {
        // xxxHonza: remove also on the server side.
        // xxxsz: The storage needs to be cleared immediately, otherwise different storages
        //   can get in conflict with each other (FBTest lib/storage/storageService.js fails)
        this.storage.clear(true);
        this.breakpoints = {};
    },

    /**
     * Load breakpoints from the associated storage (see initialize).
     */
    restore: function()
    {
        this.breakpoints = {};

        var urls = this.storage.getKeys();
        for (var i = 0; i < urls.length; i++)
        {
            var url = urls[i];
            var bps = this.storage.getItem(url);

            // Do not restore "Run until this line" breakpoints. This should solve complaints
            // about Firebug breaking in the source even if there are no breakpoints in
            // Firebug UI.
            bps = bps.filter(function(element, index, array)
            {
                return (element.type != BP_UNTIL);
            });

            // Convert to Breakpoint object type. This also means that we don't modify
            // directly the stored JSON object.
            bps = bps.map(function(bp)
            {
                var breakpoint = new Breakpoint();

                for (var p in bp)
                    breakpoint[p] = bp[p];

                // Convert to line index (zero-based)
                breakpoint.lineNo = breakpoint.lineNo - 1;

                return breakpoint;
            });

            this.breakpoints[url] = bps;

            // 'params' contains transient data (not persistent).
            for (var j = 0; j < bps.length; j++)
                bps[j].params = {};
        }

        // Remove duplicities (breakpoints with the same URL and line).
        for (var url in this.breakpoints)
        {
            var bps = this.breakpoints[url];

            var map = {};
            var result = [];
            for (var i = 0; i < bps.length; i++)
            {
                var bp = bps[i];
                if (map[bp.lineNo])
                    continue;

                result.push(bp);
                map[bp.lineNo] = bp;
            }

            this.breakpoints[url] = result;
        }
    },

    save: function(url)
    {
        if (!url)
        {
            TraceError.sysout("breakpointStore.save; ERROR no URL", this.storage);
            return;
        }

        var bps = this.getBreakpoints(url);
        if (!bps)
            return;

        var cleanBPs = [];
        for (var i = 0; i < bps.length; i++)
        {
            var bp = bps[i];

            // xxxHonza: what if BP_NORMAL is set too?
            if (bp.type == BP_UNTIL)
                continue;

            var cleanBP = {};

            for (var p in bp)
                cleanBP[p] = bp[p];

            // Convert line indexes (zero-based) to line numbers(one-based). The underlying
            // JSON file uses real line numbers, so it's understandable for the user
            // (if looking into the file).
            cleanBP.lineNo = cleanBP.lineNo + 1;

            // Do not persist 'params' field. It's for transient data only.
            delete cleanBP.params;

            cleanBPs.push(cleanBP);
        }

        // Make sure to remove the item (i.e. URL) from the storage entirely.
        // so there are no empty keys (URLs with no breakpoints). That would
        // cause the breakpoints.json file to grow even if breakpoints are
        // removed.
        if (cleanBPs.length)
            this.storage.setItem(url, cleanBPs);
        else
            this.storage.removeItem(url);

        Trace.sysout("breakpointStore.save;", this.storage);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    addBreakpoint: function(url, lineNo, condition, type)
    {
        type = type || BP_NORMAL;

        Trace.sysout("addBreakpoint; " + url + " (" + lineNo + "), type: " + type);

        if (!url || lineNo == null)
        {
            TraceError.sysout("breakpointStore.addBreakpoint; ERROR invalid arguments " +
                "url: " + url + ", lineNo: " + lineNo + ", type: " + type);
            return;
        }

        // If the conditional editor is opened on a line with no breakpoint a temporary
        // breakpoint must be created. If a condition is eventually created the breakpoint
        // will be kept otherwise removed.
        if (condition != null)
        {
            var bp = new Breakpoint(url, lineNo, false, type);
            bp.condition = condition;

            // We just need to find the actual location of a breakpoint.
            this.dispatch("onAddBreakpoint", [bp]);
            return;
        }

        var bp = this.findBreakpoint(url, lineNo, -1);

        // Bail out if exactly the same breakpoint already exists. This is not an error
        // since the store is shared across all contexts.
        if (bp && (bp.type & type) == type)
            return bp;

        // Either extend an existing breakpoint type (in case there are two different breakpoints
        // at the same line) else create a new breakpoint.
        // Every bit in the |type| property represents one type of a breakpoint. This way
        // the user can create different breakpoints at the same line.
        if (bp)
        {
            bp.type |= type;

            Trace.sysout("breakpointStore.addBreakpoint; EXTEND BP: " + url + " (" +
                lineNo + ")", bp);
        }
        else
        {
            if (!this.breakpoints[url])
                this.breakpoints[url] = [];

            var bp = new Breakpoint(url, lineNo, false, type);
            this.breakpoints[url].push(bp);

            Trace.sysout("breakpointStore.addBreakpoint; NEW BP: " +
                url + " (" + lineNo + ") type: " + type, bp);
        }

        this.save(url);

        // This event is handled by DebuggerTool instances (one tool per context), which
        // are responsible for creating the server side breakpoints.
        // As soon as the breakpoint is (asynchronously) created on the server side and
        // response received, each tool instance fires "onBreakpointAdded" event.
        this.dispatch("onAddBreakpoint", [bp]);

        return bp;
    },

    removeBreakpoint: function(url, lineNo, type)
    {
        var removedBp = this.removeBreakpointInternal(url, lineNo, type)
        if (removedBp)
            this.dispatch("onRemoveBreakpoint", [removedBp]);

        return removedBp;
    },

    // Removes a breakpoint silently (doesn't fire an event). Used by {link @BreakpointTool}.
    removeBreakpointInternal: function(url, lineNo, type)
    {
        type = type || BP_NORMAL;

        Trace.sysout("removeBreakpoint; " + url + " (" + lineNo + "), type: " + type);

        var bps = this.getBreakpoints(url);
        if (!bps)
            return null;

        var removedBp = null;
        for (var i = 0; i < bps.length; i++)
        {
            var bp = bps[i];
            if (bp.lineNo != lineNo)
                continue;

            // If removing the passed type makes the bp.type == zero, there is no
            // other breakpoint type associated and we can remove the breakpoint
            // entirely from the list.
            // Keep the original type in the breakpoint instance since it's passed
            // to listener which can check it.
            if (!(bp.type & ~type))
            {
                bps.splice(i, 1);
            }
            else
            {
                // There are other types yet so, just remove the one passed to this method.
                // xxxHonza: the type is removed and so listeners can't check it (e.g. isError)
                bp.type &= ~type;
            }

            removedBp = bp;
            break;
        }

        if (!removedBp)
        {
            Trace.sysout("breakpointStore.removeBreakpoint; Bail out, no such breakpoint.");
            return;
        }

        this.save(url);

        Trace.sysout("breakpointStore.removeBreakpoint; " + url + " (" + lineNo + ")", removedBp);

        return removedBp;
    },

    /**
     * Removes all breakpoints. The removal is asynchronous since it requires
     * communication with the backend.
     *
     * @param {TabContext} context Context for which breakpoints should be removed. Set to null
     * if all breakpoints (for all contexts) should be removed
     * @param {Function} callback Executed when all breakpoints (for all contexts)
     * are removed.
     */
    removeAllBreakpoints: function(callback)
    {
        var bps = this.getBreakpoints();

        Trace.sysout("breakpointStore.removeAllBreakpoints; (" + bps.length + ")", bps);

        // First clear the local (client) storage.
        this.clear();

        // Individual listeners need to return a promise that is resolved
        // as soon as breakpoints are removed on the backend.
        // When all promises are resolved the callback passed into this method
        // is executed.
        var promises = this.dispatch("onRemoveAllBreakpoints", [bps]);
        Promise.all(promises).then(function()
        {
            if (callback)
                callback();
        });
    },

    findBreakpoint: function(url, lineNo, type)
    {
        type = type || BP_NORMAL;

        var bps = this.getBreakpoints(url);
        if (!bps)
            return null;

        for (var i = 0; i < bps.length; i++)
        {
            var bp = bps[i];
            if (bp.lineNo != lineNo)
                continue;

            if (bp.type & type)
                return bp;
        }

        return null;
    },

    hasAnyBreakpoint : function(url, lineNo)
    {
        var bps = this.getBreakpoints(url);
        if (!bps)
            return false;

        for (var i = 0; i < bps.length; i++)
        {
            var bp = bps[i];
            if (bp.lineNo == lineNo)
                return true;
        }

        return false;
    },

    hasBreakpoint: function(url, lineNo)
    {
        var bp = this.findBreakpoint(url, lineNo);
        return (bp != null);
    },

    enableBreakpoint: function(url, lineNo)
    {
        var bp = this.findBreakpoint(url, lineNo);
        if (!bp || !bp.disabled)
            return;

        bp.disabled = false;

        this.save(url);

        this.dispatch("onEnableBreakpoint", [bp]);
    },

    disableBreakpoint: function(url, lineNo)
    {
        var bp = this.findBreakpoint(url, lineNo);
        if (!bp || bp.disabled)
            return;

        bp.disabled = true;

        this.save(url);

        this.dispatch("onDisableBreakpoint", [bp]);
    },

    setBreakpointCondition: function(url, lineNo, condition)
    {
        var bp = this.findBreakpoint(url, lineNo);
        if (!bp)
            return;

        bp.condition = condition;

        this.save(url);

        this.dispatch("onModifyBreakpoint", [bp]);
    },

    isBreakpointDisabled: function(url, lineNo)
    {
        var bp = this.findBreakpoint(url, lineNo);
        if (!bp)
            return;

        return bp.disabled;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    /**
     * Returns existing breakpoints for give URL.
     *
     * @param {String} url URL for which breakpoints should be returned.
     * @param {Boolean} dynamic If set to true return also dynamic breakpoints that belong
     * to dynamic scripts created by the given URL.
     */
    getBreakpoints: function(url, dynamic)
    {
        Trace.sysout("BreakpointStore.getBreakpoints; url = " + url);

        if (url && !dynamic)
            return this.breakpoints[url] || [];

        var bps = [];
        var urls = this.getBreakpointURLs();

        if (url && dynamic)
        {
            // Get all dynamic URLs for the given parent URL
            urls = urls.filter(function(item, index, array)
            {
                return item.indexOf(url) == 0;
            });
        }

        for (var i = 0; i < urls.length; i++)
            bps.push.apply(bps, this.breakpoints[urls[i]] || []);

        Trace.sysout("BreakpointStore.getBreakpointURLs; bps", bps);
        return bps;
    },

    getBreakpointURLs: function()
    {
        return this.storage.getKeys();
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Enumerators

    enumerateBreakpoints: function(url, dynamic, cb)
    {
        if (url)
        {
            var urlBreakpointsTemp = this.getBreakpoints(url, dynamic);
            if (urlBreakpointsTemp)
            {
                // Clone before iteration (the array can be modified in the callback).
                var urlBreakpoints = [];
                urlBreakpoints.push.apply(urlBreakpoints, urlBreakpointsTemp);

                for (var i=0; i<urlBreakpoints.length; ++i)
                {
                    var bp = urlBreakpoints[i];
                    if (bp.isNormal())
                    {
                        var rc = cb(bp);
                        if (rc)
                            return [bp];
                    }
                }
            }
        }
        else
        {
            var bps = [];
            var urls = this.getBreakpointURLs();
            for (var i = 0; i < urls.length; i++)
                bps.push(this.enumerateBreakpoints(urls[i], dynamic, cb));

            return bps;
        }
    },

    enumerateErrorBreakpoints: function(url, dynamic, callback)
    {
        if (url)
        {
            var urlBreakpoints = this.getBreakpoints(url, dynamic);
            if (urlBreakpoints)
            {
                for (var i=0; i<urlBreakpoints.length; ++i)
                {
                    var bp = urlBreakpoints[i];
                    if (bp.isError())
                        callback(bp);
                }
            }
        }
        else
        {
            for (var url in this.breakpoints)
                this.enumerateBreakpoints(url, callback);
        }
    },

    enumerateMonitors: function(url, dynamic, callback)
    {
        if (url)
        {
            var urlBreakpoints = this.getBreakpoints(url, dynamic);
            if (urlBreakpoints)
            {
                for (var i=0; i<urlBreakpoints.length; ++i)
                {
                    var bp = urlBreakpoints[i];
                    if (bp.type & BP_MONITOR)
                        callback(bp);
                }
            }
        }
        else
        {
            for (var url in this.breakpoints)
                this.enumerateBreakpoints(url, callback);
        }
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    getBreakpointsForContext: function(context)
    {
        var result = [];

        context.enumerateSourceFiles(function(sourceFile)
        {
            var url = sourceFile.getURL();
            var bps = this.getBreakpoints(url);
            result.push.apply(result, bps);
        });

        return result;
    },
});

// ********************************************************************************************* //
// Registration

Firebug.registerModule(BreakpointStore);

return BreakpointStore;

// ********************************************************************************************* //
});
