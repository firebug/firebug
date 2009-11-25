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
        if (Firebug.TraceModule)
            Firebug.TraceModule.addListener(TraceListener);

        if (FBTrace.DBG_WINDOWS)
            FBTrace.sysout("-> tabWatcher initialize\n");

        if (tabBrowser)
            tabBrowser.addProgressListener(TabProgressListener, NOTIFY_STATE_DOCUMENT);

        httpObserver.addObserver(TabWatcherHttpObserver, "firebug-http-event", false);
    },

    destroy: function()
    {
        if (FBTrace.DBG_WINDOWS)
            FBTrace.sysout("-> tabWatcher destroy\n");

        this.shuttingDown = true;

        httpObserver.removeObserver(TabWatcherHttpObserver, "firebug-http-event");

        if (tabBrowser)
        {
            tabBrowser.removeProgressListener(TabProgressListener);

            var browsers = Firebug.chrome.getBrowsers();
            for (var i = 0; i < browsers.length; ++i)
            {
                var browser = browsers[i];
                this.unwatchTopWindow(browser.contentWindow);
            }
        }

        if (Firebug.TraceModule)
            Firebug.TraceModule.removeListener(TraceListener);
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

        if (!win)
        {
            if (FBTrace.DBG_ERRORS)
                FBTrace.sysout("-> tabWatcher.watchTopWindow should not have a null window!");
            return false;
        }

        var selectedBrowser = Firebug.chrome.getCurrentBrowser();
        if (selectedBrowser.cancelNextLoad)
        {
            // We need to cancel this load and try again after a delay... this is used
            // mainly to prevent chaos while when the debugger is active when a page
            // is unloaded
            delete selectedBrowser.cancelNextLoad;
            selectedBrowser.webNavigation.stop(STOP_ALL);
            var url = (uri instanceof nsIURI?uri.spec:uri);
            delayBrowserLoad(selectedBrowser, url);
            if (FBTrace.DBG_WINDOWS)
                FBTrace.sysout("-> tabWatcher.watchTopWindow **CANCEL&RETRY** for: "+url+
                    ", tab: "+Firebug.getTabIdForWindow(win)+"\n");
            return;
        }

        var context = this.getContextByWindow(win);
        if (context) // then we've looked at this window before in this FF session...
        {
            if (FBTrace.DBG_ACTIVATION)
                FBTrace.sysout("-> tabWatcher.watchTopWindow context exists "+context.getName());
            if (!this.shouldShowContext(context))
            {
                // ...but now it is not wanted.
                if (context.browser)
                    delete context.browser.showFirebug;
                this.unwatchContext(win, context);

                // There shouldn't be context for this window so, remove it from the
                // global array.
                remove(contexts, context);

                return;  // did not create a context
            }
            // else we should show
        }
        else // then we've not looked this window in this session
        {
            // decide whether this window will be debugged or not
            var url = (uri instanceof nsIURI) ? uri.spec : uri;
            if (!this.shouldCreateContext(selectedBrowser, url, userCommands))
            {
                if (FBTrace.DBG_ACTIVATION)
                    FBTrace.sysout("-> tabWatcher will not create context ");

                delete selectedBrowser.showFirebug;
                this.watchContext(win, null);

                return false;  // we did not create a context
            }

            var browser = this.getBrowserByWindow(win);

            context = this.createContext(win, browser, Firebug.getContextType());
       }

        if (win instanceof Ci.nsIDOMWindow && win.parent == win)
        {
            win.addEventListener("pageshow", onLoadWindowContent, onLoadWindowContent.capturing);
            win.addEventListener("DOMContentLoaded", onLoadWindowContent, onLoadWindowContent.capturing);
            if (FBTrace.DBG_WINDOWS)
                FBTrace.sysout("-> tabWatcher.watchTopWindow addEventListener for pageshow, DomContentLoaded "+safeGetWindowLocation(win));
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

        // Call showContext only for currently active tab.
        if (Firebug.chrome.getCurrentURI().spec != context.browser.currentURI.spec)
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
                    FBTrace.sysout("-> watchTopWindow delayShowContext id:"+context.showContextTimeout, context);
                if (context.window)   // Sometimes context.window is not defined ?
                    this.rushShowContext(win, context);  // calls showContext
                else
                {
                    if(FBTrace.DBG_ERRORS)
                        FBTrace.sysout("tabWatcher watchTopWindow no context.window "+(context.browser? context.browser.currentURI.spec : " and no context.browser")+"\n");
                }
            }, this), 400);
        }
        else
        {
            if (FBTrace.DBG_WINDOWS)
                FBTrace.sysout("-> watchTopWindow context.loaded:"+context.loaded+ " for "+context.getName());
            this.rushShowContext(win, context);
        }

        return context;  // we did create or find a context
    },

    rushShowContext: function(win, context)
    {
        if (context.showContextTimeout) // then the timeout even has not run, we'll not need it after all.
            clearTimeout(context.showContextTimeout);
        delete context.showContextTimeout;

        this.watchContext(win, context);  // calls showContext
    },

    // Listeners decide to show or not
    shouldShowContext: function(context)
    {
        if ( dispatch2(this.fbListeners, "shouldShowContext", [context]))
            return true;
        else
            return false;
    },

    // Listeners given force-in and veto on URIs/Window.

    shouldCreateContext: function(browser, url, userCommands)
    {
        // called when win has no context, answers the question: create one, true or false?

        // Create if any listener says true to showCreateContext
        if (dispatch2(this.fbListeners, "shouldCreateContext", [browser, url, userCommands]))
            return true;

        if (FBTrace.DBG_ACTIVATION)
            FBTrace.sysout("-> shouldCreateContext with user: "+userCommands+ " no opinion for: "+ url);

        // Do not Create if any Listener says true to shouldNotCreateContext
        if (dispatch2(this.fbListeners, "shouldNotCreateContext", [browser, url, userCommands]))
            return false;

        if (FBTrace.DBG_ACTIVATION)
            FBTrace.sysout("-> shouldNotCreateContext no opinion for: "+ url);

        // create if user said so and no one else has an opinion.
        return userCommands;
    },

    createContext: function(win, browser, contextType)
    {
        // If the page is reloaded, store the persisted state from the previous
        // page on the new context
        var persistedState = browser.persistedState;
        delete browser.persistedState;
        var location = safeGetWindowLocation(win).toString();
        //if (!persistedState || persistedState.location != location)
        //    persistedState = null;

        // xxxHonza, xxxJJB: web application detection. Based on domain check.
        var prevDomain = persistedState ? getDomain(persistedState.location) : null;
        var domain = getDomain(location);
        if (!persistedState || prevDomain != domain)
            persistedState = null;

        // The proper instance of FirebugChrome object (different for detached Firebug and
        // accessible as Firebug.chrome property) must be used for the context object.
        // (the global context object FirebugContext is also different for detached firebug).
        var context = new contextType(win, browser, Firebug.chrome, persistedState);
        contexts.push(context);

        context.uid = FBL.getUniqueId();

        browser.showFirebug = true; // this is the only place we should set showFirebug.

        if (FBTrace.DBG_WINDOWS || FBTrace.DBG_ACTIVATION) {
            FBTrace.sysout("-> tabWatcher *** INIT *** context, id: "+context.uid+
                ", "+context.getName()+" browser "+browser.currentURI.spec+" Firebug.chrome.window: "+Firebug.chrome.window.location+" context.window: "+safeGetWindowLocation(context.window));
        }

        dispatch(this.fbListeners, "initContext", [context, persistedState]);

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
                ", "+safeGetWindowLocation(win)+"\n");

        if (context && !context.loaded)
        {
            context.loaded = true;

            if (FBTrace.DBG_WINDOWS)
                FBTrace.sysout("-> Context *** LOADED *** in watchLoadedTopWindow, id: "+context.uid+
                    ", uri: "+safeGetWindowLocation(win)+"\n");

            dispatch(this.fbListeners, "loadedContext", [context]);

            if (context.showContextTimeout) // then our timeout has never run, let's get on with it.
                this.rushShowContext(win, context);
        }
    },

    /**
     * Attaches to a window that may be either top-level or a frame within the page.
     */
    watchWindow: function(win, context)
    {
        if (!context)
            context = this.getContextByWindow(getRootWindow(win));

        var location = safeGetWindowLocation(win);

        // Unfortunately, dummy requests that trigger the call to watchWindow
        // are called several times, so we have to avoid dispatching watchWindow
        // more than once
        if (context && context.windows.indexOf(win) == -1 && location != aboutBlank)
        {
            context.windows.push(win);

            if (FBTrace.DBG_WINDOWS)
                FBTrace.sysout("-> watchWindow register *** FRAME *** to context for win.location: "+location+"\n");

            // For every window we watch, prepare for unwatch.
            if (win.parent == win)
            {
                win.addEventListener("pagehide", onPageHideTopWindow, false);
                if (FBTrace.DBG_WINDOWS)
                    FBTrace.sysout("-> tabWatcher.watchWindow addEventListener for pagehide");
            }
            else
            {
                win.addEventListener("unload", onUnloadWindow, false);
                if (FBTrace.DBG_WINDOWS)
                    FBTrace.sysout("-> tabWatcher.watchWindow addEventListener for unload");
            }

            dispatch(this.fbListeners, "watchWindow", [context, win]);

            if (FBTrace.DBG_WINDOWS)
            {
                FBTrace.sysout("-> watchWindow for: "+location+", context: "+context.uid+"\n");
                if (context)
                    for (var i = 0; i < context.windows.length; i++)
                        FBTrace.sysout("   context: "+context.uid+", window in context: "+context.windows[i].location.href+"\n");
            }
        }
    },

    /**
     * Detaches from a top-level window. Destroys context
     * Called when windows are closed, or user closes firebug
     */
    unwatchTopWindow: function(win)
    {
        var context = this.getContextByWindow(win);
        if (FBTrace.DBG_WINDOWS)
            FBTrace.sysout("-> tabWatcher.unwatchTopWindow for: " +
                (context ? context.getWindowLocation() : "NULL Context") +
                ", context: " + context);

        this.unwatchContext(win, context);

        return true; // we might later allow extensions to reject unwatch
    },

    /**
     * Detaches from a window, top-level or frame (interior)
     */
    unwatchWindow: function(win)
    {
        var context = this.getContextByWindow(win);

        if (!context)
        {
            if (FBTrace.DBG_ERRORS)
                FBTrace.sysout("unwatchWindow: no context for win "+safeGetWindowLocation(win));
            return;
        }

        var index = context.windows.indexOf(win);
        if (FBTrace.DBG_WINDOWS)
            FBTrace.sysout("-> tabWatcher.unwatchWindow context: "+context.getName()+" index of win: "+index+"/"+context.windows.length, context.windows);
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

        registerFrameListener(browser);

        var shouldDispatch = this.watchTopWindow(browser.contentWindow, safeGetURI(browser), true);

        if (shouldDispatch)
        {
            dispatch(this.fbListeners, "watchBrowser", [browser]);
            return true;
        }
        return false;
    },

    /*
     * User closes Firebug
     */

    unwatchBrowser: function(browser, userCommands)
    {
        if (FBTrace.DBG_WINDOWS)
        {
            var uri = safeGetURI(browser);
            FBTrace.sysout("-> tabWatcher.unwatchBrowser for: " + (uri instanceof nsIURI?uri.spec:uri) + " user commands: "+userCommands+(browser?"":"NULL BROWSER"));
        }
        if (!browser)
            return;

        delete browser.showFirebug;

        var shouldDispatch = this.unwatchTopWindow(browser.contentWindow);

        if (shouldDispatch)
        {
            dispatch(this.fbListeners, "unwatchBrowser", [browser, userCommands]);
            return true;
        }
        return false;
    },

    watchContext: function(win, context, isSystem)  // called when tabs change in firefox
    {
        if (this.shuttingDown)
            return;

        var browser = context ? context.browser : this.getBrowserByWindow(win);
        if (browser)
            browser.isSystemPage = isSystem;

        if (FBTrace.DBG_WINDOWS)
            FBTrace.sysout("-> tabWatcher context *** SHOW *** (watchContext), id: " +
                (context?context.uid:"null")+", uri: "+win.location.href+"\n");

        dispatch(this.fbListeners, "showContext", [browser, context]); // context is null if we don't want to debug this browser
    },

    unwatchContext: function(win, context)
    {
        if (!context)
        {
            var browser = this.getBrowserByWindow(win);
            if (browser)
            {
                browser.persistedState = {};
                delete browser.showFirebug;
                dispatch(this.fbListeners, "showContext", [browser, null]); // context is null if we don't want to debug this browser
            }
            dispatch(this.fbListeners, "destroyContext", [null, (browser?browser.persistedState:null), browser]);
            return;
        }

        var persistedState = {location: context.getWindowLocation()};
        context.browser.persistedState = persistedState;  // store our state on FF browser elt

        iterateWindows(context.window, function(win)
        {
            dispatch(TabWatcher.fbListeners, "unwatchWindow", [context, win]);
        });

        dispatch(this.fbListeners, "destroyContext", [context, persistedState, context.browser]);

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

        var currentBrowser = Firebug.chrome.getCurrentBrowser();
        if (!currentBrowser.showFirebug)  // unwatchContext can be called on an unload event after another tab is selected
            dispatch(this.fbListeners, "showContext", [browser, null]); // context is null if we don't want to debug this browser
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    getContextByWindow: function(winIn)
    {
        if (!winIn)
            return;

        var rootWindow = getRootWindow(winIn);

        if (FBTrace.DBG_INITIALIZE)
            FBTrace.sysout("winIn: "+safeGetWindowLocation(winIn).substr(0,50)+" rootWindow: "+safeGetWindowLocation(rootWindow));

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
        var browsers = Firebug.chrome.getBrowsers();
        for (var i = 0; i < browsers.length; ++i)
        {
            var browser = browsers[i];
            if (browser.contentWindow == win)
            {
                registerFrameListener(browser);
                return browser;
            }
        }

        return null;
    },

    iterateContexts: function(fn)
    {
        for (var i = 0; i < contexts.length; ++i)
        {
            var rc = fn(contexts[i]);
            if (rc)
                return rc;
        }
    },
});

