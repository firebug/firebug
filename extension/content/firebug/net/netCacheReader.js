/* See license.txt for terms of usage */

define([
    "firebug/firebug",
    "firebug/chrome/module",
    "firebug/lib/object",
    "firebug/lib/locale",
    "firebug/lib/trace",
    "firebug/lib/dom",
    "firebug/lib/css",
    "firebug/net/netMonitor",
    "firebug/net/netUtils",
    "firebug/lib/domplate",
],
function(Firebug, Module, Obj, Locale, FBTrace, Dom, Css, NetMonitor, NetUtils, Domplate) {

"use strict"

// ********************************************************************************************* //
// Constants

var Cc = Components.classes;
var Ci = Components.interfaces;
var Cr = Components.results;

var CacheService = Cc["@mozilla.org/network/cache-service;1"];

var cacheSession = null;
var autoFetchDelay = 1000;

var TraceError = FBTrace.toError();
var Trace = FBTrace.to("DBG_NETCACHEREADER");

// ********************************************************************************************* //
// Domplate Templates

var {TABLE, TBODY} = Domplate;

// Used to generate basic structure of the 'Cache' tab that is available within request
// info body (visible when a request is expanded in the Net panel).
var cacheBodyTag =
    TABLE({"class": "netInfoCacheTable", cellpadding: 0, cellspacing: 0, "role": "presentation"},
        TBODY({"role": "list", "aria-label": Locale.$STR("Cache")})
    );

// ********************************************************************************************* //
// Model implementation

/**
 * @module Responsible for fetching given URL entry from the browser cache. The Net panel
 * displays such info for requests that are stored in the cache.
 */
var NetCacheReader = Obj.extend(Module,
/** @lends NetCacheReader */
{
    dispatchName: "netCacheReader",

    // Set to true if cache-data should be fetched automatically.
    // It's set to true by default since the Net panel needs to display
    // file size (coming from the cache) for all requests immediately
    // (see issue 6837).
    // The cache descriptor was previously fetched asynchronously when the
    // user expanded a requests row (see issue 6385), but his problem
    // isn't reproducible any more.
    autoFetch: true,

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Initialization

    initialize: function()
    {
        Module.initialize.apply(this, arguments);

        // Register a listener so, we can create a custom info tab within request info body.
        NetMonitor.NetInfoBody.addListener(this);
    },

    shutdown: function()
    {
        Module.shutdown.apply(this, arguments);

        NetMonitor.NetInfoBody.removeListener(this);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // TabView Listener

    initTabBody: function(infoBox, file)
    {
        if (!file.cacheEntryRequested)
            return;

        // This is the way how templates can access the current context.
        var panel = Firebug.getElementPanel(infoBox);
        var context = panel.context;

        // Create a custom 'Cache' tab.
        NetMonitor.NetInfoBody.appendTab(infoBox, "Cache", Locale.$STR("Cache"));

        // Fetch data from the cache.
        this.getCacheEntry(file, context.netProgress);
    },

    updateTabBody: function(infoBox, file, context)
    {
        // If the file is not loaded yet or the cache-entry is not available, bail out.
        if (!file.loaded || !file.cacheEntry)
            return;

        var tab = infoBox.selectedTab;
        var tabBody = infoBox.getElementsByClassName("netInfoCacheText").item(0);
        if (!Css.hasClass(tab, "netInfoCacheTab") || tabBody.updated)
            return;

        // The UI update should happen only once so, set this flag.
        tabBody.updated = true;

        // Render basic body structure (table).
        cacheBodyTag.replace({}, tabBody);

        // Render cache information in the UI.
        NetMonitor.NetInfoBody.insertHeaderRows(tabBody, file.cacheEntry, "Cache");
    },

    updateRequestTabBody: function(context, file)
    {
        var panel = context.getPanel("net");
        var row = file.row;
        if (!row)
            return;

        // If the row is already closed, bail out.
        if (!Css.hasClass(row, "opened"))
            return;

        // Update the cache info body.
        var infoRow = row.nextSibling;
        var netInfoBox = infoRow.getElementsByClassName("netInfoBody").item(0);
        if (!netInfoBox)
            return;

        this.updateTabBody(netInfoBox, file, context);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    requestCacheEntry: function(file, netProgress)
    {
        // Bail out if the cache is disabled.
        if (!NetMonitor.BrowserCache.isEnabled())
            return;

        // Don't request the cache entry twice.
        if (file.cacheEntryRequested)
            return;

        // The actual request to the cache will be done as soon as the net panel entry
        // is expanded by the user. Reading cache during the page load can influence
        // the caching. See issue 6385.
        file.cacheEntryRequested = true;

        // In case of auto-exporters (such as NetExport) we need to fetch the
        // cache entry automatically and not wait till the user touches the UI.
        if (this.autoFetch)
        {
            var listener = this.getCacheEntry.bind(this, file, netProgress);
            netProgress.context.setTimeout(listener, autoFetchDelay);
        }
    },

    getCacheEntry: function(file, netProgress)
    {
        try
        {
            // Fetch data from the browser cache.
            fetchCacheEntry(file, netProgress);
        }
        catch (exc)
        {
            if (exc.name != "NS_ERROR_CACHE_KEY_NOT_FOUND")
                TraceError.sysout("netCacheReader.getCacheEntry; ERROR " + file.href, exc);
        }
    }
});

// ********************************************************************************************* //
// Local Helpers

function fetchCacheEntry(file, netProgress)
{
    if (file.cacheEntry)
        return;

    Trace.sysout("netCacheReader.getCacheEntry; file.href: " + file.href);

    // Initialize cache session.
    if (!cacheSession)
    {
        var cacheService = CacheService.getService(Ci.nsICacheService);
        cacheSession = cacheService.createSession("HTTP", Ci.nsICache.STORE_ANYWHERE, true);
        cacheSession.doomEntriesIfExpired = false;
    }

    cacheSession.asyncOpenCacheEntry(file.href, Ci.nsICache.ACCESS_READ,
    {
        onCacheEntryAvailable: function(descriptor, accessGranted, status)
        {
            Trace.sysout("netCacheReader.onCacheEntryAvailable; file.href: " + file.href);

            if (descriptor)
                onDescriptorAvailable(netProgress, file, descriptor);

            getCachedHeaders(file);
        }
    });
}

function onDescriptorAvailable(netProgress, file, descriptor)
{
    Trace.sysout("netCacheReader.onDescriptorAvailable; file.href: " + file.href, descriptor);

    if (file.size <= 0)
        file.size = descriptor.dataSize;

    if (descriptor.lastModified && descriptor.lastFetched &&
        descriptor.lastModified < Math.floor(file.startTime/1000))
    {
        file.fromCache = true;
    }

    file.cacheEntry =
    [
        {
            name: "Last Modified",
            value: NetUtils.getDateFromSeconds(descriptor.lastModified)
        },
        {
            name: "Last Fetched",
            value: NetUtils.getDateFromSeconds(descriptor.lastFetched)
        },
        {
            name: "Expires",
            value: NetUtils.getDateFromSeconds(descriptor.expirationTime)
        },
        {
            name: "Data Size",
            value: descriptor.dataSize
        },
        {
            name: "Fetch Count",
            value: descriptor.fetchCount
        },
        {
            name: "Device",
            value: descriptor.deviceID
        }
    ];

    try
    {
        // Get contentType from the cache.
        var value = descriptor.getMetaDataElement("response-head");
        var contentType = getContentTypeFromResponseHead(value);
        file.mimeType = NetUtils.getMimeType(contentType, file.href);
    }
    catch (e)
    {
        TraceError.sysout("netCacheReader.onCacheEntryAvailable; EXCEPTION " + e, e);
    }

    descriptor.close();
    netProgress.update(file);

    // Update UI (in case the request/file is currently expanded)
    NetCacheReader.updateRequestTabBody(netProgress.context, file);
}

function getCachedHeaders(file)
{
    // Cached headers are important only if the request comes from the cache.
    if (!file.fromCache)
        return;

    // The request is containing cached headers now. These will be also displayed
    // within the Net panel.
    var cache = {};
    NetUtils.getHttpHeaders(file.request, cache);
    file.cachedResponseHeaders = cache.responseHeaders;
}

function getContentTypeFromResponseHead(value)
{
    var values = value.split("\r\n");
    for (var i=0; i<values.length; i++)
    {
        var option = values[i].split(": ");
        var headerName = option[0];
        if (headerName && headerName.toLowerCase() == "content-type")
            return option[1];
    }
}

// ********************************************************************************************* //
// Registration

// xxxHonza: expose the module through NetMonitor namespace to avoid cycle dependency problem.
// NetCacheReader module is used within NetProgress module, but can't be included there.
NetMonitor.NetCacheReader = NetCacheReader;

Firebug.registerModule(NetCacheReader);

return NetCacheReader;

// ********************************************************************************************* //
});
