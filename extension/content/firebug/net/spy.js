/* See license.txt for terms of usage */

define([
    "firebug/chrome/module",
    "firebug/chrome/rep",
    "firebug/lib/object",
    "firebug/firebug",
    "firebug/lib/domplate",
    "firebug/chrome/reps",
    "firebug/lib/events",
    "firebug/net/requestObserver",
    "firebug/debugger/stack/stackFrame",
    "firebug/lib/http",
    "firebug/lib/css",
    "firebug/lib/dom",
    "firebug/chrome/window",
    "firebug/lib/system",
    "firebug/lib/string",
    "firebug/lib/url",
    "firebug/lib/array",
    "firebug/trace/debug",
    "firebug/net/httpActivityObserver",
    "firebug/net/netUtils",
    "firebug/trace/traceListener",
    "firebug/trace/traceModule",
    "firebug/lib/wrapper",
    "firebug/lib/options",
    "firebug/net/netPanel",
    "firebug/console/errors"
],
function(Module, Rep, Obj, Firebug, Domplate, FirebugReps, Events, HttpRequestObserver,
    StackFrame, Http, Css, Dom, Win, System, Str, Url, Arr, Debug, NetHttpActivityObserver,
    NetUtils, TraceListener, TraceModule, Wrapper, Options) {

// ********************************************************************************************* //
// Constants

var {domplate, TAG, DIV, SPAN, TD, TR, TABLE, TBODY, P, A} = Domplate;

const Cc = Components.classes;
const Ci = Components.interfaces;

var eventListenerService = Cc["@mozilla.org/eventlistenerservice;1"].
    getService(Ci.nsIEventListenerService);

// List of contexts with XHR spy attached.
var contexts = [];

var redirectionLimit = Options.getPref("network.http", "redirection-limit");

// Tracing
var TraceError = FBTrace.toError();
var Trace = FBTrace.to("DBG_SPY");

// ********************************************************************************************* //
// Spy Module

/**
 * @module Represents a XHR Spy module. The main purpose of the XHR Spy feature is to monitor
 * XHR activity of the current page and create appropriate log into the Console panel.
 * This feature can be controlled by an option <i>Show XMLHttpRequests</i> (from within the
 * console panel).
 *
 * The module is responsible for attaching/detaching a HTTP Observers when Firebug is
 * activated/deactivated for a site.
 */
Firebug.Spy = Obj.extend(Module,
/** @lends Firebug.Spy */
{
    dispatchName: "spy",

    initialize: function()
    {
        this.traceListener = new TraceListener("spy.", "DBG_SPY", true);
        TraceModule.addListener(this.traceListener);

        Module.initialize.apply(this, arguments);
    },

    shutdown: function()
    {
        Module.shutdown.apply(this, arguments);

        TraceModule.removeListener(this.traceListener);
    },

    initContext: function(context)
    {
        context.spies = [];

        if (Options.get("showXMLHttpRequests") && Firebug.Console.isAlwaysEnabled())
            this.attachObserver(context, context.window);

        Trace.sysout("spy.initContext " + contexts.length + " ", context.getName());
    },

    destroyContext: function(context)
    {
        // For any spies that are in progress, remove our listeners so that they don't leak
        this.detachObserver(context, null);

        if (context.spies && context.spies.length)
        {
            Trace.sysout("spy.destroyContext; ERROR There are spies in progress ("
                + context.spies.length + ") " + context.getName());
        }

        // Make sure that all Spies in progress are detached at this moment.
        // Clone the array beforehand since the spy object is removed from the
        // original array within detach.
        var spies = context.spies ? Arr.cloneArray(context.spies) : [];
        for (var i=0; i<spies.length; i++)
            spies[i].detach(true);

        delete context.spies;

        SpyHttpActivityObserver.cleanUp(context.window);

        Trace.sysout("spy.destroyContext " + contexts.length + " ", context.getName());
    },

    watchWindow: function(context, win)
    {
        if (Options.get("showXMLHttpRequests") && Firebug.Console.isAlwaysEnabled())
            this.attachObserver(context, win);
    },

    unwatchWindow: function(context, win)
    {
        Trace.sysout("spy.unwatchWindow; " + (context ? context.getName() : "no context"));

        try
        {
            // This make sure that the existing context is properly removed from "contexts" array.
            this.detachObserver(context, win);

            SpyHttpActivityObserver.cleanUp(win);
        }
        catch (ex)
        {
            // Get exceptions here sometimes, so let's just ignore them
            // since the window is going away anyhow
            Debug.ERROR(ex);
        }
    },

    updateOption: function(name, value)
    {
        // XXXjjb Honza, if Console.isEnabled(context) false, then this can't be called,
        // but somehow seems not correct

        // XHR Spy needs to be detached/attached when:
        // 1) The Show XMLHttpRequests options is off/on
        // 2) The Console panel is disabled/enabled
        // See also issue 5109
        if (name == "showXMLHttpRequests" || name == "console.enableSites")
        {
            var tach = value ? this.attachObserver : this.detachObserver;

            Firebug.connection.eachContext(function tachAll(context)
            {
                Win.iterateWindows(context.window, function(win)
                {
                    tach.apply(this, [context, win]);
                });
            });
        }
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Attaching Spy to XHR requests.

    /**
     * Returns false if Spy should not be attached to XHRs executed by the specified window.
     */
    skipSpy: function(win)
    {
        if (!win)
            return true;

        // Don't attach spy to chrome.
        var uri = Win.safeGetWindowLocation(win);
        if (uri && (Str.hasPrefix(uri, "about:") || Str.hasPrefix(uri, "chrome:")))
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

        // Register HTTP observers only once.
        if (contexts.length == 0)
        {
            HttpRequestObserver.addObserver(SpyHttpObserver, "firebug-http-event", false);
            SpyHttpActivityObserver.registerObserver();
        }

        contexts.push({context: context, win: win});

        Trace.sysout("spy.attachObserver (HTTP) " + contexts.length + " ", context.getName());
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

                // If no context is using spy, remove the (only one) HTTP observer.
                if (contexts.length == 0)
                {
                    HttpRequestObserver.removeObserver(SpyHttpObserver, "firebug-http-event");
                    SpyHttpActivityObserver.unregisterObserver();
                }

                Trace.sysout("spy.detachObserver (HTTP) " + contexts.length + " ",
                    context.getName());

                return;
            }
        }
    },

    /**
     * Return XHR object that is associated with specified request <i>nsIHttpChannel</i>.
     * Returns null if the request doesn't represent XHR.
     */
    getXHR: function(request)
    {
        // Does also query-interface for nsIHttpChannel.
        if (!(request instanceof Ci.nsIHttpChannel))
            return null;

        try
        {
            var callbacks = request.notificationCallbacks;
            if (callbacks)
            {
                StackFrame.suspendShowStackTrace();
                return callbacks.getInterface(Ci.nsIXMLHttpRequest);
            }
        }
        catch (exc)
        {
            if (exc.name == "NS_NOINTERFACE")
            {
                Trace.sysout("spy.getXHR; Request is not nsIXMLHttpRequest: " +
                    Http.safeGetRequestName(request));
            }
        }
        finally
        {
            StackFrame.resumeShowStackTrace();
        }

       return null;
    },
});

// ********************************************************************************************* //

/**
 * @class This observer uses {@link HttpRequestObserver} to monitor start and end of all XHRs.
 * using <code>http-on-modify-request</code>, <code>http-on-examine-response</code> and
 * <code>http-on-examine-cached-response</code> events. For every monitored XHR a new
 * instance of {@link Firebug.Spy.XMLHttpRequestSpy} object is created. This instance is removed
 * when the XHR is finished.
 */
var SpyHttpObserver =
/** @lends SpyHttpObserver */
{
    dispatchName: "SpyHttpObserver",

    observe: function(request, topic, data)
    {
        try
        {
            var redirect = (request.redirectionLimit < redirectionLimit);

            // There is no http-on-opening-request in case of redirect so, we need
            // to use http-on-modify-request.
            if ((topic == "http-on-modify-request" && redirect) ||
                topic == "http-on-opening-request" ||
                topic == "http-on-examine-response" ||
                topic == "http-on-examine-cached-response")
            {
                this.observeRequest(request, topic);
            }
        }
        catch (exc)
        {
            TraceError.sysout("spy.SpyHttpObserver EXCEPTION", exc);
        }
    },

    observeRequest: function(request, topic)
    {
        var win = Http.getWindowForRequest(request);
        var xhr = Firebug.Spy.getXHR(request);

        // The request must be associated with window (i.e. tab) and it also must be
        // real XHR request.
        if (!win || !xhr)
            return;

        var redirect = (request.redirectionLimit < redirectionLimit);

        for (var i=0; i<contexts.length; ++i)
        {
            var context = contexts[i];
            if (context.win == win)
            {
                var spyContext = context.context;
                var requestName = request.URI.asciiSpec;
                var requestMethod = request.requestMethod;

                if (topic == "http-on-modify-request" && redirect)
                    this.requestStarted(request, xhr, spyContext, requestMethod, requestName);
                else if (topic == "http-on-opening-request")
                    this.requestStarted(request, xhr, spyContext, requestMethod, requestName);
                else if (topic == "http-on-examine-response")
                    this.requestStopped(request, xhr, spyContext, requestMethod, requestName);
                else if (topic == "http-on-examine-cached-response")
                    this.requestStopped(request, xhr, spyContext, requestMethod, requestName);

                return;
            }
        }
    },

    requestStarted: function(request, xhr, context, method, url)
    {
        var spy = getSpyForXHR(request, xhr, context);
        spy.method = method;
        spy.href = url;

        Trace.sysout("spy.requestStarted; " + spy.href);

        // Get "body" for POST and PUT requests. It will be displayed in
        // appropriate tab of the XHR.
        if (method == "POST" || method == "PUT" || method == "PATCH")
            spy.postText = Http.readPostTextFromRequest(request, context);

        spy.urlParams = Url.parseURLParams(spy.href);

        // In case of redirects there is no stack and the source link is null.
        spy.sourceLink = StackFrame.getStackSourceLink();

        if (!spy.requestHeaders)
            spy.requestHeaders = getRequestHeaders(spy);

        // If it's enabled log the request into the console tab.
        if (Options.get("showXMLHttpRequests") && Firebug.Console.isAlwaysEnabled())
        {
            spy.logRow = Firebug.Console.log(spy, spy.context, "spy", null, true);
            Css.setClass(spy.logRow, "loading");
        }

        // Notify registered listeners. The onStart event is fired once for entire XHR
        // (even if there is more redirects within the process).
        if (!isRedirect(request))
            Events.dispatch(Firebug.Spy.fbListeners, "onStart", [context, spy]);

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
        spy.mimeType = NetUtils.getMimeType(request.contentType, request.name);

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
                TraceError.sysout("spy.requestStopped " + spy.href + ", status access ERROR", exc);
            }
        }

        if (spy.logRow)
        {
            updateLogRow(spy);
            updateHttpSpyInfo(spy);
        }

        // Remove only the Spy object that has been created for an intermediate rediret
        // request. These exist only to be also displayed in the console and they
        // don't attach any listeners to the original XHR object (which is always created
        // only once even in case of redirects).
        // xxxHonza: These requests are not observer by the activityObserver now
        // (if they should be observed we have to remove them in the activityObserver)
        if (!spy.onLoad && spy.context.spies)
            Arr.remove(spy.context.spies, spy);

        Trace.sysout("spy.requestStopped: " + spy.href + ", responseTime: " +
            spy.responseTime + "ms, spy.responseText: " +
            (spy.reponseText ? spy.responseText.length : 0) + " bytes");
    }
};

