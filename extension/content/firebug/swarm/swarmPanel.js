/* See license.txt for terms of usage */

define([
    "firebug/lib/object",
    "firebug/firebug",
    "firebug/lib/domplate",
    "firebug/chrome/reps",
    "firebug/lib/locale",
    "firebug/lib/events",
    "firebug/lib/wrapper",
    "firebug/js/sourceLink",
    "firebug/js/stackFrame",
    "firebug/lib/dom",
    "firebug/lib/css",
    "firebug/lib/search",
    "firebug/lib/string",
    "firebug/lib/array",
    "firebug/lib/persist",
    "firebug/dom/toggleBranch",
    "firebug/lib/system",
    "firebug/chrome/menu",
    "firebug/editor/editor",
    "firebug/js/breakpoint",
    "firebug/chrome/searchBox",
    "firebug/dom/domModule",
    "firebug/console/autoCompleter"
],
function(Obj, Firebug, Domplate, FirebugReps, Locale, Events, Wrapper,
    SourceLink, StackFrame, Dom, Css, Search, Str, Arr, Persist, ToggleBranch, System, Menu) {


// ********************************************************************************************* //
// Constants

const Cc = Components.classes;
const Ci = Components.interfaces;
const jsdIStackFrame = Ci.jsdIStackFrame;

// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //


// ********************************************************************************************* //

var SwarmPanel = Firebug.SwarmPanel = function () {};

SwarmPanel.prototype = Obj.extend(Firebug.Panel,
{
    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // extends Panel

    name: "swarm",
    searchable: false,
    statusSeparator: ">",
    searchType : "swarm",
    order: 250,
    inspectable: false,

    initialize: function(context, doc)
    {
        var panel = this;
        
        panel.panelName = "Swarm";
        
        Firebug.Panel.initialize.apply(panel, arguments);
        
        var iframe = doc.createElement("iframe");
        iframe.setAttribute("id", "firebug_swarms_iframe");
        iframe.setAttribute("type", "content");
        iframe.setAttribute("frameborder", "0");
        iframe.setAttribute("style", "height:100%;width:100%;border:none;position:absolute");
        iframe.setAttribute("src", "https://www.getfirebug.com/swarms/");
        panel.panelNode.appendChild(iframe);
    },
    getOptionsMenuItems: function()
    {
        return [];
    },
    getDefaultSelection: function()
    {
        return {};
    }
});


// ********************************************************************************************* //
// Registration

// xxxHonza: Every panel should have its own module.
Firebug.registerPanel(SwarmPanel);

return Firebug.SwarmPanel;

// ********************************************************************************************* //
});

