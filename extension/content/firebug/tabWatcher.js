/* See license.txt for terms of usage */

FBL.ns(function() { with (FBL) {

// ************************************************************************************************
// Constants

const Cc = Components.classes;
const Ci = Components.interfaces;
const nsIWebNavigation = Ci.nsIWebNavigation;
const nsIWebProgressListener = Ci.nsIWebProgressListener;
const nsIWebProgress = Ci.nsIWebProgress;
const nsISupportsWeakReference = Ci.nsISupportsWeakReference;
const nsISupports = Ci.nsISupports;
const nsIURI = Ci.nsIURI;

const NOTIFY_STATE_DOCUMENT = nsIWebProgress.NOTIFY_STATE_DOCUMENT;

const STATE_IS_WINDOW = nsIWebProgressListener.STATE_IS_WINDOW;
const STATE_IS_DOCUMENT = nsIWebProgressListener.STATE_IS_DOCUMENT;
const STATE_IS_REQUEST = nsIWebProgressListener.STATE_IS_REQUEST;

const STATE_START = nsIWebProgressListener.STATE_START;
const STATE_STOP = nsIWebProgressListener.STATE_STOP;
const STATE_TRANSFERRING = nsIWebProgressListener.STATE_TRANSFERRING;

const STOP_ALL = nsIWebNavigation.STOP_ALL;

const dummyURI = "about:layout-dummy-request";
const aboutBlank = "about:blank";

const observerService = CCSV("@joehewitt.com/firebug-http-observer;1", "nsIObserverService");

// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

const tabBrowser = $("content");

// ************************************************************************************************
// Globals

var contexts = [];
var listeners = [];

// ************************************************************************************************

top.TabWatcher =
{
    initialize: function(owner)
    {
        if (FBTrace.DBG_WINDOWS)
            FBTrace.sysout("-> tabWatcher initialize\n");

        // Store contexts where they can be accessed externally
        this.contexts = contexts;

        this.owner = owner;  // Firebug object
        this.addListener(owner);

        if (tabBrowser)
            tabBrowser.addProgressListener(TabProgressListener, NOTIFY_STATE_DOCUMENT);

        observerService.addObserver(HttpObserver, "firebug-http-event", false);
    },

    destroy: function()
    {
        if (FBTrace.DBG_WINDOWS)
            FBTrace.sysout("-> tabWatcher destroy\n");

        observerService.removeObserver(HttpObserver, "firebug-http-event");

        if (tabBrowser)
        {
            tabBrowser.removeProgressListener(TabProgressListener);

            for (var i = 0; i < tabBrowser.browsers.length; ++i)
            {
                var browser = tabBrowser.browsers[i];
                this.unwatchTopWindow(browser.contentWindow);
            }
        }

        this.removeListener(this.owner);
        this.owner = null;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    /**
     * Attaches to a top-level window. Creates context unless we just re-activated on an existing context
     */
    watchTopWindow: function(win, uri)
    {
        if (FBTrace.DBG_WINDOWS)                                                                     /*@explore*/
            FBTrace.sysout("-> tabWatcher.watchTopWindow for: "+(uri instanceof nsIURI?uri.spec:uri)+   /*@explore*/
                ", tab: "+Firebug.getTabIdForWindow(win)+"\n");                          /*@explore*/

        if (tabBrowser.selectedBrowser.cancelNextLoad)
        {
            // We need to cancel this load and try again after a delay... this is used
            // mainly to prevent chaos while when the debugger is active when a page
            // is unloaded
            delete tabBrowser.selectedBrowser.cancelNextLoad;
            tabBrowser.selectedBrowser.webNavigation.stop(STOP_ALL);
            delayBrowserLoad(tabBrowser.selectedBrowser, win.location.href);
            return;
        }

        var context = this.getContextByWindow(win);
        if (!context)
        {
            if (!this.owner.enableContext(win,uri))
            {
                this.watchContext(win, null);
                return false;  // we did not create a context
            }

            var browser = this.getBrowserByWindow(win);  // sets browser.chrome to FirebugChrome
            //if (!fbs.countContext(true))
            //    return;

            // If the page is reloaded, store the persisted state from the previous
            // page on the new context
            var persistedState = browser.persistedState;
            delete browser.persistedState;
            if (!persistedState || persistedState.location != win.location.href)
                persistedState = null;

            context = this.owner.createTabContext(win, browser, browser.chrome, persistedState);
            contexts.push(context);

            context.uid = FBL.getUniqueId();                                                                       /*@explore*/
            if (FBTrace.DBG_WINDOWS) {                                                                                 /*@explore*/
                FBTrace.sysout("-> tabWatcher *** INIT *** context, id: "+context.uid+", uri: "+                                /*@explore*/
                    (uri instanceof nsIURI ? uri.spec : uri) +                                                     /*@explore*/
                    ", win.location.href: "+win.location.href+"\n");                                                   /*@explore*/
            }                                                                                                          /*@explore*/
                                                                                                                       /*@explore*/
            dispatch(listeners, "initContext", [context, persistedState]);

            if (!FirebugContext)
                FirebugContext = context; // let's make sure we have something for errors to land on.

            win.addEventListener("pagehide", onPageHideTopWindow, true);
            win.addEventListener("pageshow", onLoadWindowContent, true);
            win.addEventListener("DOMContentLoaded", onLoadWindowContent, true);
            if (FBTrace.DBG_INITIALIZE)                                                                                /*@explore*/
                FBTrace.sysout("-> tabWatcher.watchTopWindow addEventListener for pagehide, pageshow, DomContentLoaded \n");   /*@explore*/
        }

        // xxxHonza is this still valid comment? How this could happen?
        // XXXjjb at this point we either have context or we just pushed null into contexts and sent it to init...
        if (FBTrace.DBG_WINDOWS && !context) {
            FBTrace.sysout("-> tabWatcher.watchTopWindow *** NULL CONTEXT *** for uri: "+
                (uri instanceof nsIURI ? uri.spec : uri) + "\n");
        }

        // Make sure every top window is automatially watched.
        if (context)
            this.watchWindow(win, context);

        // This is one of two places that loaded is set. The other is in watchLoadedTopWindow
        if (context && !context.loaded)
        {
            context.loaded = !context.browser.webProgress.isLoadingDocument;

            // If the loaded flag is set, the proper event should be dispatched.
            if (context.loaded)
                dispatch(listeners, "loadedContext", [context]);

            if (FBTrace.DBG_WINDOWS)                                                                     /*@explore*/
                FBTrace.sysout("-> tabWatcher context "+(context.loaded ? '*** LOADED ***' : 'isLoadingDocument')+" in watchTopWindow, id: "+context.uid+", uri: "+                                   /*@explore*/
                    (uri instanceof nsIURI ? uri.spec : uri)+"\n");                                                         /*@explore*/
        }

        // Call showContext only for currently active context.
        if (tabBrowser.currentURI.spec != context.browser.currentURI.spec)
        {
            if (FBTrace.DBG_WINDOWS)                                                                     /*@explore*/
                FBTrace.sysout("-> watchTopWindow: Do not show context as it's not active: " +         /*@explore*/
                    context.browser.currentURI.spec + "\n");                                                    /*@explore*/
            return context;  // we did create or find a context
        }

        if (context && !context.loaded && !context.showContextTimeout)  
        {
        	// still loading, we want to showContext one time but not too agressively
            context.showContextTimeout = setTimeout(bindFixed( function delayShowContext()
            {
                if (FBTrace.DBG_WINDOWS) 
            	    FBTrace.sysout("tabWatcher delayShowContext id:"+context.showContextTimeout, context);
                if (context.window)   // Sometimes context.window is not defined ?
                    this.watchContext(win, context);  // calls showContext
                else
                {
                    if(FBTrace.DBG_ERRORS) 
                    	FBTrace.sysout("tabWatcher watchTopWindow no context.window "+(context.browser? context.browser.currentURI.spec : " and no context.browser")+"\n");
                }
            }, this), 400);
        }
        else
        {
        	if (context.showContextTimeout)
        		clearTimeout(context.showContextTimeout);
        	delete context.showContextTimeout;
        	
            this.watchContext(win, context);  // calls showContext
        }

        return context;  // we did create or find a context
    },

    /**
     * Called once the document within a tab is completely loaded.
     */
    watchLoadedTopWindow: function(win)
    {
        var isSystem = isSystemPage(win);

        var context = this.getContextByWindow(win);
        if ((context && !context.window))
        {
            if (FBTrace.DBG_WINDOWS)                                                                                   /*@explore*/
                FBTrace.sysout("-> tabWatcher.watchLoadedTopWindow bailing !!!, context.window: "+                          /*@explore*/
                    context.window+", isSystem: "+isSystem+"\n");                                                      /*@explore*/
                                                                                                                       /*@explore*/
            this.unwatchTopWindow(win);
            this.watchContext(win, null, isSystem);
            return;
        }

        if (FBTrace.DBG_WINDOWS)                                                                                       /*@explore*/
            FBTrace.sysout("-> watchLoadedTopWindow context: "+                                                         /*@explore*/
                (context?(context.uid+", loaded="+context.loaded):'undefined')+                                         /*@explore*/
                ", "+win.location.href+"\n");                                                                            /*@explore*/
                                                                                                                       /*@explore*/
        if (context && !context.loaded)
        {
            context.loaded = true;
            if (FBTrace.DBG_WINDOWS)                                                                                   /*@explore*/
                FBTrace.sysout("-> Context *** LOADED *** in watchLoadedTopWindow, id: "+context.uid+                    /*@explore*/
                    ", uri: "+win.location.href+"\n");                                                                /*@explore*/
                                                                                                                        /*@explore*/
            dispatch(listeners, "loadedContext", [context]);
        }
    },

    /**
     * Attaches to a window that may be either top-level or a frame within the page.
     */
    watchWindow: function(win, context)
    {
        if (!context)
            context = this.getContextByWindow(getRootWindow(win));

        var href = win.location.href;
                                                                                                                       /*@explore*/
        // Unfortunately, dummy requests that trigger the call to watchWindow
        // are called several times, so we have to avoid dispatching watchWindow
        // more than once
        if (context && context.windows.indexOf(win) == -1 && href != aboutBlank)
        {
            context.windows.push(win);

            if (FBTrace.DBG_WINDOWS)                                                                                   /*@explore*/
                FBTrace.sysout("-> watchWindow register *** FRAME *** to context: "+href+"\n");                                        /*@explore*/
                                                                                                                       /*@explore*/
            var eventType = (win.parent == win) ? "pagehide" : "unload";
            win.addEventListener(eventType, onUnloadWindow, false);
            if (FBTrace.DBG_INITIALIZE) FBTrace.sysout("-> tabWatcher.watchWindow "+eventType+" addEventListener\n");     /*@explore*/

            dispatch(listeners, "watchWindow", [context, win]);

            if (FBTrace.DBG_WINDOWS) {                                                                                     /*@explore*/
                FBTrace.sysout("-> watchWindow for: "+href+", context: "+context.uid+"\n");                                    /*@explore*/
                if (context)                                                                                               /*@explore*/
                    for (var i = 0; i < context.windows.length; i++)                                                       /*@explore*/
                        FBTrace.sysout("   context: "+context.uid+", window in context: "+context.windows[i].location.href+"\n");                /*@explore*/
            }                                                                                                              /*@explore*/
        }
    },

    /**
     * Detaches from a top-level window. Destroys context
     */
    unwatchTopWindow: function(win)
    {
        var context = this.getContextByWindow(win);
        if (FBTrace.DBG_WINDOWS) FBTrace.dumpStack("-> tabWatcher.unwatchTopWindow for: "+win.location.href+", context: "+context+"\n");               /*@explore*/
        this.unwatchContext(win, context);
    },

    /**
     * Detaches from a window, top-level or not.
     */
    unwatchWindow: function(win)
    {
        var context = this.getContextByWindow(win);

        var index = context ? context.windows.indexOf(win) : -1;
        if (FBTrace.DBG_WINDOWS)                                                                                       /*@explore*/
            FBTrace.sysout("-> tabWatcher.unwatchWindow context: "+context+", index of win: "+index+"\n");                   /*@explore*/
        if (index != -1)
        {
            context.windows.splice(index, 1);
            dispatch(listeners, "unwatchWindow", [context, win]);
        }
    },

    /**
     * Attaches to the window inside a browser because of user-activation
     * returns false if no context was created by the attach attempt, eg extension rejected page
     */
    watchBrowser: function(browser)
    {
        if (FBTrace.DBG_WINDOWS)                                                                        /*@explore*/
        {                                                                                               /*@explore*/
            var uri = safeGetURI(browser);                                                              /*@explore*/
            FBTrace.sysout("-> tabWatcher.watchBrowser for: " + (uri instanceof nsIURI?uri.spec:uri) + "\n");         /*@explore*/
        }                                                                                               /*@explore*/
                                                                                                        /*@explore*/
        return this.watchTopWindow(browser.contentWindow, safeGetURI(browser));
    },

    unwatchBrowser: function(browser)
    {
        this.unwatchTopWindow(browser.contentWindow);
    },

    watchContext: function(win, context, isSystem)  // called when tabs change in firefox
    {
        var browser = context ? context.browser : this.getBrowserByWindow(win);
        if (browser)
            browser.isSystemPage = isSystem;

        if (FBTrace.DBG_WINDOWS)                                                                     /*@explore*/
            FBTrace.sysout("-> tabWatcher context *** SHOW *** (watchTopWindow), id: " +        /*@explore*/
                (context?context.uid:"null")+", uri: "+win.location.href+"\n");                                                         /*@explore*/

        dispatch(listeners, "showContext", [browser, context]); // context is null for unwatchContext
    },

    unwatchContext: function(win, context)
    {
        if (!context)
        {
            var browser = this.getBrowserByWindow(win);
            if (this.owner)
                this.owner.destroyTabContext(browser, null);
            // else we are probably exiting anyway.
            return;
        }

        var persistedState = {location: context.window.location.href};
        context.browser.persistedState = persistedState;  // store our state on FF browser elt

        iterateWindows(context.window, function(win)
        {
            dispatch(listeners, "unwatchWindow", [context, win]);
        });

        dispatch(listeners, "destroyContext", [context, persistedState]);

        if (FirebugContext == context)
            FirebugContext = null;

        if (FBTrace.DBG_WINDOWS)                                                                                    /*@explore*/
            FBTrace.sysout("-> tabWatcher.unwatchContext *** DESTROY *** context for: "+                                     /*@explore*/
                (context.window?context.window.location:"no window")+"\n");                                         /*@explore*/
                                                                                                                    /*@explore*/
        if (this.cancelNextLoad)
        {
            delete this.cancelNextLoad;
            context.browser.cancelNextLoad = true;
        }

        fbs.countContext(false);

        this.owner.destroyTabContext(context.browser, context);
        context.destroy(persistedState);

        remove(contexts, context);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    getContextByWindow: function(winIn)
    {
        var rootWindow = getRootWindow(winIn);

        if (rootWindow)
        {
            for (var i = 0; i < contexts.length; ++i)
            {
                var context = contexts[i];
                if (context.window == rootWindow)
                    return context;
            }
        }
    },

    getContextBySandbox: function(sandbox)
    {
        for (var i = 0; i < contexts.length; ++i)
        {
            var context = contexts[i];
            if (context.sandboxes)
            {
                for (var iframe = 0; iframe < context.sandboxes.length; iframe++)
                {
                    if (context.sandboxes[iframe] == sandbox)
                        return context;
                }
            }
        }
        return null;
    },


    getBrowserByWindow: function(win)
    {
        for (var i = 0; i < tabBrowser.browsers.length; ++i)
        {
            var browser = tabBrowser.browsers[i];
            if (browser.contentWindow == win)
            {
                if (!browser.chrome)
                    registerFrameListener(browser);  // sets browser.chrome to FirebugChrome

                return browser;
            }
        }

        return null;
    },

    iterateContexts: function(fn)
    {
        for (var i = 0; i < contexts.length; ++i)
            fn(contexts[i]);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    addListener: function(listener)
    {
        listeners.push(listener);
    },

    removeListener: function(listener)
    {
        remove(listeners, listener);
    }
};

// ************************************************************************************************

var BaseProgressListener =
{
    QueryInterface : function(iid)
    {
        if (iid.equals(nsIWebProgressListener) ||
            iid.equals(nsISupportsWeakReference) ||
            iid.equals(nsISupports))
        {
            return this;
        }

        throw Components.results.NS_NOINTERFACE;
    },

    stateIsRequest: false,
    onLocationChange: function() {},
    onStateChange : function() {},
    onProgressChange : function() {},
    onStatusChange : function() {},
    onSecurityChange : function() {},
    onLinkIconAvailable : function() {}
};

// ************************************************************************************************

var TabProgressListener = extend(BaseProgressListener,
{
    onLocationChange: function(progress, request, uri)
    {
        // Only watch windows that are their own parent - e.g. not frames
        if (progress.DOMWindow.parent == progress.DOMWindow)
        {
            if (FBTrace.DBG_WINDOWS)                                                                                   /*@explore*/
                FBTrace.sysout("-> TabProgressListener.onLocationChange to: "                                        /*@explore*/
                                          +(uri?uri.spec:"null location")+"\n");                                     /*@explore*/
                                                                                                                       /*@explore*/
            TabWatcher.watchTopWindow(progress.DOMWindow, uri);
        }
    },

    onStateChange: function(progress, request, flag, status)
    {
        if (FBTrace.DBG_WINDOWS)                                                                                   /*@explore*/
            FBTrace.sysout("-> TabProgressListener.onStateChange to: "                                        /*@explore*/
                +safeGetName(request)+"\n"+getStateDescription(flag)+"\n");                                      /*@explore*/

        /*if (flag & STATE_STOP)
        {
            var win = progress.DOMWindow;
            if (win && win.parent == win)
                TabWatcher.watchLoadedTopWindow(progress.DOMWindow);
        }*/
    }
});

// ************************************************************************************************

var FrameProgressListener = extend(BaseProgressListener,
{
    onStateChange: function(progress, request, flag, status)
    {
        if (FBTrace.DBG_WINDOWS)                                                                                        /*@explore*/
        {                                                                                                               /*@explore*/
            FBTrace.sysout("-> FrameProgressListener.onStateChanged for: "+safeGetName(request)+                        /*@explore*/
                ", win: "+progress.DOMWindow.location.href+ "\n"+getStateDescription(flag)+"\n");                                                                        /*@explore*/
        }                                                                                                               /*@explore*/
                                                                                                                        /*@explore*/
        if (flag & STATE_IS_REQUEST && flag & STATE_START)
        {
            // We need to get the hook in as soon as the new DOMWindow is created, but before
            // it starts executing any scripts in the page.  After lengthy analysis, it seems
            // that the start of these "dummy" requests is the only state that works.

            var safeName = safeGetName(request);
            if (safeName && ((safeName == dummyURI) || safeName == "about:document-onload-blocker") )
            {
                var win = progress.DOMWindow;
                // Another weird edge case here - when opening a new tab with about:blank,
                // "unload" is dispatched to the document, but onLocationChange is not called
                // again, so we have to call watchTopWindow here
                //if (win.parent == win && win.location.href == "about:blank")
                //    TabWatcher.watchTopWindow(win, win.location);
                // XXXms check this

                // Fix for Issue #760
                // Don't call watchTopWindow id the about:document-onload-blocker dummy request is sent.
                // This request is sent also if the page is modified by DOM Inspector, which
                // causes to immediately stop the Inspectore mode.
                // xxxHonza This change should be made after real understanding of
                // how this code work.
                // xxxJJB, too many bugs by the dummy request, lose it.
                if (win.parent == win && (win.location.href == "about:blank"))
                {
                    TabWatcher.watchTopWindow(win, win.location.href);
                    return;  // new one under our thumb
                }
                else
                    TabWatcher.watchWindow(win);
            }
        }

        // Later I discovered that XHTML documents don't dispatch the dummy requests, so this
        // is our best shot here at hooking them.
        if (flag & STATE_IS_DOCUMENT && flag & STATE_TRANSFERRING)
        {
            TabWatcher.watchWindow(progress.DOMWindow);
            return;
        }

    }
});

// Registers frame listener for specified tab browser.
function registerFrameListener(browser)
{
    if (browser.chrome)
        return;

    browser.chrome = FirebugChrome;
    browser.addProgressListener(FrameProgressListener, NOTIFY_STATE_DOCUMENT);

    if (FBTrace.DBG_WINDOWS)                                                                /*@explore*/
    {                                                                                       /*@explore*/
        var win = browser.contentWindow;                                                    /*@explore*/
        FBTrace.sysout("-> tabWatcher register FrameProgressListener for: "+                /*@explore*/
            (win.location.href)+", tab: "+Firebug.getTabIdForWindow(win)+"\n");             /*@explore*/
    }                                                                                       /*@explore*/
}

var HttpObserver = extend(Object,
{
    // nsIObserver
    observe: function(aSubject, aTopic, aData)
    {
        try  
        {
            if (aTopic == "http-on-modify-request") 
            {
                aSubject = aSubject.QueryInterface(Ci.nsIHttpChannel);
                this.onModifyRequest(aSubject);
            }
        }
        catch (err) 
        {
            ERROR(err);
        }
    },

    onModifyRequest: function(request)
    {
        var win = getWindowForRequest(request);
        var tabId = Firebug.getTabIdForWindow(win);

        // Tab watcher is only interested in tab related requests.
        if (!tabId)
            return;

        // Ignore redirects
        if (request.URI.spec != request.originalURI.spec)
            return;

        // A document request for the specified tab is here. It can be a top window
        // request (win == win.parent) or embedded iframe request.
        if (request.loadFlags & Ci.nsIHttpChannel.LOAD_DOCUMENT_URI)
        {
            if (FBTrace.DBG_WINDOWS && win == win.parent)
            {
                FBTrace.sysout("-> tabWatcher HttpObserver *** START *** " +
                    "document request for: " + request.URI.spec + "\n");
            }

            // Make sure the frame listener is registered for top level window so,
            // we can get all onStateChange events and init context for all opened tabs.
            if (win == win.parent)
                TabWatcher.getBrowserByWindow(win);
        }
    },

    QueryInterface : function (aIID)
    {
        if (aIID.equals(Ci.nsIObserver) ||
            aIID.equals(Ci.nsISupportsWeakReference) ||
            aIID.equals(Ci.nsISupports))
        {
            return this;
        }

        throw Components.results.NS_NOINTERFACE;
    }
});

// ************************************************************************************************
// Local Helpers

function onPageHideTopWindow(event)
{
    var win = event.currentTarget;
    win.removeEventListener("pagehide", onPageHideTopWindow, true);
    // http://developer.mozilla.org/en/docs/Using_Firefox_1.5_caching#pagehide_event
    if (event.persisted) // then the page is cached and there cannot be an unload handler
    {
        TabWatcher.unwatchTopWindow(win);
    }
    else
    {
        // Page is not cached, there may be an unload
        win.addEventListener("unload", onUnloadTopWindow, true);
        if (FBTrace.DBG_WINDOWS) /*@explore*/
            FBTrace.sysout("-> tabWatcher onPageHideTopWindow set unload handler "+win.location+"\n"); /*@explore*/
    }
}

function onUnloadTopWindow(event)
{
    var win = event.currentTarget;
    win.removeEventListener("unload", onUnloadTopWindow, true);
    if (FBTrace.DBG_WINDOWS) /*@explore*/
        FBTrace.sysout("-> tabWatcher onUnloadTopWindow for: "+win.location+"\n"); /*@explore*/
    TabWatcher.unwatchTopWindow(win);
}

function onLoadWindowContent(event)
{
    if (FBTrace.DBG_WINDOWS)                                                                                           /*@explore*/
        FBTrace.sysout("-> tabWatcher.onLoadWindowContent event.type: "+event.type+"\n");                                  /*@explore*/
                                                                                                                       /*@explore*/
    var win = event.currentTarget;
    try
    {
        win.removeEventListener("pageshow", onLoadWindowContent, true);
        if (FBTrace.DBG_INITIALIZE) FBTrace.sysout("-> tabWatcher.onLoadWindowContent pageshow removeEventListener\n");  /*@explore*/
    }
    catch (exc) 
    {
    	if (FBTrace.DBG_ERRORS)
    		FBTrace.sysout("tabWatcher.onLoadWindowContent removeEventListener pageshow fails", exc);
    }
    
    try
    {
        win.removeEventListener("DOMContentLoaded", onLoadWindowContent, true);
        if (FBTrace.DBG_INITIALIZE) FBTrace.sysout("-> tabWatcher.onLoadWindowContent DOMContentLoaded removeEventListener\n"); /*@explore*/
    }
    catch (exc) 
    {
    	if (FBTrace.DBG_ERRORS)
    		FBTrace.sysout("tabWatcher.onLoadWindowContent removeEventListener DOMContentLoaded fails", exc);
    }

    // Signal that we got the onLoadWindowContent event. This prevents the FrameProgressListener from sending it.
    var context = TabWatcher.getContextByWindow(win);
    if (context)
        context.onLoadWindowContent = true;

    if (FBTrace.DBG_WINDOWS) 
	    FBTrace.sysout("tabWatcher onLoadWindowContent, delaying watchLoadedTopWindow:"+win.location, win);
    
    // Calling this after a timeout because I'm finding some cases where calling
    // it here causes freezeup when this results in loading a script file. This fixes that.
    setTimeout(function delayWatchLoadedTopWindow()
    {
        try
        {
            if (FBTrace.DBG_WINDOWS) 
        	    FBTrace.sysout("tabWatcher delayWatchLoadedTopWindow:"+win.location, win);
            TabWatcher.watchLoadedTopWindow(win);
        }
        catch(exc)
        {
            ERROR(exc);
        }

    });
}

function onUnloadWindow(event)
{
    var win = event.currentTarget;
    var eventType = (win.parent == win) ? "pagehide" : "unload";
    win.removeEventListener(eventType, onUnloadWindow, false);
    if (FBTrace.DBG_INITIALIZE)                                                                                        /*@explore*/
        FBTrace.sysout("-> tabWatcher.onUnloadWindow for: "+win.location.href +" removeEventListener: "+ eventType+"\n");      /*@explore*/
    TabWatcher.unwatchWindow(win);
}

function delayBrowserLoad(browser, uri)
{
    setTimeout(function delayBrowserLoad100() 
    { 
        if (FBTrace.DBG_WINDOWS) 
    	    FBTrace.sysout("tabWatcher delayBrowserLoad100:"+uri, browser);
    	browser.loadURI(uri); 
    }, 100);
}

function safeGetName(request)
{
    try
    {
        return request.name;
    }
    catch (exc)
    {
        return null;
    }
}

function safeGetURI(browser)
{
    try
    {
        return browser.currentURI;
    }
    catch (exc)
    {
        return null;
    }
}

// ************************************************************************************************

}});
