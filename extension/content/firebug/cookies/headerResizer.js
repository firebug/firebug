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
    "firebug/cookies/baseObserver",
    "firebug/cookies/menuUtils",
],
function(Xpcom, Obj, Locale, Domplate, Dom, Options, Persist, Str, Http, Css, Events,
    BaseObserver, MenuUtils) {

// ********************************************************************************************* //
// Resizable column helper (helper for Templates.CookieTable)

var HeaderResizer =
{
    resizing: false,
    currColumn: null,
    startX: 0,
    startWidth: 0,
    lastMouseUp: 0,

    onMouseClick: function(event)
    {
        if (!Events.isLeftClick(event))
            return;

        // Avoid click event for sorting, if the resizing has been just finished.
        var rightNow = now();
        if ((rightNow - this.lastMouseUp) < 1000)
            Events.cancelEvent(event);
    },

    onMouseDown: function(event)
    {
        if (!Events.isLeftClick(event))
            return;

        var target = event.target;
        if (!Css.hasClass(target, "cookieHeaderCellBox"))
            return;

        var header = Dom.getAncestorByClass(target, "cookieHeaderRow");
        if (!header)
            return;

        if (!this.isBetweenColumns(event))
            return;

        this.onStartResizing(event);

        Events.cancelEvent(event);
    },

    onMouseMove: function(event)
    {
        if (this.resizing)
        {
            if (Css.hasClass(target, "cookieHeaderCellBox"))
                target.style.cursor = "e-resize";

            this.onResizing(event);
            return;
        }

        var target = event.target;
        if (!Css.hasClass(target, "cookieHeaderCellBox"))
            return;

        if (target)
            target.style.cursor = "";

        if (!this.isBetweenColumns(event))
            return;

        // Update cursor if the mouse is located between two columns.
        target.style.cursor = "e-resize";
    },

    onMouseUp: function(event)
    {
        if (!this.resizing)
            return;

        this.lastMouseUp = now();

        this.onEndResizing(event);
        Events.cancelEvent(event);
    },

    onMouseOut: function(event)
    {
        if (!this.resizing)
            return;

        if (FBTrace.DBG_COOKIES)
        {
            FBTrace.sysout("cookies.Mouse out, target: " + event.target.localName +
                ", " + event.target.className);
            FBTrace.sysout("      explicitOriginalTarget: " + event.explicitOriginalTarget.localName +
                ", " + event.explicitOriginalTarget.className);
        }

        var target = event.target;
        if (target == event.explicitOriginalTarget)
            this.onEndResizing(event);

        Events.cancelEvent(event);
    },

    isBetweenColumns: function(event)
    {
        var target = event.target;
        var x = event.clientX;

        var column = Dom.getAncestorByClass(target, "cookieHeaderCell");
        var offset = Dom.getClientOffset(column);
        var size = Dom.getOffsetSize(column);

        if (column.previousSibling)
        {
            if (x < offset.x + 4)
                return 1;   // Mouse is close to the left side of the column (target).
        }

        if (column.nextSibling)
        {
            if (x > offset.x + size.width - 6)
                return 2;  // Mouse is close to the right side.
        }

        return 0;
    },

    onStartResizing: function(event)
    {
        var location = this.isBetweenColumns(event);
        if (!location)
            return;

        var target = event.target;

        this.resizing = true;
        this.startX = event.clientX;

        // Currently resizing column.
        var column = Dom.getAncestorByClass(target, "cookieHeaderCell");
        this.currColumn = (location == 1) ? column.previousSibling : column;

        // Last column width.
        var size = Dom.getOffsetSize(this.currColumn);
        this.startWidth = size.width;

        if (FBTrace.DBG_COOKIES)
        {
            var colId = this.currColumn.getAttribute("id");
            FBTrace.sysout("cookies.Start resizing column (id): " + colId +
                ", start width: " + this.startWidth);
        }
    },

    onResizing: function(event)
    {
        if (!this.resizing)
            return;

        var newWidth = this.startWidth + (event.clientX - this.startX);
        this.currColumn.style.width = newWidth + "px";

        if (FBTrace.DBG_COOKIES)
        {
            var colId = this.currColumn.getAttribute("id");
            FBTrace.sysout("cookies.Resizing column (id): " + colId +
                ", new width: " + newWidth);
        }
    },

    onEndResizing: function(event)
    {
        if (!this.resizing)
            return;

        this.resizing = false;

        var newWidth = this.startWidth + (event.clientX - this.startX);
        this.currColumn.style.width = newWidth + "px";

        // Store width into the preferences.
        var colId = this.currColumn.getAttribute("id");
        if (colId)
        {
            // Use directly nsIPrefBranch interface as the pref
            // doesn't have to exist yet.
            Options.setPref(Firebug.prefDomain, ".cookies." + colId + ".width", newWidth);
        }

        if (FBTrace.DBG_COOKIES)
        {
            var colId = this.currColumn.getAttribute("id");
            FBTrace.sysout("cookies.End resizing column (id): " + colId +
                ", new width: " + newWidth);
        }
    }
};

// ********************************************************************************************* //
// Time Helpers

function now()
{
    return (new Date()).getTime();
}

// ********************************************************************************************* //

return HeaderResizer;

// ********************************************************************************************* //
});

