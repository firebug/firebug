/* See license.txt for terms of usage */

FBL.ns(function() {

// ********************************************************************************************* //

Components.utils.import("resource://firebug/bti/browsercontext.js");
Components.utils.import("resource://firebug/bti/compilationunit.js");

var bti = {};

// ********************************************************************************************* //

/**
 * Crossfire has announced a new context by id
 */
function createContext(context_id, href)
{
    var matchingContext = TabWatcher.iterateContexts(function findMatchingId(context)
    {
        if (context.Crossfire && context.Crossfie.crossfire_id === context_id)
            return context;
    });

    if (matchingContext)
        FBTrace.sysout("BTI: createContext found matching context");
    else
        FBTrace.sysout("BTI: createContext ERROR no find on matching context");

}
bti.createContext = createContext;

// ********************************************************************************************* //

Firebug.ClientBrowserTools = bti;

// ********************************************************************************************* //
});