// ************************************************************************************************
// Activity Observer

/**
 * @class This observer is used to properly monitor even multipart XHRs. It's based on
 * an activity-observer component that has been introduced in Firefox 3.6.
 */
var SpyHttpActivityObserver = Obj.extend(NetHttpActivityObserver,
/** @lends SpyHttpActivityObserver */
{
    dispatchName: "SpyHttpActivityObserver",
    activeRequests: [],

    observeRequest: function(request, activityType, activitySubtype, timestamp,
        extraSizeData, extraStringData)
    {
        if (activityType != Ci.nsIHttpActivityObserver.ACTIVITY_TYPE_HTTP_TRANSACTION &&
           (activityType == Ci.nsIHttpActivityObserver.ACTIVITY_TYPE_SOCKET_TRANSPORT &&
            activitySubtype != Ci.nsISocketTransport.STATUS_RECEIVING_FROM))
            return;

        // xxxHonza: this code is duplicated in net.js, it should be refactored.
        var win = Http.getWindowForRequest(request);
        if (!win)
        {
            var index = this.activeRequests.indexOf(request);
            if (index == -1)
                return;

            if (!(win = this.activeRequests[index+1]))
                return;
        }

        for (var i=0; i<contexts.length; ++i)
        {
            var context = contexts[i];
            if (context.win == win)
            {
                var spyContext = context.context;
                var spy = getSpyForXHR(request, null, spyContext, true);
                if (spy)
                    this.observeXHRActivity(win, spy, request, activitySubtype, timestamp);
                return;
            }
        }
    },

    observeXHRActivity: function(win, spy, request, activitySubtype, timestamp)
    {
        // Activity observer has precise time info; use it.
        var time = new Date();
        time.setTime(timestamp/1000);

        if (activitySubtype == Ci.nsIHttpActivityObserver.ACTIVITY_SUBTYPE_REQUEST_HEADER)
        {
            Trace.sysout("spy.observeXHRActivity REQUEST_HEADER " +
                Http.safeGetRequestName(request));

            this.activeRequests.push(request);
            this.activeRequests.push(win);

            spy.sendTime = time;
            spy.transactionStarted = true;
        }
        else if (activitySubtype == Ci.nsIHttpActivityObserver.ACTIVITY_SUBTYPE_TRANSACTION_CLOSE)
        {
            Trace.sysout("spy.observeXHRActivity TRANSACTION_CLOSE " +
                Http.safeGetRequestName(request));

            var index = this.activeRequests.indexOf(request);
            this.activeRequests.splice(index, 2);

            spy.endTime = time;
            spy.transactionClosed = true;

            updateTime(spy);

            // This should be the proper time to detach the Spy object, but only
            // in the case when the XHR is already loaded. If the XHR is made as part of the
            // page load, it may happen that the event (readyState == 4) comes later
            // than actual TRANSACTION_CLOSE.
            if (spy.loaded)
                spy.detach(false);
        }
        else if (activitySubtype == Ci.nsISocketTransport.STATUS_RECEIVING_FROM)
        {
            spy.endTime = time;
        }
    },

    cleanUp: function(win)
    {
        // https://bugzilla.mozilla.org/show_bug.cgi?id=669730
        for (var i=0; i<this.activeRequests.length; i+=2)
        {
            if (this.activeRequests[i+1] == win)
            {
                this.activeRequests.splice(i, 2);
                i -= 2;
            }
        }
    }
});

