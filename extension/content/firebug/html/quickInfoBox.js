/* See license.txt for terms of usage */

define([
    "firebug/firebug",
    "firebug/chrome/firefox",
    "firebug/lib/locale",
    "firebug/lib/events",
    "firebug/lib/dom",
    "firebug/lib/options",
],
function(Firebug, Firefox, Locale, Events, Dom, Options) {

// ********************************************************************************************* //
// Constants

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cu = Components.utils;

var domAttribs = ["nodeName", "id", "name", "offsetWidth", "offsetHeight"];
var cssAttribs = ["position"];
var compAttribs = [
    "width", "height", "zIndex", "position", "top", "right", "bottom", "left",
    "margin-top", "margin-right", "margin-bottom", "margin-left", "color",
    "backgroundColor", "fontFamily", "cssFloat", "display", "visibility"];

// ********************************************************************************************* //
// Implementation

var QuickInfoBox =
{
    boxEnabled: undefined,
    dragging: false,
    storedX: null,
    storedY: null,
    prevX: null,
    prevY: null,

    show: function(element)
    {
        if (FBTrace.DBG_QUICKINFOBOX)
            FBTrace.sysout("quickInfoBox.show;");

        if (!this.boxEnabled || !element)
            return;

        this.needsToHide = false;

        var qiBox = Firebug.chrome.$("fbQuickInfoPanel");
        if (qiBox.state === "closed")
        {
            var content = Firefox.getElementById("content");
            this.storedX = this.storedX || content.tabContainer.boxObject.screenX + 5;
            this.storedY = this.storedY || content.tabContainer.boxObject.screenY + 35;

            // Dynamically set noautohide to avoid mozilla bug 545265.
            if (!this.noautohideAdded)
            {
                this.noautohideAdded = true;
                qiBox.addEventListener("popupshowing", function runOnce()
                {
                    qiBox.removeEventListener("popupshowing", runOnce, false);
                    qiBox.setAttribute("noautohide", true);
                }, false);
            }

            qiBox.openPopupAtScreen(this.storedX, this.storedY, false);
        }

        qiBox.removeChild(qiBox.firstChild);
        var vbox = document.createElement("vbox");
        qiBox.appendChild(vbox);

        var needsTitle = this.addRows(element, vbox, domAttribs);
        var needsTitle2 = this.addRows(element.style, vbox, cssAttribs);

        var lab;
        if (needsTitle || needsTitle2)
        {
            lab = document.createElement("label");
            lab.setAttribute("class", "fbQuickInfoBoxTitle");
            lab.setAttribute("value", Locale.$STR("quickInfo"));
            vbox.insertBefore(lab, vbox.firstChild);
        }

        lab = document.createElement("label");
        lab.setAttribute("class", "fbQuickInfoBoxTitle");
        lab.setAttribute("value", Locale.$STR("computedStyle"));
        vbox.appendChild(lab);

        this.addRows(element, vbox, compAttribs, true);
    },

    hide: function()
    {
        if (FBTrace.DBG_QUICKINFOBOX)
            FBTrace.sysout("quickInfoBox.hide;");

        // if mouse is over panel defer hiding to mouseout to not cause flickering
        if (this.mouseover || this.dragging)
        {
            this.needsToHide = true;
            return;
        }

        var qiBox = Firebug.chrome.$("fbQuickInfoPanel");

        this.prevX = null;
        this.prevY = null;
        this.needsToHide = false;

        qiBox.hidePopup();
    },

    handleEvent: function(event)
    {
        switch (event.type)
        {
            case "mousemove":
                if (!this.dragging)
                    return;

                var diffX, diffY,
                    boxX = this.qiBox.screenX,
                    boxY = this.qiBox.screenY,
                    x = event.screenX,
                    y = event.screenY;

                diffX = x - this.prevX;
                diffY = y - this.prevY;

                this.qiBox.moveTo(boxX + diffX, boxY + diffY);

                this.prevX = x;
                this.prevY = y;
                this.storedX = boxX;
                this.storedY = boxY;
                break;

            case "mousedown":
                this.qiPanel = Firebug.chrome.$("fbQuickInfoPanel");
                this.qiBox = this.qiPanel.boxObject;
                Events.addEventListener(this.qiPanel, "mousemove", this, true);
                Events.addEventListener(this.qiPanel, "mouseup", this, true);
                this.dragging = true;
                this.prevX = event.screenX;
                this.prevY = event.screenY;
                break;

            case "mouseup":
                Events.removeEventListener(this.qiPanel, "mousemove", this, true);
                Events.removeEventListener(this.qiPanel, "mouseup", this, true);
                this.qiPanel = this.qiBox = null;
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

    addRows: function(domBase, vbox, attribs, computedStyle)
    {
        if (!domBase)
            return;

        var needsTitle = false;
        for (var i=0; i<attribs.length; i++)
        {
            var value;
            if (computedStyle)
            {
                var cs = Dom.getNonFrameBody(domBase).ownerDocument.defaultView.getComputedStyle(
                    domBase, null);

                value = cs.getPropertyValue(attribs[i]);

                if (value && /rgb\(\d+,\s\d+,\s\d+\)/.test(value))
                    value = rgbToHex(value);
            }
            else
            {
                value = domBase[attribs[i]];
            }

            if (value)
            {
                needsTitle = true;
                var hbox = document.createElement("hbox");
                var lab = document.createElement("label");
                lab.setAttribute("class", "fbQuickInfoName");
                lab.setAttribute("value", attribs[i]);
                hbox.appendChild(lab);
                var desc = document.createElement("label");
                desc.setAttribute("class", "fbQuickInfoValue");
                desc.appendChild(document.createTextNode(": " + value));
                hbox.appendChild(desc);
                vbox.appendChild(hbox);
            }
        }

        return needsTitle;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    /**
     * Toggle the quick info box.
     */
    toggleQuickInfoBox: function()
    {
        var qiBox = Firebug.chrome.$("fbQuickInfoPanel");

        if (qiBox.state == "open")
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
        var qiBox = Firebug.chrome.$("fbQuickInfoPanel");

        if (qiBox.state === "open")
            QuickInfoBox.hide();
    },
};

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

// XUL commands need global access.
Firebug.QuickInfoBox = QuickInfoBox;

return QuickInfoBox;

// ********************************************************************************************* //
});
