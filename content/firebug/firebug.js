/* See license.txt for terms of usage */
  
FBL.ns(function() { with (FBL) {

// ************************************************************************************************
// Constants

const nsIPrefBranch = CI("nsIPrefBranch");
const nsIPrefBranch2 = CI("nsIPrefBranch2");
const nsIPermissionManager = CI("nsIPermissionManager");
const nsIFireBugClient = CI("nsIFireBugClient");
const nsISupports = CI("nsISupports");

const PrefService = CC("@mozilla.org/preferences-service;1");
const PermManager = CC("@mozilla.org/permissionmanager;1");

// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * 

const contentBox = $("fbContentBox");
const contentSplitter = $("fbContentSplitter");
const toggleCommand = $("cmd_toggleFirebug");
const detachCommand = $("cmd_toggleDetachFirebug");
const tabBrowser = $("content");

// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * 

const prefs = PrefService.getService(nsIPrefBranch2);
const pm = PermManager.getService(nsIPermissionManager);

const DENY_ACTION = nsIPermissionManager.DENY_ACTION;
const ALLOW_ACTION = nsIPermissionManager.ALLOW_ACTION;

// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * 

const firebugURLs = 
{
    main: "http://www.getfirebug.com",
    docs: "http://www.getfirebug.com/docs.html",
    keyboard: "http://www.getfirebug.com/keyboard.html",
    discuss: "http://groups.google.com/group/firebug",
    donate: "http://www.getfirebug.com/contribute.html?product"
};

const prefDomain = "extensions.firebug";

const prefNames =
[
    "disabledAlways", "disabledFile",
    "defaultPanelName", "throttleMessages", "textSize", "showInfoTips",
    "largeCommandLine", "textWrapWidth", "openInWindow", "showErrorCount",
    
    // Console
    "showJSErrors", "showJSWarnings", "showCSSErrors", "showXMLErrors",
    "showWebErrors", "showChromeErrors", "showChromeMessages", "showExternalErrors",
    "showXMLHttpRequests",  "showStackTrace",
    
    // HTML
    "showFullTextNodes", "showCommentNodes", "showWhitespaceNodes",
    "highlightMutations", "expandMutations", "scrollToMutations", "shadeBoxModel",
    
    // CSS
    "showComputedStyle",
    
    // Script
    "breakOnErrors",    
    
    // DOM
    "showUserProps", "showUserFuncs", "showDOMProps", "showDOMFuncs", "showDOMConstants",
    
    // Layout
    "showLayoutAdjacent", "showRulers",
    
    // Net
    "netFilterCategory", "disableNetMonitor", "collectHttpHeaders"
];

// ************************************************************************************************
// Globals

var modules = [];
var panelTypes = [];
var reps = [];
var defaultRep = null;

var panelTypeMap = {};
var optionUpdateMap = {};

var deadWindows = [];
var deadWindowTimeout = 0;
var clearContextTimeout = 0;

// ************************************************************************************************

top.Firebug =
{
    version: "1.05",
    
    module: modules,
    panelTypes: panelTypes,
    reps: reps,

    tabBrowser: tabBrowser,
    
    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * 
    // Initialization
    
    initialize: function()
    {
        for (var i = 0; i < prefNames.length; ++i)
            this[prefNames[i]] = this.getPref(prefNames[i]);

        prefs.addObserver(prefDomain, this, false);

        dispatch(modules, "initialize");

        // If another window is opened, then the creation of our first context won't
        // result in calling of enable, so we have to enable our modules ourself
        if (fbs.enabled)
            dispatch(modules, "enable");
    },

    /** 
     * Called when the UI is ready to be initialized, once the panel browsers are loaded.
     */
    initializeUI: function()
    {
        fbs.registerClient(this);

        TabWatcher.initialize(this);

        if (this.disabledAlways)
            this.disableAlways();
        else
            this.enableAlways();
    },
        
    shutdown: function()
    {        
        TabWatcher.destroy();

        // TabWatcher will destroy all contexts, potentially disabling the client - but if
        // it is still enabled, then we have to disable our modules ourself
        if (fbs.enabled)
            dispatch(modules, "disable");

        prefs.removeObserver(prefDomain, this, false);

        fbs.unregisterClient(this);

        dispatch(modules, "shutdown");

        this.closeDeadWindows();
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * 
    // Dead Windows
    
    killWindow: function(browser, chrome)
    {
        deadWindows.push({browser: browser, chrome: chrome});
        deadWindowTimeout = setTimeout(function() { Firebug.closeDeadWindows(); }, 30);
    },
    
    rescueWindow: function(browser)
    {
        for (var i = 0; i < deadWindows.length; ++i)
        {
            if (deadWindows[i].browser == browser)
            {
                deadWindows.splice(i, 1);
                break;
            }
        }
    },
    
    closeDeadWindows: function()
    {
        for (var i = 0; i < deadWindows.length; ++i)
            deadWindows[i].chrome.close();
            
        deadWindows = [];
        deadWindowTimeout = 0;
    },
    
    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * 
    // Registration
    
    registerModule: function()
    {
        modules.push.apply(modules, arguments);
        
        for (var i = 0; i < arguments.length; ++i)
            TabWatcher.addListener(arguments[i]);
    },

    registerPanel: function()
    {
        panelTypes.push.apply(panelTypes, arguments);

        for (var i = 0; i < arguments.length; ++i)
            panelTypeMap[arguments[i].prototype.name] = arguments[i];
    },

    registerRep: function()
    {
        reps.push.apply(reps, arguments);
    },

    setDefaultRep: function(rep)
    {
        defaultRep = rep;
    },
    
    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * 
    // Disabling
    
    enableAlways: function()
    {
        TabWatcher.activate();
    },
    
    disableAlways: function()
    {
        var currentSelected = TabWatcher.deactivate();
        if (currentSelected)
        {
            for (var i = 0; i < tabBrowser.browsers.length; ++i)
            {
                var browser = tabBrowser.browsers[i];
                TabWatcher.watchContext(browser.contentWindow, null);
            }
        }
    },
    
    disableSite: function(disable)
    {
        var ioService = CCSV("@mozilla.org/network/io-service;1", "nsIIOService");

        var host = tabBrowser.currentURI.host;
        if (!host)
            this.setPref("disabledFile", disable);
        else
        {
            var uri = ioService.newURI("http://" + host, null, null);
            if (disable)
                pm.add(uri, "firebug", DENY_ACTION);
            else
            {
                if (this.isURIDenied(uri))
                    pm.remove(host, "firebug");
                else
                    pm.add(uri, "firebug", ALLOW_ACTION);
            }
        }

        if (disable)
        {
            TabWatcher.unwatchBrowser(tabBrowser.selectedBrowser);
            for (var i = 0; i < tabBrowser.browsers.length; ++i)
            {
                var browser = tabBrowser.browsers[i];
                TabWatcher.watchContext(browser.contentWindow, null);
            }
        }
        else
            TabWatcher.watchBrowser(tabBrowser.selectedBrowser);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * 
    // Options
    
    togglePref: function(name)
    {
        this.setPref(name, !this[name]);
    },

    getPref: function(name)
    {
        var prefName = prefDomain + "." + name;

        var type = prefs.getPrefType(prefName);
        if (type == nsIPrefBranch.PREF_STRING)
            return prefs.getCharPref(prefName);
        else if (type == nsIPrefBranch.PREF_INT)
            return prefs.getIntPref(prefName);
        else if (type == nsIPrefBranch.PREF_BOOL)
            return prefs.getBoolPref(prefName);
    },

    setPref: function(name, value)
    {
        var prefName = prefDomain + "." + name;

        var type = prefs.getPrefType(prefName);
        if (type == nsIPrefBranch.PREF_STRING)
            prefs.setCharPref(prefName, value);
        else if (type == nsIPrefBranch.PREF_INT)
            prefs.setIntPref(prefName, value);
        else if (type == nsIPrefBranch.PREF_BOOL)
            prefs.setBoolPref(prefName, value);
    },

    increaseTextSize: function(amt)
    {
        this.setTextSize(this.textSize+amt);
    },

    setTextSize: function(value)
    {
        this.setPref("textSize", value);
    },

    updatePref: function(name, value)
    {
        // Prevent infinite recursion due to pref observer
        if (name in optionUpdateMap)
            return;
        
        optionUpdateMap[name] = 1;
        this[name] = value;
        
        dispatch(modules, "updateOption", [name, value]);
        
        FirebugChrome.updateOption(name, value);

        if (TabWatcher.contexts)
        {
            for (var i = 0; i < TabWatcher.contexts.length; ++i)
            {
                var context = TabWatcher.contexts[i];
                if (context.externalChrome)
                    context.chrome.updateOption(name, value);
            }
        }

        if (name == "disabledAlways")
        {
            if (value)
                this.disableAlways();
            else
                this.enableAlways();
        }

        delete optionUpdateMap[name];
    },
    
    openPermissions: function()
    {
        var params = {
            permissionType: "firebug",
            windowTitle: $STR("FirebugPermissions"),
            introText: $STR("FirebugPermissionsIntro"),
            blockVisible: true, sessionVisible: false, allowVisible: true, prefilledHost: ""
        };

        openWindow("Browser:Permissions", "chrome://browser/content/preferences/permissions.xul",
            "", params);
    },
                
    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * 
    // Browser Bottom Bar
    
    showBar: function(show)
    {
        var browser = tabBrowser.selectedBrowser;
        browser.showFirebug = show;
        
        var shouldShow = show && !browser.detached;
        contentBox.setAttribute("collapsed", !shouldShow);
        contentSplitter.setAttribute("collapsed", !shouldShow);
        toggleCommand.setAttribute("checked", !!shouldShow);
        detachCommand.setAttribute("checked", !!browser.detached);
    },

    toggleBar: function(forceOpen, panelName)
    {
        if (Firebug.openInWindow)
            return this.toggleDetachBar(true);
        
        var browser = tabBrowser.selectedBrowser;    
        if (!browser.chrome)
            return;

        var toggleOff = forceOpen == undefined ? !contentBox.collapsed : !forceOpen;
        if (toggleOff == contentBox.collapsed)
            return;
        
        if (panelName)
            browser.chrome.selectPanel(panelName);
        
        if (browser.detached)
            browser.chrome.focus();
        else
        {
            
            if (toggleOff)
                browser.chrome.hidePanel();
            else
                browser.chrome.syncPanel();
            
            this.showBar(!toggleOff);
        }
    },

    toggleDetachBar: function(forceOpen)
    {
        var browser = tabBrowser.selectedBrowser;    
        if (!forceOpen && browser.detached)
        {
            browser.chrome.close();
            detachCommand.setAttribute("checked", false);
        }
        else
            this.detachBar();
    },
    
    detachBar: function()
    {
        var browser = tabBrowser.selectedBrowser;    
        if (!browser.chrome)
            return;

        if (browser.detached)
            browser.chrome.focus();
        else
        {
            if (FirebugContext)
                FirebugContext.detached = true;
            
            browser.detached = true;
            
            var args = {
                    FBL: FBL,
                    Firebug: this,
                    browser: browser,
                    context: FirebugContext
            };
            openWindow("Firebug", "chrome://firebug/content/firebug.xul", "", args);
            detachCommand.setAttribute("checked", true);

            FirebugChrome.clearPanels();
            this.syncBar();
        }
    },
    
    syncBar: function()
    {
        this.showBar(tabBrowser.selectedBrowser && tabBrowser.selectedBrowser.showFirebug);
    },

    onClickStatusIcon: function(context, event)
    {
        if (event.button != 0)
            return;
        else if (isControl(event))
            this.toggleDetachBar(true);
        else if (context && context.errorCount)
            Firebug.toggleBar(undefined, 'console');
        else
            this.toggleBar();
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * 
    // Panels
        
    getPanelType: function(panelName)
    {
        return panelTypeMap[panelName];
    },

    getMainPanelTypes: function(context)
    {
        var resultTypes = [];

        for (var i = 0; i < panelTypes.length; ++i)
        {
            var panelType = panelTypes[i];
            if (!panelType.prototype.parentPanel)
                resultTypes.push(panelType);
        }
        
        if (context.panelTypes)
        {
            for (var i = 0; i < context.panelTypes.length; ++i)
            {
                var panelType = context.panelTypes[i];
                if (!panelType.prototype.parentPanel)
                    resultTypes.push(panelType);
            }
        }
            
        return resultTypes;
    },
    
    getSidePanelTypes: function(context, mainPanel)
    {
        if (!mainPanel)
            return [];
        
        var resultTypes = [];
        
        for (var i = 0; i < panelTypes.length; ++i)
        {
            var panelType = panelTypes[i];
            if (panelType.prototype.parentPanel == mainPanel.name)
                resultTypes.push(panelType);
        }
        
        if (context.panelTypes)
        {
            for (var i = 0; i < context.panelTypes.length; ++i)
            {
                var panelType = context.panelTypes[i];
                if (panelType.prototype.parentPanel == mainPanel.name)
                    resultTypes.push(panelType);
            }
        }
        
        resultTypes.sort(function(a, b)
        {
            return a.prototype.order < b.prototype.order ? -1 : 1;
        });
        
        return resultTypes;
    },

    /**
     * Gets an object containing the state of the panel from the last time
     * it was displayed before one or more page reloads.
     */
    getPanelState: function(panel)
    {
        var persistedState = panel.context.persistedState;
        return persistedState ? persistedState.panelState[panel.name] : null;
    },

    showPanel: function(browser, panel)
    {
        dispatch(modules, "showPanel", [browser, panel]);
    },
    
    showSidePanel: function(browser, panel)
    {
        dispatch(modules, "showSidePanel", [browser, panel]);
    },
    
    reattachContext: function(browser, context)
    {
        dispatch(modules, "reattachContext", [browser, context]);
    },
    
    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * 
    // URL mapping

    getObjectByURL: function(context, url)
    {
        for (var i = 0; i < modules.length; ++i)
        {
            var object = modules[i].getObjectByURL(context, url);
            if (object)
                return object;
        }
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * 
    // Reps
    
    getRep: function(object)
    {
        var type = typeof(object);
        for (var i = 0; i < reps.length; ++i)
        {
            var rep = reps[i];
            try
            {
                if (rep.supportsObject(object, type))
                    return rep;
            }
            catch (exc) {}
        }
        
        return defaultRep;
    },

    getRepObject: function(node)
    {
        var target = null;
        for (var child = node; child; child = child.parentNode)
        {
            if (hasClass(child, "repTarget"))
                target = child;

            if (child.repObject)
            {
                if (!target && hasClass(child, "repIgnore"))
                    break;
                else
                    return child.repObject;
            }
        }    
    },

    getRepNode: function(node)
    {
        for (var child = node; child; child = child.parentNode)
        {
            if (child.repObject)
                return child;
        }    
    },

    getElementByRepObject: function(element, object)
    {
        for (var child = element.firstChild; child; child = child.nextSibling)
        {
            if (child.repObject == object)
                return child;
        }    
    },

    /**
     * Takes an element from a panel document and finds the owning panel.
     */
    getElementPanel: function(element)
    {
        for (; element; element = element.parentNode)
        {
            if (element.ownerPanel)
                return element.ownerPanel;
        }
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * 

    visitWebsite: function(which)
    {
        openNewTab(firebugURLs[which]);
    },
    
    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * 
    // nsISupports

    QueryInterface : function(iid)
    {
        if (iid.equals(nsIFireBugClient) || iid.equals(nsISupports))
        {
            return this;
        }

        throw Components.results.NS_NOINTERFACE;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * 
    // nsIPrefObserver

    observe: function(subject, topic, data)
    {
        var name = data.substr(prefDomain.length+1);
        var value = this.getPref(name);
        this.updatePref(name, value);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * 
    // nsIFireBugClient

    enable: function()
    {
        dispatch(modules, "enable");
    },
    
    disable: function()
    {
        dispatch(modules, "disable");
    },
    
    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * 
    // TabWatcher Owner
    
    isURIAllowed: function(uri)
    {
        return uri && 
            (pm.testPermission(uri, "firebug") == ALLOW_ACTION
                || (uri.scheme == "file" && !this.disabledFile));
    },
    
    isURIDenied: function(uri)
    {
        return uri &&
            (pm.testPermission(uri, "firebug") == DENY_ACTION
                || (uri.scheme == "file" && this.disabledFile));
    },
    
    createTabContext: function(win, browser, chrome, state)
    {
        return new Firebug.TabContext(win, browser, chrome, state);
    },
    
    destroyTabContext: function(browser, context)
    {
        if (context)
        {
            // Persist remnants of the context for restoration if the user reloads
            context.browser.panelName = context.panelName;
            context.browser.sidePanelNames = context.sidePanelNames;

            if (browser.detached || context == FirebugContext)
            {
                clearContextTimeout = setTimeout(function()
                {
                    if (context == FirebugContext)
                    {
                        browser.isSystemPage = true;
                        Firebug.showContext(browser, null);
                    }
                }, 100);
                
                browser.chrome.clearPanels();
            }

            if (context.externalChrome)
                this.killWindow(context.browser, context.externalChrome);
        }
        else if (browser.detached)
            this.killWindow(browser, browser.chrome);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * 
    // TabWatcher Listener

    initContext: function(context)
    {
        context.panelName = context.browser.panelName;
        if (context.browser.sidePanelNames)
            context.sidePanelNames = context.browser.sidePanelNames;
    },
    
    showContext: function(browser, context)
    {
        if (clearContextTimeout)
        {
            clearTimeout(clearContextTimeout);
            clearContextTimeout = 0;
        }

        if (deadWindowTimeout)
            this.rescueWindow(browser);

        if (browser)
            browser.chrome.showContext(browser, context);

        FirebugContext = context;

        this.syncBar();
    },
    
    watchWindow: function(context, win)
    {
        // XXXjoe Move this to Firebug.Console
        if (!win.console)
            win.console = new FirebugConsole(context, win);
        
        for (var panelName in context.panelMap)
        {
            var panel = context.panelMap[panelName];
            panel.watchWindow(win);
        }
    },
    
    unwatchWindow: function(context, win)
    {
        // XXXjoe Move this to Firebug.Console
        delete win.console;

        for (var panelName in context.panelMap)
        {
            var panel = context.panelMap[panelName];
            panel.unwatchWindow(win);
        }
    },
    
    loadedContext: function(context)
    {
        context.browser.chrome.showLoadedContext(context);
    }    
};

// ************************************************************************************************

Firebug.Module = 
{
    /**
     * Called when the window is opened.
     */
    initialize: function()
    {
    },
    
    /**
     * Called when the window is closed.
     */
    shutdown: function()
    {
    
    },
    
    /**
     * Called when a new context is created.
     */
    initContext: function(context)
    {
    },
    
    /**
     * Called after a context is detached to a separate window;
     */
    reattachContext: function(context)
    {
    },
    
    /**
     * Called when a context is destroyed.
     */
    destroyContext: function(context, persistedState)
    {
    },

    /**
     * Called when attaching to a window (top-level or frame).
     */
    watchWindow: function(context, win)
    {
    },

    /**
     * Called when unwatching a window (top-level or frame).
     */
    unwatchWindow: function(context, win)
    {
    },

    showContext: function(browser, context)
    {
    },

    loadedContext: function(context)
    {
    },
    
    showPanel: function(browser, panel)
    {
    },

    showSidePanel: function(browser, panel)
    {
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * 

    updateOption: function(name, value)
    {
    },
    
    getObjectByURL: function(context, url)
    {
    }
};

// ************************************************************************************************

Firebug.Panel = 
{
    searchable: false,
    editable: true,
    order: 2147483647,
    statusSeparator: "<",
    
    initialize: function(context, doc)
    {
        this.context = context;
        this.document = doc;

        this.panelNode = doc.createElement("div");
        this.panelNode.ownerPanel = this;
        
        setClass(this.panelNode, "panelNode panelNode-"+this.name);
        doc.body.appendChild(this.panelNode);

        this.initializeNode(this.panelNode);
    },
    
    destroy: function(state)
    {
        if (this.panelNode)
            delete this.panelNode.ownerPanel;
        
        this.destroyNode();
    },

    detach: function(oldChrome, newChrome)
    {
        this.lastScrollTop = this.panelNode.scrollTop;
    },
    
    reattach: function(doc)
    {
        this.document = doc;

        if (this.panelNode)
        {
            doc.body.appendChild(this.panelNode);
            this.panelNode.scrollTop = this.lastScrollTop;
            delete this.lastScrollTop;
        }
    },    

    initializeNode: function()
    {
    },
    
    destroyNode: function()
    {
    },
    
    show: function(state)
    {
    },

    hide: function()
    {
    },

    watchWindow: function(win)
    {
    },
    
    unwatchWindow: function(win)
    {
    },
    
    updateOption: function(name, value)
    {
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * 

    /**
     * Returns a number indicating the view's ability to inspect the object.
     *
     * Zero means not supported, and higher numbers indicate specificity.
     */
    supportsObject: function(object)
    {
        return 0;
    },
    
    navigate: function(object)
    {
        if (!object)
            object = this.getDefaultLocation();
        
        if (object != this.location)
        {
            this.location = object;
            this.updateLocation(object);
            
            // XXXjoe This is kind of cheating, but, feh.
            this.context.chrome.onPanelNavigate(object, this);
        }
    },

    updateLocation: function(object)
    {
    },
    
    select: function(object, forceUpdate)
    {
        if (!object)
            object = this.getDefaultSelection();
        
        if (forceUpdate || object != this.selection)
        {
            this.previousSelection = this.selection;
            this.selection = object;
            this.updateSelection(object);
            
            // XXXjoe This is kind of cheating, but, feh.
            this.context.chrome.onPanelSelect(object, this);
        }
    },

    updateSelection: function(object)
    {
    },
    
    refresh: function()
    {
        
    },
    
    markChange: function(skipSelf)
    {
        if (this.dependents)
        {
            if (skipSelf)
            {
                for (var i = 0; i < this.dependents.length; ++i)
                {
                    var panelName = this.dependents[i];
                    if (panelName != this.name)
                        this.context.invalidatePanels(panelName);
                }
            }
            else
                this.context.invalidatePanels.apply(this.context, this.dependents);
        }
    },
    
    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * 

    startInspecting: function()
    {
    },

    stopInspecting: function(object, cancelled)
    {
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * 

    search: function(text)
    {
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * 

    getLocationList: function()
    {
        return null;
    },
    
    getOptionsMenuItems: function()
    {
        return null;
    },
    
    getContextMenuItems: function(object, target)
    {
        return [];
    },
    
    getEditor: function(target, value)
    {
    },
    
    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * 

    getDefaultLocation: function(context)
    {
        return null;
    },
    
    getDefaultSelection: function(context)
    {
        return null;
    },
    
    browseObject: function(object)
    {
    },

    getPopupObject: function(target)
    {
        return Firebug.getRepObject(target);
    },

    getTooltipObject: function(target)
    {
        return Firebug.getRepObject(target);
    },
    
    showInfoTip: function(infoTip, x, y)
    {
        
    },
    
    getObjectPath: function(object)
    {
        return null;
    },

    getObjectLocation: function(object)
    {
        return "";
    }    
};

// ************************************************************************************************
    
Firebug.Rep = domplate(
{        
    className: "",
    inspectable: true,
    
    supportsObject: function(object, type)
    {
        return false;
    },

    inspectObject: function(object, context)
    {
        context.chrome.select(object);
    },
    
    browseObject: function(object, context)
    {
    },
    
    persistObject: function(object, context)
    {
    },
    
    getRealObject: function(object, context)
    {
        return object;
    },
    
    getTitle: function(object)
    {        
        var label = safeToString(object);

        var re = /\[object (.*?)\]/;
        var m = re.exec(label);
        return m ? m[1] : label;
    },
    
    getTooltip: function(object)
    {
        return null;
    },

    getContextMenuItems: function(object, target, context)
    {
        return [];
    },
    
    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * 
    // Convenience for domplates
    
    STR: function(name)
    {
        return $STR(name);
    },
    
    cropString: function(text)
    {
        return cropString(text);
    },
    
    toLowerCase: function(text)
    {
        return text.toLowerCase();
    },

    plural: function(n)
    {
        return n == 1 ? "" : "s";
    }    
});

// ************************************************************************************************
    
}});