// ********************************************************************************************* //

function getSpyForXHR(request, xhrRequest, context, noCreate)
{
    var spy = null;

    if (!context.spies)
    {
        Trace.sysout("spy.getSpyForXHR; ERROR no spies array " +
            Http.safeGetRequestName(request));
        return;
    }

    // Iterate all existing spy objects in this context and look for one that is
    // already created for this request.
    var length = context.spies.length;
    for (var i=0; i<length; i++)
    {
        spy = context.spies[i];
        if (spy.request == request)
        {
            // Use the trace condition here to avoid additional code execution (Url.getFileName)
            // when the tracing is switched off
            if (Trace.active)
            {
                var name = Url.getFileName(spy.request.URI.asciiSpec);
                var origName = Url.getFileName(spy.request.originalURI.asciiSpec);
                Trace.sysout("spy.getSpyForXHR; FOUND spy object " + name + ", " + origName);
            }

            return spy;
        }
    }

    if (noCreate)
        return null;

    spy = new Firebug.Spy.XMLHttpRequestSpy(request, xhrRequest, context);
    context.spies.push(spy);

    var name = request.URI.asciiSpec;
    var origName = request.originalURI.asciiSpec;

    if (Trace.active)
    {
        var redirect = isRedirect(request);
        Trace.sysout("spy.getSpyForXHR; NEW spy object (" +
            (redirect ? "redirected XHR" : "new XHR") + ") for: " +
            Url.getFileName(name) + ", " + Url.getFileName(origName));
    }

    // Attach spy only to the original request. Notice that there can be more network requests
    // made by the same XHR if redirects are involved.

    // The Console panel should display XHR entry for evere redirect so we need to
    // attach spy for each request (even redirects). See issue 4009
    //if (name == origName)
        spy.attach();

    return spy;
}

