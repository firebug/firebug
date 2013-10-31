/* See license.txt for terms of usage */

define([
    "firebug/chrome/activableModule",
    "firebug/chrome/activablePanel",
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
    "firebug/lib/array",
    "firebug/lib/search",
    "firebug/cookies/menuUtils",
    "firebug/cookies/cookieReps",
    "firebug/cookies/headerResizer",
    "firebug/cookies/cookieObserver",
    "firebug/cookies/cookieUtils",
    "firebug/cookies/cookie",
    "firebug/cookies/breakpoints",
    "firebug/cookies/cookiePermissions",
    "firebug/cookies/cookieClipboard",
],
function(ActivableModule, ActivablePanel, Xpcom, Obj, Locale, Domplate, Dom, Options, Persist,
    Str, Http, Css, Events, Arr, Search, MenuUtils, CookieReps, HeaderResizer, CookieObserver,
    CookieUtils, Cookie, Breakpoints, CookiePermissions, CookieClipboard) {

// ********************************************************************************************* //
// Constants

var {domplate, DIV, TR, P, A} = Domplate;

const Ci = Components.interfaces;

// Cookies preferences
const showRejectedCookies = "cookies.showRejectedCookies";
const lastSortedColumn = "cookies.lastSortedColumn";
const hiddenColsPref = "cookies.hiddenColumns";
const removeConfirmation = "cookies.removeConfirmation";

// Services
var cookieManager = Xpcom.CCSV("@mozilla.org/cookiemanager;1", "nsICookieManager2");

const panelName = "cookies";

// ********************************************************************************************* //
// Panel Implementation

/**
 * @panel This class represents the Cookies panel that is displayed within
 * Firebug UI.
 */
function CookiePanel() {}

CookiePanel.prototype = Obj.extend(ActivablePanel,
/** @lends CookiePanel */
{
    name: panelName,
    title: Locale.$STR("cookies.Panel"),
    searchable: true,
    breakable: true,

    // Place just after the Net panel
    order: 200,

    initialize: function(context, doc)
    {
        // xxxHonza:
        // This initialization is made as soon as the Cookies panel
        // is opened the first time.
        // This means that columns are *not* resizable within the console
        // (rejected cookies) till this activation isn't executed.

        // Initialize event listeners before the ancestor is called
        var hcr = HeaderResizer;
        this.onMouseClick = Obj.bind(hcr.onMouseClick, hcr);
        this.onMouseDown = Obj.bind(hcr.onMouseDown, hcr);
        this.onMouseMove = Obj.bind(hcr.onMouseMove, hcr);
        this.onMouseUp = Obj.bind(hcr.onMouseUp, hcr);
        this.onMouseOut = Obj.bind(hcr.onMouseOut, hcr);

        this.onContextMenu = Obj.bind(this.onContextMenu, this);

        ActivablePanel.initialize.apply(this, arguments);

        Firebug.ConsolePanel.prototype.addListener(this);

        // Just after the initialization, so the this.document member is set
        Firebug.CookieModule.addStyleSheet(this);

        this.refresh();
    },

    shutdown: function()
    {
        Firebug.ConsolePanel.prototype.removeListener(this);
    },

    /**
     * Renders the list of cookies displayed within the Cookies panel
     */
    refresh: function()
    {
        if (!Firebug.CookieModule.isEnabled(this.context))
            return;

        // Create cookie list table
        this.table = CookieReps.CookieTable.createTable(this.panelNode);

        // Cookies are displayed only for web pages
        var location = this.context.window.location;
        if (!location)
            return;

        var protocol = location.protocol;
        if (protocol.indexOf("http") != 0)
            return;

        // Get list of cookies for the current page
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

        // If the filter allows it, display all rejected cookies as well.
        if (Options.get(showRejectedCookies))
        {
            // xxxHonza: this.context.cookies is sometimes null, but
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
                    cookies = Arr.extendArray(cookies, receivedCookies);
            }
        }

        // Generate HTML list of cookies using Domplate
        if (cookies.length)
        {
            var header = Dom.getElementByClass(this.table, "cookieHeaderRow");
            var tag = CookieReps.CookieRow.cookieTag;
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
            FBTrace.sysout("cookies.Cookie list refreshed.", cookies);

        // Automatically sort the last sorted column. The preference stores
        // two things: name of the sorted column and sort direction asc|desc.
        // Example: colExpires asc
        var prefValue = Options.get(lastSortedColumn);
        if (prefValue)
        {
            var values = prefValue.split(" ");
            CookieReps.CookieTable.sortColumn(this.table, values[0], values[1]);
        }

        // Update visibility of columns according to the preferences
        var hiddenCols = Options.get(hiddenColsPref);
        if (hiddenCols)
            this.table.setAttribute("hiddenCols", hiddenCols);

        // Remove certain context menu items on cookiePanel display
        this.table.setAttribute("removedCols", ["colMaxAge"]);
    },

    initializeNode: function(oldPanelNode)
    {
        if (FBTrace.DBG_COOKIES)
            FBTrace.sysout("cookies.CookiePanel.initializeNode");

        // xxxHonza:
        // This method isn't called when FB UI is detached. So, the columns
        // are *not* resizable when FB is open in an external window.

        // Register event handlers for table column resizing
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
            FBTrace.sysout("cookies.CookiePanel.destroyNode");

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
        ActivablePanel.detach.apply(this, arguments);
    },

    reattach: function(doc)
    {
        ActivablePanel.reattach.apply(this, arguments);
    },

    clear: function()
    {
        if (this.panelNode)
            Dom.clearNode(this.panelNode);

        this.table = null;
    },

    show: function(state)
    {
        // Update permission button in the toolbar
        CookiePermissions.updatePermButton(this.context);

        // For backward compatibility with Firebug 1.1
        //
        // Firebug 1.6 removes Firebug.DisabledPanelPage, simplifies the activation
        // and the following code is not necessary any more.
        if (ActivableModule && Firebug.DisabledPanelPage)
        {
            var shouldShow = Firebug.CookieModule.isEnabled(this.context);
            this.showToolbarButtons("fbCookieButtons", shouldShow);
            if (!shouldShow)
            {
                // The activation model has been changed in Firebug 1.4. This is
                // just to keep backward compatibility.
                if (Firebug.DisabledPanelPage.show)
                    Firebug.DisabledPanelPage.show(this, Firebug.CookieModule);
                else
                    Firebug.CookieModule.disabledPanelPage.show(this);
                return;
            }
        }
        else
        {
            this.showToolbarButtons("fbCookieButtons", true);
        }

        if (Firebug.chrome.setGlobalAttribute)
        {
            Firebug.chrome.setGlobalAttribute("cmd_firebug_resumeExecution", "breakable", "true");
            Firebug.chrome.setGlobalAttribute("cmd_firebug_resumeExecution", "tooltiptext",
                Locale.$STR("cookies.Break On Cookie"));
        }
    },

    hide: function()
    {
        this.showToolbarButtons("fbCookieButtons", false);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    // Options menu

    getOptionsMenuItems: function(context)
    {
        return [
            MenuUtils.optionAllowGlobally(context, "cookies.AllowGlobally",
                "cookies.tip.AllowGlobally", "network.cookie", "cookieBehavior"),
            /*MenuUtils.optionMenu(context, "cookies.clearWhenDeny",
                "cookies.tip.clearWhenDeny", Firebug.prefDomain, clearWhenDeny),*/
            MenuUtils.optionMenu(context, "cookies.Confirm cookie removal",
                "cookies.tip.Confirm cookie removal", Firebug.prefDomain, removeConfirmation)
        ];
    },

    getContextMenuItems: function(object, target)
    {
        var items = [];

        // If the user clicked a cookie row, the context menu is already
        // initialized and so bail out.
        var cookieRow = Dom.getAncestorByClass(target, "cookieRow");
        if (cookieRow)
            return items;

        // Also bail out if the user clicked on the header.
        var header = Dom.getAncestorByClass(target, "cookieHeaderRow");
        if (header)
            return items;

        // Make sure default items (cmd_copy) are removed
        CookieReps.Rep.getContextMenuItems.apply(this, arguments);

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

        function findRow(node)
        {
            return Dom.getAncestorByClass(node, "cookieRow");
        }

        var search = new Search.TextSearch(this.panelNode, findRow);

        var caseSensitive = Firebug.Search.isCaseSensitive(text);
        var cookieRow = search.find(text, false, caseSensitive);
        if (!cookieRow)
            return false;

        for (; cookieRow; cookieRow = search.findNext(false, false, false, caseSensitive))
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
            return CookieReps.CookieTable;

        return ActivablePanel.getPopupObject.apply(this, arguments);
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

        CookieReps.CookieRow.toggleRow(repCookie.row, true);
        Dom.scrollIntoCenterView(repCookie.row);
    },

    enumerateCookies: function(fn)
    {
        if (!this.table)
            return;

        var rows = Dom.getElementsByClass(this.table, "cookieRow");
        rows = Arr.cloneArray(rows);
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
            this.conditionEditor = new Breakpoints.ConditionEditor(this.document);
        return this.conditionEditor;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    // Support for Break On Next

    breakOnNext: function(breaking)
    {
        this.context.breakOnCookie = breaking;

        if (FBTrace.DBG_COOKIES)
        {
            FBTrace.sysout("cookies.breakOnNext; " + this.context.breakOnCookie + ", " +
                this.context.getName());
        }
    },

    shouldBreakOnNext: function()
    {
        return this.context.breakOnCookie;
    },

    getBreakOnNextTooltip: function(enabled)
    {
        return (enabled ? Locale.$STR("cookies.Disable Break On Cookie") :
            Locale.$STR("cookies.Break On Cookie"));
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    // Console Panel Listeners

    onFiltersSet: function(logTypes)
    {
        logTypes.cookies = 1;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    // Panel Activation

    onActivationChanged: function(enable)
    {
        if (FBTrace.DBG_COOKIES || FBTrace.DBG_ACTIVATION)
            FBTrace.sysout("cookies.CookiePanel.onActivationChanged; " + enable);

        if (enable)
        {
            Firebug.CookieModule.addObserver(this);
            Firebug.Debugger.addListener(Firebug.CookieModule.DebuggerListener);
            Firebug.Console.addListener(Firebug.CookieModule.ConsoleListener);
        }
        else
        {
            Firebug.CookieModule.removeObserver(this);
            Firebug.Debugger.removeListener(Firebug.CookieModule.DebuggerListener);
            Firebug.Console.removeListener(Firebug.CookieModule.ConsoleListener);
        }
    },

    // Support for info tips.
    showInfoTip: function(infoTip, target, x, y)
    {
        var row = Dom.getAncestorByClass(target, "cookieRow");
        if (row && row.repObject)
        {
            if (Dom.getAncestorByClass(target, "cookieSizeCol") ||
                Dom.getAncestorByClass(target, "cookieRawSizeCol"))
            {
                var infoTipCookieId = "cookiesize-"+row.repObject.name;
                if (infoTipCookieId == this.infoTipCookieId && row.repObject == this.infoTipCookie)
                    return true;

                this.infoTipCookieId = infoTipCookieId;
                this.infoTipCookie = row.repObject;
                return this.populateSizeInfoTip(infoTip, row.repObject);
            }
        }

        delete this.infoTipCookieId;
        return false;
    },

    populateSizeInfoTip: function(infoTip, cookie)
    {
        CookieReps.SizeInfoTip.render(cookie, infoTip);
        return true;
    },
});

// ********************************************************************************************* //
// Cookie Breakpoints

/**
 * @class Represents an {@link Firebug.Debugger} listener. This listener is reponsible for
 * providing a list of cookie breakpoints for the Breakpoints side panel.
 */
Firebug.CookieModule.DebuggerListener =
{
    getBreakpoints: function(context, groups)
    {
        if (!context.cookies.breakpoints.isEmpty())
            groups.push(context.cookies.breakpoints);
    }
};

// ********************************************************************************************* //
// Custom output in the Console panel for document.cookie

Firebug.CookieModule.ConsoleListener =
{
    tag:
        DIV({_repObject: "$object"},
            DIV({"class": "documentCookieBody"})
        ),

    log: function(context, object, className, sourceLink)
    {
        //xxxHonza: Chromebug says it's null sometimes.
        if (!context)
            return;

        if (object !== context.window.document.cookie)
            return;

        // Parse "document.cookie" string
        var cookies = CookieUtils.parseSentCookiesFromString(object);
        if (!cookies || !cookies.length)
            return;

        // Create an empty log row that serves as a container for the list of cookies
        // created from the document.cookie property
        var appendObject = Firebug.ConsolePanel.prototype.appendObject;
        var row = Firebug.ConsoleBase.logRow(appendObject, object, context,
            "documentCookie", this, null, true);

        var rowBody = Dom.getElementByClass(row, "documentCookieBody");
        CookieReps.CookieTable.render(cookies, rowBody);
    },

    logFormatted: function(context, objects, className, sourceLink)
    {
    }
};

// ********************************************************************************************* //
// Registration

Firebug.registerPanel(CookiePanel);

return CookiePanel;

// ********************************************************************************************* //
});
