/* See license.txt for terms of usage */

define([
    "firebug/firefox/xpcom",
    "firebug/lib/trace",
    "firebug/net/httpLib",
    "firebug/firefox/window",
    "firebug/net/netProgress",
],
function(Xpcom, FBTrace, Http, Win, NetProgress) {

// ********************************************************************************************* //
// Constants

var Cc = Components.classes;
var Ci = Components.interfaces;
var Cr = Components.results;

var nsIHttpActivityObserver = Ci.nsIHttpActivityObserver;
var nsISocketTransport = Ci.nsISocketTransport;

var activeRequests = [];

// ********************************************************************************************* //
// Callbacks

var startFile = NetProgress.prototype.startFile;
var requestedHeaderFile = NetProgress.prototype.requestedHeaderFile;
var respondedHeaderFile = NetProgress.prototype.respondedHeaderFile;
var requestedFile = NetProgress.prototype.requestedFile;
var respondedFile = NetProgress.prototype.respondedFile;
var bodySentFile = NetProgress.prototype.bodySentFile;
var responseStartedFile = NetProgress.prototype.responseStartedFile;
var respondedCacheFile = NetProgress.prototype.respondedCacheFile;
var connectingFile = NetProgress.prototype.connectingFile;
var connectedFile = NetProgress.prototype.connectedFile;
var waitingForFile = NetProgress.prototype.waitingForFile;
var sendingFile = NetProgress.prototype.sendingFile;
var receivingFile = NetProgress.prototype.receivingFile;
var responseCompletedFile = NetProgress.prototype.responseCompletedFile;
var closedFile = NetProgress.prototype.closedFile;
var resolvingFile = NetProgress.prototype.resolvingFile;
var resolvedFile = NetProgress.prototype.resolvedFile;
var windowPaint = NetProgress.prototype.windowPaint;
var timeStamp = NetProgress.prototype.timeStamp;
var windowLoad = NetProgress.prototype.windowLoad;
var contentLoad = NetProgress.prototype.contentLoad;

// ********************************************************************************************* //
// Activity Observer

var NetHttpActivityObserver =
{
    registered: false,

    registerObserver: function()
    {
        if (!Ci.nsIHttpActivityDistributor)
            return;

        if (this.registered)
            return;

        var distributor = this.getActivityDistributor();
        if (!distributor)
            return;

        distributor.addObserver(this);
        this.registered = true;

        if (FBTrace.DBG_ACTIVITYOBSERVER)
            FBTrace.sysout("activityObserver.registerObserver;");
    },

    unregisterObserver: function()
    {
        if (!Ci.nsIHttpActivityDistributor)
            return;

        if (!this.registered)
            return;

        var distributor = this.getActivityDistributor();
        if (!distributor)
            return;

        distributor.removeObserver(this);
        this.registered = false;

        if (FBTrace.DBG_ACTIVITYOBSERVER)
            FBTrace.sysout("activityObserver.unregisterObserver;");
    },

    getActivityDistributor: function()
    {
        if (!this.activityDistributor)
        {
            try
            {
                var hadClass = Cc["@mozilla.org/network/http-activity-distributor;1"];
                if (!hadClass)
                    return null;

                this.activityDistributor = hadClass.getService(Ci.nsIHttpActivityDistributor);

                if (FBTrace.DBG_NET)
                    FBTrace.sysout("net.NetHttpActivityObserver; Activity Observer Registered");
            }
            catch (err)
            {
                if (FBTrace.DBG_NET || FBTrace.DBG_ERRORS)
                    FBTrace.sysout("net.NetHttpActivityObserver; Activity Observer EXCEPTION", err);
            }
        }
        return this.activityDistributor;
    },

    /* nsIActivityObserver */
    observeActivity: function(httpChannel, activityType, activitySubtype, timestamp,
        extraSizeData, extraStringData)
    {
        try
        {
            if (httpChannel instanceof Ci.nsIHttpChannel)
                this.observeRequest(httpChannel, activityType, activitySubtype, timestamp,
                    extraSizeData, extraStringData);
        }
        catch (exc)
        {
            if ( (typeof(FBTrace) !== undefined) && FBTrace && FBTrace.DBG_ERRORS)  // then we are in some sane scope
                FBTrace.sysout("net.observeActivity: EXCEPTION "+exc, exc);
        }
    },

    observeRequest: function(httpChannel, activityType, activitySubtype, timestamp,
        extraSizeData, extraStringData)
    {
        var win = Http.getWindowForRequest(httpChannel);
        if (!win)
        {
            var index = activeRequests.indexOf(httpChannel);
            if (index == -1)
                return;

            if (!(win = activeRequests[index+1]))
                return;
        }

        var context = Firebug.connection.getContextByWindow(win);
        var tabId = Win.getWindowProxyIdForWindow(win);
        if (!(tabId && win))
            return;

        var networkContext = Firebug.NetMonitor.contexts[tabId];
        if (!networkContext)
            networkContext = context ? context.netProgress : null;

        if (!networkContext)
            return;

        var time = new Date();
        time.setTime(timestamp/1000);

        if (FBTrace.DBG_ACTIVITYOBSERVER)
        {
            FBTrace.sysout("activityObserver.observeActivity; " +
                getTimeLabel(time) + ", " +
                Http.safeGetRequestName(httpChannel) + ", " +
                getActivityTypeDescription(activityType) + ", " +
                getActivitySubtypeDescription(activitySubtype) + ", " +
                extraSizeData,
                extraStringData);
        }

        time = time.getTime();

        if (activityType == nsIHttpActivityObserver.ACTIVITY_TYPE_HTTP_TRANSACTION)
        {
            if (activitySubtype == nsIHttpActivityObserver.ACTIVITY_SUBTYPE_REQUEST_HEADER)
            {
                activeRequests.push(httpChannel);
                activeRequests.push(win);

                var isXHR = Http.isXHR(httpChannel);
                networkContext.post(requestedHeaderFile, [httpChannel, time, win, isXHR, extraStringData]);
            }
            else if (activitySubtype == nsIHttpActivityObserver.ACTIVITY_SUBTYPE_TRANSACTION_CLOSE)
            {
                var index = activeRequests.indexOf(httpChannel);
                activeRequests.splice(index, 2);

                networkContext.post(closedFile, [httpChannel, time]);
            }
            else if (activitySubtype == nsIHttpActivityObserver.ACTIVITY_SUBTYPE_RESPONSE_HEADER)
                networkContext.post(respondedHeaderFile, [httpChannel, time, extraStringData]);
            else if (activitySubtype == nsIHttpActivityObserver.ACTIVITY_SUBTYPE_REQUEST_BODY_SENT)
                networkContext.post(bodySentFile, [httpChannel, time]);
            else if (activitySubtype == nsIHttpActivityObserver.ACTIVITY_SUBTYPE_RESPONSE_START)
                networkContext.post(responseStartedFile, [httpChannel, time]);
            else if (activitySubtype == nsIHttpActivityObserver.ACTIVITY_SUBTYPE_RESPONSE_COMPLETE)
                networkContext.post(responseCompletedFile, [httpChannel, time, extraSizeData]);
        }
        else if (activityType == nsIHttpActivityObserver.ACTIVITY_TYPE_SOCKET_TRANSPORT)
        {
            if (activitySubtype == nsISocketTransport.STATUS_RESOLVING)
                networkContext.post(resolvingFile, [httpChannel, time]);
            //else if (activitySubtype == nsISocketTransport.STATUS_RESOLVED)
            //    networkContext.post(resolvedFile, [httpChannel, time]);
            else if (activitySubtype == nsISocketTransport.STATUS_CONNECTING_TO)
                networkContext.post(connectingFile, [httpChannel, time]);
            else if (activitySubtype == nsISocketTransport.STATUS_CONNECTED_TO)
                networkContext.post(connectedFile, [httpChannel, time]);
            else if (activitySubtype == nsISocketTransport.STATUS_SENDING_TO)
                networkContext.post(sendingFile, [httpChannel, time, extraSizeData]);
            else if (activitySubtype == nsISocketTransport.STATUS_WAITING_FOR)
                networkContext.post(waitingForFile, [httpChannel, time]);
            else if (activitySubtype == nsISocketTransport.STATUS_RECEIVING_FROM)
                networkContext.post(receivingFile, [httpChannel, time, extraSizeData]);
        }
    },

    /* nsISupports */
    QueryInterface: function(iid)
    {
        if (iid.equals(Ci.nsISupports) ||
            iid.equals(Ci.nsIActivityObserver)) {
            return this;
         }

        throw Cr.NS_ERROR_NO_INTERFACE;
    }
}

// ********************************************************************************************* //
// Activity Observer Tracing Support

function getTimeLabel(date)
{
    var m = date.getMinutes() + "";
    var s = date.getSeconds() + "";
    var ms = date.getMilliseconds() + "";
    return "[" + ((m.length > 1) ? m : "0" + m) + ":" +
        ((s.length > 1) ? s : "0" + s) + "." +
        ((ms.length > 2) ? ms : ((ms.length > 1) ? "0" + ms : "00" + ms)) + "]";
}

function getTimeLabelFromMs(ms)
{
    var time = new Date();
    time.setTime(ms);
    return getTimeLabel(time);
}

function getActivityTypeDescription(a)
{
    switch (a)
    {
    case nsIHttpActivityObserver.ACTIVITY_TYPE_SOCKET_TRANSPORT:
        return "ACTIVITY_TYPE_SOCKET_TRANSPORT";
    case nsIHttpActivityObserver.ACTIVITY_TYPE_HTTP_TRANSACTION:
        return "ACTIVITY_TYPE_HTTP_TRANSACTION";
    default:
        return a;
    }
}

function getActivitySubtypeDescription(a)
{
    switch (a)
    {
    case nsIHttpActivityObserver.ACTIVITY_SUBTYPE_REQUEST_HEADER:
        return "ACTIVITY_SUBTYPE_REQUEST_HEADER";
    case nsIHttpActivityObserver.ACTIVITY_SUBTYPE_REQUEST_BODY_SENT:
          return "ACTIVITY_SUBTYPE_REQUEST_BODY_SENT";
    case nsIHttpActivityObserver.ACTIVITY_SUBTYPE_RESPONSE_START:
        return "ACTIVITY_SUBTYPE_RESPONSE_START";
    case nsIHttpActivityObserver.ACTIVITY_SUBTYPE_RESPONSE_HEADER:
        return "ACTIVITY_SUBTYPE_RESPONSE_HEADER";
    case nsIHttpActivityObserver.ACTIVITY_SUBTYPE_RESPONSE_COMPLETE:
        return "ACTIVITY_SUBTYPE_RESPONSE_COMPLETE";
    case nsIHttpActivityObserver.ACTIVITY_SUBTYPE_TRANSACTION_CLOSE:
        return "ACTIVITY_SUBTYPE_TRANSACTION_CLOSE";

    case nsISocketTransport.STATUS_RESOLVING:
        return "STATUS_RESOLVING";
    case nsISocketTransport.STATUS_RESOLVED:
        return "STATUS_RESOLVED";
    case nsISocketTransport.STATUS_CONNECTING_TO:
        return "STATUS_CONNECTING_TO";
    case nsISocketTransport.STATUS_CONNECTED_TO:
        return "STATUS_CONNECTED_TO";
    case nsISocketTransport.STATUS_SENDING_TO:
        return "STATUS_SENDING_TO";
    case nsISocketTransport.STATUS_WAITING_FOR:
        return "STATUS_WAITING_FOR";
    case nsISocketTransport.STATUS_RECEIVING_FROM:
        return "STATUS_RECEIVING_FROM";

    default:
        return a;
    }
}

// ********************************************************************************************* //
// Registration

return NetHttpActivityObserver;

// ********************************************************************************************* //
});
