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
const nsISeekableStream = Ci.nsISeekableStream;

const LOAD_BACKGROUND = nsIRequest.LOAD_BACKGROUND;
const NS_SEEK_SET = nsISeekableStream.NS_SEEK_SET;

const observerService = CCSV("@mozilla.org/observer-service;1", "nsIObserverService");

// ************************************************************************************************

var contexts = [];
const httpObserver =
{
    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    // nsIObserver

    observe: function(request, topic, data)
    {
        try
        {
            request = QI(request, nsIHttpChannel);
            if (((topic == "http-on-modify-request") || (topic == "http-on-examine-response"))
                && (request.loadFlags & LOAD_BACKGROUND))
            {
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
                            if (FBTrace.DBG_NET)
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
                FBTrace.dumpProperties("spy.httpObserver FAILS", exc);
        }
    }
};

// List of listeners that can be registerd by other FB extensions.
// See Firebug.Spy.addListener and Firebug.Spy.removeListener.
var listeners = [];

// ************************************************************************************************

Firebug.Spy = extend(Firebug.Module,
{
    skipSpy: function(win)
    {
        var uri = win.location.href; // don't attach spy to chrome
        if (uri &&  (uri.indexOf("about:") == 0 || uri.indexOf("chrome:") == 0))
                return true;
    },

    attachSpy: function(context, win)
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
            {
                observerService.addObserver(httpObserver, "http-on-modify-request", false);
                observerService.addObserver(httpObserver, "http-on-examine-response", false);
            }
            contexts.push({ context: context, win: win });
        }
    },

    detachSpy: function(context, win)
    {
        for( var i = 0; i < contexts.length; ++i )
        {
            if ( (contexts[i].context == context) )
            {
                if (win && (contexts[i].win != win) )
                    continue;
                contexts.splice(i, 1);
                if ( contexts.length == 0 )
                {
                    observerService.removeObserver(httpObserver, "http-on-modify-request", false);
                    observerService.removeObserver(httpObserver, "http-on-examine-response", false);
                }
                return;
            }
        }
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    // extends Module

    initContext: function(context)
    {
        context.spies = [];

        if (Firebug.showXMLHttpRequests  && Firebug.Console.isEnabled(context))
            this.attachSpy(context, context.window);
    },

    destroyContext: function(context)
    {
        // For any spies that are in progress, remove our listeners so that they don't leak
        this.detachSpy(context, false);
        delete context.spies;
    },

    watchWindow: function(context, win)
    {
        if (Firebug.showXMLHttpRequests && Firebug.Console.isEnabled(context))
            this.attachSpy(context, win);
    },

    unwatchWindow: function(context, win)
    {
        try {
            // This make sure that the existing context is properly removed from "contexts" array.
            this.detachSpy(context, win);
        } catch (ex) {
            // Get exceptions here sometimes, so let's just ignore them
            // since the window is going away anyhow
            ERROR(ex);
        }
    },

    updateOption: function(name, value)
    {
        if (name == "showXMLHttpRequests")  // XXXjjb Honza, if Console.isEnabled(context) false, then this can't be called, but somehow seems not correct
        {
            var tach = value ? this.attachSpy : this.detachSpy;
            for (var i = 0; i < TabWatcher.contexts.length; ++i)
            {
                var context = TabWatcher.contexts[i];
                iterateWindows(context.window, function(win)
                {
                    tach.apply(this, [context, win]);
                });
            }
        }
    },

    addListener: function(listener)
    {
        listeners.push(listener);
    },

    removeListener: function(listener)
    {
        remove(listeners, listener);
    }
});

// ************************************************************************************************