// ********************************************************************************************* //

/**
 * @class This class represents a Spy object that is attached to XHR. This object
 * registers various listeners into the XHR in order to monitor various events fired
 * during the request process (onLoad, onAbort, etc.)
 */
Firebug.Spy.XMLHttpRequestSpy = function(request, xhrRequest, context)
{
    this.request = request;
    this.xhrRequest = xhrRequest;
    this.context = context;
    this.responseText = "";

    // For compatibility with the Net templates.
    this.isXHR = true;

    // Support for activity-observer
    this.transactionStarted = false;
    this.transactionClosed = false;
};

Firebug.Spy.XMLHttpRequestSpy.prototype =
/** @lends Firebug.Spy.XMLHttpRequestSpy */
{
    attach: function()
    {
        var spy = this;

        this.onReadyStateChange = function(event) { onHTTPSpyReadyStateChange(spy, event); };
        this.onLoad = function() { onHTTPSpyLoad(spy); };
        this.onError = function() { onHTTPSpyError(spy); };
        this.onAbort = function() { onHTTPSpyAbort(spy); };

        this.onEventListener = function(event)
        {
            switch (event.type)
            {
                case "readystatechange":
                    onHTTPSpyReadyStateChange(spy, event);
                break;
                case "load":
                    onHTTPSpyLoad(spy);
                break;
                case "error":
                    onHTTPSpyError(spy);
                break;
                case "abort":
                    onHTTPSpyAbort(spy);
                break;
            }
        };

        if (typeof(eventListenerService.addListenerForAllEvents) == "function")
        {
            eventListenerService.addListenerForAllEvents(this.xhrRequest,
                this.onEventListener, true, false, false);
        }
        else
        {
            this.onreadystatechange = this.xhrRequest.onreadystatechange;
            this.xhrRequest.onreadystatechange = this.onReadyStateChange;

            this.xhrRequest.addEventListener("load", this.onLoad, false);
            this.xhrRequest.addEventListener("error", this.onError, false);
            this.xhrRequest.addEventListener("abort", this.onAbort, false);
        }

        Trace.sysout("spy.attach; " + Http.safeGetRequestName(this.request));
    },

    detach: function(force)
    {
        // Bubble out if already detached.
        if (!this.onEventListener)
            return;

        // If the activity distributor is available, let's detach it when the XHR
        // transaction is closed. Since, in case of multipart XHRs the onLoad method
        // (readyState == 4) can be called mutliple times.
        // Keep in mind:
        // 1) It can happen that the TRANSACTION_CLOSE event comes before onload (if
        // the XHR is made as part of the page load), so detach if it's already closed.
        // 2) In case of immediate cache responses, the transaction doesn't have to
        // be started at all (or the activity observer is not available in Firefox 3.5).
        // So, also detach in this case.
        // Make sure spy will detach if force is true.
        if (!force && this.transactionStarted && !this.transactionClosed)
            return;

        Trace.sysout("spy.detach; " + Http.safeGetRequestName(this.request) + ", " +
            Url.getFileName(this.href));

        // Remove itself from the list of active spies.
        Arr.remove(this.context.spies, this);

        if (typeof(eventListenerService.addListenerForAllEvents) == "function")
        {
            eventListenerService.removeListenerForAllEvents(this.xhrRequest,
                this.onEventListener, true, false);
        }
        else
        {
            if (this.onreadystatechange)
                this.xhrRequest.onreadystatechange = this.onreadystatechange;

            try { this.xhrRequest.removeEventListener("load", this.onLoad, false); } catch (e) {}
            try { this.xhrRequest.removeEventListener("error", this.onError, false); } catch (e) {}
            try { this.xhrRequest.removeEventListener("abort", this.onAbort, false); } catch (e) {}
        }

        this.onreadystatechange = null;
        this.onLoad = null;
        this.onError = null;
        this.onAbort = null;

        this.onEventListener = null;
    },

    getURL: function()
    {
        // Don't use this.xhrRequest.channel.name to get the URL. In cases where the
        // same XHR object is reused for more requests, the URL can be wrong (issue 4738).
        return this.href;
    },

    // Cache listener
    onStopRequest: function(context, request, responseText)
    {
        Trace.sysout("spy.onStopRequest: " + Http.safeGetRequestName(request));

        if (!responseText)
            return;

        if (request == this.request)
            this.responseText = responseText;
    },
};

