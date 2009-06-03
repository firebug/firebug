/* See license.txt for terms of usage */

FBL.ns(function() { with (FBL) {

// ************************************************************************************************
// Constants

const searchDelay = 150;

// ************************************************************************************************

Firebug.Search = extend(Firebug.Module,
{
    dispatchName: "search",
    search: function(text, context)
    {
        var searchBox = Firebug.chrome.$("fbSearchBox");
        searchBox.value = text;
        this.update(context);
    },

    enter: function(context)
    {
        var panel = Firebug.chrome.getSelectedPanel();
        if (!panel.searchable)
            return;

        var searchBox = Firebug.chrome.$("fbSearchBox");
        var value = searchBox.value;

        panel.search(value, true);
    },

    cancel: function(context)
    {
        this.search("", context);
    },

    clear: function(context)
    {
        var searchBox = Firebug.chrome.$("fbSearchBox");
        searchBox.value = "";
    },

    displayOnly: function(text, context)
    {
        var searchBox = Firebug.chrome.$("fbSearchBox");

        if (text && text.length > 0)
            setClass(searchBox, "fbSearchBox-attention");
        else
            removeClass(searchBox, "fbSearchBox-attention");

        searchBox.value = text;
    },

    focus: function(context)
    {
        if (Firebug.isDetached())
            Firebug.chrome.focus();
        else
            Firebug.toggleBar(true);

        var searchBox = Firebug.chrome.$("fbSearchBox");
        searchBox.focus();
        searchBox.select();
    },

    update: function(context, immediate, reverse)
    {
        var panel = Firebug.chrome.getSelectedPanel();
        if (!panel.searchable)
            return;

        var searchBox = Firebug.chrome.$("fbSearchBox");
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
            var found = panel.search(value, reverse);
            if (!found && value)
                beep();

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

            panel.searchText = value;
        }
        else
        {
            // After a delay, perform the search
            panelNode.searchTimeout = setTimeout(function()
            {
                Firebug.Search.showOptions(context);

                var found = panel.search(value, reverse);
                if (!found && value)
                    Firebug.Search.onNotFound(value);

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

                panel.searchText = value;
            }, searchDelay);
        }
    },

    onNotFound: function()
    {
        beep();
    },

    showOptions: function(context)
    {
        var panel = Firebug.chrome.getSelectedPanel();
        if (!panel.searchable)
            return;

        var searchBox = Firebug.chrome.$("fbSearchBox");

        // Get search options popup menu.
        var optionsPopup = Firebug.chrome.$("fbSearchOptionsPopup");
        if (optionsPopup.state == "closed")
        {
            eraseNode(optionsPopup);

            // The list of options is provided by the current panel.
            var menuItems = panel.getSearchOptionsMenuItems();
            if (menuItems)
            {
                for (var i=0; i<menuItems.length; i++)
                    FBL.createMenuItem(optionsPopup, menuItems[i]);

                optionsPopup.openPopup(searchBox, "before_start", 0, -5, false, false);
            }
        }

        // Update search caseSensitive option according to the current capitalization.
        var searchString = searchBox.value;
        Firebug.searchCaseSensitive = (searchString != searchString.toLowerCase());
    },

    hideOptions: function()
    {
        var searchOptions = Firebug.chrome.$("fbSearchOptionsPopup");
        if (searchOptions)
            searchOptions.hidePopup();
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    // extends Module




});

// ************************************************************************************************

Firebug.registerModule(Firebug.Search);

// ************************************************************************************************

}});
