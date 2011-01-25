/* See license.txt for terms of usage */

FBL.ns(function() { with (FBL) {

// ************************************************************************************************
// Constants

const inspectDelay = 200;
const highlightCSS = "chrome://firebug/content/highlighter.css";

// ************************************************************************************************
// Globals

var boxModelHighlighter = null,
    frameHighlighter = null;

// ************************************************************************************************

Firebug.Inspector = extend(Firebug.Module,
{
    dispatchName: "inspector",
    inspecting: false,
    inspectingPanel: null,

    highlightObject: function(element, context, highlightType, boxFrame)
    {
        if (!element || !isElement(element) || !isVisible(unwrapObject(element)))
        {
            if(element && element.nodeType == 3)
                element = element.parentNode;
            else
                element = null;
        }

        if (element && context && context.highlightTimeout)
        {
            context.clearTimeout(context.highlightTimeout);
            delete context.highlightTimeout;
        }

        var highlighter = highlightType ? getHighlighter(highlightType) : this.defaultHighlighter;

        var oldContext = this.highlightedContext;
        if (oldContext && highlighter != this.highlighter)
        {
            if (oldContext.window)
                this.highlighter.unhighlight(oldContext);
        }

        this.highlighter = highlighter;
        this.highlightedElement = element;
        this.highlightedContext = context;

        if (element)
        {
            if(!isVisibleElement(element))
                highlighter.unhighlight(context);
            else if (context && context.window && context.window.document)
                highlighter.highlight(context, element, boxFrame);
        }
        else if (oldContext)
        {
            oldContext.highlightTimeout = oldContext.setTimeout(function()
            {
                delete oldContext.highlightTimeout;
                if (oldContext.window && oldContext.window.document)
                {
                    highlighter.unhighlight(oldContext);
                    if (oldContext.inspectorMouseMove)
                        oldContext.window.document.removeEventListener("mousemove", oldContext.inspectorMouseMove, true);
                }
            }, inspectDelay);
        }
    },

    toggleInspecting: function(context)
    {
        if (this.inspecting)
            this.stopInspecting(true);
        else
            this.startInspecting(context);
    },

    startInspecting: function(context)
    {
        if (this.inspecting || !context || !context.loaded)
            return;

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

        if (context.stopped)
            Firebug.Debugger.thaw(context);

        if (context.hoverNode)
            this.inspectNode(context.hoverNode);
    },

    inspectNode: function(node)
    {
        if (node && node.nodeType != 1)
            node = node.parentNode;

        if(node && unwrapObject(node).firebugIgnore && !node.fbProxyFor)
            return;

        var context = this.inspectingContext;

        if (this.inspectTimeout)
        {
            context.clearTimeout(this.inspectTimeout);
            delete this.inspectTimeout;
        }

        if(node && node.fbProxyFor)
            node = node.fbProxyFor;

        if (node)
        {
            //some panels may want to only allow inspection of panel-supported objects
            var panel = this.inspectingPanel;
            while (node)
            {
                if(!panel.inspectOnlySupportedObjects || (panel.inspectOnlySupportedObjects && panel.supportsObject(node, typeof node)))
                {
                    this.highlightObject(node, context, "frame");
                    this.inspectingNode = node;

                    this.inspectTimeout = context.setTimeout(function()
                    {
                        Firebug.chrome.select(node);
                    }, inspectDelay);
                    dispatch(this.fbListeners, "onInspectNode", [context, node] );
                    return;
                }
                node = node.parentNode;
            }
        }
        // node will be undefined
        this.highlightObject(node, context, "frame");
        this.inspectingNode = node;
    },

    stopInspecting: function(cancelled, waitForClick)
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

        var panel = Firebug.chrome.unswitchToPanel(context, this.inspectingPanel.name, cancelled);

        panel.stopInspecting(panel.selection, cancelled);

        dispatch(this.fbListeners, "onStopInspecting", [context] );

        this.inspectNode(null);
    },

    _resolveInspectingPanelName: function(context) {
        var name,
            requestingPanel = context && context.getPanel(context.panelName);

        if(requestingPanel && requestingPanel.inspectable) {
            name = requestingPanel.name;
        } else {
            name = "html";
        }

        return name;
    },


    inspectFromContextMenu: function(elt)
    {
        var panel, inspectingPanelName,
            context = this.inspectingContext || Firebug.TabWatcher.getContextByWindow(elt.ownerDocument.defaultView);

        inspectingPanelName = this._resolveInspectingPanelName(context);

        Firebug.toggleBar(true, inspectingPanelName);
        Firebug.chrome.select(elt, inspectingPanelName);
        panel = Firebug.chrome.selectPanel(inspectingPanelName);
        panel.panelNode.focus();
    },

    inspectNodeBy: function(dir)
    {
        var target,
            node = this.inspectingNode;

        if (dir == "up")
            target = Firebug.chrome.getNextObject();
        else if (dir == "down")
        {
            target = Firebug.chrome.getNextObject(true);
            if (node && !target)
            {
                if (node.contentDocument)
                    target = node.contentDocument.documentElement;
                else
                    target = getNextElement(node.firstChild);
            }
        }

        if (target && isElement(target))
            this.inspectNode(target);
        else
            beep();
    },

    repaint: function() {
        var rp = this.repaint,
            highlighter = rp.highlighter,
            context = rp.context,
            element = rp.element,
            boxFrame = rp.boxFrame,
            isBoxHighlighter = highlighter.getNodes && highlighter.getNodes(context).offset.parentNode;

        if(highlighter && (isBoxHighlighter || (this.inspecting && !isBoxHighlighter)))
            highlighter.highlight(context, element, boxFrame);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    attachInspectListeners: function(context)
    {
        var win = context.window;
        if (!win || !win.document)
            return;

        if (FBTrace.DBG_INSPECT)
            FBTrace.sysout("inspector.attacheInspectListeners to alls subWindows of "+win.location);

        var chrome = Firebug.chrome;

        this.keyListeners =
        [
            chrome.keyCodeListen("RETURN", null, bindFixed(this.stopInspecting, this)),
            chrome.keyCodeListen("ESCAPE", null, bindFixed(this.stopInspecting, this, true)),
            chrome.keyCodeListen("UP", isControl, bindFixed(this.inspectNodeBy, this, "up"), true),
            chrome.keyCodeListen("DOWN", isControl, bindFixed(this.inspectNodeBy, this, "down"), true),
        ];

        iterateWindows(win, bind(function(subWin)
        {
            if (FBTrace.DBG_INSPECT)
                FBTrace.sysout("inspector.attacheInspectListeners to "+subWin.location+" subWindow of "+win.location);

            subWin.document.addEventListener("resize", this.onInspectingResizeWindow, true);
            subWin.document.addEventListener("scroll", this.onInspectingScroll, true);
            subWin.document.addEventListener("mouseover", this.onInspectingMouseOver, true);
            subWin.document.addEventListener("mousedown", this.onInspectingMouseDown, true);
            subWin.document.addEventListener("mouseup", this.onInspectingMouseUp, true);
            subWin.document.addEventListener("click", this.onInspectingClick, true);
        }, this));
    },

    detachInspectListeners: function(context)
    {
        var i, keyListenersLen,
            win = context.window;

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

        iterateWindows(win, bind(function(subWin)
        {
            // we don't remove the scroll event listener because we need it outside of inspect mode
            subWin.document.removeEventListener("mouseover", this.onInspectingMouseOver, true);
            subWin.document.removeEventListener("mousedown", this.onInspectingMouseDown, true);
            subWin.document.removeEventListener("mouseup", this.onInspectingMouseUp, true);
        }, this));
    },

    detachClickInspectListeners: function(win)
    {
        // We have to remove the click listener in a second phase because if we remove it
        // after the mousedown, we won't be able to cancel clicked links
        iterateWindows(win, bind(function(subWin)
        {
            subWin.document.removeEventListener("click", this.onInspectingClick, true);
        }, this));
    },

// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    onInspectingResizeWindow: function(event)
    {
        if (FBTrace.DBG_INSPECT)
           FBTrace.sysout("onInspectingResizeWindow event", event);

        this.repaint();
    },

    onInspectingScroll: function(event)
    {
        if (FBTrace.DBG_INSPECT)
           FBTrace.sysout("onInspectingScroll event", event);

        this.repaint();
    },

    onInspectingMouseOver: function(event)
    {
        if (FBTrace.DBG_INSPECT)
           FBTrace.sysout("onInspectingMouseOver event", event);
        this.inspectNode(event.target);
        cancelEvent(event);
    },

    onInspectingMouseDown: function(event)
    {
        if (FBTrace.DBG_INSPECT)
            FBTrace.sysout("onInspectingMouseDown event", {originalTarget: event.originalTarget,tmpRealOriginalTarget:event.tmpRealOriginalTarget,event:event});

        if (event.originalTarget && event.originalTarget.tagName === 'xul:thumb') // Allow to scroll the document while inspecting
            return;

        cancelEvent(event);
    },

    onInspectingMouseUp: function(event)
    {
        if (FBTrace.DBG_INSPECT)
            FBTrace.sysout("onInspectingMouseUp event", {originalTarget: event.originalTarget,tmpRealOriginalTarget:event.tmpRealOriginalTarget,event:event});

        if (event.originalTarget && event.originalTarget.tagName === 'xul:thumb') // Allow to release scrollbar while inspecting
            return;

        this.stopInspecting(false, true);

        cancelEvent(event);
    },

    onInspectingClick: function(event)
    {
        if (FBTrace.DBG_INSPECT)
            FBTrace.sysout("onInspectingClick event", event);
        var win = event.currentTarget.defaultView;
        if (win)
        {
            win = getRootWindow(win);
            this.detachClickInspectListeners(win);
        }
        cancelEvent(event);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    // extends Module

    initialize: function()
    {
        Firebug.Module.initialize.apply(this, arguments);

        this.onInspectingResizeWindow = bind(this.onInspectingResizeWindow, this);
        this.onInspectingScroll = bind(this.onInspectingScroll, this);
        this.onInspectingMouseOver = bind(this.onInspectingMouseOver, this);
        this.onInspectingMouseDown = bind(this.onInspectingMouseDown, this);
        this.onInspectingMouseUp = bind(this.onInspectingMouseUp, this);
        this.onInspectingClick = bind(this.onInspectingClick, this);

        this.updateOption("shadeBoxModel", Firebug.shadeBoxModel);
        this.updateOption("showQuickInfoBox", Firebug.showQuickInfoBox);
    },

    initContext: function(context)
    {
        context.onPreInspectMouseOver = function(event) { context.hoverNode = event.target; };
    },

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

    watchWindow: function(context, win)
    {
        win.addEventListener("mouseover", context.onPreInspectMouseOver, true);
    },

    unwatchWindow: function(context, win)
    {
        try {
            win.removeEventListener("mouseover", context.onPreInspectMouseOver, true);
            this.hideQuickInfoBox();
        } catch (ex) {
            // Get unfortunate errors here sometimes, so let's just ignore them
            // since the window is going away anyhow
        }
    },

    showContext: function(browser, context)
    {
        if (this.inspecting)
            this.stopInspecting(true);
    },

    showPanel: function(browser, panel)
    {
        // The panel can be null (if disabled) so use the global context.
        var context = Firebug.currentContext;
        var disabled = (context && context.loaded) ? false : true;
        Firebug.chrome.setGlobalAttribute("cmd_toggleInspecting", "disabled", disabled);
    },

    loadedContext: function(context)
    {
        Firebug.chrome.setGlobalAttribute("cmd_toggleInspecting", "disabled", "false");
    },

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

    getObjectByURL: function(context, url)
    {
        var styleSheet = getStyleSheetByHref(url, context);
        if (styleSheet)
            return styleSheet;

        /*var path = getURLPath(url);
        var xpath = "//*[contains(@src, '" + path + "')]";
        var elements = getElementsByXPath(context.window.document, xpath);
        if (elements.length)
            return elements[0];*/
    },

    toggleQuickInfoBox: function()
    {
        var qiBox = $('fbQuickInfoPanel');

        if (qiBox.state==="open")
            quickInfoBox.hide();

        quickInfoBox.boxEnabled = !quickInfoBox.boxEnabled;

        Firebug.setPref(Firebug.prefDomain, "showQuickInfoBox", quickInfoBox.boxEnabled);
    },

    hideQuickInfoBox: function()
    {
        var qiBox = $('fbQuickInfoPanel');

        if (qiBox.state==="open")
            quickInfoBox.hide();

        this.inspectNode(null);
    },

    quickInfoBoxHandler: function(e)
    {
        quickInfoBox.handleEvent(e);
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
// Imagemap Inspector

function getImageMapHighlighter(context)
{
    if(!context)
        return;

    var canvas, ctx, mx, my,
        doc = context.window.document,
        init = function(elt)
        {
            if(elt)
                doc = elt.ownerDocument;

            canvas = doc.getElementById('firebugCanvas');

            if(!canvas)
            {
                canvas = doc.createElementNS("http://www.w3.org/1999/xhtml", "canvas");
                hideElementFromInspection(canvas);
                canvas.id = "firebugCanvas";
                canvas.className = "firebugResetStyles firebugCanvas";
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

                elts = xpe.evaluate("(//img | //input)[@usemap='#" + mapName + "']", doc.documentElement,
                    nsResolver, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
                eltsLen = elts.snapshotLength;

                for(i = 0; i < eltsLen; i++)
                {
                    elt = elts.snapshotItem(i);
                    rect = getLTRBWH(elt);

                    if(multi)
                        images.push(elt);
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
                    images = this.getImages(eltArea.parentNode.name, multi);

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
                        rect = getLTRBWH(images[j], context);

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

// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
quickInfoBox =
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
            qiBox = $('fbQuickInfoPanel');

        if (qiBox.state==="closed")
        {
            qiBox.hidePopup();

            this.storedX = this.storedX || $('content').tabContainer.boxObject.screenX + 5;
            this.storedY = this.storedY || $('content').tabContainer.boxObject.screenY + 35;

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
            lab.setAttribute("value", $STR("quickInfo"));
            vbox.insertBefore(lab, vbox.firstChild);
        }

        lab = document.createElement("label");
        lab.setAttribute("class", "fbQuickInfoBoxTitle");
        lab.setAttribute("value", $STR("computedStyle"));
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

        var qiBox = $('fbQuickInfoPanel');
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
                this.qiPanel = $('fbQuickInfoPanel');
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
    doNotHighlight: function(element)
    {
        return false; // (element instanceof XULElement);
    },

    highlight: function(context, element)
    {
        storeHighlighterParams(this, context, element, null);

        if (this.doNotHighlight(element))
            return;

        var cs;
        var offset = getLTRBWH(element);
        var x = offset.left, y = offset.top;
        var w = offset.width, h = offset.height;

        if (FBTrace.DBG_INSPECT)
            FBTrace.sysout("FrameHighlighter HTML tag:" + element.tagName + " x:" + x + " y:" + y + " w:" + w + " h:" + h);

        var wacked = isNaN(x) || isNaN(y) || isNaN(w) || isNaN(h);
        if(wacked)
        {
            if (FBTrace.DBG_INSPECT)
                FBTrace.sysout("FrameHighlighter.highlight has bad boxObject for "+ element.tagName);

            return;
        }

        if(element.tagName !== "AREA")
        {
            if (FBTrace.DBG_INSPECT)
                FBTrace.sysout("FrameHighlighter "+element.tagName);
            var body = getNonFrameBody(element);
            if (!body)
                return this.unhighlight(context);

            this.ihl && this.ihl.show(false);

            quickInfoBox.show(element);
            var highlighter = this.getHighlighter(context, element);

            var css = moveImp(null, x, y) + resizeImp(null, w, h);

            cs = body.ownerDocument.defaultView.getComputedStyle(element, null);

            if(cs.MozTransform && cs.MozTransform != 'none')
                css += '-moz-transform:' + cs.MozTransform + '!important;' +
                       '-moz-transform-origin:' + cs.MozTransformOrigin + '!important;';
            if(cs.borderRadius)
                css += 'border-radius:' + cs.borderRadius + ' !important;';
            if(cs.borderTopLeftRadius)
                css += 'border-top-left-radius:' + cs.borderTopLeftRadius + ' !important;';
            if(cs.borderTopRightRadius)
                css += 'border-top-right-radius:' + cs.borderTopRightRadius + ' !important;';
            if(cs.borderBottomRightRadius)
                css += 'border-bottom-right-radius:' + cs.borderBottomRightRadius + ' !important;';
            if(cs.borderBottomLeftRadius)
                css += 'border-bottom-left-radius:' + cs.borderBottomLeftRadius + ' !important;';
            if(cs.MozBorderRadius)
                css += '-moz-border-radius:' + cs.MozBorderRadius + ' !important;';
            if(cs.MozBorderRadiusTopleft)
                css += '-moz-border-radius-topleft:' + cs.MozBorderRadiusTopleft + ' !important;';
            if(cs.MozBorderRadiusTopright)
                css += '-moz-border-radius-topright:' + cs.MozBorderRadiusTopright + ' !important;';
            if(cs.MozBorderRadiusBottomright)
                css += '-moz-border-radius-bottomright:' + cs.MozBorderRadiusBottomright + ' !important;';
            if(cs.MozBorderRadiusBottomleft)
                css += '-moz-border-radius-bottomleft:' + cs.MozBorderRadiusBottomleft + ' !important;';

            highlighter.style.cssText = css;

            var needsAppend = !highlighter.parentNode || highlighter.ownerDocument != body.ownerDocument;
            if (needsAppend)
            {
                if (FBTrace.DBG_INSPECT)
                    FBTrace.sysout("FrameHighlighter needsAppend: " + highlighter.ownerDocument.documentURI + " !?= " + body.ownerDocument.documentURI, highlighter);

                attachStyles(context, body);

                try
                {
                    body.appendChild(highlighter);
                }
                catch(exc)
                {
                    if (FBTrace.DBG_INSPECT)
                        FBTrace.sysout("inspector.FrameHighlighter.highlight body.appendChild FAILS for body " + body + " "+exc, exc);
                }

                if (element.ownerDocument.contentType.indexOf("xul") === -1)  // otherwise the proxies take up screen space in browser.xul
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
            removeProxiesForDisabledElements(body);
            quickInfoBox.hide();
        }

        this.ihl && this.ihl.destroy();
        this.ihl = null;
    },

    getHighlighter: function(context)
    {
        if (!context.frameHighlighter)
        {
            var doc = context.window.document,
                div = doc.createElementNS("http://www.w3.org/1999/xhtml", "div");

            hideElementFromInspection(div);
            div.className = "firebugResetStyles firebugFrameHighlighter";

            context.frameHighlighter = div;
        }

        return context.frameHighlighter;
    }
};

// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

function BoxModelHighlighter()
{
}

Firebug.Inspector.BoxModelHighlighter = BoxModelHighlighter;

BoxModelHighlighter.prototype =
{
    highlight: function(context, element, boxFrame)
    {
        var line,
            nodes = this.getNodes(context),
            highlightFrame = boxFrame ? nodes[boxFrame] : null;

        storeHighlighterParams(this, context, element, boxFrame);

        if (context.highlightFrame)
            removeClass(context.highlightFrame, "firebugHighlightBox");

        if(element.tagName !== "AREA")
        {
            this.ihl && this.ihl.show(false);

            quickInfoBox.show(element);
            context.highlightFrame = highlightFrame;

            if (highlightFrame)
            {
                setClass(nodes.offset, "firebugHighlightGroup");
                setClass(highlightFrame, "firebugHighlightBox");
            }
            else
                removeClass(nodes.offset, "firebugHighlightGroup");

            var win = element.ownerDocument.defaultView;
            if (!win)
                return;

            var style = win.getComputedStyle(element, "");
            if (!style)
            {
                if (FBTrace.DBG_INSPECT)
                    FBTrace.sysout("highlight: no style for element "+element, element);
                return;
            }

            var styles = readBoxStyles(style);

            var offset = getLTRBWH(element);

            var x = offset.left - Math.abs(styles.marginLeft);
            var y = offset.top - Math.abs(styles.marginTop);
            var w = offset.width - (styles.paddingLeft + styles.paddingRight
                    + styles.borderLeft + styles.borderRight);
            var h = offset.height - (styles.paddingTop + styles.paddingBottom
                    + styles.borderTop + styles.borderBottom);

            moveImp(nodes.offset, x, y);
            pad(nodes.margin, styles.marginTop, styles.marginRight, styles.marginBottom,
                    styles.marginLeft);
            pad(nodes.border, styles.borderTop, styles.borderRight, styles.borderBottom,
                    styles.borderLeft);
            pad(nodes.padding, styles.paddingTop, styles.paddingRight, styles.paddingBottom,
                    styles.paddingLeft);
            resizeImp(nodes.content, w, h);

            // element.tagName !== "BODY" for issue 2447. hopefully temporary, robc
            var showLines = Firebug.showRulers && boxFrame && element.tagName !== "BODY";
            if (showLines)
            {
                var offsetParent = element.offsetParent;

                if (offsetParent)
                    this.setNodesByOffsetParent(win, offsetParent, nodes);
                else
                    delete nodes.parent;

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
                moveImp(nodes.lines.right, left+width, 0);
                moveImp(nodes.lines.bottom, 0, top+height);
                moveImp(nodes.lines.left, left, 0)
            }

            var body = getNonFrameBody(element);
            if (!body)
                return this.unhighlight(context);

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
        var nodes = this.getNodes(context);
        if (nodes.offset.parentNode)
        {
            var body = nodes.offset.parentNode;
            body.removeChild(nodes.offset);

            if (nodes.lines.top.parentNode)
            {
                if (nodes.parent)
                    body.removeChild(nodes.parent);

                for (var line in nodes.lines)
                    body.removeChild(nodes.lines[line]);
            }
        }

        this.ihl && this.ihl.destroy();
        this.ihl = null;

        quickInfoBox.hide();
    },

    getNodes: function(context)
    {
        if (!context.boxModelHighlighter)
        {
            var doc = context.window.document;
            if (FBTrace.DBG_ERRORS && !doc)
                FBTrace.sysout("inspector getNodes no document for window:"+window.location);
            if (FBTrace.DBG_INSPECT && doc)
                FBTrace.sysout("inspect.getNodes doc: "+doc.location);

            var Ruler = "firebugResetStyles firebugRuler firebugRuler";
            var Box = "firebugResetStyles firebugLayoutBox firebugLayoutBox";
            var Line = "firebugResetStyles firebugLayoutLine firebugLayoutLine";

            function create(className, name)
            {
                var div = doc.createElementNS("http://www.w3.org/1999/xhtml", "div");
                hideElementFromInspection(div);
                div.className = className +name;
                return div;
            }

            var nodes = context.boxModelHighlighter =
            {
                parent: create(Box, "Parent"),
                rulerH: create(Ruler, "H"),
                rulerV: create(Ruler, "V"),
                offset: create(Box, "Offset"),
                margin: create(Box, "Margin"),
                border: create(Box, "Border"),
                padding: create(Box, "Padding"),
                content: create(Box, "Content"),
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

        return context.boxModelHighlighter;
    },

    setNodesByOffsetParent: function(win, offsetParent, nodes)
    {
        var parentStyle = win.getComputedStyle(offsetParent, "");
        var parentOffset = getLTRBWH(offsetParent);
        var parentX = parentOffset.left + parseInt(parentStyle.borderLeftWidth, 10);
        var parentY = parentOffset.top + parseInt(parentStyle.borderTopWidth, 10);
        var parentW = offsetParent.offsetWidth-1;
        var parentH = offsetParent.offsetHeight-1;

        nodes.parent.style.cssText = moveImp(null, parentX, parentY) +
            resizeImp(null, parentW, parentH);

        if (parentX < 14)
            setClass(nodes.parent, "overflowRulerX");
        else
            removeClass(nodes.parent, "overflowRulerX");

        if (parentY < 14)
            setClass(nodes.parent, "overflowRulerY");
        else
            removeClass(nodes.parent, "overflowRulerY");
    }
};

function getNonFrameBody(elt)
{
    var body = getBody(elt.ownerDocument);
    return (body.localName && body.localName.toUpperCase() == "FRAMESET") ? null : body;
}

function attachStyles(context, body)
{
    var doc = body.ownerDocument;
    if (!context.highlightStyle)
        context.highlightStyle = createStyleSheet(doc, highlightCSS);

    if (!context.highlightStyle.parentNode || context.highlightStyle.ownerDocument != doc)
        addStyleSheet(body.ownerDocument, context.highlightStyle);
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
        if(!node.fbHasProxyElement)
        {
            rect = node.getBoundingClientRect();
            div = doc.createElementNS("http://www.w3.org/1999/xhtml", "div");
            hideElementFromInspection(div);
            div.className = "fbProxyElement";
            div.style.cssText = moveImp(null, rect.left, rect.top + body.scrollTop) +
                resizeImp(null, rect.width, rect.height);
            div.fbProxyFor = node;
            node.fbHasProxyElement = true;

            body.appendChild(div);
        }
    }
}

function removeProxiesForDisabledElements(body)
{
    var i, doc = body.ownerDocument,
        proxyElements = doc.getElementsByClassName("fbProxyElement"),
        proxyElementsLen = proxyElements.length;

    for (i = 0; i < proxyElementsLen; i++)
    {
        proxyElements[i].fbProxyFor.fbHasProxyElement = false;
        proxyElements[i].parentNode.removeChild(proxyElements[i]);
    }
}

function rgbToHex(value)
{
    return value.replace(/\brgb\((\d{1,3}),\s*(\d{1,3}),\s*(\d{1,3})\)/gi, function(_, r, g, b) {
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

function hideElementFromInspection(elt) {
    unwrapObject(elt).firebugIgnore = !FBTrace.DBG_INSPECT;
}

function storeHighlighterParams(highlighter, context, element, boxFrame) {
    var fir = Firebug.Inspector.repaint;

    fir.highlighter = highlighter;
    fir.context = context,
    fir.element = element,
    fir.boxFrame = boxFrame;
}

// ************************************************************************************************

Firebug.registerModule(Firebug.Inspector);

// ************************************************************************************************
return Firebug.Inspector;
}});