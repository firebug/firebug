/* See license.txt for terms of usage */

FBL.ns(function() { with (FBL) {

// ************************************************************************************************
// Constants

const nsIWebNavigation = CI("nsIWebNavigation");
const nsIWebProgressListener = CI("nsIWebProgressListener");
const nsIWebProgress = CI("nsIWebProgress");
const nsISupportsWeakReference = CI("nsISupportsWeakReference");
const nsISupports = CI("nsISupports");

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
var listeners = [];

// ************************************************************************************************

top.TabWatcher =
{
    initialize: function(owner)
    {
        // Store contexts where they can be accessed externally
        this.contexts = contexts;

        this.owner = owner;  // Firebug object
        this.addListener(owner);

        if (tabBrowser)
            tabBrowser.addProgressListener(TabProgressListener, NOTIFY_STATE_DOCUMENT);
    },

    destroy: function()
    {
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

    activate: function()
    {
        if (tabBrowser)
            this.watchBrowser(tabBrowser.selectedBrowser);
    },

    deactivate: function()
    {
        if (tabBrowser)
        {
            var currentSelected = false;
            for (var i = 0; i < tabBrowser.browsers.length; ++i)
            {
                var browser = tabBrowser.browsers[i];
                if (!this.owner.isURIAllowed(safeGetURI(browser)))
                {
                    this.unwatchTopWindow(browser.contentWindow);

                    if (browser == tabBrowser.selectedBrowser)
                        currentSelected = true;
                }
            }
            return currentSelected;
        }
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    /**
     * Attaches to a top-level window. Creates context unless we just re-activated on an existing context
     */
    watchTopWindow: function(win, uri)
    {
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
                return this.watchContext(win, null);
            }
        }

        if (!context)
        {
            var browser = this.getBrowserByWindow(win);
            if (!fbs.countContext(true))
                return;

            // If the page is reloaded, store the persisted state from the previous
            // page on the new context
            var persistedState = browser.persistedState;
            delete browser.persistedState;
            if (!persistedState || persistedState.location != win.location.href)
                persistedState = null;

            context = this.owner.createTabContext(win, browser, browser.chrome, persistedState);
            contexts.push(context);

            if (FBTrace.DBG_WINDOWS) {                                                                                 /*@explore*/
                context.uid = FBL.getUniqueId();                                                                       /*@explore*/
                FBTrace.sysout("tabWatcher created context with id="+context.uid+" for uri="+uri+" and win.location.href="+win.location.href+"\n"); /*@explore*/
            }                                                                                                          /*@explore*/
                                                                                                                       /*@explore*/
            this.dispatch("initContext", [context]);

            win.addEventListener("pagehide", onUnloadTopWindow, true);
            win.addEventListener("pageshow", onLoadWindowContent, true);
            win.addEventListener("DOMContentLoaded", onLoadWindowContent, true);
            if (FBTrace.DBG_INITIALIZE)                                                                                /*@explore*/
                FBTrace.sysout("tabWatcher.watchTopWindow pagehide, pageshow, DomContentLoaded addEventListener\n");   /*@explore*/
        }
        // XXXjjb at this point we either have context or we just pushed null into contexts and sent it to init...

        // This is one of two places that loaded is set. The other is in watchLoadedTopWindow
        if (context)
            context.loaded = !context.browser.webProgress.isLoadingDocument;

        if (FBTrace.DBG_WINDOWS && context.loaded)                                                                     /*@explore*/
            FBTrace.sysout("***************> Context loaded in tabWatcher.watchTopWindow\n");                          /*@explore*/
        this.watchContext(win, context);
    },

    /**
     * Called once the document within a tab is completely loaded.
     */
    watchLoadedTopWindow: function(win)
    {
        var isSystem = isSystemPage(win);

        var context = this.getContextByWindow(win);
        if ((context && !context.window) || (isSystem && !Firebug.allowSystemPages))
        {
            if (FBTrace.DBG_WINDOWS)                                                                                   /*@explore*/
                FBTrace.sysout("tabWatcher.watchLoadedTopWindow bailing, context.window:"+context.window+" isSystem:"+isSystem+"\n"); /*@explore*/
            this.unwatchTopWindow(win);
            this.watchContext(win, null, isSystem);
            return;
        }

        if (FBTrace.DBG_WINDOWS)                                                                                       /*@explore*/
            FBTrace.sysout("watchLoadedTopWindow context="+(context?(context.uid+" loaded="+context.loaded):'undefined')+"\n"); /*@explore*/
                                                                                                                       /*@explore*/
        if (context && !context.loaded)
        {
            context.loaded = true;
            if (FBTrace.DBG_WINDOWS)                                                                                   /*@explore*/
                FBTrace.sysout("***************> Context loaded in tabWatcher.watchLoadedTopWindow\n");                /*@explore*/
            this.dispatch("loadedContext", [context]);
        }
    },

    /**
     * Attaches to a window that may be either top-level or a frame within the page.
     */
    watchWindow: function(win, context)
    {
        if (!context)
            context = this.getContextByWindow(getRootWindow(win));

        // Unfortunately, dummy requests that trigger the call to watchWindow
        // are called several times, so we have to avoid dispatching watchWindow
        // more than once
        var href = win.location.href;
                                                                                                                       /*@explore*/
        if (FBTrace.DBG_WINDOWS) {                                                                                     /*@explore*/
            FBTrace.sysout("watchWindow for href="+href+" context="+context+"\n");                                     /*@explore*/
            if (context)                                                                                               /*@explore*/
                for (var i = 0; i < context.windows.length; i++)                                                       /*@explore*/
                    FBTrace.sysout("watchWindow context("+context.uid+").windows["+i+"]= ("                            /*@explore*/
                             +context.windows[i].__firebug__uid+") "+context.windows[i].location.href+"\n");           /*@explore*/
        }                                                                                                              /*@explore*/
                                                                                                                       /*@explore*/
        if (context && context.windows.indexOf(win) == -1 && href != aboutBlank)
        {
            context.windows.push(win);

            if (FBTrace.DBG_WINDOWS)                                                                                   /*@explore*/
                FBTrace.sysout("watchWindow sets context for href="+href+"\n");                                        /*@explore*/
                                                                                                                       /*@explore*/
            var eventType = (win.parent == win) ? "pagehide" : "unload";
            win.addEventListener(eventType, onUnloadWindow, false);
            if (FBTrace.DBG_INITIALIZE) FBTrace.sysout("tabWatcher.watchWindow "+eventType+" addEventListener\n");     /*@explore*/
            this.dispatch("watchWindow", [context, win]);
        }
    },

    /**
     * Detaches from a top-level window. Destroys context
     */
    unwatchTopWindow: function(win)
    {
        var context = this.getContextByWindow(win);
        if (FBTrace.DBG_WINDOWS) FBTrace.dumpStack("tabWatcher.unwatchTopWindow context="+context+"\n");               /*@explore*/
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
            FBTrace.sysout("tabWatcher.unwatchWindow context="+context+" index of win="+index+"\n");                   /*@explore*/
        if (index != -1)
        {
            context.windows.splice(index, 1);
            this.dispatch("unwatchWindow", [context, win]);  // XXXjjb Joe check
        }
    },

    /**
     * Attaches to the window inside a browser because of user-activation
     */
    watchBrowser: function(browser)
    {
        this.watchTopWindow(browser.contentWindow, safeGetURI(browser));
    },

    unwatchBrowser: function(browser)
    {
        this.unwatchTopWindow(browser.contentWindow);
    },

    watchContext: function(win, context, isSystem)
    {
        var browser = context ? context.browser : this.getBrowserByWindow(win);
        if (browser)
            browser.isSystemPage = isSystem;

        this.dispatch("showContext", [browser, context]);
    },

    unwatchContext: function(win, context)
    {
        if (!context)
        {
            var browser = this.getBrowserByWindow(win);
            this.owner.destroyTabContext(browser, null);
            return;
        }

        var persistedState = {location: context.window.location.href};
        context.browser.persistedState = persistedState;

        iterateWindows(context.window, function(win)
        {
            TabWatcher.dispatch("unwatchWindow", [context, win]);
        });

        this.dispatch("destroyContext", [context, persistedState]);

        if (this.cancelNextLoad)
        {
            delete this.cancelNextLoad;
            context.browser.cancelNextLoad = true;
        }

        try
        {
            context.window.removeEventListener("pagehide", onUnloadTopWindow, true);
            if (FBTrace.DBG_WINDOWS) FBTrace.sysout("tabWatcher.unwatchContext  pagehide removeEventListener\n");      /*@explore*/
        }
        catch (exc)
        {
        }

        fbs.countContext(false);

        this.owner.destroyTabContext(context.browser, context);
        context.destroy(persistedState);

        remove(contexts, context);
        for (var p in context)
            delete context[p];
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    getContextByWindow: function(win)
    {
        while (win && win.parent != win)
            win = win.parent;

        if (!win) // eg search bar, and sometimes win.parent is null??
            return;

        if (FBTrace.DBG_WINDOWS)  // XXXjjb This shows a lot of calls to getContextByWindow, can some be avoided?      /*@explore*/
        {                                                                                                              /*@explore*/
            var uid = win.__firebug__uid;                                                                              /*@explore*/
            if (!uid) {                                                                                                /*@explore*/
                uid = FBL.getUniqueId();                                                                               /*@explore*/
                win.__firebug__uid = uid;                                                                              /*@explore*/
            }                                                                                                          /*@explore*/
            FBTrace.sysout("tabWatcher.getContextByWindow win.uid: "+uid+" win.location "+(win.location?win.location.href:"(undefined)")+"\n"); /*@explore*/
        }                                                                                                              /*@explore*/
        for (var i = 0; i < contexts.length; ++i)
        {
            var context = contexts[i];
            if (context.window == win)
                return context;
        }
    },

    getBrowserByWindow: function(win)
    {
        for (var i = 0; i < tabBrowser.browsers.length; ++i)
        {
            var browser = tabBrowser.browsers[i];
            if (browser.contentWindow == win)
            {
                if (!browser.chrome)
                {
                    browser.chrome = FirebugChrome;
                    browser.addProgressListener(FrameProgressListener, NOTIFY_STATE_DOCUMENT);
                }
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
    },

    dispatch: function(name, args)
    {
        if (FBTrace.DBG_WINDOWS)                                                                                       /*@explore*/
            FBTrace.sysout("TabWatcher.dispatch "+name+" to "+listeners.length+" listeners\n");                        /*@explore*/
                                                                                                                       /*@explore*/
        for (var i = 0; i < listeners.length; ++i)
        {
            var listener = listeners[i];
            if (name in listener)
            {
                try
                {
                    listener[name].apply(listener, args);
                }
                catch (exc)
                {
                    ERROR(exc);
                    FBTrace.dumpProperties(" Exception in TabWatcher.dispatch "+ name, exc);                           /*@explore*/
                    FBTrace.dumpProperties(" Exception in TabWatcher.dispatch for listener[name]:", listener[name]);   /*@explore*/
                }
            }
        }
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
    onLocationChange: function(progress, request, location)
    {
        // Only watch windows that are their own parent - e.g. not frames
        if (progress.DOMWindow.parent == progress.DOMWindow)
        {
            if (FBTrace.DBG_WINDOWS)                                                                                   /*@explore*/
                FBTrace.sysout("TabProgressListener.onLocationChange to location="                                     /*@explore*/
                                          +(location?location.href:"null location")+"\n");                             /*@explore*/
                                                                                                                       /*@explore*/
            TabWatcher.watchTopWindow(progress.DOMWindow, location);
        }
    },

    onStateChange: function(progress, request, flag, status)
    {
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
        if (FBTrace.DBG_WINDOWS)                                                                                       /*@explore*/
                FBTrace.sysout("FrameProgressListener "+getStateDescription(flag)+" uid="                              /*@explore*/
                             +progress.DOMWindow.__firebug__uid+" uri="+safeGetName(request)+"\n");                    /*@explore*/
        if (flag & STATE_IS_REQUEST && flag & STATE_START)
        {
            // We need to get the hook in as soon as the new DOMWindow is created, but before
            // it starts executing any scripts in the page.  After lengthy analysis, it seems
            // that the start of these "dummy" requests is the only state that works.

            var safeURI = safeGetName(request);
            if (safeURI && ((safeURI == dummyURI) || safeURI == "about:document-onload-blocker") )
            {
                var win = progress.DOMWindow;
                // Another weird edge case here - when opening a new tab with about:blank,
                // "unload" is dispatched to the document, but onLocationChange is not called
                // again, so we have to call watchTopWindow here
                //if (win.parent == win && win.location.href == "about:blank")
                //    TabWatcher.watchTopWindow(win, null);
                // XXXms check this
                if (win.parent == win && (win.location.href == "about:blank" ))//  || safeURI == "about:document-onload-blocker"))
                {
                    TabWatcher.watchWindow(win);
                    return;  // new one under our thumb
                }
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

// ************************************************************************************************
// Local Helpers


function onUnloadTopWindow(event)
{
    TabWatcher.unwatchTopWindow(event.currentTarget);
}

function onLoadWindowContent(event)
{
    if (FBTrace.DBG_WINDOWS)                                                                                           /*@explore*/
        FBTrace.sysout("tabWatcher.onLoadWindowContent event.type="+event.type+"\n");                                  /*@explore*/
                                                                                                                       /*@explore*/
    var win = event.currentTarget;
    try
    {
        win.removeEventListener("pageshow", onLoadWindowContent, true);
        if (FBTrace.DBG_INITIALIZE) FBTrace.sysout("tabWatcher.onLoadWindowContent  pageshow removeEventListener\n");  /*@explore*/
    }
    catch (exc) {}

    try
    {
        win.removeEventListener("DOMContentLoaded", onLoadWindowContent, true);
         if (FBTrace.DBG_INITIALIZE) FBTrace.sysout("tabWatcher.onLoadWindowContent  DOMContentLoaded removeEventListener\n"); /*@explore*/
    }
    catch (exc) {}

    // Signal that we got the onLoadWindowContent event. This prevents the FrameProgressListener from sending it.
    var context = TabWatcher.getContextByWindow(win);
    if (context)
        context.onLoadWindowContent = true;

    // Calling this after a timeout because I'm finding some cases where calling
    // it here causes freezeup when this results in loading a script file. This fixes that.
    setTimeout(function()
    {
        TabWatcher.watchLoadedTopWindow(win);
    });
}

function onUnloadWindow(event)
{
    var win = event.currentTarget;
    var eventType = (win.parent == win) ? "pagehide" : "unload";
    win.removeEventListener(eventType, onUnloadWindow, false);
    if (FBTrace.DBG_INITIALIZE)                                                                                        /*@explore*/
        FBTrace.sysout("tabWatcher.onUnloadWindow "+win.location.href +" removeEventListener: "+ eventType+"\n");      /*@explore*/
    TabWatcher.unwatchWindow(win);
}

function delayBrowserLoad(browser, uri)
{
    setTimeout(function() { browser.loadURI(uri); }, 100);
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

function getStateDescription(flag) {
    var state = "";
    if (flag & nsIWebProgressListener.STATE_START) state += "STATE_START ";
    else if (flag & nsIWebProgressListener.STATE_REDIRECTING) state += "STATE_REDIRECTING ";
    else if (flag & nsIWebProgressListener.STATE_TRANSFERRING) state += "STATE_TRANSFERRING ";
    else if (flag & nsIWebProgressListener.STATE_NEGOTIATING) state += "STATE_NEGOTIATING ";
    else if (flag & nsIWebProgressListener.STATE_STOP) state += "STATE_STOP ";

    if (flag & nsIWebProgressListener.STATE_IS_REQUEST) state += "STATE_IS_REQUEST ";
    if (flag & nsIWebProgressListener.STATE_IS_DOCUMENT) state += "STATE_IS_DOCUMENT ";
    if (flag & nsIWebProgressListener.STATE_IS_NETWORK) state += "STATE_IS_NETWORK ";
    if (flag & nsIWebProgressListener.STATE_IS_WINDOW) state += "STATE_IS_WINDOW ";
    if (flag & nsIWebProgressListener.STATE_RESTORING) state += "STATE_RESTORING ";
    if (flag & nsIWebProgressListener.STATE_IS_INSECURE) state += "STATE_IS_INSECURE ";
    if (flag & nsIWebProgressListener.STATE_IS_BROKEN) state += "STATE_IS_BROKEN ";
    if (flag & nsIWebProgressListener.STATE_IS_SECURE) state += "STATE_IS_SECURE ";
    if (flag & nsIWebProgressListener.STATE_SECURE_HIGH) state += "STATE_SECURE_HIGH ";
    if (flag & nsIWebProgressListener.STATE_SECURE_MED) state += "STATE_SECURE_MED ";
    if (flag & nsIWebProgressListener.STATE_SECURE_LOW) state += "STATE_SECURE_LOW ";

    return state;
}

// ************************************************************************************************

}});
