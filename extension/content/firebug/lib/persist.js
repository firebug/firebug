/* See license.txt for terms of usage */

define([
    "firebug/lib/trace",
],
function(FBTrace) {

"use strict";

// ********************************************************************************************* //
// Constants

var Persist = {};

const overrideDefaultsWithPersistedValuesTimeout = 500;

// ********************************************************************************************* //
// Persistence (cross page refresh)

Persist.persistObjects = function(panel, panelState)
{
    // Persist the location and selection so we can restore them in case of a reload
    if (panel.location)
        panelState.persistedLocation = Persist.persistObject(panel.location, panel.context); // fn(context)->location

    if (panel.selection)
        panelState.persistedSelection = Persist.persistObject(panel.selection, panel.context);

    if (FBTrace.DBG_INITIALIZE)
        FBTrace.sysout("lib.persistObjects "+panel.name+" panel.location:"+panel.location+
            " panel.selection:"+panel.selection+" panelState:", panelState);
};

Persist.persistObject = function(object, context)
{
    var rep = Firebug.getRep(object, context);
    return rep ? rep.persistObject(object, context) : null;
};

Persist.restoreLocation =  function(panel, panelState)
{
    var restored = false;

    if (!panel.location && panelState && panelState.persistedLocation)
    {
        var location = panelState.persistedLocation(panel.context);

        if (FBTrace.DBG_INITIALIZE)
            FBTrace.sysout("lib.restoreObjects "+panel.name+" persistedLocation: "+location+
                " panelState:", panelState);

        if (location)
        {
            panel.navigate(location);
            restored = true;
        }
    }

    if (!panel.location)
        panel.navigate(null);

    if (FBTrace.DBG_INITIALIZE)
        FBTrace.sysout("lib.restoreLocation panel.location: "+panel.location+" restored: "+
            restored+" panelState:", panelState);

    return restored;
};

Persist.restoreSelection = function(panel, panelState)
{
    var needRetry = false;

    if (!panel.selection && panelState && panelState.persistedSelection)
    {
        var selection = panelState.persistedSelection(panel.context);
        if (selection)
            panel.select(selection);
        else
            needRetry = true;
    }

    if (!panel.selection)  // Couldn't restore the selection, so select the default object
        panel.select(null);

    function overrideDefaultWithPersistedSelection()
    {
        if (panel.selection == panel.getDefaultSelection() && panelState.persistedSelection)
        {
            var selection = panelState.persistedSelection(panel.context);
            if (selection)
                panel.select(selection);
        }

        if (FBTrace.DBG_INITIALIZE)
            FBTrace.sysout("lib.overrideDefaultsWithPersistedValues "+panel.name+
                " panel.location: "+panel.location+" panel.selection: "+panel.selection+
                " panelState:", panelState);
    }

    if (needRetry)
    {
        // If we couldn't restore the selection, wait a bit and try again
        panel.context.setTimeout(overrideDefaultWithPersistedSelection,
            overrideDefaultsWithPersistedValuesTimeout);
    }

    if (FBTrace.DBG_INITIALIZE)
        FBTrace.sysout("lib.restore "+panel.name+" needRetry "+needRetry+" panel.selection: "+
            panel.selection+" panelState:", panelState);
};

Persist.restoreObjects = function(panel, panelState)
{
    Persist.restoreLocation(panel, panelState);
    Persist.restoreSelection(panel, panelState);
};

Persist.getPersistedState = function(context, panelName)
{
    if (!context)
        return null;

    var persistedState = context.persistedState;
    if (!persistedState)
        persistedState = context.persistedState = {};

    if (!persistedState.panelState)
        persistedState.panelState = {};

    var panelState = persistedState.panelState[panelName];
    if (!panelState)
        panelState = persistedState.panelState[panelName] = {};

    return panelState;
};

// ********************************************************************************************* //

return Persist;

// ********************************************************************************************* //
});
