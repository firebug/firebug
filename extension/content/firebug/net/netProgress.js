/* See license.txt for terms of usage */

define([
    "firebug/lib/object",
    "firebug/firebug",
    "firebug/lib/locale",
    "firebug/lib/events",
    "firebug/lib/url",
    "firebug/debugger/script/sourceLink",
    "firebug/lib/http",
    "firebug/lib/css",
    "firebug/chrome/window",
    "firebug/lib/string",
    "firebug/lib/array",
    "firebug/lib/system",
    "firebug/net/netUtils"
],
function(Obj, Firebug, Locale, Events, Url, SourceLink, Http, Css, Win, Str,
    Arr, System, NetUtils) {

// ********************************************************************************************* //
// Constants

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;

// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

const reIgnore = /about:|javascript:|resource:|chrome:|jar:/;
const reResponseStatus = /HTTP\/1\.\d\s(\d+)\s(.*)/;

var panelName = "net";

// ********************************************************************************************* //
// Net Progress

function NetProgress(context)
{
    if (FBTrace.DBG_NET)
        FBTrace.sysout("net.NetProgress.constructor; " +
            (context ? context.getName() : "NULL Context"));

    this.context = context;

    var panel = null;
    var queue = [];

    this.post = function(handler, args)
    {
        if (panel)
        {
            var file = handler.apply(this, args);
            if (file)
            {
                panel.updateFile(file);

                // If the panel isn't currently visible, make sure the limit is up to date.
                if (!panel.layoutInterval)
                    panel.updateLogLimit(Firebug.NetMonitor.maxQueueRequests);

                return file;
            }
        }
        else
        {
            // The first page request is made before the initContext (known problem).
            queue.push(handler, args);
        }
    };

    this.flush = function()
    {
        for (var i=0; i<queue.length; i+=2)
            this.post(queue[i], queue[i+1]);

        queue = [];
    };

    this.activate = function(activePanel)
    {
        this.panel = panel = activePanel;
        if (panel)
            this.flush();
    };

    this.update = function(file)
    {
        if (panel)
            panel.updateFile(file);
    };

    this.clear = function()
    {
        for (var i=0; this.files && i<this.files.length; i++)
            this.files[i].clear();

        this.requests = [];
        this.files = [];
        this.phases = [];
        this.documents = [];
        this.windows = [];
        this.currentPhase = null;

        queue = [];
    };

    this.clear();
}

NetProgress.prototype =
{
    dispatchName: "netProgress",
    panel: null,

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    requestNumber: 1,

    openingFile: function openingFile(request, win)
    {
        var file = this.getRequestFile(request, win);
        if (file)
        {
            // Parse URL params so, they are available for conditional breakpoints.
            file.urlParams = Url.parseURLParams(file.href);
            this.breakOnXHR(file);
        }
    },

    startFile: function startFile(request, win)
    {
        // Called asynchronously since Fx17, so can't be used for Break on XHR,
        // since JS stack is not available at the moment.
        // See https://bugzilla.mozilla.org/show_bug.cgi?id=800799
    },

    requestedHeaderFile: function requestedHeaderFile(request, time, win, xhr, extraStringData)
    {
        var file = this.getRequestFile(request);
        if (file)
        {
            logTime(file, "requestedHeaderFile", time);

            file.requestHeadersText = extraStringData;

            this.requestedFile(request, time, win, xhr);

            Events.dispatch(Firebug.NetMonitor.fbListeners, "onRequest", [this.context, file]);
        }
    },

    // Can be called from onModifyRequest (to catch request start even in case of BF cache) and also
    // from requestHeaderFile (activity observer)
    requestedFile: function requestedFile(request, time, win, xhr)
    {
        var file = this.getRequestFile(request, win);
        if (file)
        {
            logTime(file, "requestedFile", time);

            if (FBTrace.DBG_NET_EVENTS)
                FBTrace.sysout("net.events.requestedFile +0 " + getPrintableTime() + ", " +
                    request.URI.path, file);

            // For cached image files, we may never hear another peep from any observers
            // after this point, so we have to assume that the file is cached and loaded
            // until we get a respondedFile call later
            file.startTime = file.endTime = time;
            file.resolvingTime = time;
            file.connectingTime = time;
            file.connectedTime = time;
            file.sendingTime = time;
            file.waitingForTime = time;
            file.respondedTime = time;
            file.isXHR = xhr;
            file.isBackground = request.loadFlags & Ci.nsIRequest.LOAD_BACKGROUND;
            file.method = request.requestMethod;

            if (!Ci.nsIHttpActivityDistributor)
                NetUtils.getPostText(file, this.context);

            this.extendPhase(file);

            return file;
        }
        else
        {
            if (FBTrace.DBG_NET)
                FBTrace.sysout("net.requestedFile no file for request=");
        }
    },

    breakOnXHR: function breakOnXHR(file)
    {
        var halt = false;
        var conditionIsFalse = false;

        // If there is an enabled breakpoint with condition:
        // 1) break if the condition is evaluated to true.
        var breakpoints = this.context.netProgress.breakpoints;
        var bp = breakpoints ? breakpoints.findBreakpoint(file.getFileURL()) : null;
        if (bp && bp.checked)
        {
            halt = true;
            if (bp.condition)
            {
                halt = bp.evaluateCondition(this.context, file);
                conditionIsFalse = !halt;
            }
        }

        // 2) If break on XHR flag is set and there is no condition evaluated to false,
        // break with "break on next" breaking cause (this new breaking cause can override
        // an existing one that is set when evaluating a breakpoint condition).
        if (this.context.breakOnXHR && !conditionIsFalse)
        {
            this.context.breakingCause = {
                title: Locale.$STR("net.Break On XHR"),
                message: Str.cropString(file.href, 200),
                copyAction: Obj.bindFixed(System.copyToClipboard, System, file.href)
            };

            halt = true;
        }

        // Ignore if there is no reason to break.
        if (!halt)
            return;

        // Even if the execution was stopped at breakpoint reset the global
        // breakOnXHR flag.
        this.context.breakOnXHR = false;

        Firebug.Breakpoint.breakNow(this.context.getPanel(panelName, true));
    },

    respondedHeaderFile: function respondedHeaderFile(request, time, extraStringData)
    {
        var file = this.getRequestFile(request);
        if (file)
        {
            logTime(file, "respondedHeaderFile", time);

            file.responseHeadersText = extraStringData;
        }
    },

    bodySentFile: function bodySentFile(request, time)
    {
        var file = this.getRequestFile(request);
        if (file)
        {
            logTime(file, "bodySentFile", time);

            NetUtils.getPostText(file, this.context);
        }
    },

    responseStartedFile: function responseStartedFile(request, time)
    {
        var file = this.getRequestFile(request);
        if (file)
        {
            logTime(file, "responseStartedFile", time);

            if (!file.responseStarted)
            {
                file.respondedTime = time;
                file.responseStarted = true;
            }

            file.endTime = time;
            return file;
        }
    },

    respondedFile: function respondedFile(request, time, info)
    {
        Events.dispatch(Firebug.NetMonitor.fbListeners, "onExamineResponse", [this.context, request]);

        var file = this.getRequestFile(request);
        if (file)
        {
            logTime(file, "respondedFile", time);

            if (!Ci.nsIHttpActivityDistributor)
            {
                file.respondedTime = time;
                file.endTime = time;

                if (request.contentLength >= 0)
                    file.size = request.contentLength;
            }

            if (info)
            {
                if (info.responseStatus == 304)
                    file.fromCache = true;
                else if (!file.fromCache)
                    file.fromCache = false;
            }

            // respondedFile can be executed asynchronously and getting headers now
            // could be too late. They could be already replaced by cached headers.
            if (info.responseHeaders)
                file.responseHeaders = info.responseHeaders;

            // Get also request headers (and perhaps also responseHeaders, they won't be
            // replaced if already available).
            NetUtils.getHttpHeaders(request, file, this.context);

            if (info)
            {
                file.responseStatus = info.responseStatus;
                file.responseStatusText = info.responseStatusText;
                file.postText = info.postText;
            }

            file.aborted = false;

            // Use ACTIVITY_SUBTYPE_RESPONSE_COMPLETE to get the info if possible.
            if (!Ci.nsIHttpActivityDistributor)
            {
                if (file.fromCache)
                    getCacheEntry(file, this);
            }

            if (FBTrace.DBG_NET_EVENTS)
                FBTrace.sysout("net.events.respondedFile +" + (NetUtils.now() - file.startTime) + " " +
                     getPrintableTime() + ", " + request.URI.path, file);

            // The ACTIVITY_SUBTYPE_TRANSACTION_CLOSE could come earlier.
            if (file.loaded)
                return;

            this.endLoad(file);

            // If there is a network error, log it into the Console panel.
            if (Firebug.showNetworkErrors && Firebug.NetMonitor.NetRequestEntry.isError(file))
            {
                Firebug.Errors.increaseCount(this.context);
                var message = "NetworkError: " + Firebug.NetMonitor.NetRequestEntry.getStatus(file) + " - "+file.href;
                Firebug.Console.log(message, this.context, "error", null, true, file.getFileLink(message));
            }

            Events.dispatch(Firebug.NetMonitor.fbListeners, "onResponse", [this.context, file]);
            return file;
        }
    },

    respondedCacheFile: function respondedCacheFile(request, time, info)
    {
        Events.dispatch(Firebug.NetMonitor.fbListeners, "onExamineCachedResponse",
            [this.context, request]);

        var file = this.getRequestFile(request, null, true);
        if (file)
        {
            logTime(file, "respondedCacheFile", time);

            if (FBTrace.DBG_NET_EVENTS)
                FBTrace.sysout("net.events.respondedCacheFile +" + (NetUtils.now() - file.startTime) + " " +
                     getPrintableTime() + ", " + request.URI.path, file);

            // on-examine-cache-response is using different timer, do not track response
            // times from the cache and use the proper waiting time.
            if (file.waitingStarted)
                time = file.waitingForTime;

            if (!file.responseStarted)
            {
                file.respondedTime = time;
                file.responseStarted = true;
            }

            file.endTime = time;
            file.fromBFCache = true;
            file.fromCache = true;
            file.aborted = false;

            try
            {
                if (request instanceof Ci.nsIApplicationCacheChannel)
                {
                    if (request.loadedFromApplicationCache)
                        file.fromAppCache = true;
                }
            }
            catch (e)
            {
                if (FBTrace.DBG_ERRORS)
                    FBTrace.sysout("net.respondedCacheFile ERROR " + e, e);
            }

            if (request.contentLength >= 0)
                file.size = request.contentLength;

            NetUtils.getHttpHeaders(request, file, this.context);

            if (info)
            {
                file.responseStatus = info.responseStatus;
                file.responseStatusText = info.responseStatusText;
                file.postText = info.postText;
            }

            getCacheEntry(file, this);

            this.endLoad(file);

            Events.dispatch(Firebug.NetMonitor.fbListeners, "onCachedResponse",
                [this.context, file]);

            return file;
        }
        else
        {
            if (FBTrace.DBG_NET)
                FBTrace.sysout("net.respondedCacheFile; NO FILE FOR " +
                    Http.safeGetRequestName(request));
        }
    },

    waitingForFile: function waitingForFile(request, time)
    {
        var file = this.getRequestFile(request, null, true);
        if (file)
        {
            logTime(file, "waitingForFile", time);

            if (!file.waitingStarted)
            {
                file.waitingForTime = time;
                file.waitingStarted = true;
            }
        }

        // Don't update the UI now (optimization).
        return null;
    },

    sendingFile: function sendingFile(request, time, size)
    {
        var file = this.getRequestFile(request, null, true);
        if (file)
        {
            logTime(file, "sendingFile", time);

            // Remember when the send started.
            if (!file.sendStarted)
            {
                file.sendingTime = time;
                file.waitingForTime = time; // in case waiting-for would never came.
                file.sendStarted = true;
            }

            // Catch 2.
            // It can happen that "connected" event sometimes comes after sending,
            // which doesn't make much sense (Firefox bug?)
            if (!file.connected)
            {
                file.connected = true;
                file.connectedTime = time;
            }

            file.totalSent = size;

            // Catch 1.
            // Request is sending so reset following flags. There are cases where
            // RESPONSE_COMPLETE and TRANSACTION_CLOSE came in the middle of
            // connetion initialization (resolving, connecting, connected).
            file.loaded = false;
            file.responseStarted = false;

            if (FBTrace.DBG_NET_EVENTS)
                FBTrace.sysout("net.events.sendingFile +" + (NetUtils.now() - file.startTime) + " " +
                     getPrintableTime() + ", " + request.URI.path, file);
        }

        // Don't update the UI now (optimization).
        return null;
    },

    connectingFile: function connectingFile(request, time)
    {
        var file = this.getRequestFile(request, null, true);

        logTime(file, "connectingFile", time);

        // Resolving, connecting and connected can come after the file is loaded
        // (closedFile received). This happens if the response is coming from the
        // cache. Just ignore it.
        if (file && file.loaded)
            return null;

        if (file && !file.connectStarted)
        {
            file.connectStarted = true;
            file.connectingTime = time;
            file.connectedTime = time; // in case connected-to would never came.
            file.sendingTime = time;  // in case sending-to would never came.
            file.waitingForTime = time; // in case waiting-for would never came.
        }

        // Don't update the UI now (optimization).
        return null;
    },

    connectedFile: function connectedFile(request, time)
    {
        var file = this.getRequestFile(request, null, true);

        logTime(file, "connectedFile", time);

        if (file && file.loaded)
            return null;

        if (file && !file.connected)
        {
            file.connected = true;
            file.connectedTime = time;
            file.sendingTime = time;  // in case sending-to would never came.
            file.waitingForTime = time; // in case waiting-for would never came.
        }

        // Don't update the UI now (optimization).
        return null;
    },

    receivingFile: function receivingFile(request, time, size)
    {
        var file = this.getRequestFile(request, null, true);
        if (file)
        {
            logTime(file, "receivingFile", time);

            if (FBTrace.DBG_NET_EVENTS)
                FBTrace.sysout("net.events.receivingFile +" + time + " " +
                    getPrintableTime() + ", " +
                    Str.formatSize(size) + " (" + size + "B), " +
                    request.URI.path, file);

            file.endTime = time;
            file.totalReceived = size;

            // Update phase's lastFinishedFile in case of long time downloads.
            // This forces the timeline to have proper extent.
            if (file.phase && file.phase.endTime < time)
                file.phase.lastFinishedFile = file;

            // Force update UI.
            if (file.row && Css.hasClass(file.row, "opened"))
            {
                var netInfoBox = file.row.nextSibling.getElementsByClassName("netInfoBody").item(0);
                if (netInfoBox)
                {
                    netInfoBox.responsePresented = false;
                    netInfoBox.htmlPresented = false;
                }
            }
        }

        return file;
    },

    responseCompletedFile: function responseCompletedFile(request, time, responseSize)
    {
        var file = this.getRequestFile(request, null, true);
        if (file)
        {
            logTime(file, "responseCompletedFile", time);

            if (FBTrace.DBG_NET_EVENTS)
                FBTrace.sysout("net.events.responseCompletedFile +" + time + " " +
                    getPrintableTime() + ", " + request.URI.path, file);

            if (responseSize >= 0)
                file.size = responseSize;

            // This was only a helper to show download progress.
            file.totalReceived = 0;

            // The request is completed, get cache entry.
            getCacheEntry(file, this);

            // Sometimes the HTTP-ON-EXAMINE-RESPONSE doesn't come.
            if (!file.loaded  && file.responseHeadersText)
            {
                var info = null;
                var m = file.responseHeadersText.match(reResponseStatus);
                if (m.length == 3)
                    info = {responseStatus: m[1], responseStatusText: m[2]};
                this.respondedFile(request, NetUtils.now(), info);
            }

            this.updateIPInfo(request, file);
        }

        return file;
    },

    closedFile: function closedFile(request, time)
    {
        var file = this.getRequestFile(request, null, true);
        if (file)
        {
            logTime(file, "closedFile", time);

            if (FBTrace.DBG_NET_EVENTS)
                FBTrace.sysout("net.events.closedFile +" + time + " " +
                    getPrintableTime() + ", " + request.URI.path);

            // If the response never came, stop the loading and set time info.
            // In this case the request is marked with "Timeout" and the
            // respondedTime is set to the time when ACTIVITY_SUBTYPE_TRANSACTION_CLOSE
            // is received (after timeout).
            // If file.responseHeadersText is null the response didn't come.
            if (!file.loaded && !file.responseHeadersText)
            {
                if (FBTrace.DBG_NET_EVENTS)
                    FBTrace.sysout("net.events; TIMEOUT " + Http.safeGetRequestName(request));

                this.endLoad(file);

                file.aborted = true;
                if (!file.responseStatusText)
                    file.responseStatusText = "Aborted";

                if (!file.responseStarted)
                {
                    file.respondedTime = time;
                    file.responseStarted = true;
                }

                file.endTime = time;
            }
        }

        return file;
    },

    resolvingFile: function resolvingFile(request, time)
    {
        var file = this.getRequestFile(request, null, true);

        if (file)
            logTime(file, "resolvingFile", time);

        if (file && file.loaded)
            return null;

        if (file && !file.resolveStarted)
        {
            file.resolveStarted = true;
            file.resolvingTime = time;
            file.connectingTime = time; // in case connecting would never came.
            file.connectedTime = time; // in case connected-to would never came.
            file.sendingTime = time;  // in case sending-to would never came.
            file.waitingForTime = time; // in case waiting-for would never came.
        }

        return file;
    },

    resolvedFile: function resolvedFile(request, time)
    {
        return null;
    },

    stopFile: function stopFile(request, time, postText, responseText)
    {
        var file = this.getRequestFile(request, null, true);
        if (file)
        {

            logTime(file, "stopFile", time);

            if (FBTrace.DBG_NET_EVENTS)
                FBTrace.sysout("net.stopFile +" + (NetUtils.now() - file.startTime) + " " +
                    getPrintableTime() + ", " + request.URI.path, file);

            // xxxHonza: spy should measure time using the activity observer too.
            // Don't ruin the endTime if it was already set.
            if (file.endTime == file.startTime)
                file.endTime = time;

            file.postText = postText;
            file.responseText = responseText;

            NetUtils.getHttpHeaders(request, file, this.context);

            this.endLoad(file);

            getCacheEntry(file, this);
        }

        return file;
    },

    abortFile: function abortFile(request, time, postText, responseText)
    {
        var file = this.getRequestFile(request, null, true);
        if (file)
        {
            logTime(file, "abortFile", time);

            file.aborted = true;
            file.responseStatusText = "Aborted";
        }

        return this.stopFile(request, time, postText, responseText);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // IP Address and port number

    updateIPInfo: function(request, file)
    {
        file.localAddress = Http.safeGetLocalAddress(request);
        file.localPort = Http.safeGetLocalPort(request);
        file.remoteAddress = Http.safeGetRemoteAddress(request);
        file.remotePort = Http.safeGetRemotePort(request);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    windowPaint: function windowPaint(window, time)
    {
        if (FBTrace.DBG_NET)
            FBTrace.sysout("net.windowPaint +? " + getPrintableTime() + ", " +
                window.location.href, this.phases);

        if (!this.phases.length)
            return;

        var phase = this.context.netProgress.currentPhase;
        var timeStamp = phase.addTimeStamp("MozAfterPaint", "netPaintBar");
        timeStamp.time = time;

        // Return the first file, so the layout is updated. I can happen that the
        // onLoad event is the last one and the graph end-time must be recalculated.
        return phase.files[0];
    },

    timeStamp: function timeStamp(window, time, label)
    {
        if (FBTrace.DBG_NET)
            FBTrace.sysout("net.timeStamp +? " + getPrintableTime() + ", " +
                window.location.href, this.phases);

        if (!this.phases.length)
            return;

        var phase = this.context.netProgress.currentPhase;
        var timeStamp = phase.addTimeStamp(label, "netTimeStampBar");
        timeStamp.time = time;

        return phase.files[0];
    },

    windowLoad: function windowLoad(window, time)
    {
        if (FBTrace.DBG_NET_EVENTS)
            FBTrace.sysout("net.windowLoad +? " + getPrintableTime() + ", " +
                window.location.href, this.phases);

        if (!this.phases.length)
            return;

        // Update all requests that belong to the first phase.
        var firstPhase = this.phases[0];

        // Keep the information also in the phase for now, NetExport and other could need it.
        firstPhase.windowLoadTime = time;

        var timeStamp = firstPhase.addTimeStamp("load", "netWindowLoadBar");
        timeStamp.time = time;

        // Return the first file, so the layout is updated. I can happen that the
        // onLoad event is the last one and the graph end-time must be recalculated.
        return firstPhase.files[0];
    },

    contentLoad: function contentLoad(window, time)
    {
        if (FBTrace.DBG_NET_EVENTS)
            FBTrace.sysout("net.contentLoad +? " + getPrintableTime() + ", " +
                window.location.href);

        if (!this.phases.length)
            return;

        // Update all requests that belong to the first phase.
        var firstPhase = this.phases[0];

        // Keep the information also in the phase for now, NetExport and other could need it.
        firstPhase.contentLoadTime = time;

        var timeStamp = firstPhase.addTimeStamp("DOMContentLoaded", "netContentLoadBar");
        timeStamp.time = time;

        return null;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    getRequestFile: function getRequestFile(request, win, noCreate)
    {
        var name = Http.safeGetRequestName(request);
        if (!name || reIgnore.exec(name))
            return null;

        for (var i=0; i<this.files.length; i++)
        {
            var file = this.files[i];
            if (file.request == request)
                return file;
        }

        if (noCreate)
            return null;

        if (!win || Win.getRootWindow(win) != this.context.window)
            return;

        var fileDoc = this.getRequestDocument(win);
        var isDocument = request.loadFlags & Ci.nsIChannel.LOAD_DOCUMENT_URI && fileDoc.parent;
        var doc = isDocument ? fileDoc.parent : fileDoc;

        var file = doc.createFile(request);
        if (isDocument)
        {
            fileDoc.documentFile = file;
            file.ownDocument = fileDoc;
        }

        file.request = request;
        file.requestNumber = this.requestNumber;
        this.requestNumber++;
        this.requests.push(request);
        this.files.push(file);

        if (FBTrace.DBG_NET_EVENTS)
            FBTrace.sysout("net.createFile; " + Http.safeGetRequestName(request) +
                "(" + this.files.length + ")");

        return file;
    },

    getRequestDocument: function(win)
    {
        if (win)
        {
            var index = this.windows.indexOf(win);
            if (index == -1)
            {
                var doc = new NetDocument();
                if (win.parent != win)
                    doc.parent = this.getRequestDocument(win.parent);

                //doc.level = NetUtils.getFrameLevel(win);

                this.documents.push(doc);
                this.windows.push(win);

                return doc;
            }
            else
                return this.documents[index];
        }
        else
            return this.documents[0];
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    endLoad: function(file)
    {
        if (FBTrace.DBG_NET_EVENTS)
            FBTrace.sysout("net.events.endLoad +" + (NetUtils.now() - file.startTime) + " " +
                getPrintableTime() + ", " + file.request.URI.path, file);

        // Set file as loaded.
        file.loaded = true;

        // Update last finished file of the associated phase.
        //xxxHonza: verify this.
        if (file.phase)
            file.phase.lastFinishedFile = file;
    },

    extendPhase: function(file)
    {
        // Phase start can be measured since HTTP-ON-MODIFIED-REQUEST as
        // ACTIVITY_SUBTYPE_REQUEST_HEADER won't fire if the response comes from the BF cache.
        // If it's real HTTP request we need to start again since ACTIVITY_SUBTYPE_REQUEST_HEADER
        // has the proper time.
        // Order of ACTIVITY_SUBTYPE_REQUEST_HEADER can be different than order of
        // HTTP-ON-MODIFIED-REQUEST events, see issue 4535
        if (file.phase)
        {
            if (file.phase.files[0] == file)
                file.phase.startTime = file.startTime;

            // Since the request order can be wrong (see above) we need to iterate all files
            // in this phase and find the one that actually executed first.
            // In some cases, the waterfall can display a request executed before another,
            // but started later.
            // See: https://bugzilla.mozilla.org/show_bug.cgi?id=664781
            var phase = file.phase;
            for (var i=0; i<phase.files.length; i++)
            {
                var file = phase.files[i];
                if (file.startTime > 0 && phase.startTime > file.startTime)
                    phase.startTime = file.startTime;
            }
            return;
        }

        if (this.currentPhase)
        {
            // If the new request has been started within a "phaseInterval" after the
            // previous reqeust has been started, associate it with the current phase;
            // otherwise create a new phase.
            var phaseInterval = Firebug.netPhaseInterval;
            var lastStartTime = this.currentPhase.lastStartTime;
            if (phaseInterval > 0 && this.loaded && file.startTime - lastStartTime >= phaseInterval)
                this.startPhase(file);
            else
                this.currentPhase.addFile(file);
        }
        else
        {
            // If there is no phase yet, just create it.
            this.startPhase(file);
        }
    },

    startPhase: function(file)
    {
        var phase = new NetPhase(file);
        phase.initial = !this.currentPhase;

        file.breakLayout = true;

        this.currentPhase = phase;
        this.phases.push(phase);
    },
};

// ********************************************************************************************* //
// Time Logging

function logTime(file, title, time)
{
    // xxxHonza: just for debugging purposes.
    return;

    if (!file._timings)
        file._timings = {counter: 0};

    if (!file._timings.logs)
        file._timings.logs = [];

    file._timings.logs.push({
        title: title,
        index: ++file._timings.counter,
        time: time
    });
}

// ********************************************************************************************* //

/**
 * A Document is a helper object that represents a document (window) on the page.
 * This object is created for main page document and for every embedded document (iframe)
 * for which a request is made.
 */
function NetDocument()
{
    this.id = 0;
    this.title = "";
}

NetDocument.prototype =
{
    createFile: function(request)
    {
        return new NetFile(request.name, this);
    }
};

// ********************************************************************************************* //

/**
 * A File is a helper object that represents a file for which a request is made.
 * The document refers to it's parent document (NetDocument) through a member
 * variable.
 */
function NetFile(href, document)
{
    this.href = href;
    this.document = document;
}

NetFile.prototype =
{
    status: 0,
    files: 0,
    loaded: false,
    fromCache: false,
    size: -1,
    expectedSize: -1,
    endTime: null,
    waitingForTime: null,
    connectingTime: null,

    getFileLink: function(message)
    {
        // this.SourceLink = function(url, line, type, object, instance)
        var link = new SourceLink(this.href, null, "net", this.request);
        return link;
    },

    getFileURL: function()
    {
        var index = this.href.indexOf("?");
        if (index < 0)
            return this.href;

        return this.href.substring(0, index);
    },

    clear: function()
    {
        // Remove all members to avoid circular references and memleaks.
        for (var name in this)
            delete this[name];
    }
};

Firebug.NetFile = NetFile;

// ********************************************************************************************* //

/**
 * A Phase is a helper object that groups requests made in the same time frame.
 * In other words, if a new requests is started within a given time (specified
 * by phaseInterval [ms]) - after previous request has been started -
 * it automatically belongs to the same phase.
 * If a request is started after this period, a new phase is created
 * and this file becomes to be the first in that phase.
 * The first phase is ended when the page finishes it's loading. Other phases
 * might be started by additional XHR made by the page.
 *
 * All phases are stored within NetProgress.phases array.
 *
 * Phases are used to compute size of the graphical timeline. The timeline
 * for each phase starts from the beginning of the graph.
 */
function NetPhase(file)
{
    // Start time of the phase. Remains the same, even if the file
    // is removed from the log (due to a max limit of entries).
    // This ensures stability of the time line.
    this.startTime = file.startTime;

    // The last finished request (file) in the phase.
    this.lastFinishedFile = null;

    // Set to true if the phase needs to be updated in the UI.
    this.invalidPhase = null;

    // List of files associated with this phase.
    this.files = [];

    // List of paint events.
    this.windowPaints = [];

    this.timeStamps = [];

    this.addFile(file);
}

NetPhase.prototype =
{
    addFile: function(file)
    {
        this.files.push(file);
        file.phase = this;
    },

    removeFile: function removeFile(file)
    {
        Arr.remove(this.files, file);

        // The file don't have a parent phase now.
        file.phase = null;

        // If the last file has been removed, update the last file member.
        if (file == this.lastFinishedFile)
        {
            if (this.files.length == 0)
            {
                this.lastFinishedFile = null;
            }
            else
            {
                for (var i=0; i<this.files.length; i++)
                {
                    if (this.lastFinishedFile.endTime < this.files[i].endTime)
                        this.lastFinishedFile = this.files[i];
                }
            }
        }
    },

    get lastStartTime()
    {
        return this.files[this.files.length - 1].startTime;
    },

    get endTime()
    {
        var endTime = this.lastFinishedFile ? this.lastFinishedFile.endTime : null;
        if (this.timeStamps.length > 0)
        {
            var lastTimeStamp = this.timeStamps[this.timeStamps.length-1].time;
            endTime = (endTime > lastTimeStamp) ? endTime : lastTimeStamp;
        }
        return endTime;
    },

    addTimeStamp: function(label, classes)
    {
        var timeStamp = {
            label: label,
            classes: classes
        };

        this.timeStamps.push(timeStamp);
        return timeStamp;
    }
};

// ********************************************************************************************* //

function getCacheEntry(file, netProgress)
{
    // xxxHonza: dependency on NetCacheReader can't be used in this module
    // since it causes cycle dependency problem. So, use the module through
    // NetMonitor namespace.
    Firebug.NetMonitor.NetCacheReader.requestCacheEntry(file, netProgress);
}

// ********************************************************************************************* //
// Helper for tracing

function getPrintableTime()
{
    var date = new Date();
    return "(" + date.getSeconds() + ":" + date.getMilliseconds() + ")";
}

// ********************************************************************************************* //
// Registration

return NetProgress;

// ********************************************************************************************* //
});
