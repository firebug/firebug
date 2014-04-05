/* See license.txt for terms of usage */

define([
    "firebug/lib/trace",
    "firebug/chrome/module",
    "firebug/lib/object",
    "firebug/firebug",
    "firebug/lib/domplate",
    "firebug/lib/locale",
    "firebug/lib/events",
    "firebug/lib/dom",
    "firebug/lib/options"
],
function(FBTrace, Module, Obj, Firebug, Domplate, Locale, Events, Dom, Options) {

"use strict";

// ********************************************************************************************* //
// Constants

const infoTipMargin = 10;

// ********************************************************************************************* //

var {domplate, DIV} = Domplate;

Firebug.InfoTip = Obj.extend(Module,
{
    dispatchName: "infoTip",

    tags: domplate(
    {
        infoTipTag:
            DIV({"class": "infoTip"}),
    }),

    initializeBrowser: function(browser)
    {
        browser.onInfoTipMouseOut = Obj.bind(this.onMouseOut, this, browser);
        browser.onInfoTipMouseMove = Obj.bind(this.onMouseMove, this, browser);

        var doc = browser.contentDocument;
        if (!doc)
            return;

        doc.addEventListener("mouseover", browser.onInfoTipMouseMove, true);
        doc.addEventListener("mouseout", browser.onInfoTipMouseOut, true);
        doc.addEventListener("mousemove", browser.onInfoTipMouseMove, true);

        return browser.infoTip = this.tags.infoTipTag.append({}, Dom.getBody(doc));
    },

    uninitializeBrowser: function(browser)
    {
        if (browser.infoTip)
        {
            var doc = browser.contentDocument;
            doc.removeEventListener("mouseover", browser.onInfoTipMouseMove, true);
            doc.removeEventListener("mouseout", browser.onInfoTipMouseOut, true);
            doc.removeEventListener("mousemove", browser.onInfoTipMouseMove, true);

            browser.infoTip.parentNode.removeChild(browser.infoTip);
            delete browser.infoTip;
            delete browser.onInfoTipMouseMove;
        }
    },

    showInfoTip: function(infoTip, panel, target, x, y, rangeParent, rangeOffset)
    {
        if (!Options.get("showInfoTips"))
            return;

        var scrollParent = Dom.getOverflowParent(target);
        var scrollX = x + (scrollParent ? scrollParent.scrollLeft : 0);

        var show = panel.showInfoTip(infoTip, target, scrollX, y, rangeParent, rangeOffset);
        if (!show && this.fbListeners)
        {
            show = Events.dispatch2(this.fbListeners, "showInfoTip", [infoTip, target, scrollX, y,
                rangeParent, rangeOffset]);
        }

        if (show)
        {
            var htmlElt = infoTip.ownerDocument.documentElement;
            var panelWidth = htmlElt.clientWidth;
            var panelHeight = htmlElt.clientHeight;

            if (x + infoTip.offsetWidth + infoTipMargin > panelWidth)
            {
                infoTip.style.left = Math.max(0, panelWidth -
                    (infoTip.offsetWidth + infoTipMargin)) + "px";
                infoTip.style.right = "auto";
            }
            else
            {
                infoTip.style.left = (x + infoTipMargin) + "px";
                infoTip.style.right = "auto";
            }

            if (y + infoTip.offsetHeight + infoTipMargin > panelHeight)
            {
                infoTip.style.top = Math.max(0, panelHeight -
                    (infoTip.offsetHeight + infoTipMargin)) + "px";
                infoTip.style.bottom = "auto";
            }
            else
            {
                infoTip.style.top = (y + infoTipMargin) + "px";
                infoTip.style.bottom = "auto";
            }

            if (FBTrace.DBG_INFOTIP)
            {
                FBTrace.sysout("infotip.showInfoTip; top: " + infoTip.style.top +
                    ", left: " + infoTip.style.left + ", bottom: " + infoTip.style.bottom +
                    ", right:" + infoTip.style.right + ", offsetHeight: " + infoTip.offsetHeight +
                    ", offsetWidth: " + infoTip.offsetWidth +
                    ", x: " + x + ", panelWidth: " + panelWidth +
                    ", y: " + y + ", panelHeight: " + panelHeight);
            }

            infoTip.setAttribute("active", "true");
        }
        else
        {
            this.hideInfoTip(infoTip);
        }
    },

    hideInfoTip: function(infoTip)
    {
        if (infoTip)
            infoTip.removeAttribute("active");
    },

    onMouseOut: function(event, browser)
    {
        if (!event.relatedTarget)
            this.hideInfoTip(browser.infoTip);
    },

    onMouseMove: function(event, browser)
    {
        // Ignore if the mouse is moving over the existing info tip.
        if (Dom.getAncestorByClass(event.target, "infoTip"))
            return;

        if (browser.currentPanel)
        {
            var x = event.clientX, y = event.clientY;
            this.showInfoTip(browser.infoTip, browser.currentPanel, event.target, x, y,
                event.rangeParent, event.rangeOffset);
        }
        else
        {
            this.hideInfoTip(browser.infoTip);
        }
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // extends Module

    disable: function()
    {
        // XXXjoe For each browser, call uninitializeBrowser
    },

    showPanel: function(browser, panel)
    {
        if (panel)
        {
            var infoTip = panel.panelBrowser.infoTip;
            if (!infoTip)
                infoTip = this.initializeBrowser(panel.panelBrowser);
            this.hideInfoTip(infoTip);
        }

    },

    showSidePanel: function(browser, panel)
    {
        this.showPanel(browser, panel);
    }
});

// ********************************************************************************************* //
// Registration

Firebug.registerModule(Firebug.InfoTip);

return Firebug.InfoTip;

// ********************************************************************************************* //
});
