/* See license.txt for terms of usage */

define([
    "firebug/lib/trace",
    "firebug/firebug",
    "firebug/lib/object",
    "firebug/remoting/debuggerClientModule",
    "firebug/debugger/breakpoints/breakpoint",
],
function(FBTrace, Firebug, Obj, DebuggerClientModule, Breakpoint) {

// ********************************************************************************************* //
// Constants

var Cc = Components.classes;
var Ci = Components.interfaces;
var Cu = Components.utils;

Cu["import"]("resource://firebug/storageService.js");

var BP_NORMAL = 1;
var BP_MONITOR = 2;
var BP_UNTIL = 4;
var BP_ONRELOAD = 8;  // XXXjjb: This is a mark for the UI to test
var BP_ERROR = 16;
var BP_TRACE = 32; // BP used to initiate traceCalls

var Trace = FBTrace.to("DBG_BREAKPOINTSTORE");
var TraceError = FBTrace.to("DBG_ERRORS");

// ********************************************************************************************* //
// Breakpoint Store

/**
 * @Module BreakpointStore module is responsible for saving and loading breakpoints
 * on the client side.
 *
 * TODO:
 * 1) Methods should expect zero-based line numbers so, it's consistent across
 *    Firebug framework. The line numbers should be auto-converted into one-based
 *    when stored into breakpoints.json so, the file contains numbers expected
 *    by the user.
 */
var BreakpointStore = Obj.extend(Firebug.Module,
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
        Firebug.Module.initialize.apply(this, arguments);

        // Restore breakpoints from a file. This should be done only if it's necessary
        // (i.e. when the Debugger tool is actually activated.
        this.storage = StorageService.getStorage("breakpoints.json");
        this.restore();

        Trace.sysout("breakpointStore.initialize; ", this.breakpoints);
    },

    initializeUI: function()
    {
        Firebug.Module.initializeUI.apply(this, arguments);

        // BreakpointStore object must be registered as a {@DebuggerClientModule} listener
        // after {@DebuggerTool} otherwise breakpoint initialization doesn't work
        // (it would be done before requesting scripts).
        // This is why we do it here, in initializeUI.
        // xxxHonza: is there any other way how to ensure that DebuggerTool listener
        // is registered first?
        DebuggerClientModule.addListener(this);
    },

    shutdown: function()
    {
        Firebug.Module.shutdown.apply(this, arguments);

        DebuggerClientModule.removeListener(this);

        this.storage = null;
    },

    resetAllOptions: function()
    {
        // xxxHonza: remove also on the server side.
        this.storage.clear();
        this.breakpoints = {};
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // DebuggerClientModule Events

    onThreadAttached: function(context, reload)
    {
        // Ignore page reloads.
        if (reload)
            return;

        // Get all breakpoints
        // xxxHonza: do we have to send all the breakpoints to the server?
        // Could we optimize this somehow?
        var bps = this.getBreakpoints();

        // Filter out disabled breakpoints. These won't be set on the server side
        // (unless the user enables them later).
        // xxxHonza: we shouldn't create server-side breakpoints for normal disabled
        // breakpoints, but not in case there are other breakpoints at the same line.
        /*bps = bps.filter(function(bp, index, array)
        {
            return bp.isEnabled();
        });*/

        Trace.sysout("breakpointStore.onThreadAttached; Initialize server " +
            "side breakpoints", bps);

        // Set breakpoints on the server side. The initialization is done by the breakpoint
        // store since the Script panel doesn't have to exist at this point. Also, other
        // panels can also deal with breakpoints (BON) and so, a panel doesn't seem to be
        // the right center place, where the perform the initialization.
        var tool = context.getTool("breakpoint");
        tool.setBreakpoints(bps, function()
        {
            // Some breakpoint could have been auto-corrected so, save all now.
            self.save();
        });
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Breakpoint Store

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

            // Convert to Breakpoint object type
            bps = bps.map(function(bp)
            {
                var breakpoint = new Breakpoint();

                // Convert to line index (zero-based)
                bp.lineNo = bp.lineNo - 1;
                for (var p in bp)
                    breakpoint[p] = bp[p];
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

            // Convert line indexes (zero-based) to line numbers(one-based)
            cleanBP.lineNo = cleanBP.lineNo + 1;

            // Do not persist 'params' field. It's for transient data only.
            delete cleanBP.params;

            cleanBPs.push(cleanBP);
        }

        this.storage.setItem(url, cleanBPs);

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

            // We just need to find the actual location of bp.
            this.dispatch("onAddBreakpoint", [bp]);
            return;
        }

        var bp = this.findBreakpoint(url, lineNo, -1);

        // Bail out if exactly the same breakpoint already exists. This is not an error
        // since the store is shared across all contexts.
        if (bp && (bp.type & type == bp.type))
            return bp;

        // Either extend an existing breakpoint type (in case there are two different bps
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

    // Removes a breakpoint silently (doesn't fire an event). Used by {@BreakpointTool}.
    removeBreakpointInternal: function(url, lineNo, type)
    {
        type = type || BP_NORMAL;

        Trace.sysout("removeBreakpoint; " + url + " (" + lineNo + "), type: " + type);

        var bps = this.getBreakpoints(url);
        if (!bps)
            return null;

        var removedBp = null;
        for (var i=0; i<bps.length; i++)
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

    findBreakpoint: function(url, lineNo, type)
    {
        type = type || BP_NORMAL;

        var bps = this.getBreakpoints(url);
        if (!bps)
            return null;

        for (var i=0; i<bps.length; i++)
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

        for (var i=0; i<bps.length; i++)
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

    getBreakpoints: function(url)
    {
        if (url)
            return this.breakpoints[url] || [];

        var bps = [];
        var urls = this.getBreakpointURLs();
        for (var i=0; i<urls.length; i++)
            bps.push.apply(bps, this.breakpoints[urls[i]] || []);

        return bps;
    },

    getBreakpointURLs: function()
    {
        return this.storage.getKeys();
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Enumerators

    enumerateBreakpoints: function(url, cb)
    {
        if (url)
        {
            var urlBreakpointsTemp = this.getBreakpoints(url);
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
            for (var i=0; i<urls.length; i++)
                bps.push(this.enumerateBreakpoints(urls[i], cb));

            return bps;
        }
    },

    enumerateErrorBreakpoints: function(url, callback)
    {
        if (url)
        {
            var urlBreakpoints = this.getBreakpoints(url);
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
            for (var url in breakpoints)
                this.enumerateBreakpoints(url, callback);
        }
    },

    enumerateMonitors: function(url, callback)
    {
        if (url)
        {
            var urlBreakpoints = this.getBreakpoints(url);
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
            for (var url in breakpoints)
                this.enumerateBreakpoints(url, callback);
        }
    }
});

// ********************************************************************************************* //
// Registration

Firebug.registerModule(BreakpointStore);

return BreakpointStore;

// ********************************************************************************************* //
});
