/* See license.txt for terms of usage */

// Debug Logging for Firebug internals

var FBTrace = {};
try {
(function() {

const consoleService = Components.classes["@mozilla.org/consoleservice;1"].getService(Components.interfaces["nsIConsoleService"]);


this.initializeTrace = function(context)
{
    if (FBTrace.dumpToPanel && context)
    {
        FBTrace.sysout = function(msg) {
            var noThrottle = true;
            Firebug.TraceModule.log(msg, context, "info", FirebugReps.Text, noThrottle);
        }
        dump("trace.initializeTrace Set to panel\n");
    }
    else
    {
        FBTrace.sysout = function(msg)
        {
            dump(msg);
        }
        dump("trace.initializeTrace Set to stdout for context="+context+"\n");
    }
}
this.dumpToPanel = false;


this.dumpProperties = function(header, obj)
{
    try {
        var noThrottle = true;
        this.sysout(header+" sees object with typeof: \'"+typeof(obj)+"\'; object contains:\n");
        if (obj instanceof Array)
        {
            if (FBTrace.dumpToPanel && FirebugContext)
                return Firebug.TraceModule.log(obj, FirebugContext, "info", FirebugReps.Array, noThrottle);

            for (var p = 0; p < obj.length; p++)
            {
                try
                {
                    this.sysout("["+p+"]="+obj[p]+";\n");
                }
                catch (e)
                {
                    this.sysout("dumpProperties failed:"+e+"\n");
                }
            }
        }
        else if (typeof(obj) == 'string')
        {
            if (FBTrace.dumpToPanel && FirebugContext)
                return Firebug.TraceModule.log(obj, FirebugContext, "info", FirebugReps.Text, noThrottle);

            this.sysout(obj+"\n");
        }
        //else if (obj.name && obj.name == 'NS_ERROR_XPC_JS_THREW_JS_OBJECT')
        //{
        //
        //}
        else
        {
            if (FBTrace.dumpToPanel && FirebugContext)
                return Firebug.TraceModule.log(obj, FirebugContext, "info", FirebugReps.Obj, noThrottle);

            for (var p in obj)
            {
                try
                {
                    this.sysout("["+p+"]="+obj[p]+";\n");
                }
                catch (e)
                {
                    this.sysout("dumpProperties failed:"+e+"\n");
                }
            }
        }
    }
    catch(exc)
    {
        this.dumpStack("dumpProperties failed:"+exc+" trying with header="+header);
    }
},

this.consoleOut = function(text)
{
    consoleService.logStringMessage(text + "");
},

this.dumpStack = function(optional_header) {
    if (optional_header)
        this.sysout(optional_header + "\n");
    this.sysout(this.getComponentsStack(2));
    this.sysout("\n");
}

this.getComponentsStack = function(strip)
{
    var lines = [];
    for (var frame = Components.stack; frame; frame = frame.caller)
        lines.push(frame.filename + " (" + frame.lineNumber + ")");

    if (strip)
        lines.splice(0, strip);

    return lines.join("\n");
};


// ************************************************************************************************
this.initializeTrace();

}).apply(FBTrace);
} catch (exc) { alert(exc);}