/* See license.txt for terms of usage */

FBL.ns(function() {

// ************************************************************************************************
// Constants

const maxWidth = 100, maxHeight = 80;
const infoTipMargin = 10;
const infoTipWindowPadding = 25;

// ************************************************************************************************

with (Domplate) {
Firebug.InfoTip = FBL.extend(Firebug.Module,
{
    dispatchName: "infoTip",
    tags: domplate(
    {
        infoTipTag: DIV({"class": "infoTip"}),

        colorTag:
            DIV({"class": "infoTipColorBox"},
                DIV({style: "background: $rgbValue; width: 100px; height: 40px;"})
            ),

        imgTag:
            DIV({"class": "infoTipImageBox infoTipLoading"},
                IMG({"class": "infoTipImage", src: "$urlValue", repeat: "$repeat",
                    onload: "$onLoadImage", onerror: "$onErrorImage"}),
                IMG({"class": "infoTipBgImage", collapsed: true, src: "blank.gif"}),
                DIV({"class": "infoTipCaption"})
            ),

        onLoadImage: function(event)
        {
            var img = event.currentTarget;
            var bgImg = img.nextSibling;
            if (!bgImg)
                return; // Sometimes gets called after element is dead

            var caption = bgImg.nextSibling;
            var innerBox = img.parentNode;

            var w = img.naturalWidth, h = img.naturalHeight;
            var repeat = img.getAttribute("repeat");

            if (repeat == "repeat-x" || (w == 1 && h > 1))
            {
                FBL.collapse(img, true);
                FBL.collapse(bgImg, false);
                bgImg.style.background = "url(" + img.src + ") repeat-x";
                bgImg.style.width = maxWidth + "px";
                if (h > maxHeight)
                    bgImg.style.height = maxHeight + "px";
                else
                    bgImg.style.height = h + "px";
            }
            else if (repeat == "repeat-y" || (h == 1 && w > 1))
            {
                FBL.collapse(img, true);
                FBL.collapse(bgImg, false);
                bgImg.style.background = "url(" + img.src + ") repeat-y";
                bgImg.style.height = maxHeight + "px";
                if (w > maxWidth)
                    bgImg.style.width = maxWidth + "px";
                else
                    bgImg.style.width = w + "px";
            }
            else if (repeat == "repeat" || (w == 1 && h == 1))
            {
                FBL.collapse(img, true);
                FBL.collapse(bgImg, false);
                bgImg.style.background = "url(" + img.src + ") repeat";
                bgImg.style.width = maxWidth + "px";
                bgImg.style.height = maxHeight + "px";
            }
            else
            {
                if (w > maxWidth || h > maxHeight)
                {
                    if (w > h)
                    {
                        img.style.width = maxWidth + "px";
                        img.style.height = Math.round((h / w) * maxWidth) + "px";
                    }
                    else
                    {
                        img.style.width = Math.round((w / h) * maxHeight) + "px";
                        img.style.height = maxHeight + "px";
                    }
                }
            }

            caption.innerHTML = FBL.$STRF("Dimensions", [w, h]);

            FBL.removeClass(innerBox, "infoTipLoading");
        },

        onErrorImage: function(event)
        {
            var img = event.currentTarget;
            var bgImg = img.nextSibling;
            if (!bgImg)
                return;

            var caption = bgImg.nextSibling;

            // Display an error in the caption (instead of dimensions).
            if (img.src.indexOf("moz-filedata") == 0)
                caption.innerHTML = FBL.$STR("firebug.failedToPreviewObjectURL");
            else
                caption.innerHTML = FBL.$STR("firebug.failedToPreviewImageURL");

            var innerBox = img.parentNode;
            FBL.removeClass(innerBox, "infoTipLoading");
        }
    }),

    initializeBrowser: function(browser)
    {
        browser.onInfoTipMouseOut = FBL.bind(this.onMouseOut, this, browser);
        browser.onInfoTipMouseMove = FBL.bind(this.onMouseMove, this, browser);

        var doc = browser.contentDocument;
        if (!doc)
            return;

        doc.addEventListener("mouseover", browser.onInfoTipMouseMove, true);
        doc.addEventListener("mouseout", browser.onInfoTipMouseOut, true);
        doc.addEventListener("mousemove", browser.onInfoTipMouseMove, true);

        return browser.infoTip = this.tags.infoTipTag.append({}, FBL.getBody(doc));
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
        if (!Firebug.showInfoTips)
            return;

        var scrollParent = FBL.getOverflowParent(target);
        var scrollX = x + (scrollParent ? scrollParent.scrollLeft : 0);

        var show = panel.showInfoTip(infoTip, target, scrollX, y, rangeParent, rangeOffset);
        if (!show && this.fbListeners)
        {
            show = FBL.dispatch2(this.fbListeners, "showInfoTip", [infoTip, target, scrollX, y,
                rangeParent, rangeOffset]);
        }

        if (show)
        {
            var htmlElt = infoTip.ownerDocument.documentElement;
            var panelWidth = htmlElt.clientWidth;
            var panelHeight = htmlElt.clientHeight;

            if (x+infoTip.offsetWidth+infoTipMargin > panelWidth)
            {
                infoTip.style.left = Math.max(0, panelWidth-(infoTip.offsetWidth+infoTipMargin)) + "px";
                infoTip.style.right = "auto";
            }
            else
            {
                infoTip.style.left = (x+infoTipMargin) + "px";
                infoTip.style.right = "auto";
            }

            if (y+infoTip.offsetHeight+infoTipMargin > panelHeight)
            {
                infoTip.style.top = Math.max(0, panelHeight-(infoTip.offsetHeight+infoTipMargin)) + "px";
                infoTip.style.bottom = "auto";
            }
            else
            {
                infoTip.style.top = (y+infoTipMargin) + "px";
                infoTip.style.bottom = "auto";
            }

            if (FBTrace.DBG_INFOTIP)
                FBTrace.sysout("infotip.showInfoTip; top: " + infoTip.style.top +
                    ", left: " + infoTip.style.left + ", bottom: " + infoTip.style.bottom +
                    ", right:" + infoTip.style.right + ", offsetHeight: " + infoTip.offsetHeight +
                    ", offsetWidth: " + infoTip.offsetWidth +
                    ", x: " + x + ", panelWidth: " + panelWidth +
                    ", y: " + y + ", panelHeight: " + panelHeight);

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
        if (FBL.getAncestorByClass(event.target, "infoTip"))
            return;

        if (browser.currentPanel)
        {
            var x = event.clientX, y = event.clientY;
            this.showInfoTip(browser.infoTip, browser.currentPanel, event.target, x, y, event.rangeParent, event.rangeOffset);
        }
        else
            this.hideInfoTip(browser.infoTip);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    populateColorInfoTip: function(infoTip, color)
    {
        this.tags.colorTag.replace({rgbValue: color}, infoTip);
        return true;
    },

    populateImageInfoTip: function(infoTip, url, repeat)
    {
        if (!repeat)
            repeat = "no-repeat";

        this.tags.imgTag.replace({urlValue: url, repeat: repeat}, infoTip);

        return true;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
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
})};

// ************************************************************************************************
// Registration

Firebug.registerModule(Firebug.InfoTip);

return Firebug.InfoTip;

// ************************************************************************************************
});