// ********************************************************************************************* //

function onHTTPSpyReadyStateChange(spy, event)
{
    if (Trace.active)
    {
        var name = Url.getFileName(spy.request.URI.asciiSpec);
        var origName = Url.getFileName(spy.request.originalURI.asciiSpec);

        Trace.sysout("spy.onHTTPSpyReadyStateChange " + spy.xhrRequest.readyState +
            " (multipart: " + spy.xhrRequest.multipart + ") " + name + ", " + origName);
    }

    // Remember just in case spy is detached (readyState == 4).
    var originalHandler = spy.onreadystatechange;

    // ReadyStateChange event with readyState == 1 is fired when the page calls  the |open| method.
    // This event is usually not cought since spy object is attached when HTTP-ON-OPENING-REQUEST
    // http even is fired - which happens after |readyState == 1|
    // This scenario happens if the xhr object is reused synchronously in page callback handler
    // (onreadystatechange) for another request. In such case we need to quickly detach our
    // Spy object. New one will be immediatelly created when HTTP-ON-OPENING-REQUEST is fired.
    // See issue 5049
    if (spy.xhrRequest.readyState == 1)
    {
        if (Trace.active)
        {
            Trace.sysout("spy.onHTTPSpyReadyStateChange; ready state == 1, XHR probably being " +
                "reused, detach" + Http.safeGetRequestName(spy.request) + ", " +
                Url.getFileName(spy.href));
        }

        spy.detach(false);
        return;
    }

    // Force response text to be updated in the UI (in case the console entry
    // has been already expanded and the response tab selected).
    if (spy.logRow && spy.xhrRequest.readyState >= 3)
    {
        var netInfoBox = getInfoBox(spy);
        if (netInfoBox)
        {
            netInfoBox.htmlPresented = false;
            netInfoBox.responsePresented = false;
        }
    }

    // If the request is loading update the end time.
    if (spy.logRow && spy.xhrRequest.readyState == 3 && spy.sendTime && spy.endTime)
    {
        spy.responseTime = spy.endTime - spy.sendTime;
        updateTime(spy);
    }

    // Request loaded. Get all the info from the request now, just in case the
    // XHR would be aborted in the original onReadyStateChange handler.
    if (spy.xhrRequest.readyState == 4)
    {
        // Cumulate response so that multipart response content is properly displayed.
        spy.responseText += Http.safeGetXHRResponseText(spy.xhrRequest);

        // The XHR is loaded now (used also by the activity observer).
        spy.loaded = true;

        // Update UI.
        updateLogRow(spy);
        updateHttpSpyInfo(spy, true);

        // Notify the Net panel about a request being loaded.
        // xxxHonza: I don't think this is necessary.
        // stopFile this breaks layout of the net panel in case of redirects.
        var netProgress = spy.context.netProgress;
        if (netProgress && !isRedirect(spy.request))
            netProgress.post(netProgress.stopFile, [spy.request, spy.endTime, spy.postText,
                spy.responseText]);

        // Notify registered listeners about finish of the XHR.
        Events.dispatch(Firebug.Spy.fbListeners, "onLoad", [spy.context, spy]);
    }

    // Pass the event to the original page handler.
    if (typeof(eventListenerService.addListenerForAllEvents) == "undefined")
        callPageHandler(spy, event, originalHandler);
}