// ************************************************************************************************

var TabProgressListener = extend(BaseProgressListener,
{
    onLocationChange: function(progress, request, uri)
    {
        // Only watch windows that are their own parent - e.g. not frames
        if (progress.DOMWindow.parent == progress.DOMWindow)
        {
            var srcWindow = getWindowForRequest(request);
            var browser = srcWindow ? TabWatcher.getBrowserByWindow(srcWindow) : null;
            var requestFromFirebuggedWindow = browser && browser.showFirebug;

            if (FBTrace.DBG_WINDOWS || FBTrace.DBG_ACTIVATION)
            {
                FBTrace.sysout("-> TabProgressListener.onLocationChange "+
                    progress.DOMWindow.location+" to: "+
                    (uri?uri.spec:"null location")+
                    (requestFromFirebuggedWindow?" from firebugged window":" no firebug"));
            }
            if (uri)
                TabWatcher.watchTopWindow(progress.DOMWindow, uri);
            else // the location change to a non-uri means we need to hide
                TabWatcher.watchContext(progress.DOMWindow, null, true);
        }
    },

    onStateChange: function(progress, request, flag, status)
    {
        if (FBTrace.DBG_WINDOWS)
            FBTrace.sysout("-> TabProgressListener.onStateChange to: "
                +safeGetName(request)+" "+getStateDescription(flag)+"\n");
    }
});

