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

        this.owner = owner;
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
     * Attaches to a top-level window.
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

        if (uri)
        {
            if (Firebug.disabledAlways)
            {
                // Check if the whitelist makes an exception
                if (!this.owner.isURIAllowed(uri))
                    return this.watchContext(win, null);
            }
            else
            {
                // Check if the blacklist says no
                if (this.owner.isURIDenied(uri))
                    return this.watchContext(win, null);
            }
        }
        
        var context = this.getContextByWindow(win);
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
            
            this.dispatch("initContext", [context]);
            
            win.addEventListener("pagehide", onUnloadTopWindow, true);
            win.addEventListener("pageshow", onLoadWindowContent, true);
            win.addEventListener("DOMContentLoaded", onLoadWindowContent, true);
        }
        
        if (context)
            context.loaded = !context.browser.webProgress.isLoadingDocument;

        this.watchContext(win, context);
    },

    /**
     * Called once the document within a tab is completely loaded.
     */
    watchLoadedTopWindow: function(win)
    {
        var isSystem = isSystemPage(win);
        
        var context = this.getContextByWindow(win);
        if ((context && !context.window) || isSystem)
        {
            this.unwatchTopWindow(win);
            this.watchContext(win, null, isSystem);
            return;
        }

        if (context && !context.loaded)
        {
            context.loaded = true;
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
        if (context && context.windows.indexOf(win) == -1 && href != aboutBlank)
        {
            context.windows.push(win);

            var eventType = (win.parent == win) ? "pagehide" : "unload";
            win.addEventListener(eventType, onUnloadWindow, false);
            this.dispatch("watchWindow", [context, win]);
        }
    },

    /**
     * Detaches from a top-level window.
     */
    unwatchTopWindow: function(win)
    {
        var context = this.getContextByWindow(win);
        this.unwatchContext(win, context);
    },
    
    /**
     * Detaches from a window, top-level or not.
     */ 
    unwatchWindow: function(win)
    {
        var context = this.getContextByWindow(win);

        var index = context ? context.windows.indexOf(win) : -1;
        if (index != -1)
            context.windows.splice(index, 1);
    },
    
    /**
     * Attaches to the window inside a browser.
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
        }
        catch (exc)
        {
        }

        fbs.countContext(false);

        this.owner.destroyTabContext(context.browser, context);
        context.destroy(persistedState);    
        
        remove(contexts, context);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * 
    
    getContextByWindow: function(win)
    {
        while (win && win.parent != win)
            win = win.parent;
        
        for (var i = 0; i < contexts.length; ++i)
        {
            var context = contexts[i];
            if (context.window == win)
                return context;
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
            TabWatcher.watchTopWindow(progress.DOMWindow, location);
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
        // We need to get the hook in as soon as the new DOMWindow is created, but before
        // it starts executing any scripts in the page.  After lengthy analysis, it seems
        // that the start of these "dummy" requests is the only state that works.
        if (flag & STATE_IS_REQUEST && flag & STATE_START)
        {
            if (safeGetName(request) == dummyURI)
            {
                // Another weird edge case here - when opening a new tab with about:blank,
                // "unload" is dispatched to the document, but onLocationChange is not called
                // again, so we have to call watchTopWindow here
                var win = progress.DOMWindow;
                if (win.parent == win && win.location.href == "about:blank")
                    TabWatcher.watchTopWindow(win, null);

                TabWatcher.watchWindow(win);
            }
        }

        // Later I discovered that XHTML documents don't dispatch the dummy requests, so this
        // is our best shot here at hooking them.  
        if (flag & STATE_IS_DOCUMENT && flag & STATE_TRANSFERRING)
            TabWatcher.watchWindow(progress.DOMWindow);
    }
});

// ************************************************************************************************
// Local Helpers

function isSystemPage(win)
{
    try
    {
        var doc = win.document;
        if (!doc)
            return false;

        // Detect network error pages like 404
        if (doc.documentURI.indexOf("about:neterror") == 0)
            return true;
        
        // Detect pages for pretty printed XML
        return (doc.styleSheets.length && doc.styleSheets[0].href
                == "chrome://global/content/xml/XMLPrettyPrint.css")
            || (doc.styleSheets.length > 1 && doc.styleSheets[1].href
                == "chrome://browser/skin/feeds/subscribe.css");
    }
    catch (exc)
    {
        // Sometimes documents just aren't ready to be manipulated here, but don't let that
        // gum up the works
        ERROR(exc)
        return false;
    }
}

function onUnloadTopWindow(event)
{
    TabWatcher.unwatchTopWindow(event.currentTarget);
}

function onLoadWindowContent(event)
{
    var win = event.currentTarget;
    try
    {
        win.removeEventListener("pageshow", onLoadWindowContent, true);
    }
    catch (exc) {}
    
    try
    {
        win.removeEventListener("DOMContentLoaded", onLoadWindowContent, true);
    }
    catch (exc) {}
    
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

// ************************************************************************************************
    
}});
