/* See license.txt for terms of usage */

// Debug Logging for Firebug internals

// ************************************************************************************************
// about:config browser.dom.window.dump.enabled true

var FBTrace = {};
try {
(function() {

const Ci = Components.interfaces;
const consoleService = Components.classes["@mozilla.org/consoleservice;1"].getService(Ci.nsIConsoleService);
const permissionManager = Components.classes["@mozilla.org/permissionmanager;1"].getService(Ci.nsIPermissionManager);

FBTrace.avoidRecursion = false;

this.sysout = function(msg, more)
{
    if (more)
    {
        try {
            msg += " " + more.toString() + "\n";
        } catch (exc) {
            // probably xpconnect error message that won't be intelligable
            msg += "(trace.sysout fails: "+exc+")";
        }
    }

    dump(msg);
}

this.dumpTypes = function(header, obj)
{
    try {
        if (header) this.sysout(header);
        this.sysout(" typeof="+typeof(obj));
        if (obj)
        {
            this.sysout(" constructor="+obj.constructor);
            if (obj.prototype)
                this.dumpTypes(" obj.prototype", obj.prototype);
            else
                this.sysout("\n");
        }
    }
    catch (e)
    {
        this.sysout("trace.dumpTypes FAILED:"+e+"\n");
    }
}
this.reXPConnect = /\[xpconnect wrapped ([^\]]*)\]/;
this.dumpProperties = function(header, obj)
{
    try {
        var noThrottle = true;
        header += " sees object with typeof: \'"+typeof(obj)+"\'; object contains:\n";

        if (FBTrace.DBG_DBG2FIREBUG)
        {
            Firebug.Console.openGroup(header);
            Firebug.Console.log(obj);
            Firebug.Console.closeGroup();
            return;
        }
        this.sysout(header);

        if (obj instanceof Array)
        {
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
            this.sysout(obj+"\n");
        }
        //else if (obj.name && obj.name == 'NS_ERROR_XPC_JS_THREW_JS_OBJECT')
        //{
        //
        //}
        else
        {
            var propsTotal = 0;
            for (var p in obj)
            {
                propsTotal++;
                try
                {
                    var pAsString = p + "";
                    if (pAsString.match("QueryInterface"))
                    {
                        if (this.dumpInterfaces(obj))
                            continue;
                        else
                            this.sysout("dumpInterfaces found NONE\n");
                    }
                    var m = this.reXPConnect.exec(pAsString);
                    if (m)
                    {
                        var kind = m[1];
                        if (!obj[p] instanceof Ci[kind])
                        {
                            var xpobj = obj[p].wrappedJSObject;
                            this.sysout("["+p+"]="+xpobj+";\n");
                        }
                    }
                    if (obj.wrappedJSObject)
                        this.sysout("w["+p+"]="+obj.wrappedJSOboject[p]+";\n");
                    else
                        this.sysout("["+p+"]="+obj[p]+";\n");
                }
                catch (e)
                {
                    this.sysout("dumpProperties failed:"+e+"\n");
                }
            }
            if (propsTotal == 0)
                this.sysout("0 properties\n");
        }
    }
    catch(exc)
    {
        this.dumpStack("dumpProperties failed:"+exc+" trying with header="+header+"\n");
    }
},

this.dumpInterfaces = function(obj)
{
    var found = false;
    // could try for classInfo
    for(iface in Components.interfaces)
    {
        if (obj instanceof Components.interfaces[iface])
        {
            found = true;
            for (p in Components.interfaces[iface])
            {
                this.sysout("["+iface+"."+p+"]="+obj[p]+";\n");
            }
        }

    }
    return found;
},

this.dumpEvent = function(header, event)
{
    var phase = " capturing phase ";
    if (event.eventPhase == event.AT_TARGET)
        phase = " at target ";
    else if (event.eventPhase == event.BUBBLING_PHASE)
        phase = " bubbling phase ";

    if (event.relatedTarget)
        var from = event.relatedTarget.tagName + "->";
    else
        var from = "";
    if (event.currentTarget.tagName)
        var at = event.currentTarget.tagName + "->";
    else
        var at = event.currentTarget.nodeName + "->";
    var to = event.target.tagName;

    this.sysout(header+" "+event.type+phase+from+at+to+"\n");
},

this.dumpPermissions = function()
{
    FBTrace.sysout("Enumerate permissions:\n");
    var perms = permissionManager.enumerator;
    while(perms.hasMoreElements())
    {
        var perm = perms.getNext();
        if (perm instanceof Ci.nsIPermission)
            FBTrace.dumpProperties("Permission ", perm);
        else
            FBTrace.dumpProperties("NOT an nsIPermission", perm);
    }
    FBTrace.sysout("Enumerate permissions DONE\n");
},


this.dumpIValue= function(header, iValue)
{
    FBTrace.sysout(header+"\n");
    var listValue = {value: null}, lengthValue = {value: 0};
    iValue.getProperties(listValue, lengthValue);
    for (var i = 0; i < lengthValue.value; ++i)
    {
        var prop = listValue.value[i];
        try {
            var name = prop.name.getWrappedValue();
            FBTrace.sysout(i+"]"+name+"="+prop.value.getWrappedValue()+"\n");
        } catch (e) {
            FBTrace.sysout(i+"]"+e+"\n");
        }
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
        lines.push(frame.toString()+ " "+(frame.sourceLine?frame.sourceLine:""));//frame.filename + " (" + frame.lineNumber + ")");

    if (strip)
        lines.splice(0, strip);

    return lines.join("\n");
};

}).apply(FBTrace);
} catch (exc) { alert(exc);}
