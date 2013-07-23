/* See license.txt for terms of usage */

define([
    "firebug/firebug",
    "firebug/chrome/firefox",
    "firebug/lib/locale",
    "firebug/lib/events",
    "firebug/lib/dom",
    "firebug/lib/options",
    "firebug/lib/domplate",
    "firebug/lib/object",
    "firebug/lib/css",
],
function(Firebug, Firefox, Locale, Events, Dom, Options, Domplate, Obj, Css) {

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

// ********************************************************************************************* //
// Domplate

var {domplate, DIV, TABLE, TBODY, TR, TD, SPAN} = Domplate;

var tableTag =
    TABLE({"class": "fbQuickInfoTable", cellpadding: 0, cellspacing: 0},
        TBODY(
            TR({"class": "pin"},
                TD({"class": "", align: "right"},
                    DIV({"class": "fbQuickInfoPin"})
                )
            )
        )
    );

var titleTag = 
    TR(
        TD({"class": "fbQuickInfoBoxTitle"},
            "$title"
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
 * Displays the most important DOM properties and computed CSS styles for the currently inspected element. 
 * It can be freely positioned at the monitor via drag & drop.
 */
var QuickInfoBox = Obj.extend(Firebug.Module,
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
        Firebug.Module.initialize.apply(this, arguments);

        var contentFrame = this.getContentFrame();
        Events.addEventListener(contentFrame, "load", this.onContentLoaded.bind(this), true);
    },

    shutdown: function()
    {
        Firebug.Module.shutdown.apply(this, arguments);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    onContentLoaded: function(event)
    {
        var doc = this.getContentDoc();
        doc.body.classList.add("fbQuickInfoPanelBody");

        Css.appendStylesheet(doc, "chrome://firebug/skin/quickInfoBox.css");
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Show/hide

    show: function(element)
    {
        if (!this.boxEnabled || !element)
            return;

        this.needsToHide = false;

        var box = Firebug.chrome.$("fbQuickInfoPanel");
        if (box.state === "closed")
        {
            var content = Firefox.getElementById("content");
            this.storedX = this.storedX || content.tabContainer.boxObject.screenX + 5;
            this.storedY = this.storedY || content.tabContainer.boxObject.screenY + 35;

            // Dynamically set noautohide to avoid mozilla bug 545265.
            if (!this.noautohideAdded)
            {
                this.noautohideAdded = true;
                box.addEventListener("popupshowing", function runOnce()
                {
                    box.removeEventListener("popupshowing", runOnce, false);
                    box.setAttribute("noautohide", true);
                }, false);
            }

            box.openPopupAtScreen(this.storedX, this.storedY, false);
        }

        var doc = this.getContentDoc();
        var parentNode = doc.body;

        var table = tableTag.replace({}, parentNode, this);
        var tbody = table.firstChild;

        var needsTitle = this.addRows(element, tbody, domAttribs);
        var needsTitle2 = this.addRows(element.style, tbody, cssAttribs);

        if (needsTitle || needsTitle2)
        {
            titleTag.insertRows({title: Locale.$STR("quickInfo")}, tbody.firstChild, this);
        }

        titleTag.insertRows({title: Locale.$STR("computedStyle")}, tbody.lastChild, this);

        this.addRows(element, tbody, compAttribs, true);
    },

    hide: function()
    {
        // if mouse is over panel defer hiding to mouseout to not cause flickering
        if (this.mouseover || this.dragging)
        {
            this.needsToHide = true;
            return;
        }

        var box = Firebug.chrome.$("fbQuickInfoPanel");

        this.prevX = null;
        this.prevY = null;
        this.needsToHide = false;

        // Remove this line if you want to inspect the info-box content
        // using DOM inspector addon.
        box.hidePopup();
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

    handleEvent: function(event)
    {
        switch (event.type)
        {
        case "mousemove":
            if (!this.dragging)
                return;

            var diffX, diffY,
                boxX = this.box.screenX,
                boxY = this.box.screenY,
                x = event.screenX,
                y = event.screenY;

            diffX = x - this.prevX;
            diffY = y - this.prevY;

            this.box.moveTo(boxX + diffX, boxY + diffY);

            this.prevX = x;
            this.prevY = y;
            this.storedX = boxX;
            this.storedY = boxY;
            break;

        case "mousedown":
            this.qiPanel = Firebug.chrome.$("fbQuickInfoPanel");
            this.box = this.qiPanel.boxObject;
            Events.addEventListener(this.qiPanel, "mousemove", this, true);
            Events.addEventListener(this.qiPanel, "mouseup", this, true);
            this.dragging = true;
            this.prevX = event.screenX;
            this.prevY = event.screenY;
            break;

        case "mouseup":
            Events.removeEventListener(this.qiPanel, "mousemove", this, true);
            Events.removeEventListener(this.qiPanel, "mouseup", this, true);
            this.qiPanel = this.box = null;
            this.prevX = this.prevY = null;
            this.dragging = false;
            break;

        // this is a hack to find when mouse enters and leaves panel
        // it requires that #fbQuickInfoPanel have border
        case "mouseover":
            if (this.dragging)
                return;
            this.mouseover = true;
            break;

        case "mouseout":
            if (this.dragging)
                return;
            this.mouseover = false;
            // if hiding was defered because mouse was over panel hide it
            if (this.needsToHide && event.target.nodeName == "panel")
                this.hide();
            break;
        }
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    /**
     * Toggle the quick info box.
     */
    toggleQuickInfoBox: function()
    {
        var box = Firebug.chrome.$("fbQuickInfoPanel");

        if (box.state == "open")
            QuickInfoBox.hide();

        QuickInfoBox.boxEnabled = !QuickInfoBox.boxEnabled;

        Options.set("showQuickInfoBox", QuickInfoBox.boxEnabled);
    },

    /**
     * Pass all quick info box events to QuickInfoBox.handleEvent() for handling.
     * @param {Event} event Event to handle
     */
    quickInfoBoxHandler: function(event)
    {
        QuickInfoBox.handleEvent(event);
    },

    /**
     * Hide the quick info box.
     */
    hideQuickInfoBox: function()
    {
        var box = Firebug.chrome.$("fbQuickInfoPanel");

        if (box.state === "open")
            QuickInfoBox.hide();
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Helpers

    getContentFrame: function()
    {
        var box = Firebug.chrome.$("fbQuickInfoPanel");
        return box.getElementsByClassName("contentFrame")[0];
    },

    getContentDoc: function()
    {
        var contentFrame = this.getContentFrame();
        return contentFrame.contentWindow.document;
    }
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

// XUL commands need global access.
Firebug.QuickInfoBox = QuickInfoBox;

return QuickInfoBox;

// ********************************************************************************************* //
});
