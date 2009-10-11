8/29/2007/* See license.txt for terms of usage */

FBL.ns(function() { with (FBL) {

// ************************************************************************************************
// Constants

const inspectDelay = 100;

const edgeSize = 2;

const defaultPrimaryPanel = "html";
const defaultSecondaryPanel = "dom";

const highlightCSS = "chrome://firebug/content/highlighter.css";

// ************************************************************************************************
// Globals

var boxModelHighlighter = null;
var frameHighlighter = null;
var popupHighlighter = null;
var mx, my;

// ************************************************************************************************

Firebug.Inspector = extend(Firebug.Module,
{
    dispatchName: "inspector",
    inspecting: false,

    highlightObject: function(element, context, highlightType, boxFrame)
    {
        if(context && context.window.document)
        {
            context.window.document.addEventListener("mousemove", function(event)
            {
                mx = event.clientX;
                my = event.clientY;
            }, true);
        }

        if (!element || !isElement(element) || !isVisible(element))
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
            if (context && context.window && context.window.document)
                highlighter.highlight(context, element, boxFrame);
        }
        else if (oldContext)
        {
            oldContext.highlightTimeout = oldContext.setTimeout(function()
            {
                delete oldContext.highlightTimeout;
                if (oldContext.window && oldContext.window.document)
                    highlighter.unhighlight(oldContext);
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

        var htmlPanel = Firebug.chrome.switchToPanel(context, "html");

        if (Firebug.isDetached())
            Firebug.chrome.focus();
        else if (Firebug.isMinimized())
            Firebug.showBar(true);

        htmlPanel.panelNode.focus();
        htmlPanel.startInspecting();

        if (context.hoverNode)
            this.inspectNode(context.hoverNode);
    },

    inspectNode: function(node)
    {
        if (node && node.nodeType != 1)
            node = node.parentNode;

        if (node && node.firebugIgnore)
            return;

        var context = this.inspectingContext;

        if (this.inspectTimeout)
        {
            context.clearTimeout(this.inspectTimeout);
            delete this.inspectTimeout;
        }

        this.highlightObject(node, context, "frame");

        this.inspectingNode = node;

        if (node)
        {
            this.inspectTimeout = context.setTimeout(function()
            {
                Firebug.chrome.select(node);
            }, inspectDelay);
        }
    },

    stopInspecting: function(cancelled, waitForClick)
    {
        if (!this.inspecting)
            return;

        var context = this.inspectingContext;

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

        var htmlPanel = Firebug.chrome.unswitchToPanel(context, "html", cancelled);

        htmlPanel.stopInspecting(htmlPanel.selection, cancelled);

        this.inspectNode(null);
    },

    inspectNodeBy: function(dir)
    {
        var target;
        var node = this.inspectingNode;

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
            subWin.document.addEventListener("mouseover", this.onInspectingMouseOver, true);
            subWin.document.addEventListener("mousedown", this.onInspectingMouseDown, true);
            subWin.document.addEventListener("click", this.onInspectingClick, true);
        }, this));
    },

    detachInspectListeners: function(context)
    {
        var win = context.window;
        if (!win || !win.document)
            return;

        var chrome = Firebug.chrome;

        if (this.keyListeners)  // XXXjjb for some reason this is null some times.
        {
            for (var i = 0; i < this.keyListeners.length; ++i)
                chrome.keyIgnore(this.keyListeners[i]);
            delete this.keyListeners;
        }

        iterateWindows(win, bind(function(subWin)
        {
            subWin.document.removeEventListener("mouseover", this.onInspectingMouseOver, true);
            subWin.document.removeEventListener("mousedown", this.onInspectingMouseDown, true);
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
           FBTrace.sysout("onInspectingMouseDown event", event);
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

        this.onInspectingMouseOver = bind(this.onInspectingMouseOver, this);
        this.onInspectingMouseDown = bind(this.onInspectingMouseDown, this);
        this.onInspectingClick = bind(this.onInspectingClick, this);

        this.updateOption("shadeBoxModel", Firebug.shadeBoxModel);
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
        var chrome = Firebug.chrome;
        var disabled = !panel || !panel.context.loaded;
        chrome.setGlobalAttribute("cmd_toggleInspecting", "disabled", disabled);
        //chrome.setGlobalAttribute("menu_firebugInspect", "disabled", disabled);
    },

    loadedContext: function(context)
    {
        Firebug.chrome.setGlobalAttribute("cmd_toggleInspecting", "disabled", "false");
        //Firebug.chrome.setGlobalAttribute("menu_firebugInspect", "disabled", "false");
    },

    updateOption: function(name, value)
    {
        if (name == "shadeBoxModel")
        {
            this.highlightObject(null);
            this.defaultHighlighter = value ? getHighlighter("boxModel") : getHighlighter("frame");
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
    else if (type == "popup")
    {
        if (!popupHighlighter)
            popupHighlighter = new PopupHighlighter();

        return popupHighlighter;
    }
}

function pad(element, t, r, b, l)
{
    element.style.padding = Math.abs(t) + "px " + Math.abs(r) + "px "
        + Math.abs(b) + "px " + Math.abs(l) + "px";
}

// ************************************************************************************************
// Imagemap Inspector

function getImageMapHighlighter(context)
{
    if(!context)
        return;

    var canvas, ctx,
        doc = context.window.document,
        init = function(elt)
        {
            if(elt)
                doc = elt.ownerDocument;
            canvas = doc.getElementById('firebugCanvas');

            if(!canvas)
            {
                canvas = doc.createElementNS("http://www.w3.org/1999/xhtml", "canvas");
                canvas.firebugIgnore = true;
                canvas.id = "firebugCanvas";
                canvas.className = "firebugCanvas";
                canvas.width = context.window.innerWidth;
                canvas.height = context.window.innerHeight;
                canvas.addEventListener("mousemove", function(event){context.imageMapHighlighter.mouseMoved(event)}, true);
                canvas.addEventListener("mouseout", function(){getImageMapHighlighter(context).destroy();}, true);
                context.window.addEventListener("scroll", function(){context.imageMapHighlighter.show(false);}, true);

                doc.body.appendChild(canvas);
            }
        };

    if (!context.imageMapHighlighter)
    {
        context.imageMapHighlighter =
        {
            "show": function(state)
            {
                if(!canvas)
                    init();
                canvas.style.display = state?'block':'none';
            },
            "getImages": function(mapName, multi)
            {
                var i,
                    elts = [],
                    images = [],
                    elts2 = doc.getElementsByTagName("img"),
                    elts3 = doc.getElementsByTagName("input");

                for(i=0;i<elts2.length;i++)
                    elts.push(elts2[i]);

                for(i=0;i<elts3.length;i++)
                    elts.push(elts3[i]);

                if(elts)
                {
                    for(i=0;i<elts.length;i++)
                    {
                        if(elts[i].getAttribute('usemap') == mapName)
                        {
                            rect = getLTRBWH(elts[i]);

                            if(multi)
                                images.push(elts[i]);
                            else if(rect.left <= mx && rect.right >= mx && rect.top <= my && rect.bottom >= my)
                            {
                                images[0]=elts[i];
                                break;
                            }
                        }
                    }
                }
                return images;
            },
            "highlight": function(eltArea, multi)
            {
                var i, j, v, images, rect, clearForFirst;

                if (eltArea && eltArea.coords)
                {
                    images = this.getImages("#"+eltArea.parentNode.name, multi);

                    init(eltArea);

                    v = eltArea.coords.split(",");

                    if(!ctx)
                        ctx = canvas.getContext("2d");

                    ctx.fillStyle = "rgba(135, 206, 235, 0.7)";
                    ctx.strokeStyle = "rgb(29, 55, 95)";
                    ctx.lineWidth = 2;

                    if(images.length===0)
                        images[0] = eltArea;

                    for(j=0;j<images.length;j++)
                    {
                        rect = getLTRBWH(images[j], context);

                        ctx.beginPath();

                        if(!multi || (multi && j===0))
                            ctx.clearRect(0,0,canvas.width,canvas.height);

                        if (eltArea.shape.toLowerCase() === 'rect')
                            ctx.rect(rect.left+parseInt(v[0],10), rect.top+parseInt(v[1],10), v[2]-v[0], v[3]-v[1]);
                        else if (eltArea.shape.toLowerCase() === 'circle')
                            ctx.arc(rect.left+parseInt(v[0],10) + ctx.lineWidth / 2, rect.top+parseInt(v[1],10) + ctx.lineWidth / 2, v[2], 0, Math.PI / 180 * 360, false);
                        else
                        {
                            ctx.moveTo(rect.left+parseInt(v[0],10), rect.top+parseInt(v[1],10));
                            for(i=2;i<v.length;i+=2)
                                ctx.lineTo(rect.left+parseInt(v[i],10), rect.top+parseInt(v[i+1],10));
                        }

                        ctx.fill();
                        ctx.stroke();
                        ctx.closePath();
                    }

                    this.show(true);
                }
                else
                {
                    return;
                }
            },
            "mouseMoved": function(event)
            {
                var idata = ctx.getImageData(event.layerX, event.layerY, 1, 1);

                mx = event.clientX;
                my = event.clientY;

                if(!idata)
                    this.show(false);
                else if(idata.data[0]===0 && idata.data[1]===0 && idata.data[2]===0 && idata.data[3]===0)
                    this.show(false);
            },
            "destroy": function()
            {
                canvas = null;
                ctx = null;
            }
        }
    }

    return context.imageMapHighlighter;
}

// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

Firebug.Inspector.FrameHighlighter = function()
{
}

Firebug.Inspector.FrameHighlighter.prototype =
{
    doNotHighlight: function(element)
    {
        return false; // (element instanceof XULElement);
    },

    highlight: function(context, element)
    {
        if (this.doNotHighlight(element))
            return;

        var offset = getLTRBWH(element);
        offset = applyBodyOffsets(element, offset);
        var x = offset.left, y = offset.top;
        var w = offset.width, h = offset.height;
        if (FBTrace.DBG_INSPECT)
                FBTrace.sysout("FrameHighlighter HTML tag:"+element.tagName+" x:"+x+" y:"+y+" w:"+w+" h:"+h);

        var wacked = isNaN(x) || isNaN(y) || isNaN(w) || isNaN(h);
        if (FBTrace.DBG_INSPECT && wacked)
            FBTrace.sysout("FrameHighlighter.highlight has bad boxObject for "+ element.tagName);
        if (wacked)
            return;

        if(element.tagName !== "AREA")
        {
            var nodes = this.getNodes(context, element);

            move(nodes.top, x, y-edgeSize);
            resize(nodes.top, w, edgeSize);

            move(nodes.right, x+w, y-edgeSize);
            resize(nodes.right, edgeSize, h+edgeSize*2);

            move(nodes.bottom, x, y+h);
            resize(nodes.bottom, w, edgeSize);

            move(nodes.left, x-edgeSize, y-edgeSize);
            resize(nodes.left, edgeSize, h+edgeSize*2);
            if (FBTrace.DBG_INSPECT)
                FBTrace.sysout("FrameHighlighter "+element.tagName);
            var body = getNonFrameBody(element);
            if (!body)
                return this.unhighlight(context);

            var needsAppend = !nodes.top.parentNode || nodes.top.ownerDocument != body.ownerDocument;
            if (needsAppend)
            {
                if (FBTrace.DBG_INSPECT)
                    FBTrace.sysout("FrameHighlighter needsAppend: "+ nodes.top.ownerDocument.documentURI+" !?= "+body.ownerDocument.documentURI, nodes);
                attachStyles(context, body);
                for (var edge in nodes)
                {
                    try
                    {
                        body.appendChild(nodes[edge]);
                    }
                    catch(exc)
                    {
                        if (FBTrace.DBG_INSPECT)
                            FBTrace.sysout("inspector.FrameHighlighter.highlight body.appendChild FAILS for body "+body+" "+exc, exc);
                    }
                }
            }
        }
        else
        {
            var ihl = getImageMapHighlighter(context);
            ihl.highlight(element, false);
        }
    },

    unhighlight: function(context)
    {
        if (FBTrace.DBG_INSPECT)
            FBTrace.sysout("FrameHighlighter unhightlight", context.window.location);
        var nodes = this.getNodes(context);
        var body = nodes.top.parentNode;
        if (body)
        {
            for (var edge in nodes)
                body.removeChild(nodes[edge]);
        }
    },

    getNodes: function(context)
    {
        if (!context.frameHighlighter)
        {
            var doc = context.window.document;

            function createEdge(name)
            {
                var div = doc.createElementNS("http://www.w3.org/1999/xhtml", "div");
                div.firebugIgnore = true;
                div.className = "firebugHighlight";
                return div;
            }

            context.frameHighlighter =
            {
                top: createEdge("Top"),
                right: createEdge("Right"),
                bottom: createEdge("Bottom"),
                left: createEdge("Left")
            };
        }

        return context.frameHighlighter;
    }
};
// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

function PopupHighlighter()
{
}

PopupHighlighter.prototype =
{
    highlight: function(context, element)
    {
        var doc = context.window.document;
        var popup = doc.getElementById("inspectorPopup");
        popup.style.width = "200px";
        popup.style.height = "100px";
        popup.showPopup(element, element.boxObject.screenX,
            element.boxObject.screenY, "popup", "none", "none");
        if (FBTrace.DBG_INSPECT)
        {
            FBTrace.sysout("PopupHighlighter for "+element.tagName, " at ("+element.boxObject.screenX+","+element.boxObject.screenY+")");
            FBTrace.sysout("PopupHighlighter popup=", popup);
        }
    },

    unhighlight: function(context)
    {
    },
}
// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

function BoxModelHighlighter()
{
}

BoxModelHighlighter.prototype =
{
    highlight: function(context, element, boxFrame)
    {
        var nodes = this.getNodes(context);
        var highlightFrame = boxFrame ? nodes[boxFrame] : null;

        if (context.highlightFrame)
            removeClass(context.highlightFrame, "firebugHighlightBox");

        if(element.tagName !== "AREA")
        {
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
            offset = applyBodyOffsets(element, offset);

            var x = offset.left - Math.abs(styles.marginLeft);
            var y = offset.top - Math.abs(styles.marginTop);
            var w = offset.width - (styles.paddingLeft + styles.paddingRight
                    + styles.borderLeft + styles.borderRight);
            var h = offset.height - (styles.paddingTop + styles.paddingBottom
                    + styles.borderTop + styles.borderBottom);

            move(nodes.offset, x, y);
            pad(nodes.margin, styles.marginTop, styles.marginRight, styles.marginBottom,
                    styles.marginLeft);
            pad(nodes.border, styles.borderTop, styles.borderRight, styles.borderBottom,
                    styles.borderLeft);
            pad(nodes.padding, styles.paddingTop, styles.paddingRight, styles.paddingBottom,
                    styles.paddingLeft);
            resize(nodes.content, w, h);

            var showLines = Firebug.showRulers && boxFrame;
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

                move(nodes.lines.top, 0, top);
                move(nodes.lines.right, left+width, 0);
                move(nodes.lines.bottom, 0, top+height);
                move(nodes.lines.left, left, 0)
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

                    for (var line in nodes.lines)
                        body.appendChild(nodes.lines[line]);
                }
            }
            else if (nodes.lines.top.parentNode)
            {
                if (nodes.parent)
                    body.removeChild(nodes.parent);

                for (var line in nodes.lines)
                    body.removeChild(nodes.lines[line]);
            }
        }
        else
        {
            var ihl = getImageMapHighlighter(context);
            ihl.highlight(element, true);
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
    },

    getNodes: function(context)
    {
        if (!context.boxModelHighlighter)
        {
            var doc = context.window.document;
            if (FBTrace.DBG_ERRORS && !doc) FBTrace.sysout("inspector getNodes no document for window:"+window.location);
            if (FBTrace.DBG_INSPECT && doc)
                FBTrace.sysout("inspect.getNodes doc: "+doc.location);

            function createRuler(name)
            {
                var div = doc.createElementNS("http://www.w3.org/1999/xhtml", "div");
                div.firebugIgnore = true;
                div.className = "firebugRuler firebugRuler"+name;
                return div;
            }

            function createBox(name)
            {
                var div = doc.createElementNS("http://www.w3.org/1999/xhtml", "div");
                div.firebugIgnore = true;
                div.className = "firebugLayoutBox firebugLayoutBox"+name;
                return div;
            }

            function createLine(name)
            {
                var div = doc.createElementNS("http://www.w3.org/1999/xhtml", "div");
                div.firebugIgnore = true;
                div.className = "firebugLayoutLine firebugLayoutLine"+name;
                return div;
            }

            var nodes = context.boxModelHighlighter =
            {
                parent: createBox("Parent"),
                rulerH: createRuler("H"),
                rulerV: createRuler("V"),
                offset: createBox("Offset"),
                margin: createBox("Margin"),
                border: createBox("Border"),
                padding: createBox("Padding"),
                content: createBox("Content"),
                lines: {
                    top: createLine("Top"),
                    right: createLine("Right"),
                    bottom: createLine("Bottom"),
                    left: createLine("Left")
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
        parentOffset = applyBodyOffsets(offsetParent, parentOffset);
        var parentX = parentOffset.left + parseInt(parentStyle.borderLeftWidth);
        var parentY = parentOffset.top + parseInt(parentStyle.borderTopWidth);
        var parentW = offsetParent.offsetWidth-1;
        var parentH = offsetParent.offsetHeight-1;

        move(nodes.parent, parentX, parentY);
        resize(nodes.parent, parentW, parentH);

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

// ************************************************************************************************

Firebug.registerModule(Firebug.Inspector);

// ************************************************************************************************

}});
