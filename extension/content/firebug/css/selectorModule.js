/* See license.txt for terms of usage */

define([
    "firebug/firebug",
    "firebug/chrome/module",
    "firebug/lib/object",
    "firebug/lib/dom",
    "firebug/lib/locale",
    "firebug/chrome/menu"
],
function(Firebug, Module, Obj, Dom, Locale, Menu) {

// ********************************************************************************************* //
// Module implementation

var CSSSelectorsModule = Obj.extend(Module,
{
    dispatchName: "CSSSelectorsModule",

    initialize: function()
    {
        Firebug.registerUIListener(this);
    },

    shutdown: function()
    {
        Firebug.unregisterUIListener(this);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Context Menu

    onContextMenu: function(items, object, target, context, panel, popup)
    {
        if (!panel || panel.name != "stylesheet")
            return;

        var cssRule = Dom.getAncestorByClass(target, "cssRule");
        if (!cssRule)
            return;

        var rule = cssRule.repObject;
        if (!rule || !rule.selectorText)
            return;

        var panel = context.getPanel("selectors");
        if (!panel)
            return;

        var item = {
           id: "fbGetMatchingElements",
           nol10n: true,
           label: Locale.$STR("css.selector.cmd.getMatchingElements"),
           command: Obj.bindFixed(panel.addGroup, panel, rule.selectorText)
        };

        var refreshMenuItem = popup.querySelector("#fbRefresh");
        Menu.createMenuItem(popup, item, refreshMenuItem);

        return [];
    },

    matchElements: function(windows, selector)
    {
        if (selector == "")
            return;

        var elements = [];

        // Execute the query also in all iframes (see issue 5962)
        for (var i=0; i<windows.length; ++i)
        {
            var win = windows[i];
            var selections = win.document.querySelectorAll(selector);

            // For some reason the return value of querySelectorAll()
            // is not recognized as a NodeList anymore since Firefox 10.0.
            // See issue 5442.
            // But since there can be more iframes we need to collect all matching
            // elements in an extra array anyway.
            if (selections)
            {
                for (var j=0; j<selections.length; j++)
                {
                    if (!Firebug.shouldIgnore(selections[j]))
                        elements.push(selections[j]);
                }
            }
            else
            {
                throw new Error("Selection Failed: " + selections);
            }
        }

        return elements;
    }
});

//********************************************************************************************* //
//Registration

Firebug.registerModule(CSSSelectorsModule);

return CSSSelectorsModule;

//********************************************************************************************* //
});
