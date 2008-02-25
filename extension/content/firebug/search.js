/* See license.txt for terms of usage */

FBL.ns(function() { with (FBL) {

// ************************************************************************************************
// Constants

const searchDelay = 150;

// ************************************************************************************************

Firebug.Search = extend(Firebug.Module,
{
    search: function(text, context)
    {
        var searchBox = context.chrome.$("fbSearchBox");
        searchBox.value = text;
        this.update(context);
    },

    enter: function(context)
    {
        var panel = context.chrome.getSelectedPanel();
        if (!panel.searchable)
            return;

        var searchBox = context.chrome.$("fbSearchBox");
        var value = searchBox.value;

        panel.search(value, true);
    },

    cancel: function(context)
    {
        this.search("", context);
    },

    clear: function(context)
    {
        var searchBox = context.chrome.$("fbSearchBox");
        searchBox.value = "";
    },

    displayOnly: function(text, context)
    {
        var searchBox = context.chrome.$("fbSearchBox");

        if (text && text.length > 0)
            setClass(searchBox, "fbSearchBox-attention");
        else
            removeClass(searchBox, "fbSearchBox-attention");

        searchBox.value = text;
    },

    focus: function(context)
    {
        if (context.detached)
            context.chrome.focus();
        else
            Firebug.toggleBar(true);

        var searchBox = context.chrome.$("fbSearchBox");
        searchBox.focus();
        searchBox.select();
    },

    update: function(context, immediate)
    {
        var panel = context.chrome.getSelectedPanel();
        if (!panel.searchable)
            return;

        var searchBox = context.chrome.$("fbSearchBox");
        var panelNode = panel.panelNode;

        var value = searchBox.value;

        // This sucks, but the find service won't match nodes that are invisible, so we
        // have to make sure to make them all visible unless the user is appending to the
        // last string, in which case it's ok to just search the set of visible nodes
        if (!panel.searchText || value.indexOf(panel.searchText) != 0)
            removeClass(panelNode, "searching");

        // Cancel the previous search to keep typing smooth
        clearTimeout(panelNode.searchTimeout);

        if (immediate)
        {
            var found = panel.search(value);
            if (!found && value)
                beep();

            panel.searchText = value;
        }
        else
        {
            // After a delay, perform the search
            panelNode.searchTimeout = setTimeout(function()
            {
                if (value)
                {
                    // Hides all nodes that didn't pass the filter
                    setClass(panelNode, "searching");
                }
                else
                {
                    // Makes all nodes visible again
                    removeClass(panelNode, "searching");
                }

                var found = panel.search(value);
                if (!found && value)
                    beep();

                panel.searchText = value;
            }, searchDelay);
        }
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    // extends Module

    enable: function()
    {
        var searchBox = FirebugChrome.$("fbSearchBox");
        searchBox.value = "";
        searchBox.disabled = false;
    },

    disable: function()
    {
        var searchBox = FirebugChrome.$("fbSearchBox");
        searchBox.value = "";
        searchBox.disabled = true;
    },

    showPanel: function(browser, panel)
    {
        var chrome = browser.chrome;
        var searchBox = chrome.$("fbSearchBox");
        searchBox.value = panel && panel.searchText ? panel.searchText : "";
        searchBox.disabled = !panel || !panel.searchable;
    }
});

// ************************************************************************************************

Firebug.registerModule(Firebug.Search);

// ************************************************************************************************

}});