function callPageHandler(spy, event, originalHandler)
{
    try
    {
        // Calling the page handler throwed an exception (see #502959)
        // This should be fixed in Firefox 3.5
        if (originalHandler && event)
        {
            if (originalHandler.handleEvent)
                originalHandler.handleEvent(event);
            else
                originalHandler.call(spy.xhrRequest, event);
        }
    }
    catch (exc)
    {
        TraceError.sysout("spy.onHTTPSpyReadyStateChange: EXCEPTION " + exc, [exc, event]);

        var xpcError = Firebug.Errors.reparseXPC(exc, spy.context);
        if (xpcError)
        {
            // TODO attach trace
            TraceError.sysout("spy.onHTTPSpyReadyStateChange: reparseXPC", xpcError);

            // Make sure the exception is displayed in both Firefox & Firebug console.
            throw new Error(xpcError.message, xpcError.href, xpcError.lineNo);
        }
        else
        {
            throw exc;
        }
    }
}

function onHTTPSpyLoad(spy)
{
    if (Trace.active)
    {
        Trace.sysout("spy.onHTTPSpyLoad: " + Http.safeGetRequestName(spy.request) + ", " +
            Url.getFileName(spy.href) + ", state: " + spy.xhrRequest.readyState);
    }

    // Detach must be done in onLoad (not in onreadystatechange) otherwise onAbort would
    // not be handled. Note that onAbort, onError and onLoad events are fired after
    // onreadystatechange and must also be handled.
    // Issue 5049: only detach if XHR state == 4. It can happen that XHR object is being
    // reused for another request and onLoad fires too soon. See also onHTTPSpyReadyStateChange
    // for more details.
    if (spy.xhrRequest.readyState == 4)
        spy.detach(false);

    // If the spy is not loaded yet (and so, the response was not cached), do it now.
    // This can happen since synchronous XHRs don't fire onReadyStateChange event (issue 2868).
    if (!spy.loaded)
    {
        spy.loaded = true;
        spy.responseText = Http.safeGetXHRResponseText(spy.xhrRequest);

        updateLogRow(spy);
        updateHttpSpyInfo(spy, true);
    }
}

function onHTTPSpyError(spy)
{
    Trace.sysout("spy.onHTTPSpyError; " + spy.href);

    spy.detach(false);
    spy.loaded = true;
    spy.error= true;

    updateLogRow(spy);
}

function onHTTPSpyAbort(spy)
{
    Trace.sysout("spy.onHTTPSpyAbort: " + spy.href);

    spy.detach(false);
    spy.loaded = true;

    // Ignore aborts if the request already has a response status.
    if (spy.xhrRequest.status)
    {
        updateLogRow(spy);
        return;
    }

    spy.aborted = true;
    spy.statusText = "Aborted";

    updateLogRow(spy);

    // Notify Net pane about a request beeing aborted.
    // xxxHonza: the net panel shoud find out this itself.
    var netProgress = spy.context.netProgress;
    if (netProgress)
    {
        netProgress.post(netProgress.abortFile, [spy.request, spy.endTime, spy.postText,
            spy.responseText]);
    }
}

// ********************************************************************************************* //

