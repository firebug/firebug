/* See license.txt for terms of usage */

FBL.ns(function() { with (FBL) {

// ************************************************************************************************
// Constants

const Cc = Components.classes;
const Ci = Components.interfaces;

// List of contexts with XHR spy attached.
var contexts = [];

// ************************************************************************************************
// Spy Module

/**
 * @module Represents a Spy module that is responsible for attaching/detaching a Spy HTTP Observer
 * when Firebug is activated/deactivated for a site. This {@link SpyHttpObserver} is
 * consequently responsible for monitoring all XHRs.
 */
Firebug.Spy = extend(Firebug.Module,
/** @lends Firebug.Spy */
{
    dispatchName: "spy",

    skipSpy: function(win)
    {
        if (!win)
            return true;

        var uri = safeGetWindowLocation(win); // don't attach spy to chrome
        if (uri &&  (uri.indexOf("about:") == 0 || uri.indexOf("chrome:") == 0))
            return true;
    },

    attachObserver: function(context, win)
    {
        if (Firebug.Spy.skipSpy(win))
            return;

        for (var i=0; i<contexts.length; ++i)
        {
            if ((contexts[i].context == context) && (contexts[i].win == win))
                return;
        }

        // Register HTTP observer only once.
        if (contexts.length == 0)
            httpObserver.addObserver(SpyHttpObserver, "firebug-http-event", false);

        contexts.push({context: context, win: win});

        if (FBTrace.DBG_SPY)
            FBTrace.sysout("spy.attachObserver " + contexts.length + " ", context.getName());
    },

    detachObserver: function(context, win)
    {
        for (var i=0; i<contexts.length; ++i)
        {
            if (contexts[i].context == context)
            {
                if (win && (contexts[i].win != win))
                    continue;

                contexts.splice(i, 1);

                // If no context is using spy, remvove the (only one) HTTP observer.
                if (contexts.length == 0)
                    httpObserver.removeObserver(SpyHttpObserver, "firebug-http-event");

                if (FBTrace.DBG_SPY)
                    FBTrace.sysout("spy.detachObserver " + contexts.length + " ", context.getName());
                return;
            }
        }
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    // extends Module

    initContext: function(context)
    {
        context.spies = [];

        if (Firebug.showXMLHttpRequests && Firebug.Console.isAlwaysEnabled())
            this.attachObserver(context, context.window);

        if (FBTrace.DBG_SPY)
            FBTrace.sysout("spy.initContext " + contexts.length + " ", context.getName());
    },

    destroyContext: function(context)
    {
        // For any spies that are in progress, remove our listeners so that they don't leak
        this.detachObserver(context, null);
        delete context.spies;

        if (FBTrace.DBG_SPY)
            FBTrace.sysout("spy.destroyContext " + contexts.length + " ", context.getName());
    },

    watchWindow: function(context, win)
    {
        if (Firebug.showXMLHttpRequests && Firebug.Console.isAlwaysEnabled())
            this.attachObserver(context, win);
    },

    unwatchWindow: function(context, win)
    {
        try
        {
            // This make sure that the existing context is properly removed from "contexts" array.
            this.detachObserver(context, win);
        }
        catch (ex)
        {
            // Get exceptions here sometimes, so let's just ignore them
            // since the window is going away anyhow
            ERROR(ex);
        }
    },

    updateOption: function(name, value)
    {
        // XXXjjb Honza, if Console.isEnabled(context) false, then this can't be called,
        // but somehow seems not correct
        if (name == "showXMLHttpRequests")
        {
            var tach = value ? this.attachObserver : this.detachObserver;
            for (var i = 0; i < TabWatcher.contexts.length; ++i)
            {
                var context = TabWatcher.contexts[i];
                iterateWindows(context.window, function(win)
                {
                    tach.apply(this, [context, win]);
                });
            }
        }
    }
});

// ************************************************************************************************

/**
 * @class This observer uses {@link HttpRequestObserver} to monitor start and end of all XHRs.
 * using http-on-modify-request and http-on-examine-response events. For every new XHR
 * an instance of {@link Firebug.Spy.XMLHttpRequestSpy} object is created and removed
 * when the XHR is finished.
 */
var SpyHttpObserver =
/** @lends SpyHttpObserver */
{
    observe: function(request, topic, data)
    {
        try
        {
            if (topic != "http-on-modify-request" &&
                topic != "http-on-examine-response" &&
                topic != "http-on-examine-cached-response")
            {
                if (FBTrace.DBG_ERRORS || FBTrace.DBG_SPY)
                    FBTrace.sysout("spy.SpyHttpObserver.observe; ERROR Unknown topic: " + topic);
                return;
            }

            this.observeRequest(request, topic);
        }
        catch (exc)
        {
            if (FBTrace.DBG_ERRORS || FBTrace.DBG_SPY)
                FBTrace.sysout("spy.SpyHttpObserver EXCEPTION", exc);
        }
    },

    observeRequest: function(request, topic)
    {
        var win = getWindowForRequest(request);
        var xhr = this.getXHR(request);

        // The request must be associated with window (i.e. tab) and it also must be 
        // real XHR request.
        if (!win || !xhr)
            return;

        for (var i=0; i<contexts.length; ++i)
        {
            var context = contexts[i];
            if (context.win == win)
            {
                var spyContext = context.context;
                var requestName = request.URI.asciiSpec;
                var requestMethod = request.requestMethod;

                if (topic == "http-on-modify-request")
                    this.requestStarted(request, xhr, spyContext, requestMethod, requestName);
                else if (topic == "http-on-examine-response")
                    this.requestStopped(request, xhr, spyContext, requestMethod, requestName);
                else if (topic == "http-on-examine-cached-response")
                    this.requestStopped(request, xhr, spyContext, requestMethod, requestName);

                return;
            }
        }
    },

    getXHR: function(request)
    {
        // Does also query-interface for nsIHttpChannel.
        if (!(request instanceof Ci.nsIHttpChannel))
            return null;

        try
        {
            var callbacks = request.notificationCallbacks;
            return (callbacks ? callbacks.getInterface(Ci.nsIXMLHttpRequest) : null);
        }
        catch (exc)
        {
            if (exc.name == "NS_NOINTERFACE")
            {
                if (FBTrace.DBG_SPY)
                    FBTrace.sysout("spy.getXHR; Request is not nsIXMLHttpRequest: " +
                        safeGetRequestName(request));
            }
        }

       return null;
    },

    requestStarted: function(request, xhr, context, method, url)
    {
        var spy = getSpyForXHR(request, xhr, context);
        spy.method = method;
        spy.href = url;

        if (FBTrace.DBG_SPY)
            FBTrace.sysout("spy.requestStarted; " + spy.href, spy);

        // Get "body" for POST and PUT requests. It will be displayed in
        // appropriate tab of the XHR.
        if (method == "POST" || method == "PUT")
            spy.postText = readPostTextFromRequest(request, context);

        spy.urlParams = parseURLParams(spy.href);

        // In case of redirects there is no stack and the source link is null.
        spy.sourceLink = getStackSourceLink();

        if (!spy.requestHeaders)
            spy.requestHeaders = getRequestHeaders(spy);

        // If it's enabled log the request into the console tab.
        if (Firebug.showXMLHttpRequests && Firebug.Console.isAlwaysEnabled())
        {
            spy.logRow = Firebug.Console.log(spy, spy.context, "spy", null, true);
            setClass(spy.logRow, "loading");
        }

        // Notify registered listeners. The onStart event is fired once for entire XHR
        // (even if there is more redirects within the process).
        var name = request.URI.asciiSpec;
        var origName = request.originalURI.asciiSpec;
        if (name == origName)
            dispatch(Firebug.Spy.fbListeners, "onStart", [context, spy]);

        // Remember the start time et the end, so it's most accurate.
        spy.sendTime = new Date().getTime();
    },

    requestStopped: function(request, xhr, context, method, url)
    {
        var spy = getSpyForXHR(request, xhr, context);
        if (!spy)
            return;

        spy.endTime = new Date().getTime();
        spy.responseTime = spy.endTime - spy.sendTime;
        spy.loaded = true;
        spy.mimeType = Firebug.NetMonitor.Utils.getMimeType(request.contentType, request.name);

        if (!spy.responseHeaders)
            spy.responseHeaders = getResponseHeaders(spy);

        if (!spy.statusText)
        {
            try
            {
                spy.statusCode = request.responseStatus;
                spy.statusText = request.responseStatusText;
            }
            catch (exc)
            {
                if (FBTrace.DBG_SPY)
                    FBTrace.sysout("spy.requestStopped " + spy.href + ", status access FAILED", exc);
            }
        }

        if (spy.logRow)
        {
            updateLogRow(spy, spy.responseTime);
            updateHttpSpyInfo(spy);
        }

        if (spy.context.spies)  // XXXjjb don't we need to spy.detach() ?
            remove(spy.context.spies, spy);

        if (FBTrace.DBG_SPY)
            FBTrace.sysout("spy.requestStopped: " + spy.href + ", responseTime: " +
                spy.responseTime + "ms, spy.responseText: " + (spy.reponseText?spy.responseText.length:0) +
                " bytes", request);
    }
};

// ************************************************************************************************

function getSpyForXHR(request, xhrRequest, context)
{
    var spy = null;

    // Iterate all existing spy objects in this context and look for one that is
    // already created for this request.
    var length = context.spies.length;
    for (var i=0; i<length; i++)
    {
        spy = context.spies[i];
        if (spy.request == request)
            return spy;
    }

    spy = new Firebug.Spy.XMLHttpRequestSpy(request, xhrRequest, context);
    context.spies.push(spy);

    var name = request.URI.asciiSpec;
    var origName = request.originalURI.asciiSpec;

    // Attach spy only to the original request. Notice that there can be more network requests
    // made by the same XHR if redirects are involved.
    if (name == origName)
        spy.attach();

    if (FBTrace.DBG_SPY)
        FBTrace.sysout("spy.getSpyForXHR; New spy object created for: " + name, spy);

    return spy;
}

// ************************************************************************************************

Firebug.Spy.XMLHttpRequestSpy = function(request, xhrRequest, context)
{
    this.request = request;
    this.xhrRequest = xhrRequest;
    this.context = context;
    this.responseText = null;

    // For compatibility with the Net templates.
    this.isXHR = true;
};

Firebug.Spy.XMLHttpRequestSpy.prototype =
{
    attach: function()
    {
        var spy = this;
        this.onReadyStateChange = function(event) { onHTTPSpyReadyStateChange(spy, event); };
        this.onLoad = function() { onHTTPSpyLoad(spy); };
        this.onError = function() { onHTTPSpyError(spy); };
        this.onAbort = function() { onHTTPSpyAbort(spy); };

        this.onreadystatechange = this.xhrRequest.onreadystatechange;
        this.xhrRequest.onreadystatechange = this.onReadyStateChange;
        this.xhrRequest.addEventListener("load", this.onLoad, false);
        this.xhrRequest.addEventListener("error", this.onError, false);
        this.xhrRequest.addEventListener("abort", this.onAbort, false);
    },

    detach: function()
    {
        this.xhrRequest.onreadystatechange = this.onreadystatechange;
        try { this.xhrRequest.removeEventListener("load", this.onLoad, false); } catch (e) {}
        try { this.xhrRequest.removeEventListener("error", this.onError, false); } catch (e) {}
        try { this.xhrRequest.removeEventListener("abort", this.onAbort, false); } catch (e) {}

        this.onreadystatechange = null;
        this.onLoad = null;
        this.onError = null;
        this.onAbort = null;
    },

    getURL: function()
    {
        return this.xhrRequest.channel ? this.xhrRequest.channel.name : this.href;
    },
};

// ************************************************************************************************

/**
 * @domplate Represents a template for XHRs logged in the Console panel. The body of the
 * log (displayed when expanded) is rendered using {@link Firebug.NetMonitor.NetInfoBody}.
 */
Firebug.Spy.XHR = domplate(Firebug.Rep,
/** @lends Firebug.Spy.XHR */
{
    tag:
        DIV({"class": "spyHead", _repObject: "$object"},
            TABLE({"class": "spyHeadTable focusRow outerFocusRow", cellpadding: 0, cellspacing: 0,
                "role": "listitem", "aria-expanded": "false"},
                TBODY({"role": "presentation"},
                    TR({"class": "spyRow"},
                        TD({"class": "spyTitleCol spyCol", onclick: "$onToggleBody"},
                            DIV({"class": "spyTitle"},
                                "$object|getCaption"
                            ),
                            DIV({"class": "spyFullTitle spyTitle"},
                                "$object|getFullUri"
                            )
                        ),
                        TD({"class": "spyCol"},
                            DIV({"class": "spyStatus"}, "$object|getStatus")
                        ),
                        TD({"class": "spyCol"},
                            IMG({"class": "spyIcon", src: "blank.gif"})
                        ),
                        TD({"class": "spyCol"},
                            SPAN({"class": "spyTime"})
                        ),
                        TD({"class": "spyCol"},
                            TAG(FirebugReps.SourceLink.tag, {object: "$object.sourceLink"})
                        )
                    )
                )
            )
        ),

    getCaption: function(spy)
    {
        return spy.method.toUpperCase() + " " + cropString(spy.getURL(), 100);
    },

    getFullUri: function(spy)
    {
        return spy.method.toUpperCase() + " " + spy.getURL();
    },

    getStatus: function(spy)
    {
        var text = "";
        if (spy.statusCode)
            text += spy.statusCode + " ";

        if (spy.statusText)
            return text += spy.statusText;

        return text;
    },

    onToggleBody: function(event)
    {
        var target = event.currentTarget;
        var logRow = getAncestorByClass(target, "logRow-spy");

        if (isLeftClick(event))
        {
            toggleClass(logRow, "opened");

            var spy = getChildByClass(logRow, "spyHead").repObject;
            var spyHeadTable = getAncestorByClass(target, "spyHeadTable");

            if (hasClass(logRow, "opened"))
            {
                updateHttpSpyInfo(spy);
                if (spyHeadTable)
                    spyHeadTable.setAttribute('aria-expanded', 'true');
            }
            else
            {
                var netInfoBox = getChildByClass(spy.logRow, "spyHead", "netInfoBody");
                dispatch(Firebug.NetMonitor.NetInfoBody.fbListeners, "destroyTabBody", [netInfoBox, spy]);
                if (spyHeadTable)
                    spyHeadTable.setAttribute('aria-expanded', 'false');
            }
        }
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    copyURL: function(spy)
    {
        copyToClipboard(spy.getURL());
    },

    copyParams: function(spy)
    {
        var text = spy.postText;
        if (!text)
            return;

        var url = reEncodeURL(spy, text);
        copyToClipboard(url);
    },

    copyResponse: function(spy)
    {
        copyToClipboard(spy.responseText);
    },

    openInTab: function(spy)
    {
        openNewTab(spy.getURL(), spy.postText);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    supportsObject: function(object)
    {
        return object instanceof Firebug.Spy.XMLHttpRequestSpy;
    },

    browseObject: function(spy, context)
    {
        var url = spy.getURL();
        openNewTab(url);
        return true;
    },

    getRealObject: function(spy, context)
    {
        return spy.xhrRequest;
    },

    getContextMenuItems: function(spy)
    {
        var items = [
            {label: "CopyLocation", command: bindFixed(this.copyURL, this, spy) }
        ];

        if (spy.postText)
        {
            items.push(
                {label: "CopyLocationParameters", command: bindFixed(this.copyParams, this, spy) }
            );
        }

        items.push(
            {label: "CopyResponse", command: bindFixed(this.copyResponse, this, spy) },
            "-",
            {label: "OpenInTab", command: bindFixed(this.openInTab, this, spy) }
        );

        return items;
    }
});

// ************************************************************************************************

Firebug.XHRSpyListener =
{
    onStart: function(context, spy)
    {
    },

    onLoad: function(context, spy)
    {
    }
};

// ************************************************************************************************

function onHTTPSpyReadyStateChange(spy, event)
{
    if (FBTrace.DBG_SPY)
        FBTrace.sysout("spy.onHTTPSpyReadyStateChange " + spy.xhrRequest.readyState +
            ", multipart: " + spy.xhrRequest.multipart);

    // If the request is loading update the end time.
    if (spy.xhrRequest.readyState == 3)
    {
        spy.endTime = new Date().getTime();
        spy.responseTime = spy.endTime - spy.sendTime;
        updateTime(spy, spy.responseTime);
    }

    var originalHandler = spy.onreadystatechange;

    // Request loaded. Get all the info from the request now, just in case the 
    // XHR were aborted in the original onReadyStateChange handler.
    if (spy.xhrRequest.readyState == 4)
        onHTTPSpyLoad(spy);

    try
    {
        // Maybe the handler will eval(), we want the URL (used by debuggger.js).
        spy.context.onReadySpy = spy;

        // Calling the page handler throwed an exception (see #502959)
        // This should be fixed in Firefox 3.5
        if (originalHandler)
            originalHandler.handleEvent(event);
    }
    catch (exc)
    {
        if (FBTrace.DBG_ERRORS)
            FBTrace.sysout("spy.onHTTPSpyReadyStateChange: EXCEPTION "+exc, [exc, event]);

        if (exc.name != "NS_ERROR_XPC_JAVASCRIPT_ERROR_WITH_DETAILS")
        {
            Firebug.Console.logFormatted(["onreadystatechange FAILS "+exc, exc, event],
                spy.context, "error", true);
        }
        else
        {
            var error = Firebug.Errors.reparseXPC(exc, spy.context);
            if (error)
            {
                // TODO attach trace
                if (FBTrace.DBG_ERRORS)
                    FBTrace.sysout("spy.onHTTPSpyReadyStateChange: reparseXPC", error);
                Firebug.Console.logFormatted([error], spy.context, "error", false);
            }
        }

        var rethrow = exc;
    }
    finally
    {
        delete spy.context.onReadySpy;
    }

    // xxxHonza: Since #502959 is fixed, this should never happen. Keep it here for Firebug 1.5
    // to see it's relly working. If yes, it can be removed from 1.6
    if (rethrow)
        throw rethrow;  // does nothing?
}

function onHTTPSpyLoad(spy)
{
    if (FBTrace.DBG_SPY)
        FBTrace.sysout("spy.onHTTPSpyLoad: " + spy.href, spy);

    // If we were already detached, don't do this again
    if (!spy.onLoad)
        return;

    // Detach all listeners from the XHR object.
    spy.detach();

    if (!spy.responseText)
    {
        if (spy.logRow)
        {
            // Force response text to be updated in the UI (in case the console entry
            // has been already expanded and the response tab selected).
            var netInfoBox = getChildByClass(spy.logRow, "spyHead", "netInfoBody");
            if (netInfoBox)
            {
                netInfoBox.htmlPresented = false;
                netInfoBox.responsePresented = false;
            }
        }

        spy.responseText = spy.xhrRequest.responseText;
    }

    var netProgress = spy.context.netProgress;
    if (netProgress)
        netProgress.post(netProgress.stopFile, [spy.request, spy.endTime, spy.postText, spy.responseText]);

    updateHttpSpyInfo(spy);

    // Notify registered listeners about finish of the XHR.
    dispatch(Firebug.Spy.fbListeners, "onLoad", [spy.context, spy]);
}

function onHTTPSpyError(spy)
{
    if (FBTrace.DBG_SPY)
        FBTrace.sysout("spy.onHTTPSpyError; " + spy.href, spy);

    var now = new Date().getTime();

    if (spy.logRow)
    {
        removeClass(spy.logRow, "loading");
        setClass(spy.logRow, "error");
    }

    spy.detach();

    if (spy.context.spies)
        remove(spy.context.spies, spy);
}

function onHTTPSpyAbort(spy)
{
    if (FBTrace.DBG_SPY)
        FBTrace.sysout("spy.onHTTPSpyAbort: " + spy.href, spy);

    onHTTPSpyError(spy);

    spy.statusText = "Aborted";
    updateLogRow(spy);

    var netProgress = spy.context.netProgress;
    if (netProgress)
        netProgress.post(netProgress.abortFile, [spy.request, spy.endTime, spy.postText, spy.responseText]);
}

// ************************************************************************************************

function updateTime(spy, responseTime)
{
    var timeBox = getElementByClass(spy.logRow, "spyTime");
    if (responseTime)
        timeBox.textContent = " " + formatTime(responseTime);
}

function updateLogRow(spy, responseTime)
{
    updateTime(spy, responseTime);

    var statusBox = getElementByClass(spy.logRow, "spyStatus");
    statusBox.textContent = Firebug.Spy.XHR.getStatus(spy);

    removeClass(spy.logRow, "loading");
    setClass(spy.logRow, "loaded");

    try
    {
        var errorRange = Math.floor(spy.xhrRequest.status/100);
        if (errorRange == 4 || errorRange == 5)
            setClass(spy.logRow, "error");
    }
    catch (exc)
    {
    }
}

function updateHttpSpyInfo(spy)
{
    if (!spy.logRow || !hasClass(spy.logRow, "opened"))
        return;

    if (!spy.params)
        spy.params = parseURLParams(spy.href+"");

    if (!spy.requestHeaders)
        spy.requestHeaders = getRequestHeaders(spy);

    if (!spy.responseHeaders && spy.loaded)
        spy.responseHeaders = getResponseHeaders(spy);

    var template = Firebug.NetMonitor.NetInfoBody;
    var netInfoBox = getChildByClass(spy.logRow, "spyHead", "netInfoBody");
    if (!netInfoBox)
    {
        var head = getChildByClass(spy.logRow, "spyHead");
        netInfoBox = template.tag.append({"file": spy}, head);
        dispatch(template.fbListeners, "initTabBody", [netInfoBox, spy]);
        template.selectTabByName(netInfoBox, "Response");
    }
    else
    {
        template.updateInfo(netInfoBox, spy, spy.context);
    }
}

// ************************************************************************************************

function getRequestHeaders(spy)
{
    var headers = [];

    var channel = spy.xhrRequest.channel;
    if (channel instanceof Ci.nsIHttpChannel)
    {
        channel.visitRequestHeaders({
            visitHeader: function(name, value)
            {
                headers.push({name: name, value: value});
            }
        });
    }

    return headers;
}

function getResponseHeaders(spy)
{
    var headers = [];

    try
    {
        var channel = spy.xhrRequest.channel;
        if (channel instanceof Ci.nsIHttpChannel)
        {
            channel.visitResponseHeaders({
                visitHeader: function(name, value)
                {
                    headers.push({name: name, value: value});
                }
            });
        }
    }
    catch (exc)
    {
        if (FBTrace.DBG_SPY || FBTrace.DBG_ERRORS)
            FBTrace.sysout("spy.getResponseHeaders; EXCEPTION " +
                safeGetRequestName(spy.request), exc);
    }

    return headers;
}

// ************************************************************************************************
// Registration

Firebug.registerModule(Firebug.Spy);
Firebug.registerRep(Firebug.Spy.XHR);

// ************************************************************************************************
}});
