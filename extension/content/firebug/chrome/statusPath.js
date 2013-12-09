/* See license.txt for terms of usage */

define([
    "firebug/firebug",
    "firebug/lib/trace",
    "firebug/lib/dom",
    "firebug/lib/string",
],
function(Firebug, FBTrace, Dom, String) {

// ********************************************************************************************* //
// Constants

var TraceError = FBTrace.to("DBG_ERRORS");
var Trace = FBTrace.to("DBG_STATUSPATH");

var statusCropSize = 20;

// ********************************************************************************************* //
// StatusPath

/**
 * @object The object is responsible for 'Status path' maintenance (aka breadcrumbs) that
 * is used to display path to the selected element in the {@HTMLPanel}, path to the
 * selected object in the {@DOMPanel} and call-stack in the {@ScriptPanel}.
 * The path is displayed in the panel's toolbar and the logic is based on {@Panel.getObjectPath}
 * method, so any panel can support it.
 */
var StatusPath =
{
    clear: function()
    {
        Trace.sysout("statusPath.clear;");

        var panelStatus = Firebug.chrome.getElementById("fbPanelStatus");
        panelStatus.clear();
    },

    update: function()
    {
        Trace.sysout("statusPath.update;");

        var context = Firebug.currentContext;

        var panelStatus = Firebug.chrome.getElementById("fbPanelStatus");
        var panelStatusSeparator = Firebug.chrome.getElementById("fbStatusSeparator");
        var panelBar1 = Firebug.chrome.getElementById("fbPanelBar1");
        var panel = panelBar1.selectedPanel;

        if (!panel || (panel && !panel.selection))
        {
            panelStatus.clear();
        }
        else
        {
            var path = panel.getObjectPath(panel.selection);
            if (!path || !path.length)
            {
                Dom.hide(panelStatusSeparator, true);
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

                Dom.hide(panelStatusSeparator, hide);

                if (panel.name != panelStatus.lastPanelName)
                    panelStatus.clear();

                panelStatus.lastPanelName = panel.name;

                // If the object already exists in the list, just select it and keep the path.
                var selection = panel.selection;
                var existingItem = panelStatus.getItemByObject(panel.selection);
                if (existingItem)
                {
                    // Update the labels of the status path elements, because it can be,
                    // that the elements changed even when the selected element exists
                    // inside the path (issue 4826)
                    var statusItems = panelStatus.getItems();
                    for (var i = 0; i < statusItems.length; ++i)
                    {
                        var object = Firebug.getRepObject(statusItems[i]);
                        var rep = Firebug.getRep(object, context);
                        var objectTitle = rep.getTitle(object, context);
                        var title = String.cropMultipleLines(objectTitle, statusCropSize);

                        statusItems[i].label = title;
                    }

                    panelStatus.selectItem(existingItem);
                }
                else
                {
                    panelStatus.clear();

                    for (var i = 0; i < path.length; ++i)
                    {
                        var object = path[i];
                        var rep = Firebug.getRep(object, context);
                        var objectTitle = rep.getTitle(object, context);
                        var title = String.cropMultipleLines(objectTitle, statusCropSize);

                        panelStatus.addItem(title, object, rep, panel.statusSeparator);
                    }

                    panelStatus.selectObject(panel.selection);

                    Trace.sysout("statusPath.update " + path.length + " items ", path);
                }
            }
        }
    },
};

// ********************************************************************************************* //
// Registration

return StatusPath;

// ********************************************************************************************* //
});
