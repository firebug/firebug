/* See license.txt for terms of usage */

define([
    "fbtrace/trace"
],
function(FBTrace) {

// ********************************************************************************************* //
// Constants

var Events = {};

// ********************************************************************************************* //

Events.dispatch = function(listeners, name, args)
{
    if (!listeners)
    {
        if (FBTrace.DBG_DISPATCH)
            FBTrace.sysout("Events.dispatch "+name+" without listeners");

        return;
    }

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
                        FBTrace.sysout("EXCEPTION in Events.dispatch "+(culprit?culprit+".":"")+
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

// ********************************************************************************************* //
// Events

Events.cancelEvent = function(event)
{
    event.stopPropagation();
    event.preventDefault();
};

Events.isLeftClick = function(event, allowKeyModifiers)
{
    return event.button == 0 && (allowKeyModifiers || this.noKeyModifiers(event));
};

Events.noKeyModifiers = function(event)
{
    return !event.ctrlKey && !event.shiftKey && !event.altKey && !event.metaKey;
};

// ********************************************************************************************* //

return Events;

// ********************************************************************************************* //
});