/**
 * @domplate Represents a template for XHRs logged in the Console panel. The body of the
 * log (displayed when expanded) is rendered using {@link Firebug.NetMonitor.NetInfoBody}.
 */
Firebug.Spy.XHR = domplate(Rep,
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
                            SPAN({"class": "spyIcon"})
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
        return spy.method.toUpperCase() + " " + Str.cropString(spy.getURL(), 100);
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
        var logRow = Dom.getAncestorByClass(target, "logRow-spy");

        if (Events.isLeftClick(event))
        {
            Css.toggleClass(logRow, "opened");

            var spy = logRow.getElementsByClassName("spyHead")[0].repObject;
            var spyHeadTable = Dom.getAncestorByClass(target, "spyHeadTable");

            if (Css.hasClass(logRow, "opened"))
            {
                updateHttpSpyInfo(spy);

                if (spyHeadTable)
                    spyHeadTable.setAttribute("aria-expanded", "true");
            }
            else
            {
                // Notify all listeners about closing XHR entry and destroying the body.
                // Any custom tabs should be removed now.
                var netInfoBox = getInfoBox(spy);
                Events.dispatch(Firebug.NetMonitor.NetInfoBody.fbListeners, "destroyTabBody",
                    [netInfoBox, spy]);

                if (spyHeadTable)
                    spyHeadTable.setAttribute("aria-expanded", "false");

                // Remove the info box, it'll be re-created (together with custom tabs)
                // the next time the XHR entry is opened/updated.
                netInfoBox.parentNode.removeChild(netInfoBox);
            }
        }
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    copyURL: function(spy)
    {
        System.copyToClipboard(spy.getURL());
    },

    copyParams: function(spy)
    {
        var text = spy.postText;
        if (!text)
            return;

        var url = Url.reEncodeURL(spy, text, true);
        System.copyToClipboard(url);
    },

    copyAsCurl: function(spy)
    {
        System.copyToClipboard(NetUtils.generateCurlCommand(spy,
            Options.get("net.curlAddCompressedArgument")));
    },

    copyResponse: function(spy)
    {
        System.copyToClipboard(spy.responseText);
    },

    openInTab: function(spy)
    {
        Win.openNewTab(spy.getURL(), spy.postText);
    },

    resend: function(spy, context)
    {
        try
        {
            if (!context.window)
            {
                TraceError.sysout("spy.resend; ERROR no context");
                return;
            }

            // xxxHonza: must be done through Console RDP
            var win = Wrapper.unwrapObject(context.window);
            var request = new win.XMLHttpRequest();
            request.open(spy.method, spy.href, true);

            var headers = spy.requestHeaders;
            for (var i=0; headers && i<headers.length; i++)
            {
                var header = headers[i];
                request.setRequestHeader(header.name, header.value);
            }

            var postData = NetUtils.getPostText(spy, context, true);
            request.send(postData);
        }
        catch (err)
        {
            TraceError.sysout("spy.resend; EXCEPTION " + err, err);
        }
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    supportsObject: function(object, type)
    {
        return object instanceof Firebug.Spy.XMLHttpRequestSpy;
    },

    browseObject: function(spy, context)
    {
        var url = spy.getURL();
        Win.openNewTab(url);
        return true;
    },

    getRealObject: function(spy, context)
    {
        return spy.xhrRequest;
    },

    getContextMenuItems: function(spy, target, context)
    {
        var items = [{
            label: "CopyLocation",
            tooltiptext: "clipboard.tip.Copy_Location",
            id: "fbSpyCopyLocation",
            command: Obj.bindFixed(this.copyURL, this, spy)
        }];

        if (spy.postText)
        {
            items.push({
                label: "CopyLocationParameters",
                tooltiptext: "net.tip.Copy_Location_Parameters",
                command: Obj.bindFixed(this.copyParams, this, spy)
            });
        }

        items.push({
            label: "CopyResponse",
            id: "fbSpyCopyResponse",
            command: Obj.bindFixed(this.copyResponse, this, spy)
        });

        items.push(
            {
                id: "fbCopyAsCurl",
                label: "CopyAsCurl",
                tooltiptext: "net.tip.Copy_as_cURL",
                command: Obj.bindFixed(this.copyAsCurl, this, spy)
            }
        );

        items.push("-");

        items.push({
            label: "OpenInTab",
            tooltiptext: "firebug.tip.Open_In_Tab",
            id: "fbSpyOpenInTab",
            command: Obj.bindFixed(this.openInTab, this, spy)
        });

        items.push({
            label: "Open_Response_In_New_Tab",
            tooltiptext: "net.tip.Open_Response_In_New_Tab",
            id: "fbSpyOpenResponseInTab",
            command: Obj.bindFixed(NetUtils.openResponseInTab, this, spy)
        });

        items.push("-");

        items.push({
            label: "net.label.Resend",
            tooltiptext: "net.tip.Resend",
            id: "fbSpyResend",
            command: Obj.bindFixed(this.resend, this, spy, context)
        });

        return items;
    }
});

