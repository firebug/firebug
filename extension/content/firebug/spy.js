/* See license.txt for terms of usage */

FBL.ns(function() { with (FBL) {

// ************************************************************************************************
// Constants

const nsIHttpChannel = CI("nsIHttpChannel");
const nsIUploadChannel = CI("nsIUploadChannel");
const nsIRequest = CI("nsIRequest")
const nsIXMLHttpRequest = CI("nsIXMLHttpRequest");
const nsIWebProgress = CI("nsIWebProgress");
const nsISeekableStream = CI("nsISeekableStream");

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
        request = QI(request, nsIHttpChannel);
        if ((topic == "http-on-modify-request") && (request.loadFlags & LOAD_BACKGROUND))
        {
            try
            {
                if (request.notificationCallbacks)
                {
                    var xhrRequest = request.notificationCallbacks.getInterface(nsIXMLHttpRequest);
                    if (xhrRequest)
                    {
                        var win = QI(request.loadGroup.groupObserver, nsIWebProgress).DOMWindow;
                        for( var i = 0; i < contexts.length; ++i )
                        {
                            if (contexts[i].win == win)
                            {
                                requestStarted(xhrRequest, contexts[i].context, request.requestMethod, request.URI.asciiSpec);
                                return;
                            }
                        }
                    }
                }
            }
            catch(exc)
            {
            }
        }
    }
};

var listeners = [];

// ************************************************************************************************

Firebug.Spy = extend(Firebug.Module,
{
    attachSpy: function(context, win)
    {
        if (win)
        {
            var uri = win.location.href; // don't attach spy to chrome
            if (uri &&  (uri.indexOf("about:") == 0 || uri.indexOf("chrome:") == 0))
                return;
            for( var i = 0; i < contexts.length; ++i )
            {
                if ( (contexts[i].context == context) && (contexts[i].win == win) )
                    return;
            }
            if ( contexts.length == 0 )
            {
                observerService.addObserver(httpObserver, "http-on-modify-request", false);
            }
            contexts.push({ context: context, win: win });
        }
    },

    detachSpy: function(context, win)
    {
        if (win)
        {
            for( var i = 0; i < contexts.length; ++i )
            {
                if ( (contexts[i].context == context) && (contexts[i].win == win) )
                {
                    contexts.splice(i, 1);
                    if ( contexts.length == 0 )
                    {
                        observerService.removeObserver(httpObserver, "http-on-modify-request", false);
                    }
                    return;
                }
            }
        }
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    // extends Module

    initContext: function(context)
    {
        context.spies = [];

        if (!Firebug.disableNetMonitor)
            this.attachSpy(context, context.window);
    },

    destroyContext: function(context)
    {
        // For any spies that are in progress, remove our listeners so that they don't leak
        for (var i in context.spies)
        {
            var spy = context.spies[i];
            spy.detach();
        }

        delete context.spies;
    },

    watchWindow: function(context, win)
    {
        if (!Firebug.disableNetMonitor)
            this.attachSpy(context, win);
    },

    unwatchWindow: function(context, win)
    {
        try {
            // this.detachSpy has to be called even if the Firebug.disableNetMonitor
            // is true. This make sure that the existing context is properly
            // removed from "contexts" array.
            this.detachSpy(context, win);
        } catch (ex) {
            // Get exceptions here sometimes, so let's just ignore them
            // since the window is going away anyhow
            ERROR(ex);
        }
    },

    updateOption: function(name, value)
    {
        if (name == "showXMLHttpRequests")
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
            A({class: "spyTitle", onclick: "$onToggleBody"},
                IMG({class: "spyIcon", src: "blank.gif"}),
                SPAN({class: "spyURI"}, "$object|getCaption"),
                SPAN({class: "spyErrorCode"}),
                SPAN({class: "spyTime"})
            ),
            TAG(FirebugReps.SourceLink.tag, {object: "$object.sourceLink"})
        ),

    getCaption: function(spy)
    {
        return spy.method.toUpperCase() + " " + this.getURL(spy);
    },

    getURL: function(spy)
    {
        return spy.request.channel ? spy.request.channel.name : spy.url;
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
        copyToClipboard(this.getURL(spy));
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

        var url = this.getURL(spy);
        url += (url.indexOf("?") == -1 ? "?" : "&") + args.join("&");
        copyToClipboard(url);
    },

    copyResponse: function(spy)
    {
        copyToClipboard(spy.request.responseText);
    },

    openInTab: function(spy)
    {
        openNewTab(this.getURL(spy));
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    supportsObject: function(object)
    {
        return object instanceof XMLHttpRequestSpy;
    },

    browseObject: function(spy, context)
    {
        // XXXjoe Need to combine this with window.location
        var url = spy.request.channel ? spy.request.channel.name : spy.url;
        openNewTab(url);
        return true;
    },

    getRealObject: function(spy, context)
    {
        return spy.request;
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

top.XMLHttpRequestSpy = function(request, context)
{
    this.request = request;
    this.context = context;
    this.responseText = null;
};

XMLHttpRequestSpy.prototype =
{
    attach: function()
    {
        var spy = this;
        this.onReadyStateChange = function(event) { onHTTPSpyReadyStateChange(spy, event); };
        this.onLoad = function() { onHTTPSpyLoad(spy); };
        this.onError = function() { onHTTPSpyError(spy); };

        this.onreadystatechange = this.request.onreadystatechange;

        this.request.onreadystatechange = this.onReadyStateChange;
        this.request.addEventListener("load", this.onLoad, true);
        this.request.addEventListener("error", this.onError, true);
    },

    detach: function()
    {
        this.request.onreadystatechange = this.onreadystatechange;
        try { this.request.removeEventListener("load", this.onLoad, true); } catch (e) {}
        try { this.request.removeEventListener("error", this.onError, true); } catch (e) {}

        this.onreadystatechange = null;
        this.onLoad = null;
        this.onError = null;
    }
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

function requestStarted(request, context, method, url)
{
    var spy = new XMLHttpRequestSpy(request, context);
    context.spies.push(spy);

    spy.method = method;
    spy.url = url;

    if ( method == "POST" )
        spy.postText = getPostText(request, context);

    spy.urlParams = parseURLParams(spy.url);
    spy.sourceLink = getStackSourceLink();

    if (!spy.requestHeaders)
        spy.requestHeaders = getRequestHeaders(spy);

    dispatch(listeners,"onStart",[context, spy]);

    if (Firebug.showXMLHttpRequests)
    {
        spy.logRow = Firebug.Console.log(spy, spy.context, "spy", null, true);
        setClass(spy.logRow, "loading");
    }

    spy.attach();
    spy.sendTime = new Date().getTime();
}

function onHTTPSpyReadyStateChange(spy, event)
{
    try
    {
        if (spy.onreadystatechange)
            spy.onreadystatechange.handleEvent(event);
    }
    catch (exc)
    {
    }

    if (spy.request.readyState == 4)
    {
        onHTTPSpyLoad(spy);
        if (!spy.responseHeaders)
            spy.responseHeaders = getResponseHeaders(spy);
        if (!spy.statusText)
        {
            spy.statusCode = spy.request.status;
            spy.statusText = spy.request.statusText;
        }
        dispatch(listeners,"onLoad",[spy.context, spy]);
    }
}

function onHTTPSpyLoad(spy)
{
    // If we were already detached, don't do this again
    if (!spy.onLoad)
        return;

    var now = new Date().getTime();
    var responseTime = now - spy.sendTime;

    spy.loaded = true;

    if (!spy.responseText)
        spy.responseText = spy.request.responseText;

    var netProgress = spy.context.netProgress;
    if (netProgress)
        netProgress.post(netProgress.stopFile,
                [spy.request.channel, now, spy.postText, spy.responseText]);

    if (FBL.DBG_NET)                                                                                                   /*@explore*/
        FBL.sysout("onHTTPSpyLoad netProgress:"+netProgress+" responseTime="+responseTime                              /*@explore*/
                                       +" spy.responseText "+spy.responseText.length +"bytes\n");                      /*@explore*/

    if (spy.logRow)
    {
        updateLogRow(spy, responseTime);
        updateHttpSpyInfo(spy);
    }

    spy.detach();

    if (spy.context.spies)
        remove(spy.context.spies, spy);
}

function onHTTPSpyError(spy)
{
    var now = new Date().getTime();

    var netProgress = spy.context.netProgress;
    if (netProgress)
        netProgress.post(netProgress.stopFile, [spy.request.channel, now]);

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
    var timeBox = spy.logRow.firstChild.firstChild.lastChild;
    timeBox.textContent = " " + $STRF("SpyResponseTime", [responseTime]);

    removeClass(spy.logRow, "loading");
    setClass(spy.logRow, "loaded");

    try
    {
        var errorRange = Math.floor(spy.request.status/100);
        if (errorRange == 4 || errorRange == 5)
        {
            setClass(spy.logRow, "error");
            var errorBox = spy.logRow.firstChild.firstChild.childNodes[2];
            errorBox.textContent = spy.request.status;
        }
    }
    catch (exc) {}
}

function updateHttpSpyInfo(spy)
{
    if (!spy.logRow || !hasClass(spy.logRow, "opened"))
        return;

    var template = Firebug.NetMonitor.NetInfoBody;

    if (!spy.params)
        spy.params = parseURLParams(spy.url+"");

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

    if (spy.request.channel instanceof nsIHttpChannel)
    {
        var http = QI(spy.request.channel, nsIHttpChannel);
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
        if (spy.request.channel instanceof nsIHttpChannel)
        {
            var http = QI(spy.request.channel, nsIHttpChannel);
            http.visitResponseHeaders({
                visitHeader: function(name, value)
                {
                    headers.push({name: name, value: value});
                }
            });
        }
    }
    catch (exc)
    {

    }

    return headers;
}

function getPostText(request, context)
{
    try
    {
        var is = QI(request.channel, nsIUploadChannel).uploadStream;
        if (is)
        {
            var charset = context.window.document.characterSet;
            var text = readFromStream(is, charset);
            var ss = QI(is, nsISeekableStream);
            if ( ss )
                ss.seek(NS_SEEK_SET, 0);
            return text;
        }
    }
    catch(exc)
    {
    }
}

// ************************************************************************************************

Firebug.registerModule(Firebug.Spy);
Firebug.registerRep(Firebug.Spy.XHR);

// ************************************************************************************************

}});
