/* See license.txt for terms of usage */

FBL.ns(function() { with (FBL) {

// ************************************************************************************************
// Constants

const Cc = Components.classes;
const Ci = Components.interfaces;

// ************************************************************************************************

/**
 * This module implements Firebug activation logic.
 * 
 * 1) Part of the logic is based on URL annotations ("firebug/history") that are used
 *    to remember whether Firebug was active the last time. If yes, open it for the URL
 *    automatically again.
 *
 * 2) Othe part is based on extensions.firebug.allPagesActivation option. This option
 *    can be set to the following values:
 *    none: The option isn't used (default value)
 *    on:   Firebug is activated for all URLs.
 *    off:  Firebug is never activated.
 *
 *    This logic has higher priority over the URL annotations.
 *    If "off" options is selected, all existing URL annotations are removed.
 */
Firebug.Activation = extend(Firebug.Module,
{
    dispatchName: "activation",
    annotationName: "firebug/history",
    allPagesActivation: "none",

    initializeUI: function()  // called once
    {
        Firebug.Module.initializeUI.apply(this, arguments);

        TabWatcher.addListener(this.TabWatcherListener);

        this.annotationSvc = Cc["@mozilla.org/browser/annotation-service;1"]
            .getService(Ci.nsIAnnotationService);

        this.allPagesActivation = Firebug.getPref(Firebug.prefDomain, "allPagesActivation");
        this.expires = this.annotationSvc.EXPIRE_NEVER;

        this.updateAllPagesActivation();
    },

    shutdown: function()
    {
        Firebug.Module.shutdown.apply(this, arguments);

        TabWatcher.removeListener(this.TabWatcherListener);
    },

    convertToURIKey: function(url)  // process the URL to canonicalize it. Need not be reversible.
    {
        var uri = makeURI(normalizeURL(url));

        if (Firebug.filterSystemURLs && isSystemURL(url))
            return uri;

        if (url == "about:blank")  // avoid exceptions.
            return uri;

        if (uri && Firebug.activateSameOrigin)
        {
            var prePath = uri.prePath; // returns the string before the path (such as "scheme://user:password@host:port").
            var shortURI = makeURI(prePath);
            if (!shortURI)
                return uri;

            var host = shortURI.host;
            if (host)
            {
                var crossDomain = host.split('.').slice(-2)
                shortURI.host = crossDomain.join('.');
                return shortURI
            }
        }
        return uri;
    },

    shouldCreateContext: function(browser, url, userCommands)  // true if the Places annotation the URI "firebugged"
    {
        if (FBTrace.DBG_ACTIVATION)
            FBTrace.sysout("shouldCreateContext allPagesActivation "+this.allPagesActivation +
                " onByDefault: "+Firebug.onByDefault);

        if (this.allPagesActivation == "off")
            return false;

        if (this.allPagesActivation == "on")
            return true;

        if (Firebug.filterSystemURLs && isSystemURL(url)) // if about:blank gets thru, 1483 fails
            return false;

        if (userCommands)
            return true;

        try
        {
            var uri = this.convertToURIKey(url);
            if (!uri)
                return false;

            var hasAnnotation = this.annotationSvc.pageHasAnnotation(uri, this.annotationName);

            if (FBTrace.DBG_ACTIVATION)
                FBTrace.sysout("shouldCreateContext hasAnnotation "+hasAnnotation +
                    " for "+uri.spec+" in "+browser.contentWindow.location +
                    " using activateSameOrigin: "+Firebug.activateSameOrigin);

            // Annotated so, return the value.
            if (hasAnnotation)
                return this.checkAnnotation(browser, uri);

            if (Firebug.onByDefault)
                return true;

            if (browser.FirebugLink) // then TabWatcher found a connection
            {
                var dst = browser.FirebugLink.dst;
                var dstURI = this.convertToURIKey(dst.spec);
                if (FBTrace.DBG_ACTIVATION)
                    FBTrace.sysout("shouldCreateContext found FirebugLink pointing to " +
                        dstURI.spec, browser.FirebugLink);

                if (dstURI && dstURI.equals(uri)) // and it matches us now
                {
                    var srcURI = this.convertToURIKey(browser.FirebugLink.src.spec);
                    if (srcURI)
                    {
                        if (FBTrace.DBG_ACTIVATION)
                            FBTrace.sysout("shouldCreateContext found FirebugLink pointing from " +
                                srcURI.spec, browser.FirebugLink);

                        if (srcURI.schemeIs("file") || (dstURI.host == srcURI.host) ) // and it's on the same domain
                        {
                            hasAnnotation = this.annotationSvc.pageHasAnnotation(srcURI, this.annotationName);
                            if (hasAnnotation) // and the source page was annotated.
                            {
                                var srcShow = this.checkAnnotation(browser, srcURI);
                                if (srcShow)  // and the source annotation said show it
                                    this.watchBrowser(browser);  // so we show dst as well.
                                return srcShow;
                            }
                        }
                    }
                }
                else
                {
                    if (FBTrace.DBG_ACTIVATION)
                        FBTrace.sysout("shouldCreateContext FirebugLink does not match "+uri.spec, browser.FirebugLink);
                }
            }
            else if (browser.contentWindow.opener)
            {
                var openerContext = TabWatcher.getContextByWindow(browser.contentWindow.opener);

                if (FBTrace.DBG_ACTIVATION)
                    FBTrace.sysout("shouldCreateContext opener found, has "+
                        (openerContext?"a ":"no ")+" context: "+
                        browser.contentWindow.opener.location);

                if (openerContext)
                    return true;  // popup windows of Firebugged windows are Firebugged
            }

            return false;   // don't createContext
        }
        catch (exc)
        {
            if (FBTrace.DBG_ERRORS)
                FBTrace.sysout("pageHasAnnoation FAILS for url: "+url+" which gave uri "+(uri?uri.spec:"null"), exc);
        }
    },

    checkAnnotation: function(browser, uri)
    {
        var annotation = this.annotationSvc.getPageAnnotation(uri, this.annotationName);

        if (FBTrace.DBG_ACTIVATION)
            FBTrace.sysout("shouldCreateContext read back annotation "+annotation+" for uri "+uri.spec);

        // then the user closed Firebug on this page last time
        if ((this.allPagesActivation != "on") && (annotation.indexOf("closed") > 0))
            return false; // annotated as 'closed', don't create
        else
            return true;    // annotated, createContext
    },

    shouldShowContext: function(context)
    {
        return this.shouldCreateContext(context.browser, context.getWindowLocation().toString());
    },

    watchBrowser: function(browser)  // Firebug is opened in browser
    {
        var annotation = "firebugged.showFirebug";

        // mark this URI as firebugged
        var uri = this.convertToURIKey(browser.currentURI.spec);
        if (uri)
            this.annotationSvc.setPageAnnotation(uri, this.annotationName, annotation,
                null, this.expires);

        if (FBTrace.DBG_ACTIVATION)
        {
            if (!this.annotationSvc.pageHasAnnotation(uri, this.annotationName))
                FBTrace.sysout("nsIAnnotationService FAILS for "+uri.spec);
            FBTrace.sysout("Firebug.Activation.watchBrowser tagged "+uri.spec+" with: "+annotation);
        }
    },

    unwatchBrowser: function(browser, userCommands)  // Firebug closes in browser
    {
        var uri  = this.convertToURIKey(browser.currentURI.spec);

        if (!uri)
            return;

        if (userCommands)  // then mark to not open virally.
        {
            var annotation = "firebugged.closed";
            this.annotationSvc.setPageAnnotation(uri, this.annotationName, annotation, null, this.expires);
        }
        else
        {
            this.annotationSvc.removePageAnnotation(uri, this.annotationName); // unmark this URI

            if (FBTrace.DBG_ACTIVATION)
                FBTrace.sysout("Firebug.Activation.unwatchBrowser untagged "+uri.spec);
        }
    },

    clearAnnotations: function()
    {
        var self =this;
        this.iterateAnnotations(function remove(uri)
        {
            self.annotationSvc.removePageAnnotation(uri, self.annotationName); // unmark this URI
            if (FBTrace.DBG_ACTIVATION)
                FBTrace.sysout("Firebug.Activation.clearAnnotations untagged "+uri.spec);
        });
    },

    iterateAnnotations: function(fn)  // stops at the first fn(uri) that returns a true value
    {
        var resultCount = {};
        var results = [];
        var uris = this.annotationSvc.getPagesWithAnnotation(this.annotationName, resultCount, results);
        for (var i = 0; i < uris.length; i++)
        {
            var uri = uris[i];
            var rc = fn(uri);
            if (rc)
                return rc;
        }
    },

    getURLsAsBlackWhiteLists: function()
    {
        var blacklist = [];
        var whitelist = [];
        var self = this;
        this.iterateAnnotations(function buildLists(uri)
        {
            var annotation = self.annotationSvc.getPageAnnotation(uri, self.annotationName);
            if (annotation.indexOf("closed") > 0)
                blacklist.push(uri.spec);
            else
                whitelist.push(uri.spec);
        });
        return {blacklist: blacklist, whitelist: whitelist};
    },

    logBlackWhiteList: function()
    {
        Firebug.Console.logFormatted([this.getURLsAsBlackWhiteLists()]);
    },

    toggleAll: function(offOrOn)
    {
        if (FBTrace.DBG_ACTIVATION)
            FBTrace.sysout("Firebug.toggleAll("+offOrOn+") with allPagesActivation: " +
                this.allPagesActivation);

        if (offOrOn == "on" || offOrOn == "off")
        {
            if (this.allPagesActivation == offOrOn) // then we were armed
                this.allPagesActivation = "none";
            else
                (offOrOn == "off") ? this.allOff() : this.allOn();

            // don't show Off if we are always on
            Firebug.chrome.disableOff(this.allPagesActivation == "on");
        }
        else
        {
            this.allPagesActivation = "none";
        }

        Firebug.setPref(Firebug.prefDomain, "allPagesActivation", this.allPagesActivation);
        this.updateAllPagesActivation();
    },

    updateAllPagesActivation: function()
    {
        $('menu_AllOff').setAttribute("checked", (this.allPagesActivation=="off"));
        $('menu_AllOn').setAttribute("checked", (this.allPagesActivation=="on"));
    },

    allOn: function()
    {
        this.allPagesActivation = "on";  // In future we always create contexts,
        Firebug.toggleBar(true);  // and we turn on for the current page
    },

    allOff: function()
    {
        this.allPagesActivation = "off";  // In future we don't create contexts,

        TabWatcher.iterateContexts(function turnOff(context)  // we close the current contexts,
        {
            if (!context.browser)
            {
                if (FBTrace.DBG_ERRORS)
                    FBTrace.sysout("context with no browser??!! "+context.getName());
                return;
            }
            if (context != FirebugContext)
                TabWatcher.unwatchBrowser(context.browser);
        });

        if (Firebug.isDetached())
        {
            // The current detached chrome object is Firebug.chrome.
            Firebug.chrome.close();  // should call unwatchBrowser
            detachCommand.setAttribute("checked", false);
            return;
        }

        if (Firebug.isInBrowser())
        {
            Firebug.chrome.hidePanel();
            Firebug.showBar(false);
        }

        Firebug.closeFirebug();
        this.clearAnnotations();  // and the past pages with contexts are forgotten.
    },
});

// ************************************************************************************************

Firebug.Activation.TabWatcherListener =
{
    watchBrowser: function(browser)
    {
        Firebug.Activation.watchBrowser(browser);
    },

    unwatchBrowser: function(browser, userCommands)
    {
        Firebug.Activation.unwatchBrowser(browser, userCommands);
    }
}

// ************************************************************************************************

Firebug.registerModule(Firebug.Activation);

// ************************************************************************************************
}});
