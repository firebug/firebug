/* See license.txt for terms of usage */

define([
    "fbtrace/trace",
    "fbtrace/lib/string",
    "fbtrace/lib/wrapper",
    "fbtrace/lib/domplate",
    "fbtrace/lib/dom",
    "fbtrace/lib/options",
],
function(FBTrace, Str, Wrapper, Domplate, Dom, Options) {

// ********************************************************************************************* //
// Constants

var Cc = Components.classes;
var Ci = Components.interfaces;
var Cu = Components.utils;

var EOF = "<br/>";

// ********************************************************************************************* //
// Trace Message Object

var TraceMessage = function(type, text, obj, time)
{
    this.type = type;
    this.text = text;
    this.obj = obj;
    this.stack = [];
    this.time = time;

    if (typeof(this.obj) == "function")
    {
        // will make functions visible
        this.obj = {"": this.obj};
    }

    if (this.obj instanceof Ci.nsIScriptError)
    {
        // Put info about the script error location into the stack.
        this.stack.push({
            fileName: this.obj.sourceName,
            lineNumber: this.obj.lineNumber,
            funcName: ""
        });
    }
    //xxxHonza: the object doesn't have to always be an instance of Error.
    else if (this.obj && this.obj.stack && /*(this.obj instanceof Error) &&*/
        (typeof this.obj.stack.split == "function"))
    {
        // If the passed object is an error with stack trace attached, use it.
        // This stack trace points directly to the place where the error occurred.
        var stack = this.obj.stack.split("\n");
        for (var i=0; i<stack.length; i++)
        {
            var frame = stack[i].split("@");
            if (frame.length != 2)
                continue;

            var index = frame[1].lastIndexOf(":");
            this.stack.push({
                fileName: frame[1].substr(0, index),
                lineNumber: frame[1].substr(index+1),
                funcName: frame[0]
            });
        }
    }
    else
    {
        var traceServiceFile = "firebug-trace-service.js";
        var firebugServiceFile = "firebug-service.js";

        // Initialize stack trace info. This must be done now, when the stack
        // is available.
        for (var frame = Components.stack, i=0; frame; frame = frame.caller, i++)
        {
            // Skip frames related to the tracing code.
            var fileName = unescape(frame.filename ? frame.filename : "");

            // window.dump("traceModule frame "+i+": "+fileName+"\n");
            if (i < 5 || fileName.indexOf(traceServiceFile) != -1)
                continue;

            var sourceLine = frame.sourceLine ? frame.sourceLine : "";
            var lineNumber = frame.lineNumber ? frame.lineNumber : "";
            this.stack.push({fileName:fileName, lineNumber:lineNumber, funcName:""});
        }
    }

    if (this.obj instanceof Ci.nsICachingChannel)
    {
        try
        {
            var cacheToken = this.obj.cacheToken;
            if (cacheToken instanceof Ci.nsICacheEntryDescriptor)
            {
                this.cacheClient = cacheToken.clientID;
                this.cacheKey = cacheToken.key;
            }
        }
        catch (e)
        {
        }
    }

    if (this.obj instanceof Error ||
        this.obj instanceof Ci.nsIException ||
        this.obj instanceof Ci.nsIScriptError)
    {
        // Put the error message into the title so, it's immediately visible.
        this.text += " " + this.obj.message;
    }

    // Get snapshot of all properties now, as they can be changed.
    this.getProperties();
}

// ********************************************************************************************* //

TraceMessage.prototype =
{
    getType: function()
    {
        return this.type;
    },

    getLabel: function(maxLength)
    {
        if (!maxLength)
            maxLength = 0;

        if (!this.text)
            return "";

        if (maxLength <= 10 || this.text.length <= maxLength)
            return this.text.replace(/[\n]/g,"");

        return this.text.substr(0, maxLength - 3) + "...";
    },

    getStackArray: function()
    {
        return this.stack;
    },

    getStack: function()
    {
        var result = "";
        for (var i=0; i<this.stack.length; i++) {
            var frame = this.stack[i];
            result += frame.fileName + " (" + frame.lineNumber + ")\n";
        }

        return result;
    },

    getProperties: function()
    {
        if (this.props)
            return this.props;

        this.props = [];

        if (this.obj instanceof Array)
        {
            if (this.obj.length)
            {
                for (var p=0; p<this.obj.length; p++)
                {
                    try
                    {
                        var getter = this.obj.__lookupGetter__(p);
                        if (getter)
                            this.props[p] = "" + getter;
                        else
                            this.props[p] = "" + this.obj[p];
                    }
                    catch (e)
                    {
                        onPanic("instanceof Array with length, item "+p, e);
                    }
                }
            }
            else
            {
                for (var p in this.obj)
                {
                    try
                    {
                        var subProps = this.props[p] = [];
                        var subobj = this.obj.__lookupGetter__(p);
                        if (!subobj)
                            subobj = this.obj[p];
                        for (var p1 in subobj)
                        {
                            var getter = subobj.lookupGetter__(p1);
                            if (getter)
                                subProps[p1] = "" + getter;
                            else
                                subProps[p1] = "" + subobj[p1];
                        }
                    }
                    catch (e)
                    {
                        onPanic("instanceof Array, item "+p, e);
                    }
                }
            }
        }
        else if (typeof(this.obj) == "string")
        {
            this.props = this.obj;
        }
        else if (this.obj instanceof Ci.nsISupportsCString)
        {
            this.props = this.obj.data;
        }
        else
        {
            try
            {
                this.props = {};
                var propsTotal = 0;
                for (var p in this.obj)
                {
                    propsTotal++;

                    try
                    {
                        // If "this.obj.__lookupGetter__(p)" is executed for 'window' when
                        // p == 'globalStorage' (or local or session) the property is not
                        // accessbible anymore when iterated in getMembers (dom.js)
                        if (this.obj.__lookupGetter__)
                            var getter = this.obj.__lookupGetter__(p);
                        if (getter)
                            var value = "" + getter;
                        else
                            var value = Str.safeToString(this.obj[p]);

                        this.props[p] = value;
                    }
                    catch (err)
                    {
                        this.props[p] = "{Error}";
                    }
                }
            }
            catch (exc)
            {
            }
        }

        return this.props;
    },

    getInterfaces: function()
    {
        if (this.ifaces)
            return this.ifaces;

        this.ifaces = [];

        if (!this.obj)
            return;

        for (var iface in Ci)
        {
            try
            {
                // http://groups.google.com/group/mozilla.dev.platform/browse_thread/thread/7e660bf20836fa47
                if (/*("prototype" in Ci[iface]) && */this.obj instanceof Ci[iface])
                {
                    var ifaceProps = this.ifaces[iface] = [];
                    for (p in Ci[iface])
                        ifaceProps[p] = this.obj[p];
                }
            }
            catch (err)
            {
                //onPanic("TraceMessage.getInterfaces: " + iface+" typeof(Ci[iface].prototype)="+
                //    typeof(Ci[iface].prototype), err);
            }
        }
        return this.ifaces;
    },

    getResponse: function()
    {
        // xxxHonza: remove support for net responses
    },

    getException: function()
    {
        if (this.err)
            return this.err;

        this.err = "";

        if (this.obj && this.obj.message)
            return this.obj.message;

        // xxxJJB: this isn't needed, instanceof does QI. try {this.obj =
        // this.obj.QueryInterface(Ci.nsIException);} catch (err){}
        if (!this.obj)
            return null;

        if (this.obj instanceof Error || this.obj instanceof Ci.nsIException)
        {
            try
            {
                this.err += "<span class='ExceptionMessage'>" + this.obj.message + "</span>" + EOF;
                this.err += this.obj.name + EOF;
                this.err += this.obj.fileName + "(" + this.obj.lineNumber+ ")" + EOF;
            }
            catch (err)
            {
                onPanic("instanceof Error or nsIExcpetion", e);
            }
        }

        return this.err;
    },

    getTypes: function()
    {
        if (this.types)
            return this.types;

        this.types = "";

        try
        {
            var obj = this.obj;
            while (obj)
            {
                this.types += "typeof = " + typeof(obj) + EOF;
                if (obj)
                    this.types += "    constructor = " + obj.constructor + EOF;

                obj = obj.prototype;
            }
        }
        catch (e)
        {
            onPanic("getTypes "+this.types, e);
        }

        return this.types;
    },

    getEvent: function()
    {
        if (!(this.obj instanceof window.Event))
            return;

        if (this.eventInfo)
            return this.eventInfo;

        this.eventInfo = "";

        try
        {
            if (this.obj.eventPhase == this.obj.AT_TARGET)
                this.eventInfo += " at target ";
            else if (this.obj.eventPhase == this.obj.BUBBLING_PHASE)
                this.eventInfo += " bubbling phase ";
            else
                this.eventInfo += " capturing phase ";

            if (this.obj.relatedTarget)
                this.eventInfo += this.obj.relatedTarget.tagName + "->";

            if (this.obj.currentTarget)
            {
                if (this.obj.currentTarget.tagName)
                    this.eventInfo += this.obj.currentTarget.tagName + "->";
                else
                    this.eventInfo += this.obj.currentTarget.nodeName + "->";
            }

            this.eventInfo += this.obj.target.tagName;
        }
        catch (err)
        {
            onPanic("event", err);
        }

        return this.eventInfo;
    },

    getObject: function()
    {
        return this.obj;
    }
}

// ********************************************************************************************* //
// Registration

return TraceMessage;

// ********************************************************************************************* //
});
