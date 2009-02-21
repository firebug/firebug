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

// ************************************************************************************************

top.TabWatcher = extend(new Firebug.Listener(),
{
    // Store contexts where they can be accessed externally
    contexts: contexts,

    initialize: function()
    {
        if (FBTrace.DBG_WINDOWS)
            FBTrace.sysout("-> tabWatcher initialize\n");

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
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    /**
     * Called when tabBrowser browsers get a new location OR when we get a explicit user op to open firebug
     * Attaches to a top-level window. Creates context unless we just re-activated on an existing context
     */
    watchTopWindow: function(win, uri, userCommands)
    {
        if (FBTrace.DBG_WINDOWS)
            FBTrace.sysout("-> tabWatcher.watchTopWindow for: "+(uri instanceof nsIURI?uri.spec:uri)+
                ", tab: "+Firebug.getTabIdForWindow(win)+"\n");

        if (tabBrowser.selectedBrowser.cancelNextLoad)
        {
            // We need to cancel this load and try again after a delay... this is used
            // mainly to prevent chaos while when the debugger is active when a page
            // is unloaded
            delete tabBrowser.selectedBrowser.cancelNextLoad;
            tabBrowser.selectedBrowser.webNavigation.stop(STOP_ALL);
            delayBrowserLoad(tabBrowser.selectedBrowser, win.location.href);
            if (FBTrace.DBG_WINDOWS)
                FBTrace.sysout("-> tabWatcher.watchTopWindow **CANCEL&RETRY** for: "+win.location.href+
                    ", tab: "+Firebug.getTabIdForWindow(win)+"\n");
            return;
        }

        var context = this.getContextByWindow(win);
        if (!context) // then we've not looked this window in this session
        {
            // decide whether this window will be debugged or not
            if (!this.shouldCreateContext(win, uri, userCommands))
            {
                if (FBTrace.DBG_WINDOWS)
                    FBTrace.sysout("-> tabWatcher will not create context ");
                this.watchContext(win, null);
                return false;  // we did not create a context
            }

            context = this.createContext(win);
       }

        // Dispatch watchWindow for the outer most DOM window
        this.watchWindow(win, context);

        // This is one of two places that loaded is set. The other is in watchLoadedTopWindow
        if (context && !context.loaded)
        {
            context.loaded = !context.browser.webProgress.isLoadingDocument;

            // If the loaded flag is set, the proper event should be dispatched.
            if (context.loaded)
                dispatch(this.fbListeners, "loadedContext", [context]);

            if (FBTrace.DBG_WINDOWS)
                FBTrace.sysout("-> tabWatcher context "+(context.loaded ? '*** LOADED ***' : 'isLoadingDocument')+" in watchTopWindow, id: "+context.uid+", uri: "+
                    (uri instanceof nsIURI ? uri.spec : uri)+"\n");
        }

        // Call showContext only for currently active context.
        if (tabBrowser.currentURI.spec != context.browser.currentURI.spec)
        {
            if (FBTrace.DBG_WINDOWS)
                FBTrace.sysout("-> watchTopWindow: Do not show context as it's not the active tab: " +
                    context.browser.currentURI.spec + "\n");
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

    // Listeners given force-in and veto on URIs/Window.

    shouldCreateContext: function(win, uri, userCommands)  // currently this can be called with nsIURI or a string URL.
    {
        // called when win has no context, answers the question: create one, true or false?

        // Create if any listener says true to showCreateContext
        if ( dispatch2(this.fbListeners, "shouldCreateContext", [win, uri, userCommands]) )
            return true;

        if (FBTrace.DBG_WINDOWS)
            FBTrace.sysout("-> shouldCreateContext with user: "+userCommands+ " no opinion for: "+ ((uri instanceof nsIURI)?uri.spec:uri));

        // Do not Create if any Listener says true to shouldNotCreateContext
        if ( dispatch(this.fbListeners, "shouldNotCreateContext", [win, uri, userCommands]) )
            return false;

        if (FBTrace.DBG_WINDOWS)
            FBTrace.sysout("-> shouldNotCreateContext no opinion for: "+ ((uri instanceof nsIURI)?uri.spec:uri));

        // create if user said so and no one else has an opinion.
        return userCommands;
    },

    createContext: function(win)
    {
        var browser = this.getBrowserByWindow(win);  // sets browser.chrome to FirebugChrome

        // If the page is reloaded, store the persisted state from the previous
        // page on the new context
        var persistedState = browser.persistedState;
        delete browser.persistedState;
        if (!persistedState || persistedState.location != win.location.href)
            persistedState = null;

        context = new Firebug.TabContext(win, browser, browser.chrome, persistedState);
        contexts.push(context);

        context.uid = FBL.getUniqueId();
        if (FBTrace.DBG_WINDOWS || FBTrace.DBG_INITIALIZE) {
            FBTrace.sysout("-> tabWatcher *** INIT *** context, id: "+context.uid+
                ", "+context.getName()+" browser "+browser.currentURI+"\n");
        }

        dispatch(this.fbListeners, "initContext", [context, persistedState]);

        if (win instanceof Ci.nsIDOMWindow && win.top == win)
        {
            win.addEventListener("pagehide", onPageHideTopWindow, false);
            win.addEventListener("pageshow", onLoadWindowContent, false);
            win.addEventListener("DOMContentLoaded", onLoadWindowContent, false);
            if (FBTrace.DBG_INITIALIZE)
                FBTrace.sysout("-> tabWatcher.watchTopWindow addEventListener for pagehide, pageshow, DomContentLoaded \n");
        }
        return context;
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
            if (FBTrace.DBG_WINDOWS)
                FBTrace.sysout("-> tabWatcher.watchLoadedTopWindow bailing !!!, context.window: "+
                    context.window+", isSystem: "+isSystem+"\n");

            this.unwatchTopWindow(win);
            this.watchContext(win, null, isSystem);
            return;
        }

        if (FBTrace.DBG_WINDOWS)
            FBTrace.sysout("-> watchLoadedTopWindow context: "+
                (context?(context.uid+", loaded="+context.loaded):'undefined')+
                ", "+win.location.href+"\n");

        if (context && !context.loaded)
        {
            context.loaded = true;
            if (FBTrace.DBG_WINDOWS)
                FBTrace.sysout("-> Context *** LOADED *** in watchLoadedTopWindow, id: "+context.uid+
                    ", uri: "+win.location.href+"\n");

            dispatch(this.fbListeners, "loadedContext", [context]);
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

        // Unfortunately, dummy requests that trigger the call to watchWindow
        // are called several times, so we have to avoid dispatching watchWindow
        // more than once
        if (context && context.windows.indexOf(win) == -1 && href != aboutBlank)
        {
            context.windows.push(win);

            if (FBTrace.DBG_WINDOWS)
                FBTrace.sysout("-> watchWindow register *** FRAME *** to context: "+href+"\n");

            var eventType = (win.parent == win) ? "pagehide" : "unload";
            win.addEventListener(eventType, onUnloadWindow, false);
            if (FBTrace.DBG_INITIALIZE) FBTrace.sysout("-> tabWatcher.watchWindow "+eventType+" addEventListener\n");

            dispatch(this.fbListeners, "watchWindow", [context, win]);

            if (FBTrace.DBG_WINDOWS) 
            {
                FBTrace.sysout("-> watchWindow for: "+href+", context: "+context.uid+"\n");
                if (context)
                    for (var i = 0; i < context.windows.length; i++)
                        FBTrace.sysout("   context: "+context.uid+", window in context: "+context.windows[i].location.href+"\n");
            }
        }
    },

    /**
     * Detaches from a top-level window. Destroys context
     */
    unwatchTopWindow: function(win)
    {
        var context = this.getContextByWindow(win);
        if (FBTrace.DBG_WINDOWS) FBTrace.sysout("-> tabWatcher.unwatchTopWindow for: "+win.location.href+", context: "+context+"\n");
        this.unwatchContext(win, context);
    },

    /**
     * Detaches from a window, top-level or frame (interior)
     */
    unwatchWindow: function(win)
    {
        var context = this.getContextByWindow(win);

        var index = context ? context.windows.indexOf(win) : -1;
        if (FBTrace.DBG_WINDOWS)
            FBTrace.sysout("-> tabWatcher.unwatchWindow context: "+context+", index of win: "+index+"\n");
        if (index != -1)
        {
            context.windows.splice(index, 1);
            dispatch(this.fbListeners, "unwatchWindow", [context, win]);
        }
    },

    /**
     * Attaches to the window inside a browser because of user-activation
     * returns false if no context was created by the attach attempt, eg extension rejected page
     */
    watchBrowser: function(browser)
    {
        if (FBTrace.DBG_WINDOWS)
        {
            var uri = safeGetURI(browser);
            FBTrace.sysout("-> tabWatcher.watchBrowser for: " + (uri instanceof nsIURI?uri.spec:uri) + "\n");
        }

        if (!browser.chrome)
            registerFrameListener(browser);  // sets browser.chrome to FirebugChrome

        return this.watchTopWindow(browser.contentWindow, safeGetURI(browser), true);
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

        if (FBTrace.DBG_WINDOWS)
            FBTrace.sysout("-> tabWatcher context *** SHOW *** (watchTopWindow), id: " +
                (context?context.uid:"null")+", uri: "+win.location.href+"\n");

        dispatch(this.fbListeners, "showContext", [browser, context]); // context is null if we don't want to debug this browser
    },

    unwatchContext: function(win, context)
    {
        if (!context)
        {
            var browser = this.getBrowserByWindow(win);
            dispatch(this.fbListeners, "destroyContext", [browser, null]);
            return;
        }

        var persistedState = {location: context.window.location.href};
        context.browser.persistedState = persistedState;  // store our state on FF browser elt

        iterateWindows(context.window, function(win)
        {
            dispatch(TabWatcher.fbListeners, "unwatchWindow", [context, win]);
        });

        dispatch(this.fbListeners, "destroyContext", [context, persistedState]);

        if (FBTrace.DBG_WINDOWS)
            FBTrace.sysout("-> tabWatcher.unwatchContext *** DESTROY *** context for: "+
                (context.window?context.window.location:"no window")+" this.cancelNextLoad: "+this.cancelNextLoad+"\n");
		
		// this flag may be set by the debugger.destroyContext
        if (this.cancelNextLoad)
        {
            delete this.cancelNextLoad;
            context.browser.cancelNextLoad = true;
        }

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
});

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
            if (FBTrace.DBG_WINDOWS)
                FBTrace.sysout("-> TabProgressListener.onLocationChange to: "
                                          +(uri?uri.spec:"null location")+"\n");

            TabWatcher.watchTopWindow(progress.DOMWindow, uri);
        }
    },

    onStateChange: function(progress, request, flag, status)
    {
        if (FBTrace.DBG_WINDOWS)
            FBTrace.sysout("-> TabProgressListener.onStateChange to: "
                +safeGetName(request)+"\n"+getStateDescription(flag)+"\n");

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
        if (FBTrace.DBG_WINDOWS)
        {
            FBTrace.sysout("-> FrameProgressListener.onStateChanged for: "+safeGetName(request)+
                ", win: "+progress.DOMWindow.location.href+ "\n"+getStateDescription(flag)+"\n");
        }

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

                if (win.parent == win && (win.location.href == "about:blank"))
                {
                    TabWatcher.watchTopWindow(win, win.location.href);
                    return;
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

    if (FBTrace.DBG_WINDOWS)
    {
        var win = browser.contentWindow;
        FBTrace.sysout("-> tabWatcher register FrameProgressListener for: "+
            (win.location.href)+", tab: "+Firebug.getTabIdForWindow(win)+"\n");
    }
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
    var win = event.currentTarget;  // we set the handler on a window
    var doc = event.target; // the pagehide is sent to the document.
    if (doc.defaultView != win)
        return; // ignore page hides on interior windows
    if (FBTrace.DBG_WINDOWS)
        FBTrace.sysout("-> tabWatcher pagehide event.currentTarget "+win.location, event);

    win.removeEventListener("pagehide", onPageHideTopWindow, false);
    // http://developer.mozilla.org/en/docs/Using_Firefox_1.5_caching#pagehide_event
    if (event.persisted) // then the page is cached and there cannot be an unload handler
    {
        TabWatcher.unwatchTopWindow(win);
    }
    else
    {
        // Page is not cached, there may be an unload
        win.addEventListener("unload", onUnloadTopWindow, true);
        if (FBTrace.DBG_WINDOWS)
            FBTrace.sysout("-> tabWatcher onPageHideTopWindow set unload handler "+win.location+"\n");
    }
}

function onUnloadTopWindow(event)
{
    var win = event.currentTarget;
    win.removeEventListener("unload", onUnloadTopWindow, true);
    if (FBTrace.DBG_WINDOWS)
        FBTrace.sysout("-> tabWatcher onUnloadTopWindow for: "+win.location+"\n");
    TabWatcher.unwatchTopWindow(win);
}

function onLoadWindowContent(event)
{
    if (FBTrace.DBG_WINDOWS)
        FBTrace.sysout("-> tabWatcher.onLoadWindowContent event.type: "+event.type+"\n");

    var win = event.currentTarget;
    try
    {
        win.removeEventListener("pageshow", onLoadWindowContent, true);
        if (FBTrace.DBG_INITIALIZE) FBTrace.sysout("-> tabWatcher.onLoadWindowContent pageshow removeEventListener\n");
    }
    catch (exc)
    {
        if (FBTrace.DBG_ERRORS)
            FBTrace.sysout("tabWatcher.onLoadWindowContent removeEventListener pageshow fails", exc);
    }

    try
    {
        win.removeEventListener("DOMContentLoaded", onLoadWindowContent, true);
        if (FBTrace.DBG_INITIALIZE) FBTrace.sysout("-> tabWatcher.onLoadWindowContent DOMContentLoaded removeEventListener\n");
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

    //if (FBTrace.DBG_WINDOWS)
     //   FBTrace.sysout("tabWatcher onLoadWindowContent, delaying watchLoadedTopWindow:"+win.location, win);

    // Calling this after a timeout because I'm finding some cases where calling
    // it here causes freezeup when this results in loading a script file. This fixes that.
   // setTimeout(function delayWatchLoadedTopWindow()
   // {
        try
        {
            if (FBTrace.DBG_WINDOWS)
                FBTrace.sysout("tabWatcher WatchLoadedTopWindow:"+win.location, win);
            TabWatcher.watchLoadedTopWindow(win);
        }
        catch(exc)
        {
            ERROR(exc);
        }

   // });
}

function onUnloadWindow(event)
{
    var win = event.currentTarget;
    var eventType = (win.parent == win) ? "pagehide" : "unload";
    win.removeEventListener(eventType, onUnloadWindow, false);
    if (FBTrace.DBG_INITIALIZE)
        FBTrace.sysout("-> tabWatcher.onUnloadWindow for: "+win.location.href +" removeEventListener: "+ eventType+"\n");
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
