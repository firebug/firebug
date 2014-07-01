/* See license.txt for terms of usage */

define([
    "firebug/firebug",
    "firebug/lib/trace",
    "firebug/lib/object",
    "firebug/lib/dom",
    "firebug/lib/string",
    "firebug/lib/system",
    "firebug/chrome/module",
],
function(Firebug, FBTrace, Obj, Dom, Str, System, Module) {

"use strict";

// ********************************************************************************************* //
// Constants

var TraceError = FBTrace.toError();
var Trace = FBTrace.to("DBG_STATUSPATH");

var statusCropSize = 20;
var timeoutLen = 100;

// ********************************************************************************************* //
// StatusPath Implementation

/**
 * @module The object is responsible for 'Status path' maintenance (aka breadcrumbs) that
 * is used to display path to the selected element in the {@link HTMLPanel}, path to the
 * selected object in the {@link DOMPanel} and call-stack in the {@link ScriptPanel}.
 *
 * The path is displayed in panel-toolbar and the logic is based on {@link Panel.getObjectPath}
 * and {@link Panel.getCurrentObject} methods, so any panel can support it.
 *
 * The path can be updated through clear and update methods. Further, {@link Panel} instance can
 * specify whether the update should be synchronous or asynchronous through:
 * 'objectPathAsyncUpdate' member.
 */
var StatusPath = Obj.extend(Module,
/** @lends StatusPath */
{
    dispatchName: "StatusPath",

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Module

    initializeUI: function()
    {
        Module.initializeUI.apply(this, arguments);

        var panelStatus = Firebug.chrome.getElementById("fbPanelStatus");
        panelStatus.lastPanelName = "";
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Public API

    clear: function()
    {
        this.clearFlag = true;
        this.executor();
    },

    update: function()
    {
        this.updateFlag = true;
        this.executor();
    },

    flush: function()
    {
        if (this.timeout)
        {
            clearTimeout(this.timeout);
            this.timeout = null;
        }

        if (this.clearFlag)
            this.doClear();

        if (this.updateFlag)
            this.doUpdate();

        this.clearFlag = false;
        this.updateFlag = false;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Private API

    executor: function()
    {
        var panelBar1 = Firebug.chrome.getElementById("fbPanelBar1");
        var panelStatus = Firebug.chrome.getElementById("fbPanelStatus");

        var panel = panelBar1.selectedPanel;
        if (!panel)
            return;

        // Asynchronous update is not necessary for every panel,
        // so it's up to the current panel what to do.
        var asyncUpdate = panel.objectPathAsyncUpdate;

        // Synchronous update is always used when panels are switched.
        if (panel.name != panelStatus.lastPanelName)
            asyncUpdate = false;

        Trace.sysout("statusPath.executor; asyncUpdate: " + asyncUpdate + ", " +
            panelStatus.lastPanelName + " -> " + panel.name);

        if (asyncUpdate)
        {
            if (this.timeout)
                clearTimeout(this.timeout);

            this.timeout = setTimeout(() => {
                this.timeout = null;
                this.flush();
            }, timeoutLen);
        }
        else
        {
            this.flush();
        }
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    doClear: function()
    {
        Trace.sysout("statusPath.clear;");

        var panelStatus = Firebug.chrome.getElementById("fbPanelStatus");
        panelStatus.clear();
    },

    doUpdate: function()
    {
        Trace.sysout("statusPath.update;");

        var context = Firebug.currentContext;
        var panelStatus = Firebug.chrome.getElementById("fbPanelStatus");
        var panelStatusSeparator = Firebug.chrome.getElementById("fbStatusSeparator");
        var panelBar1 = Firebug.chrome.getElementById("fbPanelBar1");

        var panel = panelBar1.selectedPanel;
        if (!panel)
          return;

        var currentObject = panel ? panel.getCurrentObject() : null;

        panelStatus.setAttribute("direction", panel.statusSeparator === ">" ? "right" : "left");

        // The |currentObject| is the one that should be emphasized in the path. It's
        // usually the current selection, but can be different (e.g. if the debugger is halted
        // the Script panel emphasizes the current frame).
        if (!panel || !currentObject)
        {
            Dom.collapse(panelStatusSeparator, true);
            panelStatus.clear();
        }
        else
        {
            var path = panel.getObjectPath(currentObject);
            if (!path || !path.length)
            {
                Dom.collapse(panelStatusSeparator, true);
                panelStatus.clear();
            }
            else
            {
                // Update the visibility of the separator. The separator
                // is displayed only if there are some other buttons on the left side.
                // Before showing the status separator let's see whether there are any other
                // buttons on the left.
                var hide = true;
                var sibling = panelStatusSeparator.parentNode.previousSibling;
                while (sibling)
                {
                    if (!Dom.isCollapsed(sibling))
                    {
                        hide = false;
                        break;
                    }

                    sibling = sibling.previousSibling;
                }

                Dom.collapse(panelStatusSeparator, hide);

                if (panel.name != panelStatus.lastPanelName)
                    panelStatus.clear();

                // If the object already exists in the list, just select it and keep the path.
                var existingItem = panelStatus.getItemByObject(currentObject);
                if (existingItem)
                {
                    // Update the labels of the status path elements, because it can be,
                    // that the elements changed even when the selected element exists
                    // inside the path (issue 4826)
                    var statusItems = panelStatus.getItems();
                    for (var i = 0; i < statusItems.length; i++)
                    {
                        var object = Firebug.getRepObject(statusItems[i]);
                        var rep = Firebug.getRep(object, context);
                        var objectTitle = rep.getTitle(object, context);
                        var title = Str.cropMultipleLines(objectTitle, statusCropSize);

                        statusItems[i].label = title;
                    }

                    panelStatus.selectItem(existingItem);
                }
                else
                {
                    panelStatus.clear();

                    for (var i = 0; i < path.length; i++)
                    {
                        var object = path[i];
                        var rep = Firebug.getRep(object, context);
                        var objectTitle = rep.getTitle(object, context);
                        var title = Str.cropMultipleLines(objectTitle, statusCropSize);

                        panelStatus.addItem(title, object, rep, panel.statusSeparator);
                    }

                    panelStatus.selectObject(currentObject);

                    Trace.sysout("statusPath.update " + path.length + " items ", path);
                }
            }
        }

        // If the current panel is disabled there is no panel instance.
        panelStatus.lastPanelName = panel ? panel.name : "";
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Arrow Navigation

    getNextObject: function(reverse)
    {
        var panelBar1 = Firebug.chrome.getElementById("fbPanelBar1");
        var panel = panelBar1.selectedPanel;
        if (panel)
        {
            var panelStatus = Firebug.chrome.getElementById("fbPanelStatus");
            var currentObject = panel.getCurrentObject();

            var item = panelStatus.getItemByObject(currentObject);
            if (item)
            {
                if (reverse)
                    item = item.previousSibling ? item.previousSibling.previousSibling : null;
                else
                    item = item.nextSibling ? item.nextSibling.nextSibling : null;

                if (item)
                    return item.repObject;
            }
        }
    },

    gotoNextObject: function(reverse)
    {
        var nextObject = this.getNextObject(reverse);
        if (nextObject)
            Firebug.chrome.select(nextObject);
        else
            System.beep();
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Options

    updateOption: function(name, value)
    {
        if (name == "omitObjectPathStack")
            this.obeyOmitObjectPathStack(value);
    },

    obeyOmitObjectPathStack: function(value)
    {
        var panelStatus = Firebug.chrome.getElementById("fbPanelStatus");

        // The element does not exist immediately at start-up.
        if (!panelStatus)
            return;

        Dom.hide(panelStatus, (value ? true : false));
    },
});

// ********************************************************************************************* //
// Registration

Firebug.registerModule(StatusPath);

// xxxHonza: exposed for XUL (see firebugMenuOverlay.xul)
Firebug.StatusPath = StatusPath;

return StatusPath;

// ********************************************************************************************* //
});
