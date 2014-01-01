/* See license.txt for terms of usage */

define([
    "firebug/firebug",
    "firebug/chrome/module",
    "firebug/lib/trace",
    "firebug/lib/object",
],
function(Firebug, Module, FBTrace, Obj) {

"use strict"

// ********************************************************************************************* //
// Constants

var Cc = Components.classes;
var Ci = Components.interfaces;

// ********************************************************************************************* //
// CSSPanelMutationObserver

/**
 * @module This module is responsible for updating the CSS panel (name='stylesheet')
 * when the currently displayed CSS stylesheet is removed from the page.
 *
 * The module uses Mutation Observer API to watch elements removal (STYLE and LINK)
 * from the page.
 *
 * The observer activity is optimized, so it observes the document only if
 * the panel is actually visible (the optimization is based on Firebug UI events).
 *
 * See issue 6582 for more details.
 */
var CSSPanelMutationObserver = Obj.extend(Module,
/** @lends CSSPanelMutationObserver */
{
    dispatchName: "CSSPanelMutationObserver",

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Module

    initialize: function()
    {
        Module.initialize.apply(this, arguments);

        // Register UI listeners, so we can get events about when the CSS panel
        // is visible and hidden.
        Firebug.registerUIListener(this);
    },

    shutdown: function()
    {
        Module.shutdown.apply(this, arguments);
        Firebug.unregisterUIListener(this);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // UI Listener

    onShowPanel: function(panel)
    {
        if (panel.name != "stylesheet" || panel.location == null)
            return;

        // The CSS panel is visible let's observe mutations. 
        this.startObserveMutations(panel);
    },

    onHidePanel: function(panel)
    {
        if (panel.name != "stylesheet")
            return;

        this.stopObserveMutations(panel);
    },

    onPanelNavigate: function(object, panel)
    {
        if (panel.name != "stylesheet" || panel.location == null)
            return;

        // Different stylesheet is displayed in the panel, restart mutation
        // observer since the stylesheet can come from different window (an iframe).
        this.startObserveMutations(panel);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Mutation Observer

    startObserveMutations: function(panel)
    {
        if (panel.mutationObserver)
            this.stopObserveMutations(panel);

        var styleSheet = panel.location;
        if (!styleSheet.ownerNode)
        {
            if (FBTrace.DBG_ERRORS)
                FBTrace.sysout("CSSPanelMutationObserver.startObserveMutations ERROR no owner!");
            return;
        }

        // Start observing mutation events. The CSS panel needs to be updated
        // if the current stylesheet's node is removed from the document
        var doc = styleSheet.ownerNode.ownerDocument;
        var callback = this.onMutationObserve.bind(this, panel, styleSheet.ownerNode);
        var observer = new MutationObserver(callback);
        observer.observe(doc, {
            childList: true,
            subtree: true,
        });

        panel.mutationObserver = observer;

        if (FBTrace.DBG_CSS)
            FBTrace.sysout("CSSPanelMutationObserver.startObserveMutations;");
    },

    stopObserveMutations: function(panel)
    {
        if (!panel.mutationObserver)
            return;

        panel.mutationObserver.disconnect();
        panel.mutationObserver = null;

        if (FBTrace.DBG_CSS)
            FBTrace.sysout("CSSPanelMutationObserver.stopObserveMutations;");
    },

    onMutationObserve: function(panel, styleSheetNode, records, observer)
    {
        var refresh = false;

        for (var i=0; i<records.length; i++)
        {
            var record = records[i];
            switch (record.type)
            {
                case "childList":
                    var nodes = record.removedNodes;
                    for (var j=0; j<nodes.length; j++)
                    {
                        // If the current stylesheet's owner node has been removed
                        // update the panel. The stylesheet must not be displayed
                        // since it's not part of the page anymore.
                        var node = nodes[j];
                        if (node == styleSheetNode)
                        {
                            refresh = true;
                            break;
                        }
                    }
            }

            if (refresh)
                break;
        }

        if (refresh)
        {
            if (FBTrace.DBG_CSS)
                FBTrace.sysout("CSSPanelMutationObserver.onMutationObserve; refresh");

            panel.location = null;
            panel.navigate(null);
        }
    }
});

// ********************************************************************************************* //
// Registration

Firebug.registerModule(CSSPanelMutationObserver);

return CSSPanelMutationObserver;

// ********************************************************************************************* //
});
