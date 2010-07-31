/* See license.txt for terms of usage */

// ************************************************************************************************
// Constants

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;

var EXPORTED_SYMBOLS = ["observerService"];


// ************************************************************************************************
// Observer implementation

var FBTrace = null;

/**
 * @service meta service module for observers
 * See also: <a href="https://developer.mozilla.org/en/NsIObserverService">
 * nsIObserverService</a>
 */
var observerService =
/** lends observerService */
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
}

