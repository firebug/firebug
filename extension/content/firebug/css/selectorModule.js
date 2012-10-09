/* See license.txt for terms of usage */

define([
    "firebug/firebug",
    "firebug/lib/trace",
    "firebug/lib/object",
    "firebug/lib/dom",
    "firebug/lib/locale",
    "firebug/chrome/menu"
],
function(Firebug, FBTrace, Obj, Dom, Locale, Menu) {

// ********************************************************************************************* //
// Model implementation

var SelectorModule = Obj.extend(Firebug.Module,
{
    dispatchName: "selectorModule",

    initialize: function()
    {
        Firebug.NetMonitor.NetInfoBody.addListener(this);
        Firebug.registerUIListener(this);
    },

    shutdown: function()
    {
        Firebug.NetMonitor.NetInfoBody.removeListener(this);
        Firebug.unregisterUIListener(this);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Context Menu

    onContextMenu: function(items, object, target, context, panel, popup)
    {
        if (panel.name != "stylesheet")
            return;

        var cssRule = Dom.getAncestorByClass(target, "cssRule");
        if (!cssRule)
            return;

        var rule = cssRule.repObject;
        if (!rule)
            return;

        var panel = context.getPanel("selector");
        if (!panel)
            return;

        var item = {
           id: "fbGetMatchingElements",
           nol10n: true,
           label: Locale.$STR("css.selector.cmd.getMatchingElements"),
           command: Obj.bindFixed(panel.getMatchingElements, panel, rule)
        };

        var refreshMenuItem = popup.querySelector("#fbRefresh");
        Menu.createMenuItem(popup, item, refreshMenuItem);

        return [];
    },
});

// ********************************************************************************************* //
// Registration

Firebug.registerModule(SelectorModule);

return SelectorModule;

// ********************************************************************************************* //
});
