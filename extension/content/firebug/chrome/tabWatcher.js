/* See license.txt for terms of usage */

define([
    "firebug/chrome/eventSource",
    "firebug/lib/object",
    "firebug/firebug",
    "firebug/chrome/firefox",
    "firebug/lib/xpcom",
    "firebug/net/requestObserver",
    "firebug/lib/events",
    "firebug/lib/url",
    "firebug/lib/http",
    "firebug/chrome/window",
    "firebug/lib/string",
    "firebug/lib/array",
    "firebug/trace/debug",
    "firebug/trace/traceListener",
    "firebug/trace/traceModule",
    "firebug/chrome/tabContext",
],
function(EventSource, Obj, Firebug, Firefox, Xpcom, HttpRequestObserver, Events, Url, Http, Win,
    Str, Arr, Debug, TraceListener, TraceModule) {

// ********************************************************************************************* //
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

// ********************************************************************************************* //
// Globals

var contexts = [];

var showContextTimeout = 200;

// ********************************************************************************************* //

/**
 * @object TabWatcher object is responsible for monitoring page load/unload events
 * and triggering proper Firebug UI refresh by firing events. This object is also
 * responsible for creation of a context object that contains meta-data about currently
 * debugged page.
 */
Firebug.TabWatcher = Obj.extend(new EventSource(),
/** @lends Firebug.TabWatcher */
{
    // Store contexts where they can be accessed externally
    contexts: contexts,

    initialize: function()
    {
        this.traceListener = new TraceListener("->", "DBG_WINDOWS", true);
        TraceModule.addListener(this.traceListener);

        HttpRequestObserver.addObserver(TabWatcherHttpObserver, "firebug-http-event", false);
    },

    initializeUI: function()
    {
        var tabBrowser = Firefox.getElementById("content");

        if (FBTrace.DBG_INITIALIZE)
            FBTrace.sysout("-> tabWatcher initializeUI "+tabBrowser);

        if (tabBrowser)
            tabBrowser.addProgressListener(TabProgressListener);
    },

    destroy: function()
    {
        if (FBTrace.DBG_WINDOWS)
            FBTrace.sysout("-> tabWatcher destroy");

        this.shuttingDown = true;

        HttpRequestObserver.removeObserver(TabWatcherHttpObserver, "firebug-http-event");

        var tabBrowser = Firefox.getElementById("content");
        if (tabBrowser)
        {
            try
            {
                // Exception thrown: tabBrowser.removeProgressListener is not a function
                // when Firebug is in detached state and the origin browser window is closed.
                tabBrowser.removeProgressListener(TabProgressListener);
            }
            catch (e)
            {
                FBTrace.sysout("tabWatcher.destroy; EXCEPTION " + e, e);
            }

            var browsers = Firefox.getBrowsers();
            for (var i = 0; i < browsers.length; ++i)
            {
                var browser = browsers[i];
                this.unwatchTopWindow(browser.contentWindow);
                unregisterFrameListener(browser);
            }
        }

        TraceModule.removeListener(this.traceListener);

        var listeners = TabWatcherUnloader.listeners;
        if (listeners.length > 0)
        {
            if (FBTrace.DBG_ERRORS)
            {
                FBTrace.sysout("-> tabWatcher.destroy; ERROR unregistered listeners! (" +
                    listeners.length + ")", listeners);
            }

            TabWatcherUnloader.unregisterAll();
        }
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    /**
     * Called when tabBrowser browsers get a new location OR when we get a explicit user op
     * to open Firebug.
     * Attaches to a top-level window. Creates context unless we just re-activated on an
     * existing context.
     */
    watchTopWindow: function(win, uri, userCommands)
    {
        if (FBTrace.DBG_WINDOWS)
            FBTrace.sysout("-> tabWatcher.watchTopWindow for: " +
                (uri instanceof nsIURI?uri.spec:uri) + ", tab: " +
                Win.getWindowProxyIdForWindow(win));

        if (!win)
        {
            if (FBTrace.DBG_ERRORS)
                FBTrace.sysout("-> tabWatcher.watchTopWindow should not have a null window!");
            return false;
        }

        // Do not use Firefox.getCurrentBrowser(); since the current tab can be already
        // different from what is passed into this function (see issue 4681)
        // Can be also null, if the window is just closing.
        var selectedBrowser = Win.getBrowserByWindow(win);

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

                return;  // did not create a context
            }

            // Special case for about:blank (see issue 5120)
            // HTML panel's edit mode can cause onStateChange changes and context
            // recreation.
            if (context.loaded && context == Firebug.currentContext &&
                context.getName() == aboutBlank)
            {
                FBTrace.sysout("tabWatcher.watchTopWindow; page already watched");
                return;
            }
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

        if (win instanceof Ci.nsIDOMWindow && win.parent == win && context)
        {
            // xxxHonza: This place can be called multiple times for one window, so
            // make sure event listeners are not registered twice.
            // There should be a better way to find out whether the listeners are actually
            // registered for the window.
            context.removeEventListener(win, "pageshow", onLoadWindowContent,
                onLoadWindowContent.capturing);
            context.removeEventListener(win, "DOMContentLoaded", onLoadWindowContent,
                onLoadWindowContent.capturing);

            // Re-register again since it could have been done too soon before.
            context.addEventListener(win, "pageshow", onLoadWindowContent,
                onLoadWindowContent.capturing);
            context.addEventListener(win, "DOMContentLoaded", onLoadWindowContent,
                onLoadWindowContent.capturing);

            if (FBTrace.DBG_WINDOWS)
                FBTrace.sysout("-> tabWatcher.watchTopWindow addEventListener for pageshow, " +
                    "DomContentLoaded " + Win.safeGetWindowLocation(win));
        }

        // Dispatch watchWindow for the outer most DOM window
        this.watchWindow(win, context);

        // This is one of two places that loaded is set. The other is in watchLoadedTopWindow
        if (context && !context.loaded)
        {
            context.loaded = !context.browser.webProgress.isLoadingDocument;

            // If the loaded flag is set, the proper event should be dispatched.
            if (context.loaded)
                Events.dispatch(this.fbListeners, "loadedContext", [context]);

            if (FBTrace.DBG_WINDOWS)
                FBTrace.sysout("-> tabWatcher context " +
                    (context.loaded ? '*** LOADED ***' : 'isLoadingDocument') +
                    " in watchTopWindow, id: "+context.uid+", uri: "+
                    (uri instanceof nsIURI ? uri.spec : uri));
        }

        if (context && !context.loaded && !context.showContextTimeout)
        {
            this.rushShowContextTimeout(win, context, 20);
        }
        else
        {
            if (FBTrace.DBG_WINDOWS)
                FBTrace.sysout("-> watchTopWindow context.loaded:" + context.loaded + " for " +
                    context.getName());

            this.rushShowContext(win, context);
        }

        return context;  // we did create or find a context
    },

    rushShowContextTimeout: function(win, context, tryAgain)
    {
        if (FBTrace.DBG_WINDOWS)
            FBTrace.sysout("-> rushShowContextTimeout: tryAgain: " + tryAgain);

        // still loading, we want to showContext one time but not too aggressively
        var handler = Obj.bindFixed(function delayShowContext()
        {
            if (FBTrace.DBG_WINDOWS)
                FBTrace.sysout("-> watchTopWindow delayShowContext id:" +
                    context.showContextTimeout, context);

            if (context.browser && context.browser.webProgress.isLoadingDocument && --tryAgain > 0)
            {
                this.rushShowContextTimeout(win, context, tryAgain);
                return;
            }

            // Sometimes context.window is not defined, especially when running tests.
            if (context.window)
            {
                this.rushShowContext(win, context);  // calls showContext
            }
            else
            {
                if (FBTrace.DBG_ERRORS)
                    FBTrace.sysout("tabWatcher watchTopWindow no context.window " +
                        (context.browser? context.browser.currentURI.spec :
                        " and no context.browser"));
            }
        }, this);

        context.showContextTimeout = window.setTimeout(handler, showContextTimeout);
    },

    rushShowContext: function(win, context)
    {
        // then the timeout even has not run, we'll not need it after all.
        if (context.showContextTimeout)
            clearTimeout(context.showContextTimeout);
        delete context.showContextTimeout;

        // Call showContext only for currently active tab.
        var currentURI = Firefox.getCurrentURI();
        if (!currentURI || currentURI.spec != context.browser.currentURI.spec)
        {
            if (FBTrace.DBG_WINDOWS)
            {
                FBTrace.sysout("-> rushShowContext: Do not show context as it's not " +
                    "the active tab: " + context.browser.currentURI.spec);
            }
            return;
        }

        this.watchContext(win, context);  // calls showContext
    },

    // Listeners decide to show or not
    shouldShowContext: function(context)
    {
        if (Events.dispatch2(this.fbListeners, "shouldShowContext", [context]))
            return true;
        else
            return false;
    },

    // Listeners given force-in and veto on URIs/Window.
    shouldCreateContext: function(browser, url, userCommands)
    {
        // called when win has no context, answers the question: create one, true or false?

        if (!this.fbListeners)
            return userCommands;

        // Do not Create if any Listener says true to shouldNotCreateContext
        if (Events.dispatch2(this.fbListeners, "shouldNotCreateContext",
            [browser, url, userCommands]))
        {
            if (FBTrace.DBG_ACTIVATION)
                FBTrace.sysout("-> shouldNotCreateContext vetos create context for: " + url);
            return false;
        }

        if (FBTrace.DBG_ACTIVATION)
            FBTrace.sysout("-> shouldCreateContext FBLISTENERS", this.fbListeners);

        // Create if any listener says true to showCreateContext
        if (Events.dispatch2(this.fbListeners, "shouldCreateContext",
            [browser, url, userCommands]))
        {
             if (FBTrace.DBG_ACTIVATION)
                 FBTrace.sysout("-> shouldCreateContext with user: "+userCommands+
                    " one listener says yes to "+ url, this.fbListeners);
            return true;
        }

        if (FBTrace.DBG_ACTIVATION)
            FBTrace.sysout("-> shouldCreateContext with user: "+userCommands +
                " no opinion for: "+ url);

        // create if user said so and no one else has an opinion.
        return userCommands;
    },

    createContext: function(win, browser, contextType)
    {
        // If the page is reloaded, store the persisted state from the previous
        // page on the new context
        var persistedState = browser.persistedState;
        delete browser.persistedState;
        var location = Win.safeGetWindowLocation(win).toString();
        //if (!persistedState || persistedState.location != location)
        //    persistedState = null;

        // xxxHonza, xxxJJB: web application detection. Based on domain check.
        var prevDomain = persistedState ? Url.getDomain(persistedState.location) : null;
        var domain = Url.getDomain(location);
        // Remove this, see 3484
        //if (!persistedState || prevDomain != domain)
        //    persistedState = null;

        // The proper instance of Firebug.chrome object (different for detached Firebug and
        // accessible as Firebug.chrome property) must be used for the context object.
        // (the global context object Firebug.currentContext is also different for
        // detached Firebug).
        var context = new contextType(win, browser, Firebug.chrome, persistedState);
        contexts.push(context);

        context.uid =  Obj.getUniqueId();

        browser.showFirebug = true; // this is the only place we should set showFirebug.

        if (FBTrace.DBG_WINDOWS || FBTrace.DBG_ACTIVATION)
        {
            FBTrace.sysout("-> tabWatcher *** INIT *** context, id: " + context.uid +
                ", " + context.getName() + " browser " + browser.currentURI.spec +
                " Firebug.chrome.window: " + Firebug.chrome.window.location +
                " context.window: " + Win.safeGetWindowLocation(context.window));
        }

        Events.dispatch(this.fbListeners, "initContext", [context, persistedState]);

        return context;
    },

    /**
     * Called once the document within a tab is completely loaded.
     */
    watchLoadedTopWindow: function(win)
    {
        var isSystem = Url.isSystemPage(win);

        var context = this.getContextByWindow(win);
        if (context && !context.window)
        {
            if (FBTrace.DBG_WINDOWS)
                FBTrace.sysout("-> tabWatcher.watchLoadedTopWindow bailing !!!, context.window: " +
                    context.window + ", isSystem: " + isSystem);

            this.unwatchTopWindow(win);
            this.watchContext(win, null, isSystem);
            return;
        }

        if (FBTrace.DBG_WINDOWS)
            FBTrace.sysout("-> watchLoadedTopWindow context: " +
                (context ? (context.uid + ", loaded=" + context.loaded) : "undefined")+
                ", " + Win.safeGetWindowLocation(win));

        if (context && !context.loaded)
        {
            context.loaded = true;

            if (FBTrace.DBG_WINDOWS)
                FBTrace.sysout("-> Context *** LOADED *** in watchLoadedTopWindow, id: " +
                    context.uid + ", uri: " + Win.safeGetWindowLocation(win));

            Events.dispatch(this.fbListeners, "loadedContext", [context]);

            // DOMContentLoaded arrived. Whether or not we did showContext at 400ms, do it now.
            this.rushShowContext(win, context);
        }
    },

    /**
     * Attaches to a window that may be either top-level or a frame within the page.
     */
    watchWindow: function(win, context, skipCompletedDocuments)
    {
        if (!context)
            context = this.getContextByWindow(Win.getRootWindow(win));

        var location = Win.safeGetWindowLocation(win);

        // For every window we watch, prepare for unwatch. It's OK if this is called
        // more times (see 2695).
        if (context)
            TabWatcherUnloader.registerWindow(win);

        try
        {
            // If the documents is already completed do not register the window
            // it should be registered already at this point
            // This condition avoids situation when "about:document-onload-blocker"
            // and STATE_START is fired for a window, which is consequently never
            // firing "unload" and so, stays registered within context.windows
            // See issue 5582 (comment #4)
            if (skipCompletedDocuments && win.document.readyState == "complete")
                return;
        }
        catch (err)
        {
        }

        // Unfortunately, dummy requests that trigger the call to watchWindow
        // are called several times, so we have to avoid dispatching watchWindow
        // more than once
        if (context && context.windows.indexOf(win) == -1)
        {
            context.windows.push(win);

            if (FBTrace.DBG_WINDOWS)
            {
                FBTrace.sysout("-> tabWatcher.watchWindow; " + Win.safeGetWindowLocation(win) +
                    " [" + Win.getWindowId(win).toString() + "] " + context.windows.length +
                    " - " + win.document.readyState);
            }

            Events.dispatch(this.fbListeners, "watchWindow", [context, win]);

            if (FBTrace.DBG_WINDOWS)
            {
                FBTrace.sysout("-> watchWindow for: " + location + ", context: " + context.uid);

                if (context)
                {
                    for (var i = 0; i < context.windows.length; i++)
                        FBTrace.sysout("context: " + context.uid + ", window in context: " +
                            context.windows[i].location.href);
                }
            }

            context.addEventListener(win, "load", onLoadWindow, false);
        }
    },

    /**
     * Detaches from a top-level window. Destroys context
     * Called when windows are closed, or user closes firebug
     */
    unwatchTopWindow: function(win)
    {
        // Ignore about:blank pages
        // xxxHonza: we can't ignore about blank pages, the context is created for them too.
        //if (win.location == aboutBlank)
        //    return;

        var context = this.getContextByWindow(win);
        if (FBTrace.DBG_WINDOWS)
        {
            FBTrace.sysout("-> tabWatcher.unwatchTopWindow for: " +
                (context ? context.getWindowLocation() : "NULL Context") +
                ", context: " + context);
        }

        this.unwatchContext(win, context);

        // Make sure all listeners ('unload' and 'pagehide') are removed.
        Win.iterateWindows(win, function(win)
        {
            TabWatcherUnloader.unregisterWindow(win);
        });

        // we might later allow extensions to reject unwatch
        return true;
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
            {
                FBTrace.sysout("unwatchWindow: ERROR no context for win " +
                    Win.safeGetWindowLocation(win));
            }
            return;
        }

        var index = context.windows.indexOf(win);
        if (FBTrace.DBG_WINDOWS)
        {
            FBTrace.sysout("-> tabWatcher.unwatchWindow; " + Win.safeGetWindowLocation(win) +
                " [" + Win.getWindowId(win).toString() + "] " + context.windows.length +
                " - " + win.document.readyState);
        }

        if (index != -1)
        {
            context.windows.splice(index, 1);
            Events.dispatch(this.fbListeners, "unwatchWindow", [context, win]);
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
            var uri = Http.safeGetURI(browser);
            FBTrace.sysout("-> tabWatcher.watchBrowser for: " +
                (uri instanceof nsIURI?uri.spec:uri));
        }

        registerFrameListener(browser);

        var shouldDispatch = this.watchTopWindow(browser.contentWindow,
            Http.safeGetURI(browser), true);
        if (shouldDispatch)
        {
            Events.dispatch(this.fbListeners, "watchBrowser", [browser]);
            return true;
        }

        return false;
    },

    /**
     * User closes Firebug
     */
    unwatchBrowser: function(browser, userCommands)
    {
        if (FBTrace.DBG_WINDOWS)
        {
            var uri = Http.safeGetURI(browser);
            FBTrace.sysout("-> tabWatcher.unwatchBrowser for: " +
                (uri instanceof nsIURI ? uri.spec : uri) + " user commands: " + userCommands +
                (browser ? "" : "NULL BROWSER"));
        }

        if (!browser)
            return;

        delete browser.showFirebug;

        unregisterFrameListener(browser);

        var shouldDispatch = this.unwatchTopWindow(browser.contentWindow);

        if (shouldDispatch)
        {
            Events.dispatch(this.fbListeners, "unwatchBrowser", [browser, userCommands]);
            return true;
        }
        return false;
    },

    // called when tabs change in firefox
    watchContext: function(win, context, isSystem)
    {
        if (this.shuttingDown)
            return;

        var browser = context ? context.browser : this.getBrowserByWindow(win);
        if (browser)
            browser.isSystemPage = isSystem;

        if (FBTrace.DBG_WINDOWS)
            FBTrace.sysout("-> tabWatcher context *** SHOW *** (watchContext), id: " +
                (context?context.uid:"null")+", uri: "+win.location.href);

        // context is null if we don't want to debug this browser
        Events.dispatch(this.fbListeners, "showContext", [browser, context]);
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

                // context is null if we don't want to debug this browser
                Events.dispatch(this.fbListeners, "showContext", [browser, null]);
            }

            Events.dispatch(this.fbListeners, "destroyContext",
                [null, (browser ? browser.persistedState : null), browser]);
            return;
        }

        var persistedState = {location: context.getWindowLocation()};
        context.browser.persistedState = persistedState;  // store our state on FF browser elt

        Win.iterateWindows(context.window, function(win)
        {
            Events.dispatch(Firebug.TabWatcher.fbListeners, "unwatchWindow", [context, win]);
        });

        Events.dispatch(this.fbListeners, "destroyContext", [context, persistedState, context.browser]);

        if (FBTrace.DBG_WINDOWS || FBTrace.DBG_ACTIVATION)
        {
            FBTrace.sysout("-> tabWatcher.unwatchContext *** DESTROY *** context " + context.uid +
                " for: " + (context.window && !context.window.closed?context.window.location :
                "no window or closed ") + " aborted: " + context.aborted);
        }

        context.destroy(persistedState);

        // Remove context from the list of contexts.
        Arr.remove(contexts, context);

        for (var name in context)
            delete context[name];

        // unwatchContext can be called on an unload event after another tab is selected
        var currentBrowser = Firefox.getCurrentBrowser();
        if (!currentBrowser.showFirebug)
        {
            // context is null if we don't want to debug this browser
            Events.dispatch(this.fbListeners, "showContext", [currentBrowser, null]);
        }
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    getContextByWindow: function(winIn)
    {
        if (!winIn)
            return;

        var rootWindow = Win.getRootWindow(winIn);

        if (FBTrace.DBG_ROOT_WINDOW) // too much output to use INITIALIZE
            FBTrace.sysout("winIn: "+Win.safeGetWindowLocation(winIn).substr(0,50)+
                " rootWindow: "+Win.safeGetWindowLocation(rootWindow));

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

    getContextByGlobal: function(global)
    {
        return this.getContextByWindow(global) || this.getContextBySandbox(global);
    },

    getContextByTabActor: function(tabActor)
    {
        if (!tabActor)
            return;

        for (var i=0; i<contexts.length; i++)
        {
            var context = contexts[i];
            if (context.tabClient && context.tabClient._actor == tabActor)
                return context;
        }
    },

    // deprecated, use Win.getBrowserByWindow
    getBrowserByWindow: function(win)
    {
        if (this.shuttingDown)
            return null;

        var browsers = Firefox.getBrowsers();
        for (var i = 0; i < browsers.length; ++i)
        {
            var browser = browsers[i];
            if (browser.contentWindow == win)
            {
                registerFrameListener(browser); // Yikes side effect!
                return browser;
            }
        }

        return null;
    },

    iterateContexts: function(fn)
    {
        for (var i = 0; i < contexts.length; ++i)
        {
            try
            {
                var rc = fn(contexts[i]);
                if (rc)
                    return rc;
            }
            catch (err)
            {
                if (FBTrace.DBG_ERRORS)
                    FBTrace.sysout("-> tabWatcher.iterateContexts; EXCEPTION " + err, err);
            }
        }
    },

    // Called by script panel, not sure where this belongs.
    reloadPageFromMemory: function(context)
    {
        if (!context)
            context = Firebug.currentContext;

        if (context.browser)
            context.browser.reloadWithFlags(Ci.nsIWebNavigation.LOAD_FLAGS_CHARSET_CHANGE);
        else
            context.window.location.reload();
    },
});

// ********************************************************************************************* //

var TabWatcherUnloader =
{
    listeners: [],

    registerWindow: function(win)
    {
        var root = (win.parent == win);
        var eventName = (root && (win.location.href !== aboutBlank)) ? "pagehide" : "unload";
        var listener = Obj.bind(root ? this.onPageHide : this.onUnload, this);
        Events.addEventListener(win, eventName, listener, false);

        if (FBTrace.DBG_WINDOWS)
            FBTrace.sysout("-> tabWatcher.registerWindow; addEventListener for " + eventName+
                " on " + Win.safeGetWindowLocation(win));

        this.listeners.push({
            window: win,
            listener: listener,
            eventName: eventName
        });
    },

    unregisterWindow: function(win)
    {
        var newListeners = [];
        for (var i=0; i<this.listeners.length; i++)
        {
            var listener = this.listeners[i];
            if (listener.window != win)
            {
                newListeners.push(listener);
            }
            else
            {
                Events.removeEventListener(win, listener.eventName, listener.listener, false);

                if (FBTrace.DBG_WINDOWS)
                    FBTrace.sysout("-> tabWatcher.unregisterWindow; removeEventListener for " +
                        listener.eventName + " on " + Win.safeGetWindowLocation(win));
            }
        }
        this.listeners = newListeners;
    },

    unregisterAll: function()
    {
        for (var i=0; i<this.listeners.length; i++)
        {
            var listener = this.listeners[i];
            Events.removeEventListener(listener.win, listener.eventName, listener.listener, false);
        }

        this.listeners = [];
    },

    onPageHide: function(event)
    {
        var win = event.currentTarget;
        this.unregisterWindow(win);

        if (FBTrace.DBG_WINDOWS)
            FBTrace.sysout("-> tabWatcher.Unloader; PAGE HIDE (" +
                this.listeners.length + ") " + win.location, event);

        onPageHideTopWindow(event);
    },

    onUnload: function(event)
    {
        var win = event.currentTarget;
        this.unregisterWindow(win);

        if (FBTrace.DBG_WINDOWS)
            FBTrace.sysout("-> tabWatcher.Unloader; PAGE UNLOAD (" +
                this.listeners.length + ") " + win.location, event);

        onUnloadWindow(event);
    },
};

Firebug.TabWatcherUnloader = TabWatcherUnloader;

// ********************************************************************************************* //

// xxxHonza: I don't know why, but CSSStyleSheetPanel.destroy invokes
// FrameProgressListener.onStateChange again. Switch between two tabs
// with Firebug UI opened (the same domain) to see the scenario.
// Caused by accessing |this.panelNode.scrollTop|
// So, do not reexecute locationChange if it's in progress.
var locationInProgress = false;

var TabProgressListener = Obj.extend(Http.BaseProgressListener,
{
    onLocationChange: function(progress, request, uri)
    {
        if (locationInProgress)
        {
            FBTrace.sysout("tabWatcher.onLocationChange; already IN-PROGRESS")
            return;
        }

        locationInProgress = true;

        try
        {
            this.doLocationChange(progress, request, uri);
        }
        catch (e)
        {
        }
        finally
        {
            locationInProgress = false;
        }
    },

    doLocationChange: function(progress, request, uri)
    {
        // Only watch windows that are their own parent - e.g. not frames
        if (progress.DOMWindow.parent == progress.DOMWindow)
        {
            var srcWindow = Http.getWindowForRequest(request);
            var browser = srcWindow ? Firebug.TabWatcher.getBrowserByWindow(srcWindow) : null;

            if (FBTrace.DBG_WINDOWS || FBTrace.DBG_ACTIVATION)
            {
                var requestFromFirebuggedWindow = browser && browser.showFirebug;
                FBTrace.sysout("-> TabProgressListener.onLocationChange "+
                    progress.DOMWindow.location+" to: "+
                    (uri?uri.spec:"null location")+
                    (requestFromFirebuggedWindow?" from firebugged window":" no firebug"));
            }

            // See issue 4040 xxxHonza: different patch must be used.
            // 1) We don't want to skip about:blank since Firebug UI is not update when
            // switching to about:blank tab, see issue 4040
            //
            // 2) But we also want to skip "about:blank" in case a new tab is opened
            // (new tab is about:blank at the beggining), no context exists and Firebug
            // is suspended for all contexts, see issue5916
            // There is a workaround for this case in {@TabWatchListener.showContext]
            //
            // the onStateChange will deal with this troublesome case
            // This must stay disabled otherwise firebug/4040 test fails
            // See also a comment in {@link NetMonitor.onModifyRequest}
            //if (uri && uri.spec === "about:blank")
            //    return;

            // document.open() was called, the document was cleared.
            if (uri && uri.scheme === "wyciwyg")
                evictTopWindow(progress.DOMWindow, uri);

            if (uri)
                Firebug.TabWatcher.watchTopWindow(progress.DOMWindow, uri);
            else // the location change to a non-uri means we need to hide
                Firebug.TabWatcher.watchContext(progress.DOMWindow, null, true);
        }
    },

    onStateChange: function(progress, request, flag, status)
    {
        if (FBTrace.DBG_WINDOWS)
        {
            var win = progress.DOMWindow;
            FBTrace.sysout("-> TabProgressListener.onStateChanged for: " +
                Http.safeGetRequestName(request) + ", win: " + win.location.href +
                ", content URL: " + (win.document ? win.document.URL : "no content URL") +
                " " + Http.getStateDescription(flag));
        }
    }
});

// ********************************************************************************************* //
// Obsolete

var stateInProgress = false;
var FrameProgressListener = Obj.extend(Http.BaseProgressListener,
{
    onStateChange: function(progress, request, flag, status)
    {
        if (stateInProgress)
        {
            FBTrace.sysout("tabWatcher.onStateChange; already IN-PROGRESS")
            return;
        }

        stateInProgress = true;

        try
        {
            this.doStateChange(progress, request, flag, status)
        }
        catch (e)
        {
        }
        finally
        {
            stateInProgress = false;
        }
    },

    doStateChange: function(progress, request, flag, status)
    {
        if (FBTrace.DBG_WINDOWS)
        {
            var win = progress.DOMWindow;
            FBTrace.sysout("-> FrameProgressListener.onStateChanged for: " +
                Http.safeGetRequestName(request) + ", win: " + win.location.href +
                ", content URL: " + (win.document ? win.document.URL : "no content URL") +
                " " + Http.getStateDescription(flag) + ", " + status);
        }

        if (flag & STATE_IS_REQUEST && flag & STATE_START)
        {
            // We need to get the hook in as soon as the new DOMWindow is created, but before
            // it starts executing any scripts in the page.  After lengthy analysis, it seems
            // that the start of these "dummy" requests is the only state that works.

            var safeName = Http.safeGetRequestName(request);
            if (safeName && ((safeName == dummyURI) || safeName == "about:document-onload-blocker"))
            {
                var win = progress.DOMWindow;

                // Another weird edge case here - when opening a new tab with about:blank,
                // "unload" is dispatched to the document, but onLocationChange is not called
                // again, so we have to call watchTopWindow here

                // xxxHonza: we need to use (win.location.href == "about:blank")
                // Otherwise the DOM panel is updated too soon (when doc.readyState == "loading")
                // xxxHonza: onLocationChange doesn't fire for reopened tabs
                // (using Undo Closed Tab) menu action.
                // xxxHonza: iterating DOM window properties that happens in
                // {@link DOMMemberProvider} can cause reflow and break {@link TabContext}
                // initialization after Firefox tab is reopened using "Undo Close Tab" action.
                // See also: http://code.google.com/p/fbug/issues/detail?id=7340#c3
                // If win.document.readyState == "interactive" condition is used than test
                // script/3985/issue3985.js fails since the FBTest.reload (i.e. waitForWindowLoad)
                // doesn't catch "MozAfterPaint" event (issue in FBTest API).
                // See also issue 7364
                if (win.parent == win && (win.location.href == aboutBlank))
                {
                    Firebug.TabWatcher.watchTopWindow(win, win.location.href);
                    return;
                }
                else
                {
                    Firebug.TabWatcher.watchWindow(win, null, true);
                }
            }
        }

        // Later I discovered that XHTML documents don't dispatch the dummy requests, so this
        // is our best shot here at hooking them.
        if (flag & STATE_IS_DOCUMENT && flag & STATE_TRANSFERRING)
        {
            Firebug.TabWatcher.watchWindow(progress.DOMWindow);
            return;
        }

    }
});

// Obsolete
// Registers frame listener for specified tab browser.
function registerFrameListener(browser)
{
    if (browser.frameListener)
        return;

    browser.frameListener = FrameProgressListener;  // just a mark saying we've registered. TODO remove!
    browser.addProgressListener(FrameProgressListener);

    if (FBTrace.DBG_WINDOWS)
    {
        var win = browser.contentWindow;
        FBTrace.sysout("-> tabWatcher register FrameProgressListener for: "+
            Win.safeGetWindowLocation(win)+", tab: "+Win.getWindowProxyIdForWindow(win));
    }
}

function unregisterFrameListener(browser)
{
    if (browser.frameListener)
    {
        delete browser.frameListener;
        browser.removeProgressListener(FrameProgressListener);
    }

    if (FBTrace.DBG_WINDOWS)
    {
        var win = browser.contentWindow;
        FBTrace.sysout("-> tabWatcher unregister FrameProgressListener for: "+
            Win.safeGetWindowLocation(win)+", tab: "+Win.getWindowProxyIdForWindow(win));
    }
}

// ********************************************************************************************* //

function getRefererHeader(request)
{
    var http = Xpcom.QI(request, Ci.nsIHttpChannel);
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

// ********************************************************************************************* //

var TabWatcherHttpObserver = Obj.extend(Object,
{
    dispatchName: "TabWatcherHttpObserver",

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
            Debug.ERROR(err);
        }
    },

    onModifyRequest: function(request)
    {
        var win = Http.getWindowForRequest(request);
        if (win)
            var tabId = Win.getWindowProxyIdForWindow(win);

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
            if ((FBTrace.DBG_ACTIVATION || FBTrace.DBG_WINDOWS) && win == win.parent)
            {
                FBTrace.sysout("-> tabWatcher Firebug.TabWatcherHttpObserver *** START *** " +
                    "document request for: " + request.URI.spec + " window for request is "+
                    Win.safeGetWindowLocation(win));
            }

            if (win == win.parent)
            {
                // Make sure the frame listener is registered for top level window, so
                // we can get all onStateChange events and init context for all opened tabs.
                var browser = Firebug.TabWatcher.getBrowserByWindow(win);

                if (!browser)
                    return;

                delete browser.FirebugLink;

                // then this page is opened in new tab or window
                if (Win.safeGetWindowLocation(win).toString() == aboutBlank)
                {
                    var referer = getRefererHeader(request);
                    if (referer)
                    {
                        try
                        {
                            var srcURI = Url.makeURI(referer);
                            browser.FirebugLink = {src: srcURI, dst: request.URI};
                        }
                        catch(e)
                        {
                            if (FBTrace.DBG_ERRORS)
                                FBTrace.sysout("tabWatcher.onModifyRequest failed to make URI from "+
                                    referer+" because "+exc, exc);
                        }
                    }
                }
                else
                {
                    // Here we know the source of the request is 'win'. For viral activation
                    // and web app tracking
                    browser.FirebugLink = {src: browser.currentURI, dst: request.URI};
                }
                if (FBTrace.DBG_ACTIVATION && browser.FirebugLink)
                    FBTrace.sysout("tabWatcher.onModifyRequest created FirebugLink from "+
                        browser.FirebugLink.src.spec + " to "+browser.FirebugLink.dst.spec);
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

// ********************************************************************************************* //
// Local Helpers

function onPageHideTopWindow(event)
{
    var win = event.currentTarget;  // we set the handler on a window
    var doc = event.target; // the pagehide is sent to the document.
    if (doc.defaultView != win)
        return; // ignore page hides on interior windows

    if (FBTrace.DBG_WINDOWS)
        FBTrace.sysout("-> tabWatcher pagehide event.currentTarget "+
            Win.safeGetWindowLocation(win), event);

    // http://developer.mozilla.org/en/docs/Using_Firefox_1.5_caching#pagehide_event
    // then the page is cached and there cannot be an unload handler
    if (event.persisted || Win.safeGetWindowLocation(win) === aboutBlank)
    {
        //  see Bug 484710 -  add pageIgnore event for pages that are ejected from the bfcache
        if (FBTrace.DBG_WINDOWS)
            FBTrace.sysout("-> tabWatcher onPageHideTopWindow for: " +
                Win.safeGetWindowLocation(win));

        Firebug.TabWatcher.unwatchTopWindow(win);
    }
    else
    {
        // Page is not cached, there may be an unload
        Events.addEventListener(win, "unload", onUnloadTopWindow, true);

        if (FBTrace.DBG_WINDOWS)
            FBTrace.sysout("-> tabWatcher onPageHideTopWindow set unload handler " +
                Win.safeGetWindowLocation(win));
    }
}

function evictTopWindow(win, uri)
{
    if (FBTrace.DBG_WINDOWS)
        FBTrace.sysout("-> tabWatcher evictTopWindow win "+Win.safeGetWindowLocation(win) +
            " uri "+uri.spec);

    Firebug.TabWatcher.unwatchTopWindow(win);
}

function onUnloadTopWindow(event)
{
    var win = event.currentTarget;
    Events.removeEventListener(win, "unload", onUnloadTopWindow, true);

    if (FBTrace.DBG_WINDOWS)
        FBTrace.sysout("-> tabWatcher onUnloadTopWindow for: " + Win.safeGetWindowLocation(win) +
            " typeof: " + typeof(win));

    Firebug.TabWatcher.unwatchTopWindow(win);
}

function onLoadWindowContent(event)
{
    if (FBTrace.DBG_WINDOWS)
        FBTrace.sysout("-> tabWatcher.onLoadWindowContent event.type: " + event.type);

    var win = event.currentTarget;
    try
    {
        Events.removeEventListener(win, "pageshow", onLoadWindowContent,
            onLoadWindowContent.capturing);

        if (FBTrace.DBG_WINDOWS)
            FBTrace.sysout("-> tabWatcher.onLoadWindowContent pageshow removeEventListener " +
                Win.safeGetWindowLocation(win));
    }
    catch (exc)
    {
        if (FBTrace.DBG_ERRORS)
            FBTrace.sysout("-> tabWatcher.onLoadWindowContent removeEventListener pageshow fails",
                exc);
    }

    try
    {
        Events.removeEventListener(win, "DOMContentLoaded", onLoadWindowContent,
            onLoadWindowContent.capturing);

        if (FBTrace.DBG_WINDOWS)
            FBTrace.sysout("-> tabWatcher.onLoadWindowContent DOMContentLoaded " +
                "removeEventListener " + Win.safeGetWindowLocation(win));
    }
    catch (exc)
    {
        if (FBTrace.DBG_ERRORS)
            FBTrace.sysout("-> tabWatcher.onLoadWindowContent removeEventListener " +
                "DOMContentLoaded fails", exc);
    }

    // Signal that we got the onLoadWindowContent event. This prevents the
    // FrameProgressListener from sending it.
    var context = Firebug.TabWatcher.getContextByWindow(win);
    if (context)
        context.onLoadWindowContent = true;

    try
    {
        if (FBTrace.DBG_WINDOWS)
            FBTrace.sysout("-> tabWatcher.onLoadWindowContent:" +
                Win.safeGetWindowLocation(win), win);

        Firebug.TabWatcher.watchLoadedTopWindow(win);
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

    if (FBTrace.DBG_WINDOWS)
    {
        FBTrace.sysout("-> tabWatcher.onUnloadWindow for: " + Win.safeGetWindowLocation(win) +
            " removeEventListener: "+ eventType);
    }

    Firebug.TabWatcher.unwatchWindow(win);
}

// ********************************************************************************************* //

function onLoadWindow(event)
{
    var win = event.currentTarget;

    Events.removeEventListener(win, "load", onLoadWindow, false);

    var context = Firebug.TabWatcher.getContextByWindow(win);
    if (!context)
    {
        if (FBTrace.DBG_ERRORS)
            FBTrace.sysout("-> onLoadWindow: ERROR No context for loaded window!");
        return;
    }

    Events.dispatch(Firebug.TabWatcher.fbListeners, "loadWindow", [context, win]);
}

// ********************************************************************************************* //

window.__defineGetter__("TabWatcher", function deprecatedTabWatcher()
{
    if (FBTrace.DBG_ERRORS)
        FBTrace.sysout("deprecated TabWatcher global accessed");

    return Firebug.TabWatcher;
});

// ********************************************************************************************* //
// Registration

return Firebug.TabWatcher;

// ********************************************************************************************* //
});
