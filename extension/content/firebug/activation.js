/* See license.txt for terms of usage */

FBL.ns(function() { with (FBL) {

// ************************************************************************************************
// Constants

const Cc = Components.classes;
const Ci = Components.interfaces;

const detachCommand = $("cmd_toggleDetachFirebug");

// ************************************************************************************************

/**
 * @class Implements Firebug activation logic.
 *
 * 1) Part of the logic is based on annotation service (see components/firebug-annotations.js)
 *    in order to remember whether Firebug is activated for given site or not.
 *    If there is "firebugged.showFirebug" annotation for a given site Firbug is activated.
 *    If there is "firebugged.closed" annotation for a given site Firbug is not activated.
 *
 * 2) Other part is based on extensions.firebug.allPagesActivation option. This option
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

    initializeUI: function()  // called once
    {
        Firebug.Module.initializeUI.apply(this, arguments);

        TabWatcher.addListener(this.TabWatcherListener);

        // The "off" option is removed so make sure to convert previsous prev value
        // into "none" if necessary.
        if (Firebug.allPagesActivation == "off")
            Firebug.allPagesActivation = "none";

        // Update option menu item.
        this.updateAllPagesActivation();
    },

    getAnnotationService: function()
    {
        if(!this.annotationSvc)
        {
            // Create annotation service.
            this.annotationSvc = Cc["@joehewitt.com/firebug-annotation-service;1"]
                .getService(Ci.nsISupports).wrappedJSObject;
        }
        return this.annotationSvc;
    },

    shutdown: function()
    {
        Firebug.Module.shutdown.apply(this, arguments);

        TabWatcher.removeListener(this.TabWatcherListener);

        this.getAnnotationService().flush();
    },

    convertToURIKey: function(url, sameOrigin)  // process the URL to canonicalize it. Need not be reversible.
    {
        var uri = makeURI(normalizeURL(url));

        if (Firebug.filterSystemURLs && isSystemURL(url))
            return uri;

        if (url == "about:blank")  // avoid exceptions.
            return uri;

        if (uri && sameOrigin)
        {
            try
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
            catch (exc)
            {
                if (FBTrace.DBG_ERRORS)
                    FBTrace.sysout("activation.convertToURIKey returning full URI, activateSameOrigin FAILS for shortURI "+shortURI+" because: "+exc, exc);
                return uri;
            }
        }
        return uri;
    },

    shouldCreateContext: function(browser, url, userCommands)  // true if the Places annotation the URI "firebugged"
    {
        if (FBTrace.DBG_ACTIVATION)
            FBTrace.sysout("shouldCreateContext allPagesActivation " + Firebug.allPagesActivation);

        if (Firebug.allPagesActivation == "on")
            return true;

        if (Firebug.filterSystemURLs && isSystemURL(url)) // if about:blank gets thru, 1483 fails
            return false;

        if (userCommands)
            return true;

        try
        {
            var uri = this.convertToURIKey(url, Firebug.activateSameOrigin);
            if (!uri)
                return false;

            var hasAnnotation = this.getAnnotationService().pageHasAnnotation(uri);

            if (FBTrace.DBG_ACTIVATION)
                FBTrace.sysout("shouldCreateContext hasAnnotation "+hasAnnotation +
                    " for "+uri.spec+" in "+browser.contentWindow.location +
                    " using activateSameOrigin: "+Firebug.activateSameOrigin);

            // Annotated so, return the value.
            if (hasAnnotation)
                return this.checkAnnotation(browser, uri);

            if (browser.FirebugLink) // then TabWatcher found a connection
            {
                var dst = browser.FirebugLink.dst;
                var dstURI = this.convertToURIKey(dst.spec, Firebug.activateSameOrigin);
                if (FBTrace.DBG_ACTIVATION)
                    FBTrace.sysout("shouldCreateContext found FirebugLink pointing to " +
                        dstURI.spec, browser.FirebugLink);

                if (dstURI && dstURI.equals(uri)) // and it matches us now
                {
                    var srcURI = this.convertToURIKey(browser.FirebugLink.src.spec, Firebug.activateSameOrigin);
                    if (srcURI)
                    {
                        if (FBTrace.DBG_ACTIVATION)
                            FBTrace.sysout("shouldCreateContext found FirebugLink pointing from " +
                                srcURI.spec, browser.FirebugLink);

                        if (srcURI.schemeIs("file") || (dstURI.host == srcURI.host) ) // and it's on the same domain
                        {
                            hasAnnotation = this.getAnnotationService().pageHasAnnotation(srcURI);
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
        var annotation = this.getAnnotationService().getPageAnnotation(uri);

        if (FBTrace.DBG_ACTIVATION)
            FBTrace.sysout("shouldCreateContext read back annotation "+annotation+" for uri "+uri.spec);

        // then the user closed Firebug on this page last time
        if ((Firebug.allPagesActivation != "on") && (annotation.indexOf("closed") > 0))
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
        this.setPageAnnotation(browser.currentURI.spec, annotation);
    },

    unwatchBrowser: function(browser, userCommands)  // Firebug closes in browser
    {
    	var uri = browser.currentURI.spec;
        if (userCommands)  // then mark to not open virally.
            this.setPageAnnotation(uri, "firebugged.closed");
        else
            this.removePageAnnotation(uri); // unmark this URI
    },

    clearAnnotations: function()
    {
        this.getAnnotationService().clear();
    },

    setPageAnnotation: function(currentURI, annotation)
    {
        var uri = this.convertToURIKey(currentURI, Firebug.activateSameOrigin);
        if (uri)
            this.getAnnotationService().setPageAnnotation(uri, annotation);

        if (Firebug.activateSameOrigin)
        {
            uri = this.convertToURIKey(currentURI, false);
            if (uri)
                this.getAnnotationService().setPageAnnotation(uri, annotation);
        }
    },

    removePageAnnotation: function(currentURI)
    {
        var uri = this.convertToURIKey(currentURI, Firebug.activateSameOrigin);
        if (uri)
            this.getAnnotationService().removePageAnnotation(uri);

        if (Firebug.activateSameOrigin)
        {
            uri = this.convertToURIKey(currentURI, false);
            if (uri)
                this.getAnnotationService().removePageAnnotation(uri);
        }

        if (FBTrace.DBG_ACTIVATION)
            FBTrace.sysout("Firebug.Activation.unwatchBrowser untagged "+uri.spec);
    },

    iterateAnnotations: function(fn)  // stops at the first fn(uri) that returns a true value
    {
        var annotations = this.getAnnotationService().getAnnotations(this.annotationName);
        for (var uri in annotations)
        {
            var rc = fn(uri, annotations[uri]);
            if (rc)
                return rc;
        }
    },

    toggleAll: function(state)
    {
        if (FBTrace.DBG_ACTIVATION)
            FBTrace.sysout("Firebug.toggleAll("+state+") with allPagesActivation: " +
                Firebug.allPagesActivation);

        if (state == "on")
        {
            if (Firebug.allPagesActivation == state) // then we were armed
                Firebug.allPagesActivation = "none";
            else
                this.allOn();

            // don't show Off button if we are always on
            Firebug.chrome.disableOff(Firebug.allPagesActivation == "on");
        }
        else
        {
            Firebug.allPagesActivation = "none";
        }

        Firebug.setPref(Firebug.prefDomain, "allPagesActivation", Firebug.allPagesActivation);
        this.updateAllPagesActivation();
    },

    updateOption: function(name, value)
    {
        if (name = "allPagesActivation")
            this.updateAllPagesActivation();
    },

    updateAllPagesActivation: function()
    {
        var menu = $('menu_AllOn');
        if (menu)
            menu.setAttribute("checked", (Firebug.allPagesActivation=="on"));
    },

    allOn: function()
    {
        Firebug.allPagesActivation = "on";  // In future we always create contexts,
        Firebug.toggleBar(true);  // and we turn on for the current page
    }
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
};

// ************************************************************************************************

Firebug.registerModule(Firebug.Activation);

// ************************************************************************************************
}});