// ************************************************************************************************

var FrameProgressListener = extend(BaseProgressListener,
{
    onStateChange: function(progress, request, flag, status)
    {
        if (FBTrace.DBG_WINDOWS)
        {
            // xxxHonza: there is too much of these messages so, disable it for now.
            FBTrace.sysout("-> FrameProgressListener.onStateChanged for: "+safeGetName(request)+
                ", win: "+progress.DOMWindow.location.href+ " "+getStateDescription(flag));
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
    if (browser.frameListener)
        return;

    browser.frameListener = FrameProgressListener;  // just a mark saying we've registered. TODO remove!
    browser.addProgressListener(FrameProgressListener, NOTIFY_STATE_DOCUMENT);

    if (FBTrace.DBG_WINDOWS)
    {
        var win = browser.contentWindow;
        FBTrace.sysout("-> tabWatcher register FrameProgressListener for: "+
            safeGetWindowLocation(win)+", tab: "+Firebug.getTabIdForWindow(win)+"\n");
    }
}

function getRefererHeader(request)
{
    var http = QI(request, Ci.nsIHttpChannel);
    var referer = null;
    http.visitRequestHeaders({
        visitHeader: function(name, value)
        {
            if (name == 'referer')
                referer = value;
        }
    });
    return referer;
}

var TabWatcherHttpObserver = extend(Object,
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
            if ( (FBTrace.DBG_ACTIVATION || FBTrace.DBG_WINDOWS) && win == win.parent)
            {
                FBTrace.sysout("-> tabWatcher TabWatcherHttpObserver *** START *** " +
                    "document request for: " + request.URI.spec + " window for request is "+safeGetWindowLocation(win)+"\n");
            }

            if (win == win.parent)
            {
                // Make sure the frame listener is registered for top level window so,
                // we can get all onStateChange events and init context for all opened tabs.
                var browser = TabWatcher.getBrowserByWindow(win);

                if (!browser)
                    return;

                delete browser.FirebugLink;

                if (safeGetWindowLocation(win).toString() == "about:blank") // then this page is opened in new tab or window
                {
                    var referer = getRefererHeader(request);
                    if (referer)
                    {
                        try
                        {
                            var srcURI = makeURI(referer);
                            browser.FirebugLink = {src: srcURI, dst: request.URI};
                        }
                        catch(e)
                        {
                            if (FBTrace.DBG_ERRORS)
                                FBTrace.sysout("tabWatcher.onModifyRequest failed to make URI from "+referer+" because "+exc, exc);
                        }
                    }
                }
                else
                {
                    // Here we know the source of the request is 'win'. For viral activation and web app tracking
                    browser.FirebugLink = {src: browser.currentURI, dst: request.URI};
                }
                if (FBTrace.DBG_ACTIVATION && browser.FirebugLink)
                    FBTrace.sysout("tabWatcher.onModifyRequest created FirebugLink from "+browser.FirebugLink.src.spec + " to "+browser.FirebugLink.dst.spec);
            }
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
        FBTrace.sysout("-> tabWatcher pagehide event.currentTarget "+safeGetWindowLocation(win), event);

    win.removeEventListener("pagehide", onPageHideTopWindow, false);

    // http://developer.mozilla.org/en/docs/Using_Firefox_1.5_caching#pagehide_event
    if (event.persisted) // then the page is cached and there cannot be an unload handler
    {
        //  see Bug 484710 -  add pageIgnore event for pages that are ejected from the bfcache

        if (FBTrace.DBG_WINDOWS)
            FBTrace.sysout("-> tabWatcher onPageHideTopWindow for: "+safeGetWindowLocation(win)+"\n");
        TabWatcher.unwatchTopWindow(win);
    }
    else
    {
        // Page is not cached, there may be an unload
        win.addEventListener("unload", onUnloadTopWindow, true);
        if (FBTrace.DBG_WINDOWS)
            FBTrace.sysout("-> tabWatcher onPageHideTopWindow set unload handler "+safeGetWindowLocation(win)+"\n");
    }
}

function onUnloadTopWindow(event)
{
    var win = event.currentTarget;
    win.removeEventListener("unload", onUnloadTopWindow, true);
    if (FBTrace.DBG_WINDOWS)
        FBTrace.sysout("-> tabWatcher onUnloadTopWindow for: "+safeGetWindowLocation(win)+" typeof :"+typeof(win)+"\n");
    TabWatcher.unwatchTopWindow(win);
}

function onLoadWindowContent(event)
{
    if (FBTrace.DBG_WINDOWS)
        FBTrace.sysout("-> tabWatcher.onLoadWindowContent event.type: "+event.type+"\n");

    var win = event.currentTarget;
    try
    {
        win.removeEventListener("pageshow", onLoadWindowContent, onLoadWindowContent.capturing);
        if (FBTrace.DBG_WINDOWS) FBTrace.sysout("-> tabWatcher.onLoadWindowContent pageshow removeEventListener "+safeGetWindowLocation(win));
    }
    catch (exc)
    {
        if (FBTrace.DBG_ERRORS)
            FBTrace.sysout("-> tabWatcher.onLoadWindowContent removeEventListener pageshow fails", exc);
    }

    try
    {
        win.removeEventListener("DOMContentLoaded", onLoadWindowContent, onLoadWindowContent.capturing);
        if (FBTrace.DBG_WINDOWS) FBTrace.sysout("-> tabWatcher.onLoadWindowContent DOMContentLoaded removeEventListener "+safeGetWindowLocation(win));
    }
    catch (exc)
    {
        if (FBTrace.DBG_ERRORS)
            FBTrace.sysout("-> tabWatcher.onLoadWindowContent removeEventListener DOMContentLoaded fails", exc);
    }

    // Signal that we got the onLoadWindowContent event. This prevents the FrameProgressListener from sending it.
    var context = TabWatcher.getContextByWindow(win);
    if (context)
        context.onLoadWindowContent = true;

    try
    {
        if (FBTrace.DBG_WINDOWS)
            FBTrace.sysout("-> tabWatcher.onLoadWindowContent:"+safeGetWindowLocation(win), win);
        TabWatcher.watchLoadedTopWindow(win);
    }
    catch(exc)
    {
        if (FBTrace.DBG_ERRORS)
            FBTrace.sysout("-> tabWatchter onLoadWindowContent FAILS: "+exc, exc);
    }

}
onLoadWindowContent.capturing = false;

function onUnloadWindow(event)
{
    var win = event.currentTarget;
    var eventType = "unload";
    win.removeEventListener(eventType, onUnloadWindow, false);
    if (FBTrace.DBG_WINDOWS)
        FBTrace.sysout("-> tabWatcher.onUnloadWindow for: "+safeGetWindowLocation(win) +" removeEventListener: "+ eventType+"\n");
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

var TraceListener =
{
    onDump: function(message)
    {
        var prefix = "->";
        if (message.text.indexOf(prefix) == 0)
        {
            message.text = message.text.substr(prefix.length);
            message.text = trimLeft(message.text);
            message.type = "DBG_WINDOWS";
        }
    }
};

// ************************************************************************************************

}});
