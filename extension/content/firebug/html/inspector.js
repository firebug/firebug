/* See license.txt for terms of usage */

define([
    "firebug/lib/object",
    "firebug/firebug",
    "firebug/firefox/firefox",
    "firebug/reps",
    "firebug/lib/locale",
    "firebug/lib/events",
    "firebug/lib/wrapper",
    "firebug/lib/css",
    "firebug/lib/dom",
    "firebug/lib/xml",
    "firebug/firefox/window",
    "firebug/firefox/system",
],
function(Obj, Firebug, Firefox, FirebugReps, Locale, Events, Wrapper, Css, Dom, Xml,
    Win, System) {

// ************************************************************************************************
// Constants

const inspectDelay = 200;
const highlightCSS = "chrome://firebug/content/highlighter.css";
const ident = {
    frame: 0,
    boxModel: 1,
    imageMap: 2,
    proxyElt: 3
};

// ************************************************************************************************
// Globals

var boxModelHighlighter = null;
var frameHighlighter = null;

// ************************************************************************************************

/**
 * @module Implements Firebug Inspector logic.
 */
Firebug.Inspector = Obj.extend(Firebug.Module,
{
    dispatchName: "inspector",
    inspecting: false,
    inspectingPanel: null,

    /**
     * Main highlighter method. Can be used to highlight elements using the box model, frame or image map highlighters. Can highlight single or multiple elements.
     *
     * Examples:
     * Firebug.Inspector.highlightObject([window.content.document.getElementById('gbar'), window.content.document.getElementById('logo')], window.content, "frame", null, ["#ff0000",{background:"#0000ff", border:"#ff0000"}])
     * or
     * Firebug.Inspector.highlightObject([window.content.document.getElementById('gbar'), window.content.document.getElementById('logo')], window.content, "boxModel", null, [{content: "#ff0000", padding: "#eeeeee", border: "#00ff00", margin: "#0000ff"},{content: "#00ff00", padding: "#eeeeee", border: "#00ff00", margin: "#0000ff"}])
     *
     * @param {Array} elementArr Elements to highlight
     * @param {Window} context Context of the elements to be highlighted
     * @param {String} [highlightType] Either "frame" or "boxModel". Default is configurable.
     * @param {String} [boxFrame] Displays the line guides for the box model layout view. Valid values are
     *        "content", "padding", "border" or "margin"
     * @param {String | Array} [colorObj] Any valid html color e.g. red, #f00, #ff0000, etc., a valid color object
     *        or any valid highlighter color array.
     */
    highlightObject: function(elementArr, context, highlightType, boxFrame, colorObj)
    {
        var i, elt, elementLen, oldContext, usingColorArray;
        var highlighter = highlightType ? getHighlighter(highlightType) : this.defaultHighlighter;

        if (!elementArr || !FirebugReps.Arr.isArray(elementArr))
        {
            // highlight a single element
            if (!elementArr || !Dom.isElement(elementArr) ||
                (Wrapper.getContentView(elementArr) &&
                    !Xml.isVisible(Wrapper.getContentView(elementArr))) )
            {
                if(elementArr && elementArr.nodeType == 3)
                    elementArr = elementArr.parentNode;
                else
                    elementArr = null;
            }

            if (elementArr && context && context.highlightTimeout)
            {
                context.clearTimeout(context.highlightTimeout);
                delete context.highlightTimeout;
            }

            oldContext = this.highlightedContext;
            if (oldContext && oldContext.window)
                this.clearAllHighlights();

            this.highlighter = highlighter;
            this.highlightedContext = context;

            if (elementArr)
            {
                if(!isVisibleElement(elementArr))
                    highlighter.unhighlight(context);
                else if (context && context.window && context.window.document)
                    highlighter.highlight(context, elementArr, boxFrame, colorObj, false);
            }
            else if (oldContext)
            {
                oldContext.highlightTimeout = oldContext.setTimeout(function()
                {
                    if (FBTrace.DBG_INSPECT)
                        FBTrace.sysout("Removing inspector highlighter due to setTimeout loop");

                    delete oldContext.highlightTimeout;

                    if (oldContext.window && oldContext.window.document)
                    {
                        highlighter.unhighlight(oldContext);

                        if (oldContext.inspectorMouseMove)
                            oldContext.window.document.removeEventListener("mousemove",
                                oldContext.inspectorMouseMove, true);
                    }
                }, inspectDelay);
            }
        }
        else
        {
            // Highlight multiple elements
            if (context && context.highlightTimeout)
            {
                context.clearTimeout(context.highlightTimeout);
                delete context.highlightTimeout;
            }
            this.clearAllHighlights();
            usingColorArray = FirebugReps.Arr.isArray(colorObj);

            if (context && context.window && context.window.document)
            {
                for (i = 0, elementLen = elementArr.length; i < elementLen; i++)
                {
                    elt = elementArr[i];

                    if (elt)
                    {
                        if(elt.nodeType === 3)
                            elt = elt.parentNode;

                        if (usingColorArray)
                            highlighter.highlight(context, elt, null, colorObj[i], true);
                        else
                            highlighter.highlight(context, elt, null, colorObj, true);
                    }
                }
            }

            storeHighlighterParams(null, context, elementArr, null, colorObj, highlightType, true);
        }
    },

    /**
     * Clear all highlighted areas on a page.
     */
    clearAllHighlights: function() {
        highlighterCache.clear();
    },

    /**
     * Toggle inspecting on / off
     * @param {Window} [context] The window to begin inspecting in, necessary to toggle inspecting on.
     */
    toggleInspecting: function(context)
    {
        if (this.inspecting)
            this.stopInspecting(true);
        else
            this.startInspecting(context);
    },

    /**
     * Check if the new panel has the inspectable property set. If so set it as the new inspectingPanel.
     */
    onPanelChanged: function()
    {
        if (this.inspecting)
        {
            var panelBar1 = Firebug.chrome.$("fbPanelBar1");
            var panel = panelBar1.selectedPanel;

            if (panel && panel.inspectable)
            {
                this.inspectNode(null);
                this.inspectingPanel = panel;
            }
        }
    },

    /**
     * Turn inspecting on.
     * @param {Window} context The main browser window
     */
    startInspecting: function(context)
    {
        if (this.inspecting || !context || !context.loaded)
            return;

        this.clearAllHighlights();

        this.inspecting = true;
        this.inspectingContext = context;

        Firebug.chrome.setGlobalAttribute("cmd_toggleInspecting", "checked", "true");
        this.attachInspectListeners(context);

        var inspectingPanelName = this._resolveInspectingPanelName(context);
        this.inspectingPanel = Firebug.chrome.switchToPanel(context, inspectingPanelName);

        if (Firebug.isDetached())
            context.window.focus();
        else if (Firebug.isMinimized())
            Firebug.showBar(true);

        this.inspectingPanel.panelNode.focus();
        this.inspectingPanel.startInspecting();

        Events.dispatch(this.fbListeners, "onStartInspecting", [context]);

        if (context.stopped)
            Firebug.Debugger.thaw(context);

        if (context.hoverNode)
            this.inspectNode(context.hoverNode);
    },

    /**
     * Highlight a node using the frame highlighter. Can only be used after inspecting has already started.
     * @param {Element} node The element to inspect
     */
    inspectNode: function(node)
    {
        if (node && node.nodeType != 1)
            node = node.parentNode;

        if (node && Firebug.shouldIgnore(node) && !node.fbProxyFor)
            return;

        var context = this.inspectingContext;

        if (this.inspectTimeout)
        {
            context.clearTimeout(this.inspectTimeout);
            delete this.inspectTimeout;
        }

        if (node && node.fbProxyFor)
            node = node.fbProxyFor;

        var inspectingPanel = this.inspectingPanel;

        // Some panels may want to only allow inspection of panel-supported objects
        node = inspectingPanel ? inspectingPanel.getInspectNode(node) : node;

        var highlightColor = inspectingPanel ? inspectingPanel.inspectHighlightColor : "";
        this.highlightObject(node, context, "frame", undefined, highlightColor);

        this.inspectingNode = node;

        if (node)
        {
            var _this = this;

            this.inspectTimeout = context.setTimeout(function()
            {
                var selection = inspectingPanel.inspectNode(node);
                Events.dispatch(_this.fbListeners, "onInspectNode", [context, node]);
                if (selection)
                    inspectingPanel.select(node);
            }, inspectDelay);
        }
    },

    /**
     * Stop inspecting and clear all highlights.
     * @param {Boolean} canceled Indicates whether inspect was cancelled (usually via the escape key)
     * @param {Boolean} [waitForClick] Indicates whether the next click will still forward you to the clicked element in the HTML panel
     */
    stopInspecting: function(canceled, waitForClick)
    {
        if (!this.inspecting)
            return;

        var context = this.inspectingContext;

        if (context.stopped)
            Firebug.Debugger.freeze(context);

        if (this.inspectTimeout)
        {
            context.clearTimeout(this.inspectTimeout);
            delete this.inspectTimeout;
        }

        this.detachInspectListeners(context);
        if (!waitForClick)
            this.detachClickInspectListeners(context.window);

        Firebug.chrome.setGlobalAttribute("cmd_toggleInspecting", "checked", "false");

        this.inspecting = false;

        Firebug.chrome.unswitchToPanel(context, this.inspectingPanel.name, canceled);

        this.inspectingPanel.stopInspecting(this.inspectingNode, canceled);
        Events.dispatch(this.fbListeners, "onStopInspecting", [context, this.inspectingNode, canceled]);

        this.inspectNode(null);
    },

    /**
     * Get the name of the inspectable panel.
     * @param {Window} context Context of the panel
     */
    _resolveInspectingPanelName: function(context)
    {
        var name, requestingPanel = context && context.getPanel(context.panelName);

        if (requestingPanel && requestingPanel.inspectable)
            name = requestingPanel.name;
        else
            name = "html";

        return name;
    },

    /**
     * Inspect from context menu.
     * @param {Element} elt The element to inspect
     */
    inspectFromContextMenu: function(elt)
    {
        var panel;
        var inspectingPanelName = "html";

        Firebug.toggleBar(true, inspectingPanelName);
        Firebug.chrome.select(elt, inspectingPanelName);
        panel = Firebug.chrome.selectPanel(inspectingPanelName);
        panel.panelNode.focus();
    },

    /**
     * Navigate up and down through the DOM and highlight the result. This method is used by the key handlers for the up and down arrow keys.
     * @param {String} dir Direction to navigate the Dom, either "up" or "down"
     */
    inspectNodeBy: function(dir)
    {
        var target;
        var node = this.inspectingNode;

        if (dir == "up")
        {
            target = Firebug.chrome.getNextObject();
        }
        else if (dir == "down")
        {
            target = Firebug.chrome.getNextObject(true);
            if (node && !target)
            {
                if (node.contentDocument)
                    target = node.contentDocument.documentElement;
                else
                    target = Dom.getNextElement(node.firstChild);
            }
        }

        if (target && Dom.isElement(target))
            this.inspectNode(target);
        else
            System.beep();
    },

    /**
     * Repaint the highlighter. Called from the window scroll and resize handlers.
     */
    repaint: function()
    {
        var rp = this.repaint;
        var highlighter = rp.highlighter;
        var context = rp.context;
        var element = rp.element;
        var boxFrame = rp.boxFrame;
        var colorObj = rp.colorObj;
        var highlightType = rp.highlightType;
        var isMulti = rp.isMulti;

        if(!context || (!highlighter && !isMulti))
            return;

        if(isMulti && element)
            this.highlightObject(element, context, highlightType, null, colorObj);
        else
        {
            var highlighterNode = highlighterCache.get(highlighter.ident);

            if(highlighterNode && highlighter.ident === ident.boxModel)
                highlighterNode = highlighterNode.offset;

            if(highlighterNode && highlighterNode.parentNode)
            {
                this.clearAllHighlights();
                highlighter.highlight(context, element, boxFrame, colorObj, isMulti);
            }
        }
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    /**
     * Attach the scroll and resize handlers to elts window. Called from every highlight call.
     * @param {Element} elt Passed in order to reliably obtain context
     */
    attachRepaintInspectListeners: function(elt)
    {
        if (!elt || !elt.ownerDocument || !elt.ownerDocument.defaultView)
            return;

        var win = elt.ownerDocument.defaultView;

        if (FBTrace.DBG_INSPECT)
            FBTrace.sysout("inspector.attachRepaintInspectListeners to " + win.location.href, elt);

        // there is no way to check if the listeners have already been added and we should avoid adding properties
        // to the users page. Adding them again will do no harm so lets just do that.
        win.document.addEventListener("resize", this.onInspectingResizeWindow, true);
        win.document.addEventListener("scroll", this.onInspectingScroll, true);
    },

    /**
     * Attach key and mouse events to windows recursively.
     * @param {Window} context Context of the main browser window
     */
    attachInspectListeners: function(context)
    {
        var win = context.window;
        if (!win || !win.document)
            return;

        if (FBTrace.DBG_INSPECT)
            FBTrace.sysout("inspector.attachInspectListeners to all subWindows of " + win.location);

        var chrome = Firebug.chrome;

        this.keyListeners =
        [
            chrome.keyCodeListen("RETURN", null, Obj.bindFixed(this.stopInspecting, this)),
            chrome.keyCodeListen("ESCAPE", null, Obj.bindFixed(this.stopInspecting, this, true)),
            chrome.keyCodeListen("UP", Events.isControl, Obj.bindFixed(this.inspectNodeBy, this, "up"), true),
            chrome.keyCodeListen("DOWN", Events.isControl, Obj.bindFixed(this.inspectNodeBy, this, "down"), true),
        ];

        Win.iterateWindows(win, Obj.bind(function(subWin)
        {
            if (FBTrace.DBG_INSPECT)
                FBTrace.sysout("inspector.attacheInspectListeners to " + subWin.location +
                    " subWindow of " + win.location);

            subWin.document.addEventListener("mouseover", this.onInspectingMouseOver, true);
            subWin.document.addEventListener("mousedown", this.onInspectingMouseDown, true);
            subWin.document.addEventListener("mouseup", this.onInspectingMouseUp, true);
            subWin.document.addEventListener("click", this.onInspectingClick, true);
        }, this));
    },

    /**
     * Remove all event listeners except click listener from windows recursively.
     * @param {Window} context Context of the main browser window
     */
    detachInspectListeners: function(context)
    {
        var i, keyListenersLen;
        var win = context.window;

        if (!win || !win.document)
            return;

        var chrome = Firebug.chrome;

        if (this.keyListeners)  // XXXjjb for some reason this is null some times.
        {
            keyListenersLen = this.keyListeners.length;
            for (i = 0; i < keyListenersLen; ++i)
                chrome.keyIgnore(this.keyListeners[i]);
            delete this.keyListeners;
        }

        Win.iterateWindows(win, Obj.bind(function(subWin)
        {
            subWin.document.removeEventListener("mouseover", this.onInspectingMouseOver, true);
            subWin.document.removeEventListener("mousedown", this.onInspectingMouseDown, true);
            subWin.document.removeEventListener("mouseup", this.onInspectingMouseUp, true);
        }, this));
    },

    /**
     * Remove the click listener independent from detachInspectListeners because if we remove it after mousedown, we won't be able to cancel clicked links.
     * @param {Window} context Context of the main browser window
     */
    detachClickInspectListeners: function(context)
    {
        Win.iterateWindows(context, Obj.bind(function(subWin)
        {
            subWin.document.removeEventListener("click", this.onInspectingClick, true);
        }, this));
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    /**
     * Repaint last highlight in the correct position on window resize.
     * @param {Event} event Passed for tracing
     */
    onInspectingResizeWindow: function(event)
    {
        if (FBTrace.DBG_INSPECT)
           FBTrace.sysout("onInspectingResizeWindow event", event);

        this.repaint();
    },

    /**
     * Repaint last highlight in the correct position on scroll.
     * @param {Event} event Passed for tracing
     */
    onInspectingScroll: function(event)
    {
        if (FBTrace.DBG_INSPECT)
           FBTrace.sysout("onInspectingScroll event", event);

        this.repaint();
    },

    /**
     * Call inspectNode(event.target) highlighting the element that was moused over.
     * @param {Event} event Passed for tracing and to identify the target of inspection
     */
    onInspectingMouseOver: function(event)
    {
        if (FBTrace.DBG_INSPECT)
           FBTrace.sysout("onInspectingMouseOver event", event);

        this.inspectNode(event.target);
    },

    /**
     * Trap mousedown events to prevent clicking a document from triggering a document's mousedown event when inspecting.
     * @param {Event} event Used for tracing and canceling the event
     */
    onInspectingMouseDown: function(event)
    {
        if (FBTrace.DBG_INSPECT)
            FBTrace.sysout("onInspectingMouseDown event", {originalTarget: event.originalTarget,
                tmpRealOriginalTarget:event.tmpRealOriginalTarget, event:event});

        // Allow to scroll the document while inspecting
        if (event.originalTarget && event.originalTarget.tagName === "xul:thumb")
            return;

        Events.cancelEvent(event);
    },

    /**
     * Trap mouseup events to prevent clicking a document from triggering a document's mouseup event when inspecting.
     * @param {Event} event Used for tracing and canceling the event
     */
    onInspectingMouseUp: function(event)
    {
        if (FBTrace.DBG_INSPECT)
            FBTrace.sysout("onInspectingMouseUp event", {originalTarget: event.originalTarget,
                tmpRealOriginalTarget:event.tmpRealOriginalTarget,event:event});

        // Allow to release scrollbar while inspecting
        if (event.originalTarget && event.originalTarget.tagName === "xul:thumb")
            return;

        this.stopInspecting(false, true);

        Events.cancelEvent(event);
    },

    /**
     * Trap click events to prevent clicking a document from triggering a document's click event when inspecting and removes the click inspect listener.
     * @param {Event} event Used for tracing and canceling the event
     */
    onInspectingClick: function(event)
    {
        if (FBTrace.DBG_INSPECT)
            FBTrace.sysout("onInspectingClick event", event);

        var win = event.currentTarget.defaultView;
        if (win)
        {
            win = Win.getRootWindow(win);
            this.detachClickInspectListeners(win);
        }

        Events.cancelEvent(event);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    // extends Module

    /**
     * Initialize the inspector
     */
    initialize: function()
    {
        Firebug.Module.initialize.apply(this, arguments);

        this.onInspectingResizeWindow = Obj.bind(this.onInspectingResizeWindow, this);
        this.onInspectingScroll = Obj.bind(this.onInspectingScroll, this);
        this.onInspectingMouseOver = Obj.bind(this.onInspectingMouseOver, this);
        this.onInspectingMouseDown = Obj.bind(this.onInspectingMouseDown, this);
        this.onInspectingMouseUp = Obj.bind(this.onInspectingMouseUp, this);
        this.onInspectingClick = Obj.bind(this.onInspectingClick, this);
        this.onPanelChanged = Obj.bind(this.onPanelChanged, this);

        this.updateOption("shadeBoxModel", Firebug.shadeBoxModel);
        this.updateOption("showQuickInfoBox", Firebug.showQuickInfoBox);

        var panelBar1 = Firebug.chrome.$("fbPanelBar1");
        panelBar1.addEventListener("selectPanel", this.onPanelChanged, false);
    },

    /**
     * Create a method context.onPreInspectMouseOver that updates context.hoverNode to be equal to event.target. Called on element mouseover.
     * @param {Window} context Context of the main window
     */
    initContext: function(context)
    {
        context.onPreInspectMouseOver = function(event) { context.hoverNode = event.target; };
    },

    /**
     * Stop inspecting and delete timers.
     * @param {Window} context Context of the main window
     */
    destroyContext: function(context)
    {
        if (context.highlightTimeout)
        {
            context.clearTimeout(context.highlightTimeout);
            delete context.highlightTimeout;
        }

        if (this.inspecting)
            this.stopInspecting(true);
    },

    /**
     * Attach a mouseover event to win that calls context.onPreInspectMouseOver.
     * @param {Window} context The context of the onPreInspectMouseOver method
     * @param {Window} win the context of the main window
     */
    watchWindow: function(context, win)
    {
        win.addEventListener("mouseover", context.onPreInspectMouseOver, true);
    },

    /**
     * Remove the mouseover event from win that was used to call context.onPreInspectMouseOver.
     * @param {Window} context The context of the onPreInspectMouseOver method
     * @param {Window} win the context of the main window
     */
    unwatchWindow: function(context, win)
    {
        try {
            win.removeEventListener("mouseover", context.onPreInspectMouseOver, true);
            this.hideQuickInfoBox();
        } catch (ex) {
            // Get unfortunate errors here sometimes, so let's just ignore them since the window is going away anyhow
        }
    },

    /**
     * Called when a FF tab is created or activated (user changes FF tab). We stop inspecting in this situation.
     * @param {xul:browser} [browser] Browser
     * @param {Window} [context] The main browser window
     */
    showContext: function(browser, context)
    {
        if (this.inspecting)
            this.stopInspecting(true);
    },

    /**
     * Called when a panel is shown.
     * @param {xul:browser} [browser] Browser
     * @param {Panel} [panel] Panel
     */
    showPanel: function(browser, panel)
    {
        // Don't disable the cmd_toggleInspecting command. The realted shortcut <key> must
        // be available even if Firebug is not activated for the site. See 4452
        // The panel can be null (if disabled) so use the global context.
        // var context = Firebug.currentContext;
        // var disabled = (context && context.loaded) ? false : true;
        // Firebug.chrome.setGlobalAttribute("cmd_toggleInspecting", "disabled", disabled);
    },

    /**
     * Called after a context's page gets DOMContentLoaded. We enable inspection here.
     * @param {Window} [context] Context of the main window
     */
    loadedContext: function(context)
    {
        // See the comment in showPanel.
        // Firebug.chrome.setGlobalAttribute("cmd_toggleInspecting", "disabled", "false");
    },

    /**
     * Update the shadeBoxModel or showQuickInfoBox options
     * @param {String} name Either "shadeBoxModel" or "showQuickInfoBox"
     * @param {Boolean} value Enable or Disable the option
     */
    updateOption: function(name, value)
    {
        if (name == "shadeBoxModel")
        {
            this.highlightObject(null);
            this.defaultHighlighter = value ? getHighlighter("boxModel") : getHighlighter("frame");
        }
        else if(name == "showQuickInfoBox")
        {
            quickInfoBox.boxEnabled = value;
        }
    },

    /**
     * Gets stylesheet by Url.
     * @param {Window} context the main browser window
     * @param {String} url URL of the stylesheet
     */
    getObjectByURL: function(context, url)
    {
        var styleSheet = Css.getStyleSheetByHref(url, context);
        if (styleSheet)
            return styleSheet;
    },

    /**
     * Toggle the quick info box.
     */
    toggleQuickInfoBox: function()
    {
        var qiBox = Firebug.chrome.$('fbQuickInfoPanel');

        if (qiBox.state === "open")
            quickInfoBox.hide();

        quickInfoBox.boxEnabled = !quickInfoBox.boxEnabled;

        Firebug.Options.set("showQuickInfoBox", quickInfoBox.boxEnabled);
    },

    /**
     * Hide the quick info box.
     */
    hideQuickInfoBox: function()
    {
        var qiBox = Firebug.chrome.$('fbQuickInfoPanel');

        if (qiBox.state==="open")
            quickInfoBox.hide();

        this.inspectNode(null);
    },

    /**
     * Pass all quick info box events to quickInfoBox.handleEvent() for handling.
     * @param {Event} event Event to handle
     */
    quickInfoBoxHandler: function(event)
    {
        quickInfoBox.handleEvent(event);
    }

});

// ************************************************************************************************
// Local Helpers

function getHighlighter(type)
{
    if (type == "boxModel")
    {
        if (!boxModelHighlighter)
            boxModelHighlighter = new BoxModelHighlighter();

        return boxModelHighlighter;
    }
    else if (type == "frame")
    {
        if (!frameHighlighter)
            frameHighlighter = new Firebug.Inspector.FrameHighlighter();

        return frameHighlighter;
    }
}

function pad(element, t, r, b, l) {
    var css = 'padding:' + Math.abs(t) + "px " + Math.abs(r) + "px "
         + Math.abs(b) + "px " + Math.abs(l) + "px !important;";

    if(element)
        element.style.cssText = css;
    else
        return css;
}

function moveImp(element, x, y) {
    var css = 'left:' + x + 'px !important;top:' + y + 'px !important;';

    if(element)
        element.style.cssText = css;
    else
        return css;
}

function resizeImp(element, w, h) {
    var css = 'width:' + w + 'px !important;height:' + h + 'px !important;';

    if(element)
        element.style.cssText = css;
    else
        return css;
}

// ************************************************************************************************
// Imagemap Highlighter

function getImageMapHighlighter(context)
{
    if (!context)
        return;

    var canvas, ctx, mx, my;
    var doc = context.window.document;

    var init = function(elt)
    {
        if (elt)
            doc = elt.ownerDocument;

        canvas = doc.getElementById('firebugCanvas');

        if(!canvas)
        {
            canvas = doc.createElementNS("http://www.w3.org/1999/xhtml", "canvas");
            hideElementFromInspection(canvas);
            canvas.id = "firebugCanvas";
            canvas.className = "firebugResetStyles firebugBlockBackgroundColor firebugCanvas";
            canvas.width = context.window.innerWidth;
            canvas.height = context.window.innerHeight;
            context.window.addEventListener("scroll", function(){
                context.imageMapHighlighter.show(false);
            }, true);
            doc.addEventListener("mousemove", function(event){
                mx = event.clientX;
                my = event.clientY;
            }, true);

            doc.body.appendChild(canvas);
        }
    };

    if (!context.imageMapHighlighter)
    {
        context.imageMapHighlighter =
        {
            ident: ident.imageMap,

            show: function(state)
            {
                if(!canvas)
                    init(null);

                canvas.style.cssText = 'display:' + (state?'block':'none') + ' !important';
            },

            getImages: function(mapName, multi)
            {
                var i, rect, nsResolver, xpe, elt, elts,
                    images = [],
                    eltsLen = 0;

                if(!mapName)
                    return;

                xpe = new XPathEvaluator();
                nsResolver = xpe.createNSResolver(doc.documentElement);

                elts = xpe.evaluate("//map[@name='" + mapName + "']", doc,
                    nsResolver, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);

                if(elts.snapshotLength === 0)
                    return;

                elts = xpe.evaluate("(//img | //input)[@usemap='#" + mapName + "']",
                    doc.documentElement, nsResolver, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
                eltsLen = elts.snapshotLength;

                for (i = 0; i < eltsLen; i++)
                {
                    elt = elts.snapshotItem(i);
                    rect = Dom.getLTRBWH(elt);

                    if (multi)
                    {
                        images.push(elt);
                    }
                    else if(rect.left <= mx && rect.right >= mx && rect.top <= my && rect.bottom >= my)
                    {
                        images[0] = elt;
                        break;
                    }
                }

                return images;
            },

            highlight: function(eltArea, multi)
            {
                var i, j, v, vLen, images, imagesLen, rect, shape;

                if (eltArea && eltArea.coords)
                {
                    images = this.getImages(eltArea.parentNode.name, multi) || [];

                    init(eltArea);

                    v = eltArea.coords.split(",");

                    if(!ctx)
                        ctx = canvas.getContext("2d");

                    ctx.fillStyle = "rgba(135, 206, 235, 0.7)";
                    ctx.strokeStyle = "rgb(44, 167, 220)";
                    ctx.lineWidth = 2;

                    if(images.length === 0)
                        images[0] = eltArea;

                    imagesLen = images.length;

                    for(j = 0; j < imagesLen; j++)
                    {
                        rect = Dom.getLTRBWH(images[j], context);

                        ctx.beginPath();

                        if(!multi || (multi && j===0))
                            ctx.clearRect(0, 0, canvas.width, canvas.height);

                        shape = eltArea.shape.toLowerCase();

                        if (shape === 'rect')
                            ctx.rect(rect.left + parseInt(v[0], 10), rect.top + parseInt(v[1], 10), v[2] - v[0], v[3] - v[1]);
                        else if (shape === 'circle')
                            ctx.arc(rect.left + parseInt(v[0], 10) + ctx.lineWidth / 2, rect.top + parseInt(v[1], 10) + ctx.lineWidth / 2, v[2], 0, Math.PI / 180 * 360, false);
                        else
                        {
                            vLen = v.length;
                            ctx.moveTo(rect.left + parseInt(v[0], 10), rect.top + parseInt(v[1], 10));
                            for(i=2; i < vLen; i += 2)
                                ctx.lineTo(rect.left + parseInt(v[i], 10), rect.top + parseInt(v[i + 1], 10));
                            ctx.lineTo(rect.left + parseInt(v[0], 10), rect.top + parseInt(v[1], 10));
                        }

                        ctx.fill();
                        ctx.stroke();
                        ctx.closePath();
                    }

                    this.show(true);
                }
            },

            destroy: function()
            {
                this.show(false);
                canvas = null;
                ctx = null;
            }
        }
    }

    return context.imageMapHighlighter;
}

// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

var quickInfoBox =
{
    boxEnabled: undefined,
    dragging: false,
    storedX: null,
    storedY: null,
    prevX: null,
    prevY: null,

    show: function(element)
    {
        if (!this.boxEnabled || !element)
            return;

        this.needsToHide = false;

        var vbox, lab,
            needsTitle = false,
            needsTitle2 = false,
            domAttribs = ['nodeName', 'id', 'name', 'offsetWidth', 'offsetHeight'],
            cssAttribs = ['position'],
            compAttribs = ['width', 'height', 'zIndex', 'position', 'top', 'right', 'bottom', 'left',
                           'margin-top', 'margin-right', 'margin-bottom', 'margin-left', 'color', 'backgroundColor',
                           'fontFamily', 'cssFloat', 'display', 'visibility'],
            qiBox = Firebug.chrome.$('fbQuickInfoPanel');

        if (qiBox.state==="closed")
        {
            qiBox.hidePopup();

            this.storedX = this.storedX || Firefox.getElementById('content').tabContainer.boxObject.screenX + 5;
            this.storedY = this.storedY || Firefox.getElementById('content').tabContainer.boxObject.screenY + 35;

            qiBox.openPopupAtScreen(this.storedX, this.storedY, false);
        }

        qiBox.removeChild(qiBox.firstChild);
        vbox = document.createElement("vbox");
        qiBox.appendChild(vbox);

        needsTitle = this.addRows(element, vbox, domAttribs);
        needsTitle2 = this.addRows(element.style, vbox, cssAttribs);

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
    {    // if mouse is over panel defer hiding to mouseout to not cause flickering
        if (this.mouseover || this.dragging)
        {
            this.needsToHide = true;
            return;
        }

        var qiBox = Firebug.chrome.$('fbQuickInfoPanel');
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
                if(!this.dragging)
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
                this.qiPanel = Firebug.chrome.$('fbQuickInfoPanel');
                this.qiBox = this.qiPanel.boxObject;
                this.qiPanel.addEventListener('mousemove', this, true);
                this.qiPanel.addEventListener('mouseup', this, true);
                this.dragging = true;
                this.prevX = event.screenX;
                this.prevY = event.screenY;
                break;
            case "mouseup":
                this.qiPanel.removeEventListener('mousemove', this, true);
                this.qiPanel.removeEventListener('mouseup', this, true);
                this.qiPanel = this.qiBox = null;
                this.prevX = this.prevY = null;
                this.dragging = false;
                break;
            // this is a hack to find when mouse enters and leaves panel
            // it requires that #fbQuickInfoPanel have border
            case "mouseover":
                if(this.dragging)
                    return;
                this.mouseover = true;
                break;
            case "mouseout":
                if(this.dragging)
                    return;
                this.mouseover = false;
                // if hiding was defered because mouse was over panel hide it
                if (this.needsToHide && event.target.nodeName == 'panel')
                    this.hide();
                break;
        }
    },

    addRows: function(domBase, vbox, attribs, computedStyle)
    {
        if(!domBase)
            return;

        var i, cs, desc, hbox, lab, value,
            needsTitle = false,
            attribsLen = attribs.length;

        for (i = 0; i < attribsLen; i++)
        {
            if(computedStyle)
            {
                cs = getNonFrameBody(domBase).ownerDocument.defaultView.getComputedStyle(domBase, null);
                value = cs.getPropertyValue(attribs[i]);

                if (value && /rgb\(\d+,\s\d+,\s\d+\)/.test(value))
                    value = rgbToHex(value);
            }
            else
                value = domBase[attribs[i]];

            if (value)
            {
                needsTitle = true;
                hbox = document.createElement("hbox");
                lab = document.createElement("label");
                lab.setAttribute("class", "fbQuickInfoName");
                lab.setAttribute("value", attribs[i]);
                hbox.appendChild(lab);
                desc = document.createElement("description");
                desc.setAttribute("class", "fbQuickInfoValue");
                desc.appendChild(document.createTextNode(": " + value));
                hbox.appendChild(desc);
                vbox.appendChild(hbox);
            }
        }

        return needsTitle;
    }
};

// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

Firebug.Inspector.FrameHighlighter = function()
{
};

Firebug.Inspector.FrameHighlighter.prototype =
{
    ident: ident.frame,

    doNotHighlight: function(element)
    {
        return false; // (element instanceof XULElement);
    },

    highlight: function(context, element, extra, colorObj, isMulti)
    {
        if (this.doNotHighlight(element))
            return;

        // if a single color was passed in lets use it as the border color
        if (typeof colorObj === "string")
            colorObj = {background: "transparent", border: colorObj};
        else
            colorObj = colorObj || {background: "transparent", border: "highlight"};

        Firebug.Inspector.attachRepaintInspectListeners(element);
        storeHighlighterParams(this, context, element, null, colorObj, null, isMulti);

        var cs;
        var offset = Dom.getLTRBWH(element);
        var x = offset.left, y = offset.top;
        var w = offset.width, h = offset.height;

        if (FBTrace.DBG_INSPECT)
            FBTrace.sysout("FrameHighlighter HTML tag:" + element.tagName + " x:" + x + " y:" + y + " w:" + w + " h:" + h);

        var wacked = isNaN(x) || isNaN(y) || isNaN(w) || isNaN(h);
        if (wacked)
        {
            if (FBTrace.DBG_INSPECT)
                FBTrace.sysout("FrameHighlighter.highlight has bad boxObject for " + element.tagName);

            return;
        }

        if (element.tagName !== "AREA")
        {
            if (FBTrace.DBG_INSPECT)
                FBTrace.sysout("FrameHighlighter " + element.tagName);
            var body = getNonFrameBody(element);
            if (!body)
                return this.unhighlight(context);

            this.ihl && this.ihl.show(false);

            quickInfoBox.show(element);
            var highlighter = this.getHighlighter(context, isMulti);
            var bgDiv = highlighter.firstChild;
            var css = moveImp(null, x, y) + resizeImp(null, w, h);

            cs = body.ownerDocument.defaultView.getComputedStyle(element, null);

            if(cs.MozTransform && cs.MozTransform != "none")
                css += "-moz-transform:" + cs.MozTransform + "!important;" +
                       "-moz-transform-origin:" + cs.MozTransformOrigin + "!important;";
            if(cs.borderRadius)
                css += "border-radius:" + cs.borderRadius + " !important;";
            if(cs.borderTopLeftRadius)
                css += "border-top-left-radius:" + cs.borderTopLeftRadius + " !important;";
            if(cs.borderTopRightRadius)
                css += "border-top-right-radius:" + cs.borderTopRightRadius + " !important;";
            if(cs.borderBottomRightRadius)
                css += "border-bottom-right-radius:" + cs.borderBottomRightRadius + " !important;";
            if(cs.borderBottomLeftRadius)
                css += "border-bottom-left-radius:" + cs.borderBottomLeftRadius + " !important;";
            if(cs.MozBorderRadius)
                css += "-moz-border-radius:" + cs.MozBorderRadius + " !important;";
            if(cs.MozBorderRadiusTopleft)
                css += "-moz-border-radius-topleft:" + cs.MozBorderRadiusTopleft + " !important;";
            if(cs.MozBorderRadiusTopright)
                css += "-moz-border-radius-topright:" + cs.MozBorderRadiusTopright + " !important;";
            if(cs.MozBorderRadiusBottomright)
                css += "-moz-border-radius-bottomright:" + cs.MozBorderRadiusBottomright + " !important;";
            if(cs.MozBorderRadiusBottomleft)
                css += "-moz-border-radius-bottomleft:" + cs.MozBorderRadiusBottomleft + " !important;";

            if(colorObj && colorObj.border)
                css += "box-shadow: 0 0 2px 2px " + colorObj.border + " !important; -moz-box-shadow: 0 0 2px 2px " + colorObj.border + " !important;";
            else
                css += "box-shadow: 0 0 2px 2px highlight !important; -moz-box-shadow: 0 0 2px 2px highlight !important;";

            if(colorObj && colorObj.background)
                bgDiv.style.cssText = "width: 100% !important; height: 100% !important; background-color: " + colorObj.background + " !important; opacity: 0.6 !important;";
            else
                bgDiv.style.cssText = "background-color: transparent !important;";

            highlighter.style.cssText = css;

            var needsAppend = !highlighter.parentNode || highlighter.ownerDocument != body.ownerDocument;
            if (needsAppend)
            {
                if (FBTrace.DBG_INSPECT)
                    FBTrace.sysout("FrameHighlighter needsAppend: " + highlighter.ownerDocument.documentURI +
                        " !?= " + body.ownerDocument.documentURI, highlighter);

                attachStyles(context, body);

                try
                {
                    body.appendChild(highlighter);
                }
                catch(exc)
                {
                    if (FBTrace.DBG_INSPECT)
                        FBTrace.sysout("inspector.FrameHighlighter.highlight body.appendChild FAILS for body " +
                            body + " " + exc, exc);
                }

                // otherwise the proxies take up screen space in browser.xul
                if (element.ownerDocument.contentType.indexOf("xul") === -1)
                    createProxiesForDisabledElements(body);
            }
        }
        else
        {
            this.ihl = getImageMapHighlighter(context);
            this.ihl.highlight(element, false);
        }
    },

    unhighlight: function(context)
    {
        if (FBTrace.DBG_INSPECT)
            FBTrace.sysout("FrameHighlighter unhighlight", context.window.location);

        var highlighter = this.getHighlighter(context);
        var body = highlighter.parentNode;
        if (body)
        {
            body.removeChild(highlighter);
            quickInfoBox.hide();
        }

        this.ihl && this.ihl.destroy();
        this.ihl = null;
    },

    getHighlighter: function(context, isMulti)
    {
        if(!isMulti)
        {
            var div = highlighterCache.get(ident.frame);
            if(div)
                return div;
        }

        var doc = context.window.document;
        div = doc.createElementNS("http://www.w3.org/1999/xhtml", "div");
        var div2 = doc.createElementNS("http://www.w3.org/1999/xhtml", "div");

        hideElementFromInspection(div);
        hideElementFromInspection(div2);

        div.className = "firebugResetStyles firebugBlockBackgroundColor";
        div2.className = "firebugResetStyles";
        div.appendChild(div2);
        div.ident = ident.frame;
        highlighterCache.add(div);
        return div;
    }
};

// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

function BoxModelHighlighter()
{
}

Firebug.Inspector.BoxModelHighlighter = BoxModelHighlighter;

BoxModelHighlighter.prototype =
{
    ident: ident.boxModel,

    highlight: function(context, element, boxFrame, colorObj, isMulti)
    {
        var line, contentCssText, paddingCssText, borderCssText, marginCssText,
            nodes = this.getNodes(context, isMulti),
            highlightFrame = boxFrame ? nodes[boxFrame] : null;

        // if a single color was passed in lets use it as the content box color
        if (typeof colorObj === "string")
            colorObj = {content: colorObj, padding: "SlateBlue", border: "#444444", margin: "#EDFF64"};
        else
            colorObj = colorObj || {content: "SkyBlue", padding: "SlateBlue", border: "#444444", margin: "#EDFF64"};

        Firebug.Inspector.attachRepaintInspectListeners(element);
        storeHighlighterParams(this, context, element, boxFrame, colorObj, null, isMulti);

        if (context.highlightFrame)
            Css.removeClass(context.highlightFrame, "firebugHighlightBox");

        if (element.tagName !== "AREA")
        {
            this.ihl && this.ihl.show(false);

            quickInfoBox.show(element);
            context.highlightFrame = highlightFrame;

            if (highlightFrame)
            {
                Css.setClass(nodes.offset, "firebugHighlightGroup");
                Css.setClass(highlightFrame, "firebugHighlightBox");
            }
            else
                Css.removeClass(nodes.offset, "firebugHighlightGroup");

            var win = (element.ownerDocument ? element.ownerDocument.defaultView : null);
            if (!win)
                return;

            var style = win.getComputedStyle(element, "");
            if (!style)
            {
                if (FBTrace.DBG_INSPECT)
                    FBTrace.sysout("highlight: no style for element " + element, element);
                return;
            }

            var styles = Css.readBoxStyles(style);
            var offset = Dom.getLTRBWH(element);
            var x = offset.left - Math.abs(styles.marginLeft);
            var y = offset.top - Math.abs(styles.marginTop);
            var w = offset.width - (styles.paddingLeft + styles.paddingRight + styles.borderLeft + styles.borderRight);
            var h = offset.height - (styles.paddingTop + styles.paddingBottom + styles.borderTop + styles.borderBottom);

            moveImp(nodes.offset, x, y);
            marginCssText = pad(null, styles.marginTop, styles.marginRight, styles.marginBottom, styles.marginLeft);
            borderCssText = pad(null, styles.borderTop, styles.borderRight, styles.borderBottom, styles.borderLeft);
            paddingCssText = pad(null, styles.paddingTop, styles.paddingRight, styles.paddingBottom, styles.paddingLeft);
            contentCssText = resizeImp(null, w, h);

            // element.tagName !== "BODY" for issue 2447. hopefully temporary, robc
            var showLines = Firebug.showRulers && boxFrame && element.tagName !== "BODY";
            if (showLines)
            {
                var offsetParent = element.offsetParent;

                if (offsetParent)
                    this.setNodesByOffsetParent(win, offsetParent, nodes);

                var left = x;
                var top = y;
                var width = w-1;
                var height = h-1;

                if (boxFrame == "content")
                {
                    left += Math.abs(styles.marginLeft) + Math.abs(styles.borderLeft)
                        + Math.abs(styles.paddingLeft);
                    top += Math.abs(styles.marginTop) + Math.abs(styles.borderTop)
                        + Math.abs(styles.paddingTop);
                }
                else if (boxFrame == "padding")
                {
                    left += Math.abs(styles.marginLeft) + Math.abs(styles.borderLeft);
                    top += Math.abs(styles.marginTop) + Math.abs(styles.borderTop);
                    width += Math.abs(styles.paddingLeft) + Math.abs(styles.paddingRight);
                    height += Math.abs(styles.paddingTop) + Math.abs(styles.paddingBottom);
                }
                else if (boxFrame == "border")
                {
                    left += Math.abs(styles.marginLeft);
                    top += Math.abs(styles.marginTop);
                    width += Math.abs(styles.paddingLeft) + Math.abs(styles.paddingRight)
                         + Math.abs(styles.borderLeft) + Math.abs(styles.borderRight);
                    height += Math.abs(styles.paddingTop) + Math.abs(styles.paddingBottom)
                        + Math.abs(styles.borderTop) + Math.abs(styles.borderBottom);
                }
                else if (boxFrame == "margin")
                {
                    width += Math.abs(styles.paddingLeft) + Math.abs(styles.paddingRight)
                         + Math.abs(styles.borderLeft) + Math.abs(styles.borderRight)
                         + Math.abs(styles.marginLeft) + Math.abs(styles.marginRight);
                    height += Math.abs(styles.paddingTop) + Math.abs(styles.paddingBottom)
                        + Math.abs(styles.borderTop) + Math.abs(styles.borderBottom)
                        + Math.abs(styles.marginTop) + Math.abs(styles.marginBottom);
                }

                moveImp(nodes.lines.top, 0, top);
                moveImp(nodes.lines.right, left + width, 0);
                moveImp(nodes.lines.bottom, 0, top + height);
                moveImp(nodes.lines.left, left, 0)
            }

            var body = getNonFrameBody(element);
            if (!body)
                return this.unhighlight(context);

            if (colorObj.content)
                nodes.content.style.cssText = contentCssText + " background-color: " + colorObj.content + " !important;";
            else
                nodes.content.style.cssText = contentCssText + " background-color: #87CEEB !important;";

            if (colorObj.padding)
                nodes.padding.style.cssText = paddingCssText + " background-color: " + colorObj.padding + " !important;";
            else
                nodes.padding.style.cssText = paddingCssText + " background-color: #6A5ACD !important;";

            if (colorObj.border)
                nodes.border.style.cssText = borderCssText + " background-color: " + colorObj.border + " !important;";
            else
                nodes.border.style.cssText = borderCssText + " background-color: #444444 !important;";

            if (colorObj.margin)
                nodes.margin.style.cssText = marginCssText + " background-color: " + colorObj.margin + " !important;";
            else
                nodes.margin.style.cssText = marginCssText + " background-color: #EDFF64 !important;";

            var needsAppend = !nodes.offset.parentNode
                || nodes.offset.parentNode.ownerDocument != body.ownerDocument;

            if (needsAppend)
            {
                attachStyles(context, body);
                body.appendChild(nodes.offset);
            }

            if (showLines)
            {
                if (!nodes.lines.top.parentNode)
                {
                    if (nodes.parent)
                        body.appendChild(nodes.parent);

                    for (line in nodes.lines)
                        body.appendChild(nodes.lines[line]);
                }
            }
            else if (nodes.lines.top.parentNode)
            {
                if (nodes.parent)
                    body.removeChild(nodes.parent);

                for (line in nodes.lines)
                    body.removeChild(nodes.lines[line]);
            }
        }
        else
        {
            this.ihl = getImageMapHighlighter(context);
            this.ihl.highlight(element, true);
        }
    },

    unhighlight: function(context)
    {
        highlighterCache.clear();
        quickInfoBox.hide();
    },

    getNodes: function(context, isMulti)
    {
        if (context.window)
        {
            var doc = context.window.document;

            if (FBTrace.DBG_ERRORS && !doc)
                FBTrace.sysout("inspector getNodes no document for window:" + window.location);
            if (FBTrace.DBG_INSPECT && doc)
                FBTrace.sysout("inspect.getNodes doc: " + doc.location);

            if(!isMulti)
            {
                var nodes = highlighterCache.get(ident.boxModel);
                if(nodes)
                    return nodes;
            }

            var Ruler = "firebugResetStyles firebugBlockBackgroundColor firebugRuler firebugRuler";
            var Box = "firebugResetStyles firebugBlockBackgroundColor firebugLayoutBox firebugLayoutBox";
            var CustomizableBox = "firebugResetStyles firebugLayoutBox";
            var Line = "firebugResetStyles firebugBlockBackgroundColor firebugLayoutLine firebugLayoutLine";

            function create(className, name)
            {
                var div = doc.createElementNS("http://www.w3.org/1999/xhtml", "div");
                hideElementFromInspection(div);

                if (className !== CustomizableBox)
                    div.className = className + name;
                else
                    div.className = className;

                return div;
            }

            nodes =
            {
                parent: create(Box, "Parent"),
                rulerH: create(Ruler, "H"),
                rulerV: create(Ruler, "V"),
                offset: create(Box, "Offset"),
                margin: create(CustomizableBox, "Margin"),
                border: create(CustomizableBox, "Border"),
                padding: create(CustomizableBox, "Padding"),
                content: create(CustomizableBox, "Content"),
                lines: {
                    top: create(Line, "Top"),
                    right: create(Line, "Right"),
                    bottom: create(Line, "Bottom"),
                    left: create(Line, "Left")
                }
            };

            nodes.parent.appendChild(nodes.rulerH);
            nodes.parent.appendChild(nodes.rulerV);
            nodes.offset.appendChild(nodes.margin);
            nodes.margin.appendChild(nodes.border);
            nodes.border.appendChild(nodes.padding);
            nodes.padding.appendChild(nodes.content);
        }

        nodes.ident = ident.boxModel;
        highlighterCache.add(nodes);
        return nodes;
    },

    setNodesByOffsetParent: function(win, offsetParent, nodes)
    {
        var parentStyle = win.getComputedStyle(offsetParent, "");
        var parentOffset = Dom.getLTRBWH(offsetParent);
        var parentX = parentOffset.left + parseInt(parentStyle.borderLeftWidth, 10);
        var parentY = parentOffset.top + parseInt(parentStyle.borderTopWidth, 10);
        var parentW = offsetParent.offsetWidth-1;
        var parentH = offsetParent.offsetHeight-1;

        nodes.parent.style.cssText = moveImp(null, parentX, parentY) + resizeImp(null, parentW, parentH);

        if (parentX < 14)
            Css.setClass(nodes.parent, "overflowRulerX");
        else
            Css.removeClass(nodes.parent, "overflowRulerX");

        if (parentY < 14)
            Css.setClass(nodes.parent, "overflowRulerY");
        else
            Css.removeClass(nodes.parent, "overflowRulerY");
    }
};

// ************************************************************************************************

var highlighterCache =
{
    highlighters:
    {
        frameArr: [],
        boxModelArr: [],
        proxyEltArr: []
    },

    get: function(type)
    {
        var node;
        var hl = this.highlighters;

        switch (type)
        {
            case ident.boxModel:
                if(hl.boxModelArr.length === 1)
                {
                    node = hl.boxModelArr[0];
                    if(!node.parentElement)
                        return node;
                }
            break;
            case ident.frame:
                if(hl.frameArr.length === 1)
                {
                    node = hl.frameArr[0];
                    if(!node.parentElement)
                        return node;
                }
            break;
            case ident.proxyElt:
                if(hl.proxyEltArr.length === 1)
                {
                    node = hl.proxyEltArr[0];
                    if(!node.parentElement)
                        return node;
                }
            break;
        }
    },

    add: function(node)
    {
        switch (node.ident)
        {
            case ident.boxModel:
                this.highlighters.boxModelArr.push(node);
            break;
            case ident.frame:
                this.highlighters.frameArr.push(node);
            break;
            case ident.proxyElt:
                this.highlighters.proxyEltArr.push(node);
            break;
        }
    },

    clear: function()
    {
        var clearCache = function(arr) {
            var i, highlighter;

            for(i = arr.length - 1; i >= 0; i--)
            {
                highlighter = arr[i];

                if (highlighter && highlighter.parentNode)
                    highlighter.parentNode.removeChild(highlighter);
            }
        };

        var clearBoxModelCache = function(arr) {
            var i, lineName, name, node, highlighter;

            for(i = arr.length - 1; i >= 0; i--)
            {
                for each (name in ["lines", "offset", "parent"])
                {
                    if(name === "lines")
                    {
                        for each (lineName in ["bottom", "left", "top", "right"])
                        {
                            node = arr[i].lines[lineName];
                            if(node && node.parentNode)
                                node.parentNode.removeChild(node);
                        }
                    }
                    else
                    {
                        node = arr[i][name];
                        if(node && node.parentNode)
                            node.parentNode.removeChild(node);
                    }
                }
            }
        };

        clearBoxModelCache(this.highlighters.boxModelArr);
        clearCache(this.highlighters.frameArr);
        clearCache(this.highlighters.proxyEltArr);
        this.highlighters.boxModelArr=[];
        this.highlighters.frameArr=[];
        this.highlighters.proxyEltArr=[];
    }
};

// ************************************************************************************************

function getNonFrameBody(elt)
{
    var body = Dom.getBody(elt.ownerDocument);
    return (body.localName && body.localName.toUpperCase() === "FRAMESET") ? null : body;
}

function attachStyles(context, body)
{
    var doc = body.ownerDocument;
    if (!context.highlightStyle)
        context.highlightStyle = Css.createStyleSheet(doc, highlightCSS);

    if (!context.highlightStyle.parentNode || context.highlightStyle.ownerDocument != doc)
        Css.addStyleSheet(body.ownerDocument, context.highlightStyle);
}

function createProxiesForDisabledElements(body)
{
    var i, rect, div, node,
        doc = body.ownerDocument,
        xpe = new XPathEvaluator(),
        nsResolver = xpe.createNSResolver(doc.documentElement);

    var result = xpe.evaluate('//*[@disabled]', doc.documentElement,
                      nsResolver, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
    var l = result.snapshotLength;

    for(i = 0; i < l; i++)
    {
        node = result.snapshotItem(i);
        rect = node.getBoundingClientRect();
        div = doc.createElementNS("http://www.w3.org/1999/xhtml", "div");
        hideElementFromInspection(div);
        div.className = "fbProxyElement";
        div.style.cssText = moveImp(null, rect.left, rect.top + body.scrollTop) + resizeImp(null, rect.width, rect.height);
        div.fbProxyFor = node;

        body.appendChild(div);
        div.ident = ident.proxyElt;
        highlighterCache.add(div);
    }
}

function rgbToHex(value)
{
    return value.replace(/\brgb\((\d{1,3}),\s*(\d{1,3}),\s*(\d{1,3})\)/gi, function(_, r, g, b)
    {
        return '#' + ((1 << 24) + (r << 16) + (g << 8) + (b << 0)).toString(16).substr(-6).toUpperCase();
    });
}

function isVisibleElement(elt)
{
    var invisibleElements =
        {
            "head": true,
            "base": true,
            "basefont": true,
            "isindex": true,
            "link": true,
            "meta": true,
            "script": true,
            "style": true,
            "title": true
        };

    return !invisibleElements[elt.nodeName.toLowerCase()];
}

function hideElementFromInspection(elt)
{
    if (!FBTrace.DBG_INSPECT)
        Firebug.setIgnored(elt);
}

// highlightType is only to be used for multihighlighters
function storeHighlighterParams(highlighter, context, element, boxFrame, colorObj, highlightType, isMulti)
{
    var fir = Firebug.Inspector.repaint;

    fir.highlighter = highlighter;
    fir.context = context;
    fir.element = element;
    fir.boxFrame = boxFrame;
    fir.colorObj = colorObj;
    fir.highlightType = highlightType;
    fir.isMulti = isMulti;

    Firebug.Inspector.highlightedContext = context;
}

// ************************************************************************************************
// Registration

Firebug.registerModule(Firebug.Inspector);

return Firebug.Inspector;

// ************************************************************************************************
});
