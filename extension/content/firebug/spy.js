
/* See license.txt for terms of usage */

FBL.ns(function() { with (FBL) {

// ************************************************************************************************
// Constants

const Cc = Components.classes;
const Ci = Components.interfaces;
const nsIHttpChannel = Ci.nsIHttpChannel;
const nsIUploadChannel = Ci.nsIUploadChannel;
const nsIRequest = Ci.nsIRequest;
const nsIXMLHttpRequest = Ci.nsIXMLHttpRequest;
const nsIWebProgress = Ci.nsIWebProgress;

var contexts = [];

// ************************************************************************************************
// Spy Module

/**
 * @module Represents a Spy module that is responsible for attaching/detaching a Spy HTTP Observer
 * when Firebug is activated/deactivated for a site. This {@link SpyHttpObserver} is
 * consequently responsible for monitoring all XHRs.
 */
Firebug.Spy = extend(Firebug.Module,
{
    dispatchName: "spy",

    skipSpy: function(win)
    {
        var uri = safeGetWindowLocation(win); // don't attach spy to chrome
        if (uri &&  (uri.indexOf("about:") == 0 || uri.indexOf("chrome:") == 0))
            return true;
    },

    attachObserver: function(context, win)
    {
        if (win)
        {
            if (Firebug.Spy.skipSpy(win))
                return;

            for( var i = 0; i < contexts.length; ++i )
            {
                if ( (contexts[i].context == context) && (contexts[i].win == win) )
                    return;
            }
            if ( contexts.length == 0 )
                httpObserver.addObserver(SpyHttpObserver, "firebug-http-event", false);
            contexts.push({ context: context, win: win });

            if (FBTrace.DBG_SPY)
                FBTrace.sysout("spy.attachObserver " + contexts.length + " ", context.getName());
        }
    },

    detachObserver: function(context, win)
    {
        for( var i = 0; i < contexts.length; ++i )
        {
            if ( (contexts[i].context == context) )
            {
                if (win && (contexts[i].win != win) )
                    continue;
                contexts.splice(i, 1);
                if ( contexts.length == 0 )
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
        if (name == "showXMLHttpRequests")  // XXXjjb Honza, if Console.isEnabled(context) false, then this can't be called, but somehow seems not correct
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
            // If a progress listener is set for the XHR, the loadFlags doesn't have
            // nsIRequest.LOAD_BACKGROUND flag set. So, don't use it as a condition for displaying
            // the XHR in Firebug console (Issue #1229).
            if ((topic == "http-on-modify-request") || (topic == "http-on-examine-response"))
            {
                request = QI(request, nsIHttpChannel);
                if (request.notificationCallbacks)
                {
                    try
                    {
                        var xhrRequest = request.notificationCallbacks.getInterface(nsIXMLHttpRequest);
                    }
                    catch (e)
                    {
                        if (e.name == "NS_NOINTERFACE")
                        {
                            if (FBTrace.DBG_SPY)
                                FBTrace.sysout("spy.observe - request has no nsIXMLHttpRequest interface: ", request);
                        }
                    }
                    if (xhrRequest && request.loadGroup)
                    {
                        var win = QI(request.loadGroup.groupObserver, nsIWebProgress).DOMWindow;
                        for( var i = 0; i < contexts.length; ++i )
                        {
                            if (contexts[i].win == win)
                            {
                                if (topic == "http-on-modify-request")
                                  requestStarted(request, xhrRequest, contexts[i].context, request.requestMethod, request.URI.asciiSpec);
                                else if (topic == "http-on-examine-response")
                                  requestStopped(request, xhrRequest, contexts[i].context, request.requestMethod, request.URI.asciiSpec);

                                return;
                            }
                        }
                    }
                }
            }
        }
        catch(exc)
        {
            if (FBTrace.DBG_ERRORS)
                FBTrace.sysout("spy.SpyHttpObserver FAILS", exc);
        }
    }
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

Firebug.Spy.XMLHttpRequestSpy = function(request, xhrRequest, context)
{
    this.request = request;
    this.xhrRequest = xhrRequest;
    this.context = context;
    this.responseText = null;
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

        // xxxHonza: Workaround for FB issue 1948 and FF bug #502959
        // Don't replace the original onreadystatechange callback since there is an 
        // exception when the callback is executed (see onHTTPSpyReadyStateChange)
        // Only the "load" and "error" event handlers are used to monitor the XHR. 
        //this.xhrRequest.onreadystatechange = this.onReadyStateChange;
        this.xhrRequest.addEventListener("load", this.onLoad, true);
        this.xhrRequest.addEventListener("error", this.onError, true);
        this.xhrRequest.addEventListener("abort", this.onAbort, true);

        // Use tabCache to get XHR response. Notice that the tabCache isn't
        // supported till Firefox 3.0.4
        this.context.sourceCache.addListener(this);
    },

    detach: function()
    {
        this.xhrRequest.onreadystatechange = this.onreadystatechange;
        try { this.xhrRequest.removeEventListener("load", this.onLoad, true); } catch (e) {}
        try { this.xhrRequest.removeEventListener("error", this.onError, true); } catch (e) {}
        try { this.xhrRequest.removeEventListener("abort", this.onAbort, true); } catch (e) {}

        this.onreadystatechange = null;
        this.onLoad = null;
        this.onError = null;
        this.onAbort = null;

        if (!this.context.sourceCache)
        {
            FBTrace.sysout("spy.detach; ERROR" + this.context.getName());
            return;
        }

        this.context.sourceCache.removeListener(this);  // XXXjjb I see null sourceCache errors here, from onReadyStateChange
    },

    getURL: function()
    {
        return this.xhrRequest.channel ? this.xhrRequest.channel.name : this.href;
    },

    // Cache listener
    onStopRequest: function(context, request, responseText)
    {
        if (request == this.request)
            this.responseText = responseText
    },
};

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

function getSpyForXHR(request, xhrRequest, context)
{
    var spy = null;
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

    // Attach spy only to the original request. Notice that there
    // can be more network requests made by the same XHR if there
    // are redirects.
    if (name == origName)
        spy.attach();

    if (FBTrace.DBG_SPY)
        FBTrace.sysout("spy.getSpyForXHR new spy object created for: " + name, spy);

    return spy;
}

// ************************************************************************************************

function requestStarted(request, xhrRequest, context, method, url)
{
    var spy = getSpyForXHR(request, xhrRequest, context);
    spy.method = method;
    spy.href = url;

    if (FBTrace.DBG_SPY)
        FBTrace.sysout("spy.requestStarted: "+spy.href, spy);

    // Get "body" for POST and PUT requests. It will be displayed in
    // appropriate tab of the XHR.
    if (method == "POST" || method == "PUT")
        spy.postText = readPostTextFromRequest(request, context);

    spy.urlParams = parseURLParams(spy.href);
    spy.sourceLink = getStackSourceLink();

    if (!spy.requestHeaders)
        spy.requestHeaders = getRequestHeaders(spy);

    // If it's enabled log the request into the console tab.
    if (Firebug.showXMLHttpRequests && Firebug.Console.isAlwaysEnabled())
    {
        spy.logRow = Firebug.Console.log(spy, spy.context, "spy", null, true);
        setClass(spy.logRow, "loading");
    }

    // Notify registered listeners. The onStart event is fired
    // once for entire XHR (even if there is more redirects within
    // the process).
    var name = request.URI.asciiSpec;
    var origName = request.originalURI.asciiSpec;
    if (name == origName)
        dispatch(Firebug.Spy.fbListeners, "onStart", [context, spy]);

    // Remember the start time et the end, so it's most accurate.
    spy.sendTime = new Date().getTime();
}

function requestStopped(request, xhrRequest, context, method, url)
{
    var spy = getSpyForXHR(request, xhrRequest, context);
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

function onHTTPSpyReadyStateChange(spy, event)
{
    try
    {
        spy.context.onReadySpy = spy; // maybe the handler will eval(), we want the URL.
        if (spy.onreadystatechange)
            spy.onreadystatechange.handleEvent(event);  // This throws an exception see #502959
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

    if (spy.xhrRequest.readyState == 4)
        onHTTPSpyLoad(spy);

    if (rethrow)
        throw rethrow;  // does nothing?
}

function onHTTPSpyLoad(spy)
{
    // If we were already detached, don't do this again
    if (!spy.onLoad)
        return;

    // The main XHR object has to be dettached now (i.e. listeners removed).
    spy.detach();

    // The tabCache listener is used to get the actuall response since the
    // spy.xhrRequest.responseText is empty if the request is aborted at this
    // moment. Anyway, this way is used also for following cases:
    // (a) nsITraceableChannel is not available until FF 3.0.4
    // (b) specified response content-type doesn't have to be cached.
    if (!spy.responseText)
        spy.responseText = spy.xhrRequest.responseText;

    var netProgress = spy.context.netProgress;
    if (netProgress)
        netProgress.post(netProgress.stopFile, [spy.request, spy.endTime, spy.postText, spy.responseText]);

    // If the response is get from FF cache the http-on-examine-response is never sent
    // (https://bugzilla.mozilla.org/show_bug.cgi?id=449198) and so, the requestStopped
    // method is never called.
    // Let's simulate the event for all spy objects that have been registered for this request.
    // Notice that there can be more spy objects (using the same request object) in case of
    // redirects.
    var spies = spy.context.spies;
    for (var i=0; spies && i<spies.length; i++)
    {
        if (spy.request == spies[i].request) {
            requestStopped(spy.request, spy.xhrRequest, spy.context, spy.method, spy.href);
            i--;
        }
    }

    // Notify registered listeners about finish of the XHR.
    dispatch(Firebug.Spy.fbListeners, "onLoad", [spy.context, spy]);

    if (FBTrace.DBG_SPY)
        FBTrace.sysout("spy.onHTTPSpyLoad: " + spy.href, spy);
}

function onHTTPSpyError(spy)
{
    if (FBTrace.DBG_SPY)
        FBTrace.sysout("spy.onHTTPSpyError: " + spy.href, spy);

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

function updateLogRow(spy, responseTime)
{
    var timeBox = getElementByClass(spy.logRow, "spyTime");
    if (responseTime)
        timeBox.textContent = " " + formatTime(responseTime);

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

    var template = Firebug.NetMonitor.NetInfoBody;

    if (!spy.params)
        spy.params = parseURLParams(spy.href+"");

    if (!spy.requestHeaders)
        spy.requestHeaders = getRequestHeaders(spy);

    if (!spy.responseHeaders && spy.loaded)
        spy.responseHeaders = getResponseHeaders(spy);

    var netInfoBox = getChildByClass(spy.logRow, "spyHead", "netInfoBody");
    if (!netInfoBox)
    {
        var head = getChildByClass(spy.logRow, "spyHead");
        netInfoBox = template.tag.append({"file": spy}, head);
        dispatch(template.fbListeners, "initTabBody", [netInfoBox, spy]);
        template.selectTabByName(netInfoBox, "Response");
    }
    else
        template.updateInfo(netInfoBox, spy, spy.context);
}

// ************************************************************************************************

function getRequestHeaders(spy)
{
    var headers = [];

    if (spy.xhrRequest.channel instanceof nsIHttpChannel)
    {
        var http = QI(spy.xhrRequest.channel, nsIHttpChannel);
        http.visitRequestHeaders({
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
        if (spy.xhrRequest.channel instanceof nsIHttpChannel)
        {
            var http = QI(spy.xhrRequest.channel, nsIHttpChannel);
            http.visitResponseHeaders({
                visitHeader: function(name, value)
                {
                    headers.push({name: name, value: value});
                }
            });
        }
    }
    catch (exc) { }

    return headers;
}

// ************************************************************************************************
// Registration

Firebug.registerModule(Firebug.Spy);
Firebug.registerRep(Firebug.Spy.XHR);

// ************************************************************************************************
}});
