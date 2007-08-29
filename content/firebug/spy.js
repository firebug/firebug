/* See license.txt for terms of usage */
 
FBL.ns(function() { with (FBL) {

// ************************************************************************************************
// Constants

const nsIHttpChannel = CI("nsIHttpChannel");

// ************************************************************************************************

Firebug.Spy = extend(Firebug.Module,
{
    attachSpy: function(context, win)
    {
        if (win && win.XMLHttpRequest && !win.XMLHttpRequest.wrapped)
        {
            insertSafeWrapper(win, context);
     
            // Don't attach to XML documents - there are bugs in Firefox's XML document
            // implementation that prevent the spy from working correctly
            // XXXjoe ... or not.
            //if (win.document && win.document.xmlVersion)
                //return;

            win.XMLHttpRequest.wrapped =
            {
                open: win.XMLHttpRequest.prototype.open,
                send: win.XMLHttpRequest.prototype.send,
                load: win.XMLDocument.prototype.load
            };            

            win.XMLHttpRequest.prototype.open = function(method, url, async, username, password)
            {
                if (typeof(async) == "undefined")
                    async = false; 

                httpOpenWrapper(this, context, win, method, url, async, username, password);
            };
        }
    },
    
    detachSpy: function(context, win)
    {
        if (win && win.XMLHttpRequest && win.XMLHttpRequest.wrapped)
        {
            win.XMLHttpRequest.prototype.open = win.XMLHttpRequest.wrapped.open;
            win.XMLDocument.prototype.load = win.XMLHttpRequest.wrapped.load;

            delete win.XMLHttpRequest.wrapped;
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
            if (!Firebug.disableNetMonitor)
                this.detachSpy(context, win);
        } catch (ex) {
            // Get exceptions here sometimes, so let's just ignore them
            // since the window is going away anyhow
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

top.XMLHttpRequestSpy = function(request, context, win)
{
    this.request = request;
    this.context = context;
    this.win = win;
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

// ************************************************************************************************

function httpOpenWrapper(request, context, win, method, url, async, username, password)
{
    // Usually the wrapper is there already, except in rare cases
    insertSafeWrapper(win, context);
    
    var spy = new XMLHttpRequestSpy(request, context, win);
    context.spies.push(spy);

    spy.method = typeof(method) == "string" ? method : "GET";
    spy.url = url+"";
    spy.async = async;
    spy.username = username;
    spy.password = password;
    
    spy.send = request.send;
    request.send = function(text) { httpSendWrapper(spy, text); };

    request.__open = win.XMLHttpRequest.wrapped.open;
    if (win.__firebug__)
        win.__firebug__.open(request, method, url, async, username, password);
}

function httpSendWrapper(spy, text)
{
    spy.postText = text;
    spy.urlParams = parseURLParams(spy.url);
    spy.sourceLink = getStackSourceLink();            

    if (Firebug.showXMLHttpRequests)
    {
        spy.logRow = Firebug.Console.log(spy, spy.context, "spy", null, true);
        setClass(spy.logRow, "loading");
    }
    
    spy.attach();
    spy.sendTime = new Date().getTime();

    // Remember this locally because onLoad will be called after send, which detaches it
    var onreadystatechange = spy.onreadystatechange;

    spy.request.send = spy.win.XMLHttpRequest.wrapped.send;
    if (spy.win.__firebug__)
        spy.win.__firebug__.send(spy.request, text);

    var netProgress = spy.context.netProgress;
    if (netProgress)
        netProgress.post(netProgress.requestedFile,
                [spy.request.channel, spy.sendTime, null, "xhr"]);

    // Synchronous calls should call onreadystatechange themselves, but they don't,
    // so we have to do it ourselves here
    if (!spy.async && onreadystatechange)
    {
        try
        {
            onreadystatechange.handleEvent();
        }
        catch (exc)
        {
        }
    }
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
        onHTTPSpyLoad(spy);
}

function onHTTPSpyLoad(spy)
{
    // If we were already detached, don't do this again
    if (!spy.onLoad)
        return;

    var now = new Date().getTime();
    var responseTime = new Date().getTime() - spy.sendTime;

    spy.loaded = true;

    if (!spy.responseText)
        spy.responseText = spy.request.responseText;

    var netProgress = spy.context.netProgress;
    if (netProgress)
        netProgress.post(netProgress.stopFile,
                [spy.request.channel, now, spy.postText, spy.responseText]);

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

// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * 

function insertSafeWrapper(win, context)
{
    // For security purposes we can't call open() directly, we have to insert the 
    // calling code into the page so that the page's own security credentials are
    // assigned
    evalSafeScript(win, context,
        "var __firebug__ = { " + 
        "open: function(req, m, u, s, us, p) { req.__open(m, u, s, us, p); delete req.__open; }, " + 
        "send: function(req, text) { req.send(text); }" + 
        "};"
    );
}

function evalSafeScript(win, context, text)
{    
    win.__firebugTemp__ = text;
    win.location = "javascript: eval(__firebugTemp__);";
    delete win.__firebugTemp__;
}

// ************************************************************************************************

Firebug.registerModule(Firebug.Spy);
Firebug.registerRep(Firebug.Spy.XHR);

// ************************************************************************************************
    
}});
