/* See license.txt for terms of usage */

define([
    "firebug/lib/trace",
    "firebug/firebug",
    "firebug/lib/object",
    "firebug/remoting/debuggerClientModule",
],
function(FBTrace, Firebug, Obj, DebuggerClientModule) {

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

// ********************************************************************************************* //
// Breakpoint Store

var BreakpointStore = Obj.extend(Firebug.Module,
{
    dispatchName: "BreakpointStore",
    breakpoints: {},

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Module

    initialize: function()
    {
        Firebug.Module.initialize.apply(this, arguments);

        DebuggerClientModule.addListener(this);

        // Restore breakpoints from a file. This should be done only if it's necessary
        // (i.e. when the Debugger tool is actually activated.
        this.storage = StorageService.getStorage("breakpoints.json");
        this.restore();

        FBTrace.sysout("breakpointStore.initialize; ", this.breakpoints);
    },

    shutdown: function()
    {
        Firebug.Module.destroy.apply(this, arguments);

        DebuggerClientModule.removeListener(this);

        this.storage = null;
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

        // Set breakpoints on the server side.
        var tool = context.getTool("debugger");
        tool.setBreakpoints(context, bps, function()
        {
            FBTrace.sysout("breakpointStore.onThreadAttached; Server side breakpoints " +
                "initialized", bps);
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

            // Do not persist 'params' field. It's for transient data only.
            delete cleanBP.params;

            cleanBPs.push(cleanBP);
        }

        this.storage.setItem(url, cleanBPs);

        FBTrace.sysout("breakpointStore.save;", this.storage);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    addBreakpoint: function(url, lineNo)
    {
        if (this.findBreakpoint(url, lineNo))
        {
            if (FBTrace.DBG_ERRORS)
                FBTrace.sysout("breakpointStore.addBreakpoint; ERROR There is alread a bp");
            return;
        }

        if (!this.breakpoints[url])
            this.breakpoints[url] = [];

        var bp = {
            href: url,
            lineNo: lineNo,
            type: BP_NORMAL,
            disabled: false,
            hitCount: -1,
            hit: 0,
            params: {},
        };

        this.breakpoints[url].push(bp);
        this.save(url);

        FBTrace.sysout("breakpointStore.addBreakpoint; " + url + " (" + lineNo + ")", bp);

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

        FBTrace.sysout("breakpointStore.removeBreakpoint; " + url +
            " (" + lineNo + ")", removedBp);

        this.dispatch("onBreakpointRemoved", [removedBp]);

        return removedBp;
    },

    findBreakpoint: function(url, lineNo)
    {
        var bps = this.getBreakpoints(url);
        if (!bps)
            return null;

        // xxxHonza: Objects in the store are not instances of Breakpoint object.
        for (var i=0; i<bps.length; i++)
        {
            var bp = bps[i];
            if (bp.lineNo === lineNo)
                return bp;
        }

        return null;
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
                        var rc = cb.call.apply(bp, [url, bp.lineNo, bp]);
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
