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

// xxxHonza: create shared space for breakpoint constants.
const BP_NORMAL = 1;
const BP_MONITOR = 2;
const BP_UNTIL = 4;
const BP_ONRELOAD = 8;  // XXXjjb: This is a mark for the UI to test
const BP_ERROR = 16;
const BP_TRACE = 32; // BP used to initiate traceCalls

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
        bps = bps.filter(function(bp, index, array)
        {
            return bp.isEnabled();
        });

        Trace.sysout("breakpointStore.onThreadAttached; Initialize server " +
            "side breakpoints", bps);

        // Set breakpoints on the server side. The initialization is done by the breakpoint
        // store since the Script panel doesn't have to exist at this point. Also, other
        // panels can also deal with breakpoints (BON) and so, a panel doesn't seem to be
        // the right center place, where the perform the initialization.
        var tool = context.getTool("debugger");
        tool.setBreakpoints(context, bps, function(response, bpClient)
        {
            // TODO: any async UI update or logging here?
        });
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Breakpoint Store

    restore: function()
    {
        this.breakpoints = {};

        var urls = this.storage.getKeys();
        for (var i=0; i<urls.length; i++)
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

            // Convert to Breakpoint type
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

            // 'params' contains data, which are not persisted.
            for (var j=0; j<bps.length; j++)
                bps[j].params = {};
        }
    },

    save: function(url)
    {
        var bps = this.getBreakpoints(url);
        if (!bps)
            return;

        var cleanBPs = [];
        for (var i=0; i<bps.length; i++)
        {
            var bp = bps[i];

            if (bp.type == BP_UNTIL)
                continue;

            var cleanBP = {};
            
            for (var p in bp)
                cleanBP[p] = bp[p];

            // Convert line indexes(zero-based) to line numbers(one-based)
            cleanBP.lineNo = cleanBP.lineNo + 1;

            // Do not persist 'params' field. It's for transient data only.
            delete cleanBP.params;

            cleanBPs.push(cleanBP);
        }

        this.storage.setItem(url, cleanBPs);

        Trace.sysout("breakpointStore.save;", this.storage);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    addBreakpoint: function(url, lineNo)
    {
        if (!url || !lineNo)
        {
            TraceError.sysout("breakpointStore.addBreakpoint; ERROR invalid arguments " +
                "url: " + url + ", lineNo: " + lineNo);
            return;
        }

        if (this.findBreakpoint(url, lineNo))
        {
            TraceError.sysout("breakpointStore.addBreakpoint; ERROR There is already a bp");
            return;
        }

        if (!this.breakpoints[url])
            this.breakpoints[url] = [];

        var bp = new Breakpoint(url, lineNo, false);
        this.breakpoints[url].push(bp);
        this.save(url);

        Trace.sysout("breakpointStore.addBreakpoint; " + url + " (" + lineNo + ")", bp);

        this.dispatch("onBreakpointAdded", [bp]);

        return bp;
    },

    removeBreakpoint: function(url, lineNo)
    {
        var bps = this.getBreakpoints(url);
        if (!bps)
            return null;

        var removedBp = null;
        for (var i=0; i<bps.length; i++)
        {
            var bp = bps[i];
            if (bp.lineNo === lineNo)
            {
                bps.splice(i, 1);
                removedBp = bp;
            }
        }

        if (!removedBp)
            return;

        this.save(url);

        Trace.sysout("breakpointStore.removeBreakpoint; " + url +
            " (" + lineNo + ")", removedBp);

        this.dispatch("onBreakpointRemoved", [removedBp]);

        return removedBp;
    },

    findBreakpoint: function(url, lineNo)
    {
        var bps = this.getBreakpoints(url);
        if (!bps)
            return null;

        for (var i=0; i<bps.length; i++)
        {
            var bp = bps[i];
            if (bp.lineNo === lineNo)
                return bp;
        }

        return null;
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

        this.dispatch("onBreakpointEnabled", [bp]);
    },

    disableBreakpoint: function(url, lineNo)
    {
        var bp = this.findBreakpoint(url, lineNo);
        if (!bp || bp.disabled)
            return;

        bp.disabled = true;

        this.save(url);

        this.dispatch("onBreakpointDisabled", [bp]);
    },

    setBreakpointCondition: function(url, lineNo, condition)
    {
        var bp = this.findBreakpoint(url, lineNo);
        if (!bp)
            return;

        bp.condition = condition;

        this.save(url);

        this.dispatch("onBreakpointModified", [bp]);
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
                    if (bp.type & BP_NORMAL && !(bp.type & BP_ERROR))
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

    enumerateErrorBreakpoints: function()
    {
    },

    enumerateMonitors: function()
    {
    }
});

// ********************************************************************************************* //
// Registration

Firebug.registerModule(BreakpointStore);

return BreakpointStore;

// ********************************************************************************************* //
});
