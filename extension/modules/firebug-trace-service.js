/* See license.txt for terms of usage */

// ********************************************************************************************* //
// Constants

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;
const Cu = Components.utils;

var EXPORTED_SYMBOLS = ["traceConsoleService"];

const PrefService = Cc["@mozilla.org/preferences-service;1"];
const prefs = PrefService.getService(Ci.nsIPrefBranch);
const prefService = PrefService.getService(Ci.nsIPrefService);

Cu["import"]("resource://gre/modules/XPCOMUtils.jsm");
Cu["import"]("resource://gre/modules/Services.jsm");
Cu["import"]("resource://gre/modules/AddonManager.jsm");

// xxxHonza: could we remove some of them?
var TraceAPI = ["dump", "sysout", "matchesNode", "time", "timeEnd"];

// ********************************************************************************************* //
// Service Implementation

try
{
    Cu["import"]("resource://fbtrace/firebug-trace-service.js");
}
catch (err)
{
    // Tracing Console is not available yet, let's use a fake one.
    var traceConsoleService =
    {
        tracers: {},

        getTracer: function(prefDomain)
        {
            var tracer = this.tracers[prefDomain];
            if (tracer)
                return tracer;

            var enabledAddons = decodeURIComponent(getCharPref("extensions", "enabledAddons"));
            if (enabledAddons.indexOf("fbtrace@getfirebug.com:") >= 0)
            {
                // Solution with built-in buffer for logs created before console is ready.
                var wrapper = new TracerWrapper(prefDomain);
                tracer = wrapper.createTracer();
            }
            else
            {
                // Simple empty implementation for cases where Firebug Tracing Console
                // is not even installed or 'alwaysOpenTraceConsole' is set to false.
                tracer = {};
                for (var i=0; i<TraceAPI.length; i++)
                    tracer[TraceAPI[i]] = function() {};
            }

            this.tracers[prefDomain] = tracer;
            return tracer;
        }
    };
}

// ********************************************************************************************* //
// Tracer Wrapper

/**
 * Trace Wrapper represents a temporary Trace object that is used till the real Tracing
 * Console is opened and available to use. Trace Wrapper implements a buffer that
 * collects all logs and flushes them as intot the real console as soon as it's ready.
 *
 * In order to use this functionality, you need to set:
 *    'extensions.firebug.alwaysOpenTraceConsole' to true
 *
 * @param {Object} prefDomain Associated pref domain. Usually 'extensions.firebug'
 */
function TracerWrapper(prefDomain)
{
    this.prefDomain = prefDomain;
}

TracerWrapper.prototype =
{
    // Temporary trace object
    tracer: null,

    // Buffer with logs used till the Tracing Console UI is available
    queue: [],

    // The real tracing console tracer object.
    FBTrace: null,

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Tracer

    createTracer: function()
    {
        var self = this;

        this.addObserver();

        // Default FBTrace implementation puts all calls in a buffer.
        // It'll be used as soon as the console is ready.
        function createHandler(method)
        {
            return function() {
                self.push(method, arguments);
            };
        };

        // Fake FBTrace object
        this.tracer = {};

        // Dynamically create APIs.
        for (var i=0; i<TraceAPI.length; i++)
        {
            var method = TraceAPI[i];
            this.tracer[method] = createHandler(method);
        }

        var branch = prefService.getBranch(this.prefDomain);
        var arrayDesc = {};

        // Set options from preferences.
        var children = branch.getChildList("", arrayDesc);
        for (var i=0; i<children.length; i++)
        {
            var name = children[i];
            var m = name.indexOf("DBG_");
            if (m != -1)
            {
                var optionName = name.substr(1); // drop leading .
                this.tracer[optionName] = getBoolPref(this.prefDomain, optionName);
            }
        }

        // Create FBTrace proxy. As soon as FBTrace console is available it'll forward
        // all calls to it.
        return Proxy.create(
        {
            get: function(target, name)
            {
                return self.FBTrace ? self.FBTrace[name] : self.tracer[name];
            },

            set: function(target, name, value)
            {
                if (self.FBTrace)
                    self.FBTrace[name] = value;
                else
                    self.tracer[name] = value;

                return true;
            },
        });
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Buffer

    push: function(method, args)
    {
        if (!this.queue)
            return;

        this.queue.push({
            method: method,
            args: args,
        });

        // Size of the buffer is limited.
        while (this.queue.length > 1000)
            this.queue.pop();
    },

    clearBuffer: function()
    {
        this.queue = null;
    },

    flush: function()
    {
        if (!this.FBTrace || !this.queue)
            return;

        if (this.queue.length > 0)
            this.FBTrace.sysout("FBTrace: flush " + this.queue.length + " buffered logs:");

        for (var i=0; i<this.queue.length; i++)
        {
            var call = this.queue[i];
            this.FBTrace[call.method].apply(this.FBTrace, call.args);
        }

        this.clearBuffer();
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // FBTrace Console Observer

    addObserver: function()
    {
        // Listen for new windows, Firebug must be loaded into them too.
        Services.obs.addObserver(this, "chrome-document-global-created", false);
    },

    QueryInterface: XPCOMUtils.generateQI([Ci.nsIObserver]),
    observe: function windowWatcher(win, topic, data)
    {
        // xxxHonza: the window should be associated with the same prefDomain.
        if (win.location.href == "chrome://fbtrace/content/traceLogFrame.html")
        {
            var self = this;

            // https://bugzil.la/795961 ?
            win.addEventListener("load", function onLoad(evt)
            {
                // load listener not necessary once https://bugzil.la/800677 is fixed
                var win = evt.currentTarget;
                win.removeEventListener("load", onLoad, false);

                self.initFBTrace(self.prefDomain);
            }, false);
        }
    },

    initFBTrace: function()
    {
        if (this.FBTrace)
            return this.FBTrace;

        try
        {
            var scope = {};
            Cu.import("resource://fbtrace/firebug-trace-service.js", scope);
            this.FBTrace = scope.traceConsoleService.getTracer(this.prefDomain);

            // FBTrace Console is ready let's flush the log buffer.
            this.flush();
        }
        catch (err)
        {
        }
    }
};

// ********************************************************************************************* //
// Helpers

function getStackDump()
{
    var lines = [];
    for (var frame = Components.stack; frame; frame = frame.caller)
        lines.push(frame.filename + " (" + frame.lineNumber + ")");

    return lines.join("\n");
};

function getBoolPref(prefDomain, name)
{
    try
    {
        var prefName = prefDomain + "." + name;
        return prefs.getBoolPref(prefName);
    }
    catch (err)
    {
    }

    return false;
}

function getCharPref(prefDomain, name)
{
    try
    {
        var prefName = prefDomain + "." + name;
        return prefs.getCharPref(prefName);
    }
    catch (err)
    {
    }

    return false;
}

// ********************************************************************************************* //
