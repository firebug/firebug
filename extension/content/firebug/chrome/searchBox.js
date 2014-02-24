/* See license.txt for terms of usage */

define([
    "firebug/firebug",
    "firebug/lib/object",
    "firebug/lib/css",
    "firebug/lib/search",
    "firebug/lib/system",
    "firebug/lib/string",
    "firebug/lib/locale",
    "firebug/lib/options",
    "firebug/lib/promise",
    "firebug/chrome/module",
],
function(Firebug, Obj, Css, Search, System, Str, Locale, Options, Promise, Module) {

"use strict";

// ********************************************************************************************* //
// Constants

var Ci = Components.interfaces;

// For smooth incremental searching (in case the user is typing quickly).
var searchDelay = 150;

// Tracing
var TraceError = FBTrace.toError();
var Trace = FBTrace.to("DBG_SEARCH");

// ********************************************************************************************* //

/**
 * @module Implements basic search box functionality. The box is displayed on the right side
 * of the Firebug's toolbar. Specific search capabilities depends on the current panel
 * implemented in {@link Panel.search} method.
 * The search-box is automatically available for panels that have {@link Panel.searchable}
 * property set to true (false by default).
 */
var SearchBox = Obj.extend(Module,
/** @lends SearchBox */
{
    dispatchName: "searchBox",

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Module Implementation

    internationalizeUI: function()
    {
        var sensitive = Firebug.chrome.$("fbSearchBoxIsSensitive");
        sensitive.value = Locale.$STR("search.Case_Sensitive");
        sensitive.setAttribute("tooltiptext", Locale.$STR("search.tip.Case_Sensitive"));

        var notSensitive = Firebug.chrome.$("fbSearchBoxIsNotSensitive");
        notSensitive.value = Locale.$STR("search.Case_Insensitive");
        notSensitive.setAttribute("tooltiptext", Locale.$STR("search.tip.Case_Insensitive"));
    },

    shutdown: function()
    {
    },

    showPanel: function(browser, panel)
    {
        // Manage visibility of the search-box according to the searchable flag.
        var searchBox = Firebug.chrome.$("fbSearchBox");
        searchBox.status = "noSearch";

        Css.removeClass(searchBox, "fbSearchBox-attention");
        Css.removeClass(searchBox, "fbSearchBox-autoSensitive");

        if (panel)
        {
            searchBox.collapsed = !panel.searchable;
            searchBox.updateOptions(panel.getSearchOptionsMenuItems());
        }
        else
        {
            searchBox.collapsed = false;
        }

        Trace.sysout("searchBox.showPanel; status: " + searchBox.status);

        this.setPlaceholder();
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Search Logic

    /**
     * Executed when the user focuses the search box by accel+f keyboard shortcut
     * causing the search box to get keyboard focus.
     */
    onSearchCommand: function(document)
    {
        var el = document.activeElement;
        var id = el.id;
        var doSearch = true;

        if (id == "fbPanelBar1-browser" || id == "fbPanelBar2-browser")
        {
            var sel = el.contentWindow.getSelection().toString();
            if (!sel)
            {
                var input = el.contentDocument.activeElement;
                if (input instanceof Ci.nsIDOMNSEditableElement)
                {
                    sel = input.QueryInterface(Ci.nsIDOMNSEditableElement).
                        editor.selection.toString();
                }
                else
                {
                    doSearch = false;
                }
            }

            if (doSearch)
                this.search(sel, Firebug.currentContext);
        }

        this.focus();
    },

    search: function(text, context)
    {
        var searchBox = Firebug.chrome.$("fbSearchBox");
        searchBox.value = text;

        this.update(context);
    },

    searchNext: function(context)
    {
        return this.update(context, true, false);
    },

    searchPrev: function(context)
    {
        return this.update(context, true, true);
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

    /**
     * Implements the main search logic, which is consequently distributed to the
     * current panel.
     *
     * @param {TabContext} context The current Firebug context (document)
     * @param {Boolean} immediate Set to true if the search should start synchronously.
     * This field is used for search 'previous' and 'next', otherwise searching is always done
     * on timeout so it doesn't slow down user typing within the search box (search
     * result is updated as the user is typing).
     * @param {Boolean} reverse Set to true if the search should be performed backwards.
     */
    update: function(context, immediate, reverse)
    {
        var panel = Firebug.chrome.getSelectedPanel();
        if (!panel || !panel.searchable)
            return;

        var searchBox = Firebug.chrome.$("fbSearchBox");
        var panelNode = panel.panelNode;

        var value = searchBox.value;

        this.addToHistory(value);

        // This sucks, but the find service won't match nodes that are invisible, so we
        // have to make sure to make them all visible unless the user is appending to the
        // last string, in which case it's ok to just search the set of visible nodes
        if (!panel.searchText || value == panel.searchText ||
            !Str.hasPrefix(value, panel.searchText))
        {
            Css.removeClass(panelNode, "searching");
        }

        if (SearchBox.isCaseSensitive(value))
            Css.setClass(searchBox, "fbSearchBox-autoSensitive");
        else
            Css.removeClass(searchBox, "fbSearchBox-autoSensitive");

        Trace.sysout("searchBox.update; isAutoSensitive(value): " +
            SearchBox.isAutoSensitive(value) + " for " + value, searchBox);

        // Cancel the previous search to keep typing smooth
        // xxxHonza: perhaps we could also reject the previous in-progress promise?
        clearTimeout(panelNode.searchTimeout);

        var self = this;
        var doSearch = function()
        {
            var result = panel.search(value, reverse);
            panel.searchText = value;

            // It's not nice to use isPromise in general, but {@link Promise} as the return
            // value of {@link Panel.search} method isn't mandatory for now.
            if (isPromise(result))
            {
                // TODO: we can set the icon to a doc-loading spinner
                // (or keep "searching" in place).
                result.then(function(found)
                {
                    // TODO: remove the doc-loading icon if any.
                    self.onResult(panel, found, immediate);

                    // In case the promise is resolved synchronously, the return value
                    // will be the real result value (not a promise).
                    result = found;
                });
            }
            else
            {
                self.onResult(panel, result, immediate);
            }

            return result;
        };

        if (immediate)
            return doSearch();
        else
            panelNode.searchTimeout = setTimeout(doSearch, searchDelay);

        Trace.sysout("searchBox.update; END");
    },

    onResult: function(panel, result, immediate)
    {
        Trace.sysout("searchBox.onResult; result: " + result, result);

        var searchBox = Firebug.chrome.$("fbSearchBox");
        var value = searchBox.value;

        if (!result && value)
        {
            // For non-immediate (automatic) searches, ignore search failures if
            // the panel tells us to. This is used e.g. for HTML panel selector
            // searches, where even if a typed string (".cla", say) doesn't
            // match anything, an extension of it (".class") still could.
            var shouldIgnore = panel.shouldIgnoreIntermediateSearchFailure;
            if (!immediate && shouldIgnore && shouldIgnore.call(panel, value))
                result = true;
            else
                this.onNotFound();
        }

        this.updatePanelStyle(panel, value);

        // The {@link Panel.search} method result value has three states:
        // true: match has been found further in the current document
        // false: match not found
        // "wraparound": match has been found in the next document, or search started
        //      from the beginning again.
        if (typeof result == "string")
            searchBox.status = result;
        else
            searchBox.status = (result ? "found" : "notfound");

        Trace.sysout("searchBox.onResult; status: " + searchBox.status +
            ", value: " + value + ", result: " + result);

        return result;
    },

    updatePanelStyle: function(panel, value)
    {
        var panelNode = panel.panelNode;

        if (value)
        {
            // Hides all nodes that didn't pass the filter
            Css.setClass(panelNode, "searching");
        }
        else
        {
            // Makes all nodes visible again
            Css.removeClass(panelNode, "searching");
        }
    },

    onNotFound: function()
    {
        if (this.status != "notfound")
            System.beep();
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Search Options

    isCaseSensitive: function(text)
    {
        return !!Options.get("searchCaseSensitive") || this.isAutoSensitive(text);
    },

    isAutoSensitive: function(text)
    {
        return (text.toLowerCase() !== text);
    },

    getTestingRegex: function(text)
    {
        var caseSensitive = SearchBox.isCaseSensitive(text);

        try
        {
            if (Options.get("searchUseRegularExpression"))
                return new RegExp(text, caseSensitive ? "g" : "gi");
            else
                return new Search.LiteralRegExp(text, false, caseSensitive);
        }
        catch (err)
        {
            // The user entered an invalid regex. Duck type the regex object
            // to support literal searches when an invalid regex is entered
            return new Search.LiteralRegExp(text, false, caseSensitive);
        }
    },

    searchOptionMenu: function(label, option, tooltiptext)
    {
        return {
            label: label,
            tooltiptext: tooltiptext,
            checked: Options.get(option),
            option: option,
            command: Obj.bindFixed(this.onToggleSearchOption, this, option)
        };
    },

    onToggleSearchOption: function(option)
    {
        Options.togglePref(option);

        // Make sure the "Case Sensitive || Case Insensitive" label is updated.
        this.update();
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // History

    history: [""],

    addToHistory: function(val)
    {
        var history = this.history;

        if (!history[0] || Str.hasPrefix(val, history[0]))
            history[0] = val;
        else if (Str.hasPrefix(history[0], val))
            return;
        else
            history.unshift(val);
    },

    cycleHistory: function(dir)
    {
        var history = this.history;
        if (dir > 0)
            history.unshift(history.pop());
        else
            history.push(history.shift());

        return history[0];
    },

    setPlaceholder: function()
    {
        var panel = Firebug.chrome.getSelectedPanel();
        if (!panel)
            return;

        var searchBox = Firebug.chrome.$("fbSearchBox");
        if (panel.searchPlaceholder)
        {
            searchBox.placeholder = Locale.$STR(panel.searchPlaceholder);
        }
        else
        {
            var panelType = Firebug.getPanelType(panel.name);
            var title = Firebug.getPanelTitle(panelType);
            searchBox.placeholder = Locale.$STRF("search.Placeholder", [title]);
        }
    },
});

// ********************************************************************************************* //
// Helpers

function isPromise(object)
{
    return object && typeof object.then == "function";
}

// ********************************************************************************************* //
// Registration

Firebug.registerModule(SearchBox);

// xxxHonza: backward compatibility
// Replace all Firebug.Search by SearchBox
Firebug.Search = SearchBox;

return SearchBox;

// ********************************************************************************************* //
});
