/* See license.txt for terms of usage */

FBL.ns(function() { with (FBL) {

// ************************************************************************************************
// Constants

const searchDelay = 150;

// ************************************************************************************************

/**
 * @module Implements basic search box functionality. The box is displayed on the right side
 * of the Firebug's toolbar. Specific search capabilities depends on the current panel
 * and implemented in <code>panel.search</code> method. The search-box is automatically
 * available for panels that have <code>searchable<code> property set to true (set to
 * false by default).
 */
Firebug.Search = extend(Firebug.Module,
{
    dispatchName: "search",
    search: function(text, context)
    {
        var searchBox = Firebug.chrome.$("fbSearchBox");
        searchBox.value = text;
        this.update(context);
    },
    searchNext: function(context) {
      this.update(context, true, false);
    },
    searchPrev: function(context) {
      this.update(context, true, true);
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

    isCaseSensitive: function(text)
    {
        return !!Firebug.searchCaseSensitive || text.toLowerCase() != text;
    },
    getTestingRegex: function(text)
    {
      var caseSensitive = Firebug.Search.isCaseSensitive(text);
      try
      {
          return new RegExp(text, caseSensitive ? "g" : "gi");
      }
      catch (err)
      {
          // The user entered an invalid regex. Duck type the regex object
          // to support literal searches when an invalid regex is entered
          return new LiteralRegExp(text, false, caseSensitive);
      }
    },

    searchOptionMenu: function(label, option)
    {
      return { label: label, checked: Firebug[option], option: option,
        command: bindFixed(this.onToggleSearchOption, this, option) };
    },
    onToggleSearchOption: function(option)
    {
        Firebug.setPref(Firebug.prefDomain, option, !Firebug[option]);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    // extends Module

    initializeUI: function()
    {
    },

    shutdown: function()
    {
    },

    showPanel: function(browser, panel)
    {
        // Manage visibility of the search-box according to the searchable flag.
        var searchBox = Firebug.chrome.$("fbSearchBox");
        searchBox.value = "";
        removeClass(searchBox, "fbSearchBox-attention");
        
        if (panel)
        {
            searchBox.collapsed = !panel.searchable;
            searchBox.updateOptions(panel.getSearchOptionsMenuItems());
        }
        else
            searchBox.collapsed = false;  
    }
});

// ************************************************************************************************

Firebug.registerModule(Firebug.Search);

// ************************************************************************************************
}});