Firebug.Spy.XHR = domplate(Firebug.Rep,
{
    tag:
        DIV({class: "spyHead", _repObject: "$object"},
            TABLE({cellpadding: 0, cellspacing: 0},
                TBODY(
                    TR({class: "spyRow"},
                        TD({class: "spyCol", onclick: "$onToggleBody"},
                            DIV({class: "spyTitle"},
                                "$object|getCaption"
                            ),
                            DIV({class: "spyFullTitle spyTitle"},
                                "$object|getFullUri"
                            )
                        ),
                        TD({class: "spyCol"},
                            IMG({class: "spyIcon", src: "blank.gif"})
                        ),
                        TD({class: "spyCol"},
                            SPAN({class: "spyErrorCode"})
                        ),
                        TD({class: "spyCol"},
                            SPAN({class: "spyTime"})
                        ),
                        TD({class: "spyCol"},
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
        return spy.getURL();
    },

    onToggleBody: function(event)
    {
        var target = event.currentTarget;
        var logRow = getAncestorByClass(target, "logRow-spy");

        if (isLeftClick(event))
        {
            toggleClass(logRow, "opened");

            if (hasClass(logRow, "opened"))
            {
                var spy = getChildByClass(logRow, "spyHead").repObject;
                updateHttpSpyInfo(spy);
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

        var lines = text.split("\n");
        var params = parseURLEncodedText(lines[lines.length-1]);

        var args = [];
        for (var i = 0; i < params.length; ++i)
            args.push(escape(params[i].name)+"="+escape(params[i].value));

        var url = spy.getURL();
        url += (url.indexOf("?") == -1 ? "?" : "&") + args.join("&");
        copyToClipboard(url);
    },

    copyResponse: function(spy)
    {
        copyToClipboard(spy.xhrRequest.responseText);
    },

    openInTab: function(spy)
    {
        openNewTab(spy.getURL());
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    supportsObject: function(object)
    {
        return object instanceof XMLHttpRequestSpy;
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

top.XMLHttpRequestSpy = function(request, xhrRequest, context)
{
    this.request = request;
    this.xhrRequest = xhrRequest;
    this.context = context;
    this.responseText = null;
};

top.XMLHttpRequestSpy.prototype =
{
    attach: function()
    {
        var spy = this;
        this.onReadyStateChange = function(event) { onHTTPSpyReadyStateChange(spy, event); };
        this.onLoad = function() { onHTTPSpyLoad(spy); };
        this.onError = function() { onHTTPSpyError(spy); };

        this.onreadystatechange = this.xhrRequest.onreadystatechange;

        this.xhrRequest.onreadystatechange = this.onReadyStateChange;
        this.xhrRequest.addEventListener("load", this.onLoad, true);
        this.xhrRequest.addEventListener("error", this.onError, true);
    },

    detach: function()
    {
        this.xhrRequest.onreadystatechange = this.onreadystatechange;
        try { this.xhrRequest.removeEventListener("load", this.onLoad, true); } catch (e) {}
        try { this.xhrRequest.removeEventListener("error", this.onError, true); } catch (e) {}

        this.onreadystatechange = null;
        this.onLoad = null;
        this.onError = null;
    },

    getURL: function()
    {
        return this.xhrRequest.channel ? this.xhrRequest.channel.name : this.href;
    },
};

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

    spy = new XMLHttpRequestSpy(request, xhrRequest, context);
    context.spies.push(spy);

    var name = request.URI.asciiSpec;
    var origName = request.originalURI.asciiSpec;

    // Attach spy only to the original request. Notice that there
    // can be more network requests made by the same XHR if there
    // are redirects.
    if (name == origName)
      spy.attach();

    return spy;
}

// ************************************************************************************************

function requestStarted(request, xhrRequest, context, method, url)
{
    var spy = getSpyForXHR(request, xhrRequest, context);

    spy.method = method;
    spy.href = url;

    // Get "body" for POST and PUT requests. It will be displayed in
    // appropriate tab of the XHR.
    if (method == "POST" || method == "PUT")
        spy.postText = readPostTextFromRequest(request, context);

    spy.urlParams = parseURLParams(spy.href);
    spy.sourceLink = getStackSourceLink();

    if (!spy.requestHeaders)
        spy.requestHeaders = getRequestHeaders(spy);

    // If it's enabled log the request into the console tab.
    if (Firebug.showXMLHttpRequests && Firebug.Console.isEnabled(context))
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
      dispatch(listeners, "onStart", [context, spy]);

    if (FBTrace.DBG_NET)
        FBTrace.sysout("spy.requestStarted "+spy.href+"\n");

    // Remember the start time et the end, so it's most accurate.
    spy.sendTime = new Date().getTime();
}

function requestStopped(request, xhrRequest, context, method, url)
{
    var spy = getSpyForXHR(request, xhrRequest, context);

    spy.endTime = new Date().getTime();
    spy.responseTime = spy.endTime - spy.sendTime;

    spy.loaded = true;

    if (!spy.responseHeaders)
        spy.responseHeaders = getResponseHeaders(spy);

    if (FBTrace.DBG_NET)                                                                                                   /*@explore*/
        FBTrace.sysout("onHTTPSpyLoad responseTime=" + spy.responseTime                              /*@explore*/
            + " spy.responseText " + (spy.reponseText?spy.responseText.length:0) + " bytes\n");                      /*@explore*/

    if (spy.logRow)
    {
        updateLogRow(spy, spy.responseTime);
        updateHttpSpyInfo(spy);
    }

    if (spy.context.spies)
        remove(spy.context.spies, spy);

    if (!spy.statusText)
    {
        try
        {
          spy.statusCode = spy.xhrRequest.status;
          spy.statusText = spy.xhrRequest.statusText;
        }
        catch (exc)
        {
            if (FBTrace.DBG_NET) /*@explore*/
                FBTrace.dumpProperties("spy.requestStopped status access FAILED:", exc); /*@explore*/
        }
    }
}

function onHTTPSpyReadyStateChange(spy, event)
{
    try
    {
        spy.context.onReadySpy = spy; // maybe the handler will eval(), we want the URL.
        if (spy.onreadystatechange)
            spy.onreadystatechange.handleEvent(event);
    }
    catch (exc) { }
    finally
    {
        delete spy.context.onReadySpy;
    }

    if (spy.xhrRequest.readyState == 4)
    {
        onHTTPSpyLoad(spy);
    }
}

function onHTTPSpyLoad(spy)
{
    // If we were already detached, don't do this again
    if (!spy.onLoad)
        return;

    spy.loaded = true;

    // The main XHR object has to be dettached now (i.e. listeners removed).
    spy.detach();

    if (!spy.responseText)
        spy.responseText = spy.xhrRequest.responseText;

    var netProgress = spy.context.netProgress;
    if (netProgress)
        netProgress.post(netProgress.stopFile,
                [spy.request, spy.endTime, spy.postText, spy.responseText]);

    // If there are some pending spies (i.e. the onExamineResponse never came due to a cache),
    // simulate the requestStopped here.
    while (spy.context.spies && spy.context.spies.length)
    {
        var spy = spy.context.spies[0];
        requestStopped(spy.request, spy.xhrRequest, spy.context, spy.method, spy.href);
    }

    // Notify registered listeners about finish of the XHR.
    dispatch(listeners, "onLoad", [spy.context, spy]);
}

function onHTTPSpyError(spy)
{
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


function updateLogRow(spy, responseTime)
{
    var timeBox = getElementByClass(spy.logRow, "spyTime");
    if (responseTime)
      timeBox.textContent = " " + formatTime(responseTime);

    removeClass(spy.logRow, "loading");
    setClass(spy.logRow, "loaded");

    try
    {
        var errorRange = Math.floor(spy.xhrRequest.status/100);
        if (errorRange == 4 || errorRange == 5)
        {
            setClass(spy.logRow, "error");
            var errorBox = getElementByClass(spy.logRow, "spyErrorCode");
            errorBox.textContent = spy.xhrRequest.status;
        }
    }
    catch (exc) { }
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
        template.selectTabByName(netInfoBox, "Response");
    }
    else
        template.updateInfo(netInfoBox, spy, spy.context);
}

// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

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

Firebug.registerModule(Firebug.Spy);
Firebug.registerRep(Firebug.Spy.XHR);

// ************************************************************************************************

}});
