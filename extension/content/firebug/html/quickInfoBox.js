/* See license.txt for terms of usage */

define([
    "firebug/firebug",
    "firebug/lib/trace",
    "firebug/lib/locale",
    "firebug/lib/events",
    "firebug/lib/dom",
    "firebug/lib/options",
    "firebug/lib/domplate",
    "firebug/lib/object",
    "firebug/lib/css",
    "firebug/chrome/module",
    "firebug/chrome/firefox",
],
function(Firebug, FBTrace, Locale, Events, Dom, Options, Domplate, Obj, Css, Module, Firefox) {

"use strict"

// ********************************************************************************************* //
// Constants

var Cc = Components.classes;
var Ci = Components.interfaces;
var Cu = Components.utils;

var domAttribs = ["nodeName", "id", "name", "offsetWidth", "offsetHeight"];
var cssAttribs = ["position"];
var compAttribs = [
    "width", "height", "zIndex", "position", "top", "right", "bottom", "left",
    "margin-top", "margin-right", "margin-bottom", "margin-left", "color",
    "backgroundColor", "fontFamily", "cssFloat", "display", "visibility"
];

// Tracing
var Trace = FBTrace.to("DBG_QUICKINFOBOX");
var TraceError = FBTrace.toError();

// ********************************************************************************************* //
// Domplate

var {domplate, DIV, TABLE, TBODY, TR, TD, SPAN} = Domplate;

var tableTag =
    TABLE({"class": "fbQuickInfoTable", cellpadding: 0, cellspacing: 0},
        TBODY(
            TR({"class": "pin"},
                TD({"class": "", align: "right"},
                    DIV({"class": "fbQuickInfoPin $pin button", onclick: "$onClickPin"}),
                    DIV({"class": "fbQuickInfoClose button", onclick: "$onClickClose"})
                )
            )
        )
    );

var titleTag =
    TR(
        TD({"class": "fbQuickInfoBoxTitle"},
            SPAN("$title")
        )
    );

var rowTag =
    TR({"class": "row"},
        TD({"class": ""},
            SPAN({"class": "fbQuickInfoName"}, "$name: "),
            SPAN({"class": "fbQuickInfoValue"}, "$value")
        )
    );

// ********************************************************************************************* //
// Implementation

/**
 * Displays the most important DOM properties and computed CSS styles for the currently
 * inspected element. It can be freely positioned at the monitor via drag & drop.
 */
var QuickInfoBox = Obj.extend(Module,
/** @lends QuickInfoBox */
{
    boxEnabled: undefined,
    dragging: false,
    storedX: null,
    storedY: null,
    prevX: null,
    prevY: null,

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Module

    initialize: function()
    {
        Module.initialize.apply(this, arguments);

        this.qiPanel = Firebug.chrome.$("fbQuickInfoPanel");

        this.onContentLoadedListener = this.onContentLoaded.bind(this);
        this.onMouseDownListener = this.onMouseDown.bind(this);
        this.onMouseOverListener = this.onMouseOver.bind(this);
        this.onMouseOutListener = this.onMouseOut.bind(this);
        this.onMouseMoveListener = this.onMouseMove.bind(this);
        this.onMouseUpListener = this.onMouseUp.bind(this);

        var frame = this.getContentFrame();
        Events.addEventListener(frame, "load", this.onContentLoadedListener, true);

        Events.addEventListener(this.qiPanel, "mousedown", this.onMouseDownListener, true);
        Events.addEventListener(this.qiPanel, "mouseover", this.onMouseOverListener, true);
        Events.addEventListener(this.qiPanel, "mouseout", this.onMouseOutListener, true);
    },

    shutdown: function()
    {
        Module.shutdown.apply(this, arguments);

        var frame = this.getContentFrame();
        Events.removeEventListener(frame, "load", this.onContentLoadedListener, true);

        Events.removeEventListener(this.qiPanel, "mousedown", this.onMouseDownListener, true);
        Events.removeEventListener(this.qiPanel, "mouseover", this.onMouseOverListener, true);
        Events.removeEventListener(this.qiPanel, "mouseout", this.onMouseOutListener, true);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    onContentLoaded: function(event)
    {
        var doc = this.getContentDoc();
        doc.body.classList.add("fbQuickInfoPanelBody");

        Css.appendStylesheet(doc, "chrome://firebug/content/html/quickInfoBox.css");
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Show/hide

    show: function(element)
    {
        if (!this.boxEnabled || !element)
            return;

        this.needsToHide = false;

        if (this.qiPanel.state === "closed")
        {
            var content = Firefox.getElementById("content");
            this.storedX = this.storedX || content.tabContainer.boxObject.screenX + 5;
            this.storedY = this.storedY || content.tabContainer.boxObject.screenY + 35;

            // Dynamically set noautohide to avoid Mozilla bug 545265.
            if (!this.noautohideAdded)
            {
                var self = this;
                this.noautohideAdded = true;
                this.qiPanel.addEventListener("popupshowing", function runOnce()
                {
                    self.qiPanel.removeEventListener("popupshowing", runOnce, false);
                    self.qiPanel.setAttribute("noautohide", true);
                }, false);
            }

            this.qiPanel.openPopupAtScreen(this.storedX, this.storedY, false);
        }

        var doc = this.getContentDoc();
        var parentNode = doc.body;

        // The tableTag template doesn't have its own object and so, we specify
        // all event handlers and properties through the input object.
        var input = {
            onClickPin: this.onClickPin.bind(this),
            pin: Options.get("pinQuickInfoBox") ? "pin" : "",
            onClickClose: this.onClickClose.bind(this),
        }

        // Render the basic quick-box layout. It's a table where every row represents
        // a CSS property or a section title. The pin icon displayed at the top-right
        // corner also gets one row.
        var table = tableTag.replace(input, parentNode, this);
        var tbody = table.firstChild;

        var needsTitle = this.addRows(element, tbody, domAttribs);
        var needsTitle2 = this.addRows(element.style, tbody, cssAttribs);

        // Properly create section titles.
        if (needsTitle || needsTitle2)
            titleTag.insertRows({title: Locale.$STR("quickInfo")}, tbody.firstChild, this);

        titleTag.insertRows({title: Locale.$STR("computedStyle")}, tbody.lastChild, this);

        // Generate content (a row == CSS property)
        this.addRows(element, tbody, compAttribs, true);

        // Always update size of the panel according to the content size. Some elements might
        // have more styles than others and so, require more space. We always need
        // to avoid scroll-bars.
        // Keep the default width (specified in firebugOverlay.xul for fbQuickInfoPanel)
        // and change only the height.
        this.qiPanel.sizeTo(this.qiPanel.popupBoxObject.width, doc.documentElement.clientHeight);
    },

    hide: function()
    {
        // If the preference says pin == true then do not hide.
        // xxxHonza: the box should be hidden when the user switches out of the HTML panel.
        if (Options.get("pinQuickInfoBox"))
            return;

        // if mouse is over panel defer hiding to mouseout to not cause flickering
        if (this.mouseover || this.dragging)
        {
            this.needsToHide = true;
            return;
        }

        this.prevX = null;
        this.prevY = null;
        this.needsToHide = false;

        this.qiPanel.hidePopup();
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    addRows: function(domBase, parentNode, attribs, computedStyle)
    {
        if (!domBase)
            return;

        // Iterate over all attributes and generate HTML content of the info box.
        var needsTitle = false;
        for (var i=0; i<attribs.length; i++)
        {
            var value;
            if (computedStyle)
            {
                var defaultView = Dom.getNonFrameBody(domBase).ownerDocument.defaultView;
                var cs = defaultView.getComputedStyle(domBase, null);

                value = cs.getPropertyValue(attribs[i]);

                if (value && /rgb\(\d+,\s\d+,\s\d+\)/.test(value))
                    value = rgbToHex(value);
            }
            else
            {
                value = domBase[attribs[i]];
            }

            if (!value)
                continue;

            // There is at least one value displayed so, the title should be generated.
            needsTitle = true;

            var input = {name: attribs[i], value: value}
            rowTag.insertRows(input, parentNode.lastChild, rowTag);
        }

        return needsTitle;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Events

    onClickPin: function(event)
    {
        var target = event.target;
        if (!Css.hasClass(target, "fbQuickInfoPin"))
            return;

        // The state of the pin needs to be updated in preferences.
        Options.togglePref("pinQuickInfoBox");

        // Update also the icon state.
        Css.toggleClass(target, "pin");
    },

    onClickClose: function(event)
    {
        var target = event.target;
        if (!Css.hasClass(target, "fbQuickInfoClose"))
            return;

        this.qiPanel.hidePopup();
    },

    onMouseDown: function(event)
    {
        var target = event.target;
        var node = target.firstChild ? target.firstChild.nodeType : target.nodeType;

        // skip dragging when user click on button or on text
        if (Css.hasClass(target, "button") || node == Node.TEXT_NODE)
            return;

        Events.addEventListener(this.qiPanel, "mousemove", this.onMouseMoveListener, true);
        Events.addEventListener(this.qiPanel, "mouseup", this.onMouseUpListener, true);

        this.dragging = true;
        this.prevX = event.screenX;
        this.prevY = event.screenY;
    },

    // this is a hack to find when mouse enters and leaves panel
    // it requires that #fbQuickInfoPanel have border
    onMouseOver: function(event)
    {
        if (this.dragging)
            return;

        this.mouseover = true;
    },

    onMouseOut: function(event)
    {
        if (this.dragging)
            return;

        this.mouseover = false;

        // if hiding was deferred because mouse was over panel hide it
        if (this.needsToHide && event.target.nodeName == "panel")
            this.hide();
    },

    onMouseMove: function(event)
    {
        if (!this.dragging)
            return;

        var box = this.qiPanel.boxObject;
        var boxX = box.screenX;
        var boxY = box.screenY;
        var x = event.screenX;
        var y = event.screenY;
        var diffX = x - this.prevX;
        var diffY = y - this.prevY;

        this.qiPanel.moveTo(boxX + diffX, boxY + diffY);

        this.prevX = x;
        this.prevY = y;
        this.storedX = boxX;
        this.storedY = boxY;
    },

    onMouseUp: function(event)
    {
        Events.removeEventListener(this.qiPanel, "mousemove", this.onMouseMoveListener, true);
        Events.removeEventListener(this.qiPanel, "mouseup", this.onMouseUpListener, true);

        this.prevX = this.prevY = null;
        this.dragging = false;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    /**
     * Toggle the quick info box.
     */
    toggleQuickInfoBox: function()
    {
        if (this.qiPanel.state == "open")
            QuickInfoBox.hide();

        QuickInfoBox.boxEnabled = !QuickInfoBox.boxEnabled;

        Options.set("showQuickInfoBox", QuickInfoBox.boxEnabled);
    },

    /**
     * Hide the quick info box.
     */
    hideQuickInfoBox: function()
    {
        if (this.qiPanel.state === "open")
            QuickInfoBox.hide();
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Helpers

    getContentFrame: function()
    {
        if (!this.qiPanel)
        {
            TraceError.sysout("quickInfoBox.getContentFrame; ERROR no panel!");
            return;
        }

        return this.qiPanel.getElementsByClassName("fbQuickInfoPanelContent")[0];
    },

    getContentDoc: function()
    {
        var contentFrame = this.getContentFrame();
        return contentFrame.contentWindow.document;
    },
});

// ********************************************************************************************* //
// Helpers

// xxxHonza: duplication of Css.rgbToHex
function rgbToHex(value)
{
    return value.replace(/\brgb\((\d{1,3}),\s*(\d{1,3}),\s*(\d{1,3})\)/gi, function(_, r, g, b)
    {
        return "#"+((1 << 24) + (r << 16) + (g << 8) + (b << 0)).toString(16).substr(-6).toUpperCase();
    });
}

// ********************************************************************************************* //
// Registration

Firebug.registerModule(QuickInfoBox);

// Allow to access the quick info box within the XUL (see issue 7231)
Firebug.QuickInfoBox = QuickInfoBox;

return QuickInfoBox;

// ********************************************************************************************* //
});
