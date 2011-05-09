/* See license.txt for terms of usage */

define([
    "firebug/lib/trace"
],
function(FBTrace) {

// ********************************************************************************************* //
// Constants

var Events = {};

// ********************************************************************************************* //

Events.dispatch = function(listeners, name, args)
{
    if (!listeners)
        return;

    try
    {
        if (FBTrace.DBG_DISPATCH)
            var noMethods = [];

        for (var i = 0; i < listeners.length; ++i)
        {
            var listener = listeners[i];
            if (!listener)
            {
                if (FBTrace.DBG_DISPATCH || FBTrace.DBG_ERRORS)
                    FBTrace.sysout("Events.dispatch ERROR "+i+" "+name+" to null listener.");
                continue;
            }

            if (listener[name])
            {
                try
                {
                    listener[name].apply(listener, args);
                }
                catch(exc)
                {
                    if (FBTrace.DBG_ERRORS)
                    {
                        if (exc.stack)
                        {
                            var stack = exc.stack;
                            exc.stack = stack.split('\n');
                        }

                        var culprit = listeners[i] ? listeners[i].dispatchName : null;
                        FBTrace.sysout("Exception in Events.dispatch "+(culprit?culprit+".":"")+
                            name+": "+exc+" in "+(exc.fileName?exc.fileName:"")+
                            (exc.lineNumber?":"+exc.lineNumber:""), exc);
                    }
                }
            }
            else
            {
                if (FBTrace.DBG_DISPATCH)
                    noMethods.push(listener);
            }
        }

        if (FBTrace.DBG_DISPATCH)
            FBTrace.sysout("Events.dispatch "+name+" to "+listeners.length+" listeners, "+
                noMethods.length+" had no such method:", noMethods);
    }
    catch (exc)
    {
        if (FBTrace.DBG_ERRORS)
        {
            if (exc.stack)
            {
                var stack = exc.stack;
                exc.stack = stack.split('\n');
            }

            var culprit = listeners[i] ? listeners[i].dispatchName : null;
            FBTrace.sysout("Exception in Events.dispatch "+(culprit?culprit+".":"")+ name+
                ": "+exc, exc);
        }
    }
};

Events.dispatch2 = function(listeners, name, args)
{
    try
    {
        if (FBTrace.DBG_DISPATCH)
            var noMethods = [];

        if (!listeners)
        {
            if (FBTrace.DBG_DISPATCH)
                FBTrace.sysout("dispatch2, no listeners for "+name);
            return;
        }

        for (var i = 0; i < listeners.length; ++i)
        {
            var listener = listeners[i];
            if (listener[name])
            {
                var result = listener[name].apply(listener, args);

                if (FBTrace.DBG_DISPATCH)
                    FBTrace.sysout("dispatch2 "+name+" to #"+i+" of "+listeners.length+
                        " listeners, result "+result, {result: result, listener: listeners[i],
                        fn: listener[name].toSource()});

                if (result)
                    return result;
            }
            else
            {
                if (FBTrace.DBG_DISPATCH)
                    noMethods.push(listener);
            }
        }

        if (FBTrace.DBG_DISPATCH && noMethods.length == listeners.length)
            FBTrace.sysout("Events.dispatch2 "+name+" to "+listeners.length+" listeners, "+
                noMethods.length+" had no such method:", noMethods);
    }
    catch (exc)
    {
        if (typeof(FBTrace) != "undefined" && FBTrace.DBG_ERRORS)
        {
            if (exc.stack)
                exc.stack = exc.stack.split('/n');

            FBTrace.sysout(" Exception in lib.dispatch2 "+ name+" exc:"+exc, exc);
        }
    }
};

// ********************************************************************************************* //

return Events;

// ********************************************************************************************* //
});
