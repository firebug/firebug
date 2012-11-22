/* See license.txt for terms of usage */

// ********************************************************************************************* //
// Constants

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;
const Cu = Components.utils;

var EXPORTED_SYMBOLS = ["fbObserverService"];

Cu.import("resource://firebug/fbtrace.js");

// ********************************************************************************************* //
// Observer implementation

/**
 * @service meta service module for observers
 * See also: <a href="https://developer.mozilla.org/en/NsIObserverService">
 * nsIObserverService</a>
 */
var fbObserverService =
/** lends fbObserverService */
{
    observersByTopic: {},

    /* nsIObserverService */
    addObserver: function(observer, topic, weak)
    {
        if (!this.observersByTopic[topic])
            this.observersByTopic[topic] = [];

        this.observersByTopic[topic].push(observer);
    },

    removeObserver: function(observer, topic)
    {
        var observers = this.observersByTopic[topic];
        if (!observers)
            throw new Error("observer-service.removeObserver FAILED no observers for topic "+topic);

        for (var i=0; i < observers.length; i++)
        {
            if (observers[i] == observer)
            {
                observers.splice(i, 1);
                return;
            }
        }

        throw new Error("observer-service.removeObserver FAILED (no such observer) for topic "+topic);
    },

    notifyObservers: function(subject, topic, data)
    {
        var observers = this.observersByTopic[topic];
        if (observers)
        {
            for (var i=0; i < observers.length; i++)
                observers[i].observe(subject, topic, data);
        }
    },

    enumerateObservers: function(topic, fnOfObserver)
    {
        var observers = this.observersByTopic[topic];
        if (fnOfObserver)
        {
            for (var i=0; i < observers.length; i++)
                fnOfObserver(observers[i]);
        }
        return observers;  // may be null or array
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // For debugging observer registration

    stackForTrack: [],

    track: function(stack)
    {
        this.stackForTrack.push(stack.toString());
        return this.stackForTrack.length;
    },

    untrack: function(index)
    {
        if (this.stackForTrack[index - 1])
        {
            delete this.stackForTrack[index - 1];
        }
        else
        {
            Components.reportError("observer-service. ERROR attempt to untrack item not tracked at " +
                (index - 1));
        }
    },

    getStacksForTrack: function()
    {
        return this.stackForTrack;
    },

    traceStacksForTrack: function()
    {
        if (!FBTrace.DBG_OBSERVERS)
            return;

        var result = false;
        for (var i=0; i<this.stackForTrack.length; i++)
        {
            if (this.stackForTrack[i])
            {
                result = true;
                break;
            }
        }

        if (result)
        {
            FBTrace.sysout("fbObserverService getStacksForTrack ", this.stackForTrack);
        }
    }
};

// ********************************************************************************************* //
