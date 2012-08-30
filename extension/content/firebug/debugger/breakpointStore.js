/* See license.txt for terms of usage */

define([
    "firebug/lib/trace",
    "firebug/firebug",
    "firebug/lib/object",
],
function(FBTrace, Firebug, Obj) {

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

        // Restore breakpoints from a file. This should be done only if it's necessary
        // (i.e. when the Debugger tool is actually activated.
        this.storage = StorageService.getStorage("breakpoints.json");
        this.restore();

        FBTrace.sysout("breakpointStore.initialize; ", this.breakpoints);
    },

    shutdown: function()
    {
        Firebug.Module.destroy.apply(this, arguments);

        this.storage = null;
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

            // Do not restore "Run unit this line" breakpoints. This should solve complaints
            // about Firebug breaking in the source even if there are no breakpoints in
            // Firebug UI.
            if (bps.type == BP_UNTIL)
                continue;

            this.breakpoints[url] = bps;
        }
    },

    save: function()
    {
        
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    getBreakpoints: function(url)
    {
        return this.breakpoints[url];
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
                    if (bp.type & BP_NORMAL && !(bp.type & BP_ERROR) )
                    {
                        if (bp.scriptsWithBreakpoint && bp.scriptsWithBreakpoint.length > 0)
                        {
                            var rc = cb.call.apply(bp, [url, bp.lineNo, bp,
                                bp.scriptsWithBreakpoint]);

                            if (rc)
                                return [bp];
                        }
                        else
                        {
                            var rc = cb.call.apply(bp, [url, bp.lineNo, bp]);
                            if (rc)
                                return [bp];
                        }
                    }
                }
            }
        }
        else
        {
            var bps = [];
            var urls = fbs.getBreakpointURLs();
            for (var i = 0; i < urls.length; i++)
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
