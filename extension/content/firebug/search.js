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

    update: function(context, immediate, reverse)
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
                Firebug.Search.showOptions();

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

    showOptions: function()
    {
        var panel = FirebugChrome.getSelectedPanel();
        if (!panel.searchable)
            return;

        var searchBox = FirebugChrome.$("fbSearchBox");

        // Get search options popup menu.
        var optionsPopup = FirebugChrome.$("fbSearchOptionsPopup");
        if (optionsPopup.state == "closed")
        {
            FBL.eraseNode(optionsPopup);

            // The list of options is provided by the current panel.
            var menuItems = panel.getSearchOptionsMenuItems();
            if (menuItems)
            {
                for (var i=0; i<menuItems.length; i++)
                    FBL.createMenuItem(optionsPopup, menuItems[i]);
            }

            optionsPopup.openPopup(searchBox, "before_start", 0, -5, false, false);
        }

        // Update label of the searchCaseSensitive option.
        var items = optionsPopup.getElementsByAttribute("option", "searchCaseSensitive");
        if (items.length > 0)
        {
            var searchString = searchBox.value;
            var showSearch = "Find " + searchString;   // NLS xxxHonza: localization

            var lower = searchString.toLowerCase();
            if (searchString == lower)
            {
                Firebug.searchCaseSensitive = false;
                showSearch += ", ..., " + searchString.toUpperCase();
            }
            else
            {
                Firebug.searchCaseSensitive = true;
            }

            items[0].label = showSearch;
        }
    },

    hideOptions: function()
    {
        var searchOptions = FirebugChrome.$("fbSearchOptionsPopup");
        if (searchOptions)
            searchOptions.hidePopup();
    },

    onSearchBoxFocus: function(event)
    {
        if (FBTrace.DBG_SEARCH)
            FBTrace.sysout("onSearchBoxFocus no-op");
        //this.showOptions();
    },

    onSearchButtonKey: function(event)
    {
        if (FBTrace.DBG_SEARCH)
            FBTrace.sysout("onSearchButtonKey ", event);
        var searchBox = FirebugChrome.$("fbSearchBox");
        searchBox.dispatchEvent(event);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    // extends Module

    initialize: function()
    {
        this.onSearchBoxFocus =  bind(this.onSearchBoxFocus, this);
        this.onSearchButtonKey = bind(this.onSearchButtonKey, this);
    },

    enable: function()
    {
        var searchBox = FirebugChrome.$("fbSearchBox");
        searchBox.value = "";
        searchBox.disabled = false;
        searchBox.addEventListener('focus', this.onSearchBoxFocus, true);

        var searchOptions = FirebugChrome.$("fbSearchButtons");
        searchOptions.addEventListener('keypress', this.onSearchButtonKey, true);
    },

    disable: function()
    {
        var searchBox = FirebugChrome.$("fbSearchBox");
        searchBox.value = "";
        searchBox.disabled = true;
        searchBox.removeEventListener('focus', this.onSearchBoxFocus, true);

        var searchOptions = FirebugChrome.$("fbSearchButtons");
        searchOptions.removeEventListener('keypress', this.onSearchButtonKey, true);
    }
});

// ************************************************************************************************

Firebug.registerModule(Firebug.Search);

// ************************************************************************************************

}});