// ********************************************************************************************* //

Firebug.XHRSpyListener =
{
    onStart: function(context, spy)
    {
    },

    onLoad: function(context, spy)
    {
    }
};

// ********************************************************************************************* //

function updateTime(spy)
{
    if (spy.logRow)
    {
        var timeBox = spy.logRow.getElementsByClassName("spyTime").item(0);
        if (spy.sendTime && spy.endTime)
            timeBox.textContent = " " + Str.formatTime(spy.endTime - spy.sendTime);
    }
}

function updateLogRow(spy)
{
    updateTime(spy);

    if(spy.logRow)
    {
        var statusBox = spy.logRow.getElementsByClassName("spyStatus").item(0);
        statusBox.textContent = Firebug.Spy.XHR.getStatus(spy);
    }

    if (spy.loaded)
    {
        Css.removeClass(spy.logRow, "loading");
        Css.setClass(spy.logRow, "loaded");
    }

    if (spy.error || spy.aborted)
    {
        Css.setClass(spy.logRow, "error");
    }

    try
    {
        var errorRange = Math.floor(spy.xhrRequest.status/100);
        if (errorRange == 4 || errorRange == 5)
            Css.setClass(spy.logRow, "error");
    }
    catch (exc)
    {
    }
}

function updateHttpSpyInfo(spy, updateInfoBody)
{
    if (!spy.logRow || !Css.hasClass(spy.logRow, "opened"))
        return;

    if (!spy.params)
        spy.params = Url.parseURLParams(String(spy.href));

    if (!spy.requestHeaders)
        spy.requestHeaders = getRequestHeaders(spy);

    if (!spy.responseHeaders && spy.loaded)
        spy.responseHeaders = getResponseHeaders(spy);

    var template = Firebug.NetMonitor.NetInfoBody;
    var netInfoBox = getInfoBox(spy);

    var defaultTab;

    // If the associated XHR row is currently expanded, make sure to recreate
    // the info bodies if the flag says so.
    if (updateInfoBody)
    {
        // Remember the current selected info tab.
        if (netInfoBox.selectedTab)
            defaultTab = netInfoBox.selectedTab.getAttribute("view");

        // Remove the info box so, it's recreated below.
        netInfoBox.parentNode.removeChild(netInfoBox);
        netInfoBox = null;
    }

    if (!netInfoBox)
    {
        var head = spy.logRow.getElementsByClassName("spyHead")[0];
        netInfoBox = template.tag.append({"file": spy}, head);

        // Notify listeners so, custom info tabs can be appended
        Events.dispatch(template.fbListeners, "initTabBody", [netInfoBox, spy]);

        // If the response tab isn't available/visible (perhaps the response didn't came yet),
        // select the 'Headers' tab by default or keep the default tab.
        defaultTab = defaultTab || (template.hideResponse(spy) ? "Headers" : "Response");
        template.selectTabByName(netInfoBox, defaultTab);
    }
    else
    {
        template.updateInfo(netInfoBox, spy, spy.context);
    }
}

function getInfoBox(spy)
{
    return spy.logRow.querySelector(".spyHead > .netInfoBody");
}

function getInfoBox(spy)
{
    return spy.logRow.querySelector(".spyHead > .netInfoBody");
}

// ********************************************************************************************* //

function getRequestHeaders(spy)
{
    var headers = [];

    var channel = spy.xhrRequest.channel;
    if (channel instanceof Ci.nsIHttpChannel)
    {
        channel.visitRequestHeaders(
        {
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
            channel.visitResponseHeaders(
            {
                visitHeader: function(name, value)
                {
                    headers.push({name: name, value: value});
                }
            });
        }
    }
    catch (exc)
    {
        TraceError.sysout("spy.getResponseHeaders; EXCEPTION " +
            Http.safeGetRequestName(spy.request), exc);
    }

    return headers;
}

function isRedirect(request)
{
    try
    {
        var name = request.URI.asciiSpec;
        var origName = request.originalURI.asciiSpec;
        return (name != origName);
    }
    catch (e)
    {
    }

    return false;
}

// ********************************************************************************************* //
// Registration

Firebug.registerModule(Firebug.Spy);
Firebug.registerRep(Firebug.Spy.XHR);

return Firebug.Spy;

// ********************************************************************************************* //
});
