/* See license.txt for terms of usage */

define([
    "firebug/firebug",
    "firebug/lib/trace",
    "firebug/lib/locale",
    "firebug/lib/string",
    "firebug/lib/wrapper",
    "firebug/debugger/breakpoints/breakpointModule",
],
function(Firebug, FBTrace, Locale, Str, Wrapper, BreakpointModule) {

// ********************************************************************************************* //
// Constants

var Trace = FBTrace.to("DBG_DOM");
var TraceError = FBTrace.toError();

// ********************************************************************************************* //
// DOM Breakpoint

function DOMBreakpoint(object, propName, context)
{
    this.object = Wrapper.unwrapObject(object);
    this.propName = propName;
    this.context = context;
    this.checked = true;
}

DOMBreakpoint.prototype =
{
    watchProperty: function()
    {
        if (!this.object)
            return;

        Trace.sysout("DOMBreakpoint.watchProperty; " + this.propName, this.object);

        try
        {
            if (typeof(this.object.watch) != "function")
            {
                TraceError.sysout("DOMBreakpoint.watchProperty; ERROR watch is not a function",
                    this.object);
                return false;
            }

            this.object.watch(this.propName, this.onWatch.bind(this));
        }
        catch (exc)
        {
            TraceError.sysout("DOMBreakpoint.watchProperty; EXCEPTION " + exc, exc);
            return false;
        }

        return true;
    },

    onWatch: function(prop, oldval, newval)
    {
        Trace.sysout("DOMBreakpoint.onWatch; " + this.propName);

        // XXXjjb Beware: in playing with this feature I hit too much recursion
        // multiple times with console.log
        // TODO Do something cute in the UI with the error bubble thing
        if (this.checked)
        {
            this.context.breakingCause = {
                message: Str.cropString(prop, 200),
                prevValue: oldval,
                newValue: newval
            };

            // xxxHonza: The DOM panel should not be special here.
            BreakpointModule.breakNow(this.context.getPanel("dom"));
        }

        return newval;
    },

    unwatchProperty: function()
    {
        if (!this.object)
            return;

        Trace.sysout("DOMBreakpoint.unwatchProperty; " + this.propName, this.object);

        try
        {
            if (typeof(this.object.watch) != "function")
            {
                TraceError.sysout("DOMBreakpoint.unwatchProperty; ERROR watch is not a function",
                    this.object);
                return false;
            }

            this.object.unwatch(this.propName);
        }
        catch (exc)
        {
            TraceError.sysout("watchProperty.unwatchProperty; EXCEPTION " + exc, exc);
        }
    }
};

// ********************************************************************************************* //
// Registration

return DOMBreakpoint;

// ********************************************************************************************* //
});
