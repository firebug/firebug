/* See license.txt for terms of usage */

define([
    "firebug/lib/xpcom",
    "firebug/lib/object",
    "firebug/lib/locale",
    "firebug/lib/domplate",
    "firebug/lib/dom",
    "firebug/lib/options",
    "firebug/lib/persist",
    "firebug/lib/string",
    "firebug/lib/http",
    "firebug/lib/css",
    "firebug/lib/events",
    "firebug/cookies/menuUtils",
    "firebug/cookies/templates",
    "firebug/cookies/headerResizer",
    "firebug/cookies/cookieObserver",
    "firebug/cookies/cookieUtils",
    "firebug/cookies/cookie",
    "firebug/cookies/breakpoints",
    "firebug/cookies/cookieModule",
],
function(Xpcom, Obj, Locale, Domplate, Dom, Options, Persist, Str, Http, Css, Events,
    MenuUtils, Templates, HeaderResizer, CookieObserver, CookieUtils, Cookie, Breakpoints,
    FireCookieModel) {

with (Domplate) {

// ********************************************************************************************* //
// Constants

const Cc = Components.classes;
const Ci = Components.interfaces;

// Firecookie preferences
const logEventsPref = "firecookie.logEvents";
const showRejectedCookies = "firecookie.showRejectedCookies";
const lastSortedColumn = "firecookie.lastSortedColumn";
const hiddenColsPref = "firecookie.hiddenColumns";
const removeConfirmation = "firecookie.removeConfirmation";

// Services
var cookieManager = Xpcom.CCSV("@mozilla.org/cookiemanager;1", "nsICookieManager2");

const networkPrefDomain = "network.cookie";
const cookieBehaviorPref = "cookieBehavior";

// ********************************************************************************************* //
// Panel Implementation

/**
 * @panel This class represents the Cookies panel that is displayed within
 * Firebug UI.
 */
function FireCookiePanel() {}

FireCookiePanel.prototype = Obj.extend(Firebug.ActivablePanel,
/** @lends FireCookiePanel */
{
    name: "cookies",
    title: Locale.$STR("firecookie.Panel"),
    searchable: true,
    breakable: true,
    order: 200, // Place just after the Net panel.

    initialize: function(context, doc)
    {
        // xxxHonza
        // This initialization is made as soon as the Cookies panel
        // is opened the first time.
        // This means that columns are *not* resizeable within the console
        // (rejected cookies) till this activation isn't executed.

        // Initialize event listeners before the ancestor is called.
        var hcr = HeaderResizer;
        this.onMouseClick = Obj.bind(hcr.onMouseClick, hcr);
        this.onMouseDown = Obj.bind(hcr.onMouseDown, hcr);
        this.onMouseMove = Obj.bind(hcr.onMouseMove, hcr);
        this.onMouseUp = Obj.bind(hcr.onMouseUp, hcr);
        this.onMouseOut = Obj.bind(hcr.onMouseOut, hcr);

        this.onContextMenu = Obj.bind(this.onContextMenu, this);

        Firebug.ActivablePanel.initialize.apply(this, arguments);

        // Just after the initialization, so the this.document member is set.
        Firebug.FireCookieModel.addStyleSheet(this);

        this.refresh();
    },

    /**
     * Renders list of cookies displayed within the Cookies panel.
     */
    refresh: function()
    {
        if (!Firebug.FireCookieModel.isEnabled(this.context))
            return;

        // Create cookie list table.
        this.table = Templates.CookieTable.createTable(this.panelNode);

        // Cookies are displayed only for web pages.
        var location = this.context.window.location;
        if (!location)
            return;

        var protocol = location.protocol;
        if (protocol.indexOf("http") != 0)
            return;

        // Get list of cookies for the current page.
        var cookies = [];
        var iter = cookieManager.enumerator;
        while (iter.hasMoreElements())
        {
            var cookie = iter.getNext();
            if (!cookie)
                break;

            cookie = cookie.QueryInterface(Ci.nsICookie2);
            if (!CookieObserver.isCookieFromContext(this.context, cookie))
                continue;

            var cookieWrapper = new Cookie(CookieUtils.makeCookieObject(cookie));
            cookies.push(cookieWrapper);
        }

        // If the filter allow it, display all rejected cookies as well.
        if (Options.get(showRejectedCookies))
        {
            // xxxHonza the this.context.cookies is sometimes null, but
            // this must be because FB isn't correctly initialized.
            if (!this.context.cookies)
            {
                if (FBTrace.DBG_COOKIES) 
                {
                    FBTrace.sysout(
                        "cookies.Cookie context isn't properly initialized - ERROR: " +
                        this.context.getName());
                }
                return;
            }

            var activeHosts = this.context.cookies.activeHosts;
            for (var hostName in activeHosts)
            {
                var host = activeHosts[hostName];
                if (!host.rejected)
                    continue;

                var receivedCookies = host.receivedCookies;
                if (receivedCookies)
                    cookies = extendArray(cookies, receivedCookies);
            }
        }

        // Generate HTML list of cookies using domplate.
        if (cookies.length)
        {
            var header = Dom.getElementByClass(this.table, "cookieHeaderRow");
            var tag = Templates.CookieRow.cookieTag;
            var row = tag.insertRows({cookies: cookies}, header)[0];
            for (var i=0; i<cookies.length; i++)
            {
                var cookie = cookies[i];
                cookie.row = row;

                Breakpoints.updateBreakpoint(this.context, cookie);
                row = row.nextSibling;
            }
        }

        if (FBTrace.DBG_COOKIES)
            FBTrace.sysout("cookies.Cookie list refreshed.\n", cookies);

        // Sort automaticaly the last sorted column. The preference stores
        // two things: name of the sorted column and sort direction asc|desc.
        // Example: colExpires asc
        var prefValue = Options.get(lastSortedColumn);
        if (prefValue) {
            var values = prefValue.split(" ");
            Templates.CookieTable.sortColumn(this.table, values[0], values[1]);
        }

        // Update visibility of columns according to the preferences
        var hiddenCols = Options.get(hiddenColsPref);
        if (hiddenCols)
            this.table.setAttribute("hiddenCols", hiddenCols);
    },

    initializeNode: function(oldPanelNode)
    {
        if (FBTrace.DBG_COOKIES)
            FBTrace.sysout("cookies.FireCookiePanel.initializeNode\n");

        // xxxHonza 
        // This method isn't called when FB UI is detached. So, the columns
        // are *not* resizable when FB is open in external window.

        // Register event handlers for table column resizing.
        this.document.addEventListener("click", this.onMouseClick, true);
        this.document.addEventListener("mousedown", this.onMouseDown, true);
        this.document.addEventListener("mousemove", this.onMouseMove, true);
        this.document.addEventListener("mouseup", this.onMouseUp, true);
        this.document.addEventListener("mouseout", this.onMouseOut, true);

        this.panelNode.addEventListener("contextmenu", this.onContextMenu, false);
    },

    destroyNode: function()
    {
        if (FBTrace.DBG_COOKIES)
            FBTrace.sysout("cookies.FireCookiePanel.destroyNode\n");

        this.document.removeEventListener("mouseclick", this.onMouseClick, true);
        this.document.removeEventListener("mousedown", this.onMouseDown, true);
        this.document.removeEventListener("mousemove", this.onMouseMove, true);
        this.document.removeEventListener("mouseup", this.onMouseUp, true);
        this.document.removeEventListener("mouseout", this.onMouseOut, true);

        this.panelNode.removeEventListener("contextmenu", this.onContextMenu, false);
    },

    onContextMenu: function(event)
    {
        Breakpoints.onContextMenu(this.context, event);
    },

    detach: function(oldChrome, newChrome)
    {
        Firebug.ActivablePanel.detach.apply(this, arguments);
    },

    reattach: function(doc)
    {
        Firebug.ActivablePanel.reattach.apply(this, arguments);
    },

    clear: function()
    {
        if (this.panelNode)
            clearNode(this.panelNode);

        this.table = null;
    },

    show: function(state)
    {
        // Update permission button in the toolbar.
        Firebug.FireCookieModel.Perm.updatePermButton(this.context);

        // For backward compatibility with Firebug 1.1
        //
        // Firebug 1.6 removes Firebug.DisabledPanelPage, simplifies the activation
        // and the following code is not necessary any more.
        if (Firebug.ActivableModule && Firebug.DisabledPanelPage)
        {
            var shouldShow = Firebug.FireCookieModel.isEnabled(this.context);
            this.showToolbarButtons("fbCookieButtons", shouldShow);
            if (!shouldShow)
            {
                // The activation model has been changed in Firebug 1.4. This is 
                // just to keep backward compatibility.
                if (Firebug.DisabledPanelPage.show)
                    Firebug.DisabledPanelPage.show(this, Firebug.FireCookieModel);
                else
                    Firebug.FireCookieModel.disabledPanelPage.show(this);
                return;
            }
        }
        else
        {
            this.showToolbarButtons("fbCookieButtons", true); 
        }

        if (Firebug.chrome.setGlobalAttribute)
        {
            Firebug.chrome.setGlobalAttribute("cmd_resumeExecution", "breakable", "true");
            Firebug.chrome.setGlobalAttribute("cmd_resumeExecution", "tooltiptext",
                Locale.$STR("firecookie.Break On Cookie"));
        }
    },

    hide: function()
    {
        this.showToolbarButtons("fbCookieButtons", false);
    },

    // Options menu
    getOptionsMenuItems: function(context)
    {
        return [
            MenuUtils.optionAllowGlobally(context, "firecookie.AllowGlobally",
                networkPrefDomain, cookieBehaviorPref),
            /*MenuUtils.optionMenu(context, "firecookie.clearWhenDeny",
                Firebug.prefDomain, clearWhenDeny),*/
            MenuUtils.optionMenu(context, "firecookie.LogEvents",
                Firebug.prefDomain, logEventsPref),
            MenuUtils.optionMenu(context, "firecookie.Confirm cookie removal",
                Firebug.prefDomain, removeConfirmation)
        ];
    },

    getContextMenuItems: function(object, target)
    {
        var items = [];

        // If the user clicked at a cookie row, the context menu is already
        // initialized and so, bail out.
        var cookieRow = Dom.getAncestorByClass(target, "cookieRow");
        if (cookieRow)
            return items;

        // Also bail out if the user clicked on the header.
        var header = Dom.getAncestorByClass(target, "cookieHeaderRow");
        if (header)
            return items;

        // Make sure default items (cmd_copy) is removed.
        Templates.Rep.getContextMenuItems.apply(this, arguments);

        // Create Paste menu-item so, a new cookie can be pasted even if the user
        // clicks within the panel area (not on a cookie row)
        items.push({
            label: $STR("firecookie.Paste"),
            nol10n: true,
            disabled: CookieClipboard.isCookieAvailable() ? false : true,
            command: Obj.bindFixed(Templates.CookieRow.onPaste, Templates.CookieRow)
        });

        return items;
    },

    search: function(text)
    {
        if (!text)
            return;

        // Make previously visible nodes invisible again
        if (this.matchSet)
        {
            for (var i in this.matchSet)
                Css.removeClass(this.matchSet[i], "matched");
        }

        this.matchSet = [];

        function findRow(node) { return Dom.getAncestorByClass(node, "cookieRow"); }
        var search = new TextSearch(this.panelNode, findRow);

        var cookieRow = search.find(text);
        if (!cookieRow)
            return false;

        for (; cookieRow; cookieRow = search.findNext())
        {
            Css.setClass(cookieRow, "matched");
            this.matchSet.push(cookieRow);
        }

        return true;
    },

    getPopupObject: function(target)
    {
        var header = Dom.getAncestorByClass(target, "cookieHeaderRow");
        if (header)
            return Templates.CookieTable;

        return Firebug.ActivablePanel.getPopupObject.apply(this, arguments);
    },

    findRepObject: function(cookie)
    {
        var strippedHost = CookieUtils.makeStrippedHost(cookie.host);

        var result = null;
        this.enumerateCookies(function(rep)
        {
            if (rep.rawHost == strippedHost &&
                rep.cookie.name == cookie.name &&
                rep.cookie.path == cookie.path)
            {
                result = rep;
                return true; // break iteration
            }
        });

        return result;
    },

    supportsObject: function(object)
    {
        return object instanceof Cookie;
    },

    updateSelection: function(cookie)
    {
        var repCookie = this.findRepObject(cookie.cookie);
        if (!repCookie)
            return;

        Templates.CookieRow.toggleRow(repCookie.row, true);
        Dom.scrollIntoCenterView(repCookie.row);
    },

    enumerateCookies: function(fn)
    {
        if (!this.table)
            return;

        var rows = Dom.getElementsByClass(this.table, "cookieRow");
        for (var i=0; i<rows.length; i++)
        {
            var cookie = Firebug.getRepObject(rows[i]);
            if (!cookie)
                continue;

            if (fn(cookie))
                break;
        }
    },

    getEditor: function(target, value)
    {
        if (!this.conditionEditor)
            this.conditionEditor = new Firebug.FireCookieModel.ConditionEditor(this.document);
        return this.conditionEditor;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    // Support for Break On Next

    breakOnNext: function(breaking)
    {
        this.context.breakOnCookie = breaking;

        if (FBTrace.DBG_COOKIES)
            FBTrace.sysout("cookies.breakOnNext; " + context.breakOnCookie + ", " +
                context.getName());
    },

    shouldBreakOnNext: function()
    {
        return this.context.breakOnCookie;
    },

    getBreakOnNextTooltip: function(enabled)
    {
        return (enabled ? Locale.$STR("firecookie.Disable Break On Cookie") :
            Locale.$STR("firecookie.Break On Cookie"));
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    // Panel Activation

    onActivationChanged: function(enable)
    {
        if (FBTrace.DBG_COOKIES || FBTrace.DBG_ACTIVATION)
            FBTrace.sysout("firecookie.FireCookiePanel.onActivationChanged; " + enable);

        if (enable)
        {
            Firebug.FireCookieModel.addObserver(this);
            Firebug.Debugger.addListener(Firebug.FireCookieModel.DebuggerListener);
            Firebug.Console.addListener(Firebug.FireCookieModel.ConsoleListener);
        }
        else
        {
            Firebug.FireCookieModel.removeObserver(this);
            Firebug.Debugger.removeListener(Firebug.FireCookieModel.DebuggerListener);
            Firebug.Console.removeListener(Firebug.FireCookieModel.ConsoleListener);
        }
    },
}); 

// ********************************************************************************************* //
// Registration

Firebug.registerPanel(FireCookiePanel);

return FireCookiePanel;

// ********************************************************************************************* //
}});

