/* See license.txt for terms of usage */

/**
 * The 'context' in this file is always 'Firebug.currentContext'
 *
 * xxxHonza: firebug/firebug should be also included in this file, but as soon as
 * the cycle dependency problem (chrome included in firebug) is solved.
 */
define([
    "firebug/lib/object",
    "firebug/lib/dom",
    "firebug/lib/css",
    "firebug/lib/system",
    "firebug/lib/url",
    "firebug/lib/locale",
    "firebug/lib/string",
    "firebug/lib/events",
    "firebug/lib/options",
    "firebug/chrome/window",
    "firebug/chrome/firefox",
    "firebug/chrome/menu",
    "firebug/chrome/toolbar",
    "firebug/chrome/statusPath",
],
function (Obj, Dom, Css, System, Url, Locale, String, Events, Options, Win, Firefox,
    Menu, Toolbar, StatusPath) {

// ********************************************************************************************* //
// Constants

const Cc = Components.classes;
const Ci = Components.interfaces;

const nsIWebNavigation = Ci.nsIWebNavigation;

const wm = Cc["@mozilla.org/appshell/window-mediator;1"].getService(Ci.nsIWindowMediator);

const LOAD_FLAGS_BYPASS_PROXY = nsIWebNavigation.LOAD_FLAGS_BYPASS_PROXY;
const LOAD_FLAGS_BYPASS_CACHE = nsIWebNavigation.LOAD_FLAGS_BYPASS_CACHE;
const LOAD_FLAGS_NONE = nsIWebNavigation.LOAD_FLAGS_NONE;

// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

// URLs used in the Firebug Menu and several other places
const firebugURLs =
{
    main: "https://getfirebug.com",
    help: "https://getfirebug.com/help",
    FAQ: "https://getfirebug.com/wiki/index.php/FAQ",
    docs: "https://getfirebug.com/docs.html",
    keyboard: "https://getfirebug.com/wiki/index.php/Keyboard_and_Mouse_Shortcuts",
    discuss: "https://groups.google.com/forum/#!forum/firebug",
    issues: "http://code.google.com/p/fbug/issues/list?can=1",
    donate: "https://getfirebug.com/getinvolved",
    extensions: "https://getfirebug.com/wiki/index.php/Firebug_Extensions",
    issue5110: "http://code.google.com/p/fbug/issues/detail?id=5110"
};

// ********************************************************************************************* //

// factory is global in module loading window
var ChromeFactory =
{

// chrome is created in caller window.
createFirebugChrome: function(win)
{
    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Private

    var panelSplitter, sidePanelDeck, panelBar1, panelBar2;

var FirebugChrome =
{
    // TODO: remove this property, add getters for location, title, focusedElement, setter popup
    dispatchName: "FirebugChrome",

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Initialization

    /**
     * Called by panelBarWaiter when XUL panelBar(s) (main and side) are constructed
     * (i.e. the constructor of panelBar binding is executed twice) and when all Firebug
     * modules + extension modules (if any) are loaded.
     */
    initialize: function()
    {
        if (FBTrace.DBG_INITIALIZE)
            FBTrace.sysout("chrome.initialize;");

        this.window = win;

        panelSplitter = this.getElementById("fbPanelSplitter");
        sidePanelDeck = this.getElementById("fbSidePanelDeck");
        panelBar1 = this.getElementById("fbPanelBar1");
        panelBar2 = this.getElementById("fbPanelBar2");

        // Firebug has not been initialized yet
        if (!Firebug.isInitialized)
            Firebug.initialize(this);

        // FBL should be available at this moment.
        if (FBTrace.sysout && (!FBL || !FBL.initialize))
        {
            FBTrace.sysout("Firebug is broken, FBL incomplete, if the last function is QI, " +
                "check lib.js:", FBL);
        }

        var browser1Complete = false;
        var browser2Complete = false;

        if (panelBar1)
        {
            var browser1 = panelBar1.browser;
            browser1Complete = browser1.complete;

            if (!browser1Complete)
                Events.addEventListener(browser1, "load", browser1Loaded, true);

            browser1.droppedLinkHandler = function()
            {
                return false;
            };

            if (FBTrace.DBG_INITIALIZE)
                FBTrace.sysout("chrome.browser1.complete; " + browser1Complete);
        }

        if (panelBar2)
        {
            var browser2 = panelBar2.browser;
            browser2Complete = browser2.complete;

            if (!browser2Complete)
                Events.addEventListener(browser2, "load", browser2Loaded, true);

            browser2.droppedLinkHandler = function()
            {
                return false;
            };

            if (FBTrace.DBG_INITIALIZE)
                FBTrace.sysout("chrome.browser2.complete; " + browser2Complete);
        }

        Events.addEventListener(win, "blur", onBlur, true);

        if (FBTrace.DBG_INITIALIZE)
            FBTrace.sysout("chrome.initialized in " + win.location + " with " +
                (panelBar1 ? panelBar1.browser.ownerDocument.documentURI : "no panel bar"), win);

        // At this point both panelBars can be loaded already, since the src is specified
        // in firebugOverlay.xul (asynchronously loaded). If yes, start up the initialization
        // sequence now.
        if (browser1Complete && browser2Complete)
        {
            setTimeout(function()
            {
                // chrome bound into this scope
                FirebugChrome.initializeUI();
            });
        }
    },

    /**
     * Called when the UI is ready to be initialized, once the panel browsers are loaded.
     */
    initializeUI: function()
    {
        if (FBTrace.DBG_INITIALIZE)
            FBTrace.sysout("chrome.initializeUI;");

        // listen for panel updates
        Firebug.registerUIListener(this);

        try
        {
            var cmdPopupBrowser = this.getElementById("fbCommandPopupBrowser");

            this.applyTextSize(Options.get("textSize"));

            var doc1 = panelBar1.browser.contentDocument;
            Events.addEventListener(doc1, "mouseover", onPanelMouseOver, false);
            Events.addEventListener(doc1, "mouseout", onPanelMouseOut, false);
            Events.addEventListener(doc1, "mousedown", onPanelMouseDown, false);
            Events.addEventListener(doc1, "mouseup", onPanelMouseUp, false);
            Events.addEventListener(doc1, "click", onPanelClick, false);
            Events.addEventListener(panelBar1, "selectingPanel", onSelectingPanel, false);
            Events.addEventListener(panelBar1, "DOMMouseScroll", onMouseScroll, false);

            var doc2 = panelBar2.browser.contentDocument;
            Events.addEventListener(doc2, "mouseover", onPanelMouseOver, false);
            Events.addEventListener(doc2, "mouseout", onPanelMouseOut, false);
            Events.addEventListener(doc2, "click", onPanelClick, false);
            Events.addEventListener(doc2, "mousedown", onPanelMouseDown, false);
            Events.addEventListener(doc2, "mouseup", onPanelMouseUp, false);
            Events.addEventListener(panelBar2, "selectPanel", onSelectedSidePanel, false);

            var doc3 = cmdPopupBrowser.contentDocument;
            Events.addEventListener(doc3, "mouseover", onPanelMouseOver, false);
            Events.addEventListener(doc3,"mouseout", onPanelMouseOut, false);
            Events.addEventListener(doc3, "mousedown", onPanelMouseDown, false);
            Events.addEventListener(doc3, "click", onPanelClick, false);

            var mainTabBox = panelBar1.ownerDocument.getElementById("fbPanelBar1-tabBox");
            Events.addEventListener(mainTabBox, "mousedown", onMainTabBoxMouseDown, false);

            // The side panel bar doesn't care about this event. It must, however,
            // prevent it from bubbling now that we allow the side panel bar to be
            // *inside* the main panel bar.
            Events.addEventListener(panelBar2, "selectingPanel", stopBubble, false);

            var locationList = this.getElementById("fbLocationList");
            Events.addEventListener(locationList, "selectObject", onSelectLocation, false);

            this.updatePanelBar1(Firebug.panelTypes);

            // Internationalize Firebug UI before firing initializeUI
            // (so putting version into Firebug About menu operates with correct label)
            Firebug.internationalizeUI(win.document);
            Firebug.internationalizeUI(top.document);

            // xxxHonza: Is there any reason why we don't distribute "initializeUI"?
            // event to modules?
            Firebug.initializeUI();

            // Append all registered stylesheets into Firebug UI
            for (var i=0; i<Firebug.stylesheets.length; i++)
            {
                var uri = Firebug.stylesheets[i];
                this.appendStylesheet(uri);
            }

            if (FBTrace.DBG_INITIALIZE)
                FBTrace.sysout("chrome.initializeUI; Custom stylesheet appended " +
                    Firebug.stylesheets.length, Firebug.stylesheets);

            // Fire event for window event listeners
            Firebug.sendLoadEvent();
        }
        catch (exc)
        {
            fatalError("chrome.initializeUI ERROR "+exc, exc);
        }
    },

    shutdown: function()
    {
        var doc1 = panelBar1.browser.contentDocument;
        Events.removeEventListener(doc1, "mouseover", onPanelMouseOver, false);
        Events.removeEventListener(doc1, "mouseout", onPanelMouseOut, false);
        Events.removeEventListener(doc1, "mousedown", onPanelMouseDown, false);
        Events.removeEventListener(doc1, "mouseup", onPanelMouseUp, false);
        Events.removeEventListener(doc1, "click", onPanelClick, false);
        Events.removeEventListener(panelBar1, "selectingPanel", onSelectingPanel, false);
        Events.removeEventListener(panelBar1, "DOMMouseScroll", onMouseScroll, false);

        var doc2 = panelBar2.browser.contentDocument;
        Events.removeEventListener(doc2, "mouseover", onPanelMouseOver, false);
        Events.removeEventListener(doc2, "mouseout", onPanelMouseOut, false);
        Events.removeEventListener(doc2, "mousedown", onPanelMouseDown, false);
        Events.removeEventListener(doc2, "mouseup", onPanelMouseUp, false);
        Events.removeEventListener(doc2, "click", onPanelClick, false);
        Events.removeEventListener(panelBar2, "selectPanel", onSelectedSidePanel, false);
        Events.removeEventListener(panelBar2, "selectingPanel", stopBubble, false);

        var cmdPopupBrowser = this.getElementById("fbCommandPopupBrowser");
        var doc3 = cmdPopupBrowser.contentDocument;
        Events.removeEventListener(doc3, "mouseover", onPanelMouseOver, false);
        Events.removeEventListener(doc3, "mouseout", onPanelMouseOut, false);
        Events.removeEventListener(doc3, "mousedown", onPanelMouseDown, false);
        Events.removeEventListener(doc3, "click", onPanelClick, false);

        var mainTabBox = panelBar1.ownerDocument.getElementById("fbPanelBar1-tabBox");
        Events.removeEventListener(mainTabBox, "mousedown", onMainTabBoxMouseDown, false);

        var locationList = this.getElementById("fbLocationList");
        Events.removeEventListener(locationList, "selectObject", onSelectLocation, false);

        Events.removeEventListener(win, "blur", onBlur, true);

        Firebug.unregisterUIListener(this);

        Firebug.shutdown();

        if (FBTrace.DBG_EVENTLISTENERS)
        {
            var info = [];
            var listeners = Firebug.Events.getRegisteredListeners();
            for (var i=0; i<listeners.length; i++)
            {
                var listener = listeners[i];
                info.push({
                    parentId: listener.parentId,
                    evendId: listener.eventId,
                    capturing: listener.capturing,
                    stack: listener.stack,
                });
            }

            FBTrace.sysout("firebug.shutdownFirebug; listeners: " + info.length, info);
        }

        if (FBTrace.DBG_INITIALIZE)
            FBTrace.sysout("chrome.shutdown; Done for " + win.location);
    },

    /**
     * Checks if the Firebug window has the focus (is the most recent window)
     */
    hasFocus: function()
    {
        try
        {
            // If the ID of the active element is related to Firebug, it must have the focus
            var windowID = wm.getMostRecentWindow(null).document.activeElement.id;
            return ["firebug", "fbMainContainer"].indexOf(windowID) !== -1;
        }
        catch(ex)
        {
            return false;
        }
    },

    appendStylesheet: function(uri)
    {
        var cmdPopupBrowser = this.getElementById("fbCommandPopupBrowser");

        var doc1 = panelBar1.browser.contentDocument;
        var doc2 = panelBar2.browser.contentDocument;
        var doc3 = cmdPopupBrowser.contentDocument;

        Css.appendStylesheet(doc1, uri);
        Css.appendStylesheet(doc2, uri);
        Css.appendStylesheet(doc3, uri);

        if (FBTrace.DBG_INITIALIZE)
            FBTrace.sysout("chrome.appendStylesheet; " + uri);
    },

    updateOption: function(name, value)
    {
        // Distributed 'updateOption' to all panels (main + side) in all
        // existing contexts.
        Firebug.TabWatcher.iterateContexts(function(context)
        {
            context.eachPanelInContext(function(panel)
            {
                panel.updateOption(name, value);
            });
        });

        if (name == "textSize")
            this.applyTextSize(value);

        if (name == "viewPanelOrient")
            this.updateOrient(value);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    disableOff: function(collapse)
    {
        // disable/enable this button in the Firebug.chrome window
        Dom.collapse(FirebugChrome.$("fbCloseButton"), collapse);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    getPanelDocument: function(panelType)
    {
        var cmdPopup = this.getElementById("fbCommandPopup");
        var cmdPopupBrowser = this.getElementById("fbCommandPopupBrowser");

        // Command Line Popup can be displayed for all the other panels
        // (except for the Console panel)
        // XXXjjb, xxxHonza, xxxsz: this should be somehow better, more generic and extensible,
        // e.g. by asking each panel if it supports the Command Line Popup
        var consolePanelType = Firebug.getPanelType("console");
        if (consolePanelType == panelType)
        {
            if (!Dom.isCollapsed(cmdPopup))
                return cmdPopupBrowser.contentDocument;
        }

        // Standard panel and side panel documents.
        if (!panelType.prototype.parentPanel)
            return panelBar1.browser.contentDocument;
        else
            return panelBar2.browser.contentDocument;
    },

    getPanelBrowser: function(panel)
    {
        if (!panel.parentPanel)
            return panelBar1.browser;
        else
            return panelBar2.browser;
    },

    savePanels: function()
    {
        var path = this.writePanels(panelBar1.browser.contentDocument);
        if (FBTrace.DBG_PANELS)
            FBTrace.sysout("Wrote panels to "+path+"\n");
    },

    writePanels: function(doc)
    {
        var serializer = new XMLSerializer();
        var foStream = Components.classes["@mozilla.org/network/file-output-stream;1"]
               .createInstance(Components.interfaces.nsIFileOutputStream);
        var file = Components.classes["@mozilla.org/file/directory_service;1"]
           .getService(Components.interfaces.nsIProperties)
           .get("TmpD", Components.interfaces.nsIFile);

        // extensions sub-directory
        file.append("firebug");
        file.append("panelSave.html");
        file.createUnique(Components.interfaces.nsIFile.NORMAL_FILE_TYPE, 0666);
        // write, create, truncate
        foStream.init(file, 0x02 | 0x08 | 0x20, 0664, 0);
        // remember, doc is the DOM tree
        serializer.serializeToStream(doc, foStream, "");
        foStream.close();
        return file.path;
    },

    // part of initializeUI
    updatePanelBar1: function(panelTypes)
    {
        var mainPanelTypes = [];
        for (var i = 0; i < panelTypes.length; ++i)
        {
            var panelType = panelTypes[i];
            if (!panelType.prototype.parentPanel && !panelType.hidden)
                mainPanelTypes.push(panelType);
        }
        panelBar1.updatePanels(mainPanelTypes);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    getName: function()
    {
        return win ? win.location.href : null;
    },

    close: function()
    {
        if (FBTrace.DBG_INITIALIZE)
            FBTrace.sysout("chrome.close closing window "+win.location);
        win.close();
    },

    focus: function()
    {
        win.focus();
        panelBar1.browser.contentWindow.focus();
    },

    isFocused: function()
    {
        return wm.getMostRecentWindow(null) == win;
    },

    focusWatch: function(context)
    {
        if (Firebug.isDetached())
            Firebug.chrome.focus();
        else
            Firebug.toggleBar(true);

        Firebug.chrome.selectPanel("script");

        var watchPanel = context.getPanel("watches", true);
        if (watchPanel)
        {
            watchPanel.editNewWatch();
        }
    },

    isOpen: function()
    {
        return !(FirebugChrome.$("fbContentBox").collapsed);
    },

    toggleOpen: function(shouldShow)
    {
        var contentBox = Firebug.chrome.$("fbContentBox");
        contentBox.setAttribute("collapsed", !shouldShow);

        if (!this.inDetachedScope)
        {
            Dom.collapse(Firefox.getElementById('fbMainFrame'), !shouldShow);

            var contentSplitter = Firefox.getElementById('fbContentSplitter');
            if (contentSplitter)
                contentSplitter.setAttribute("collapsed", !shouldShow);
        }

        if (shouldShow && !this.positionInitialzed)
        {
            this.positionInitialzed = true;
            var framePosition = Options.get("framePosition");
            if (framePosition !== "detached" && framePosition !== "bottom")
            {
                // null only updates frame position without side effects
                this.setPosition();
            }
        }
    },

    onDetach: function()
    {
        if(!Firebug.currentContext)
            Firebug.toggleBar(true);
        else
            Firebug.showBar(true);
    },

    onUndetach: function()
    {
        Dom.collapse(Firebug.chrome.$('fbResumeBox'), true);
        Dom.collapse(Firebug.chrome.$("fbContentBox"), false);
    },

    // only called when detached
    syncResumeBox: function(context)
    {
        var resumeBox = Firebug.chrome.$('fbResumeBox');

        // xxxHonza: Don't focus the Firebug window now. It would bring the detached Firebug window
        // to the top every time the attached Firefox page is refreshed, which is annoying.
        //this.focus();  // bring to users attention

        if (context)
        {
            Firebug.chrome.toggleOpen(true);
            Firebug.chrome.syncPanel();
            Dom.collapse(resumeBox, true);
        }
        else
        {
            Firebug.chrome.toggleOpen(false);
            Dom.collapse(resumeBox, false);

            Firebug.chrome.window.parent.document.title =
                Locale.$STR("Firebug - inactive for current website");
        }
    },

    reload: function(skipCache)
    {
        var reloadFlags = skipCache
            ? LOAD_FLAGS_BYPASS_PROXY | LOAD_FLAGS_BYPASS_CACHE
            : LOAD_FLAGS_NONE;

        // Make sure the selected tab in the attached browser window is refreshed.
        var browser = Firefox.getCurrentBrowser();
        browser.firebugReload = true;
        browser.webNavigation.reload(reloadFlags);

        if (FBTrace.DBG_WINDOWS)
            FBTrace.sysout("chrome.reload; " + skipCache + ", " + browser.currentURI.spec);
    },

    gotoPreviousTab: function()
    {
        if (Firebug.currentContext.previousPanelName)
            this.selectPanel(Firebug.currentContext.previousPanelName);
    },

    gotoSiblingTab : function(goRight)
    {
        if (FirebugChrome.$("fbContentBox").collapsed)
            return;
        var i, currentIndex = newIndex = -1, currentPanel = this.getSelectedPanel(), newPanel;
        var panelTypes = Firebug.getMainPanelTypes(Firebug.currentContext);

        // get the current panel's index (is there a simpler way for this?)
        for (i = 0; i < panelTypes.length; i++)
        {
            if (panelTypes[i].prototype.name === currentPanel.name)
            {
                currentIndex = i;
                break;
            }
        }

        if (currentIndex != -1)
        {
            newIndex = goRight ? (currentIndex == panelTypes.length - 1 ?
                0 : ++currentIndex) : (currentIndex == 0 ? panelTypes.length - 1 : --currentIndex);

            newPanel = panelTypes[newIndex].prototype;
            if (newPanel && newPanel.name)
            {
                this.selectPanel(newPanel.name);
            }
        }
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Panels

    /**
     * Set this.location on the current panel or one given by name.
     * The location object should be known to the caller to be of the correct type for the panel,
     * e.g. SourceFile for Script panel
     * @param object location object, null selects default location
     * @param panelName name of the panel to select, null means current panel
     * @param sidePanelName name of the side panel to select
     */
    navigate: function(object, panelName, sidePanelName)
    {
        var panel;
        if (panelName || sidePanelName)
            panel = this.selectPanel(panelName, sidePanelName);
        else
            panel = this.getSelectedPanel();

        if (panel)
            panel.navigate(object);
    },

    /**
     *  Set this.selection by object type analysis, passing the object to all panels to
     *      find the best match
     *  @param object new this.selection object
     *  @param panelName matching panel.name will be used, if its supportsObject returns true
     *  @param sidePanelName default side panel name used, if its supportsObject returns true
     *  @param forceUpdate if true, then (object === this.selection) is ignored and
     *      updateSelection is called
     */
    select: function(object, panelName, sidePanelName, forceUpdate)
    {
        if (FBTrace.DBG_PANELS)
            FBTrace.sysout("chrome.select object:"+object+" panelName:"+panelName+
                " sidePanelName:"+sidePanelName+" forceUpdate:"+forceUpdate+"\n");

        var bestPanelName = getBestPanelName(object, Firebug.currentContext, panelName);

        // allow refresh if needed (last argument)
        var panel = this.selectPanel(bestPanelName, sidePanelName/*, true*/);
        if (panel)
            panel.select(object, forceUpdate);

        // issue 4778
        this.syncLocationList();
    },

    selectPanel: function(panelName, sidePanelName, noRefresh)
    {
        if (panelName && sidePanelName)
            Firebug.currentContext.sidePanelNames[panelName] = sidePanelName;

        // cause panel visibility changes and events
        return panelBar1.selectPanel(panelName, false, noRefresh);
    },

    selectSidePanel: function(panelName)
    {
        return panelBar2.selectPanel(panelName);
    },

    selectSupportingPanel: function(object, context, forceUpdate)
    {
        var bestPanelName = getBestPanelSupportingObject(object, context);
        var panel = this.selectPanel(bestPanelName, false, true);
        if (panel)
            panel.select(object, forceUpdate);
    },

    clearPanels: function()
    {
        panelBar1.hideSelectedPanel();
        panelBar1.selectedPanel = null;
        panelBar2.selectedPanel = null;
    },

    getSelectedPanel: function()
    {
        return panelBar1 ? panelBar1.selectedPanel : null;
    },

    getSelectedSidePanel: function()
    {
        return panelBar2 ? panelBar2.selectedPanel : null;
    },

    switchToPanel: function(context, switchToPanelName)
    {
        // Remember the previous panel and bar state so we can revert if the user cancels.
        this.previousPanelName = context.panelName;
        this.previousSidePanelName = context.sidePanelName;
        this.previouslyCollapsed = FirebugChrome.$("fbContentBox").collapsed;

        // TODO previouslyMinimized
        this.previouslyFocused = Firebug.isDetached() && this.isFocused();

        var switchPanel = this.selectPanel(switchToPanelName);
        if (switchPanel)
            this.previousObject = switchPanel.selection;

        return switchPanel;
    },

    unswitchToPanel: function(context, switchToPanelName, canceled)
    {
        var switchToPanel = context.getPanel(switchToPanelName);

        if (this.previouslyFocused)
            this.focus();

        if (canceled && this.previousPanelName)
        {
            // revert
            if (this.previouslyCollapsed)
                Firebug.showBar(false);

            if (this.previousPanelName == switchToPanelName)
                switchToPanel.select(this.previousObject);
            else
                this.selectPanel(this.previousPanelName, this.previousSidePanelName);
        }
        else
        {
            // else stay on the switchToPanel
            this.selectPanel(switchToPanelName);
            if (switchToPanel.selection)
                this.select(switchToPanel.selection);
            this.getSelectedPanel().panelNode.focus();
        }

        delete this.previousObject;
        delete this.previousPanelName;
        delete this.previousSidePanelName;
        delete this.inspectingChrome;

        return switchToPanel;
    },

    getSelectedPanelURL: function()
    {
        var location = null;
        if (Firebug.currentContext)
        {
            var panel = Firebug.chrome.getSelectedPanel();
            if (panel)
            {
                location = panel.location;
                if (!location && panel.name == "html")
                    location = Firebug.currentContext.window.document.location;

                if (location && (location instanceof Firebug.SourceFile ||
                    location instanceof CSSStyleSheet))
                    location = location.href;
            }
        }

        if (!location)
        {
            var currentURI = Firefox.getCurrentURI();
            if (currentURI)
                location = currentURI.asciiSpec;
        }

        if (!location)
            return;

        location = location.href || location.url || location.toString();
        if (Options.get("filterSystemURLs") && Url.isSystemURL(location))
            return;

        return location;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Location interface provider for binding.xml panelFileList

    getLocationProvider: function()
    {
        // a function that returns an object with .getObjectDescription() and .getLocationList()
        return function getSelectedPanelFromCurrentContext()
        {
            // panels provide location, use the selected panel
            return Firebug.chrome.getSelectedPanel();
        };
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // UI Synchronization

    setFirebugContext: function(context)
    {
         // This sets the global value of Firebug.currentContext in the window, that this
         // chrome is compiled into. Note, that for firebug.xul the Firebug object is shared
         // across windows, but not FirebugChrome and Firebug.currentContext.
         Firebug.currentContext = context;

         if (FBTrace.DBG_WINDOWS || FBTrace.DBG_DISPATCH || FBTrace.DBG_ACTIVATION)
             FBTrace.sysout("setFirebugContext "+(Firebug.currentContext?
                Firebug.currentContext.getName():" **> NULL <** ") + " in "+win.location);
    },

    hidePanel: function()
    {
        if (panelBar1.selectedPanel)
            panelBar1.hideSelectedPanel();

        if (panelBar2.selectedPanel)
            panelBar2.hideSelectedPanel();
    },

    syncPanel: function(panelName)
    {
        var context = Firebug.currentContext;

        if (FBTrace.DBG_PANELS)
            FBTrace.sysout("chrome.syncPanel Firebug.currentContext=" +
                (context ? context.getName() : "undefined"));

        StatusPath.clear();

        if (context)
        {
            if (!panelName)
                panelName = context.panelName? context.panelName : Options.get("defaultPanelName");

            // Make the HTML panel the default panel, which is displayed
            // to the user the very first time.
            if (!panelName || !Firebug.getPanelType(panelName))
                panelName = "html";

            this.syncMainPanels();
            panelBar1.selectPanel(panelName, true);
        }
        else
        {
            panelBar1.selectPanel(null, true);
        }

        if (Firebug.isDetached())
            this.syncTitle();
    },

    syncMainPanels: function()
    {
        if (Firebug.currentContext)
        {
            var panelTypes = Firebug.getMainPanelTypes(Firebug.currentContext);
            panelBar1.updatePanels(panelTypes);

            // Update also BON tab flag (orange background if BON is active)
            // every time the user changes the current tab in Firefox.
            Firebug.Breakpoint.updatePanelTabs(Firebug.currentContext);
        }
    },

    syncSidePanels: function()
    {
        if (FBTrace.DBG_PANELS)
        {
            FBTrace.sysout("chrome.syncSidePanels; main panel: " +
                (panelBar1.selectedPanel ? panelBar1.selectedPanel.name : "no panel") +
                ", side panel: " +
                (panelBar2.selectedPanel ? panelBar2.selectedPanel.name : "no panel"));
        }

        if (!panelBar1.selectedPanel)
            return;

        var panelTypes;
        if (Firebug.currentContext)
        {
            panelTypes = Firebug.getSidePanelTypes(Firebug.currentContext,
                panelBar1.selectedPanel);
            panelBar2.updatePanels(panelTypes);
        }

        if (Firebug.currentContext && Firebug.currentContext.sidePanelNames)
        {
            if (!panelBar2.selectedPanel ||
                (panelBar2.selectedPanel.parentPanel !== panelBar1.selectedPanel.name))
            {
                var sidePanelName = Firebug.currentContext.sidePanelNames[
                    Firebug.currentContext.panelName];
                sidePanelName = getBestSidePanelName(sidePanelName, panelTypes);
                panelBar2.selectPanel(sidePanelName, true);
            }
            else
            {
                // If the context changes, we need to refresh the panel.
                panelBar2.selectPanel(panelBar2.selectedPanel.name, true);
            }
        }
        else
        {
            panelBar2.selectPanel(null);
        }

        if (FBTrace.DBG_PANELS)
        {
            FBTrace.sysout("chrome.syncSidePanels; selected side panel " +
                (panelBar2.selectedPanel ? panelBar2.selectedPanel.name : "no panel"),
                panelBar2.selectedPanel);
        }

        sidePanelDeck.selectedPanel = panelBar2;

        Dom.collapse(sidePanelDeck, !panelBar2.selectedPanel);
        Dom.collapse(panelSplitter, !panelBar2.selectedPanel);

        Events.dispatch(Firebug.uiListeners, "updateSidePanels", [panelBar1.selectedPanel]);
    },

    syncTitle: function()
    {
        if (Firebug.currentContext)
        {
            var title = Firebug.currentContext.getTitle();
            win.parent.document.title = Locale.$STRF("WindowTitle", [title]);
        }
        else
        {
            win.parent.document.title = Locale.$STR("Firebug");
        }
    },

    focusLocationList: function()
    {
        var locationList = this.getElementById("fbLocationList");
        locationList.popup.showPopup(locationList, -1, -1, "popup", "bottomleft", "topleft");
    },

    syncLocationList: function()
    {
        var locationButtons = this.getElementById("fbLocationButtons");

        var panel = panelBar1.selectedPanel;
        if (panel && panel.location)
        {
            var locationList = this.getElementById("fbLocationList");
            locationList.location = panel.location;

            Dom.collapse(locationButtons, false);
        }
        else
        {
            Dom.collapse(locationButtons, true);
        }
    },

    clearStatusPath: function()
    {
        StatusPath.clear();
    },

    syncStatusPath: function()
    {
        StatusPath.update();
    },

    toggleOrient: function(preferredValue)
    {
        var value = Options.get("viewPanelOrient");
        if (value == preferredValue)
            return;

        Options.togglePref("viewPanelOrient");
    },

    updateOrient: function(value)
    {
        var panelPane = FirebugChrome.$("fbPanelPane");
        if (!panelPane)
            return;

        var newOrient = value ? "vertical" : "horizontal";
        if (panelPane.orient == newOrient)
            return;

        panelSplitter.orient = panelPane.orient = newOrient;
    },

    setPosition: function(pos)
    {
        var framePosition = Options.get("framePosition");
        if (framePosition === pos)
            return;

        if (pos)
        {
            if (Firebug.getSuspended())
                Firebug.toggleBar();
        }
        else
        {
            pos = framePosition;
        }

        if (pos == "detached")
        {
            Firebug.toggleDetachBar(true, true);
            return;
        }

        if (Firebug.isDetached())
            Firebug.toggleDetachBar(false, true);

        pos && this.syncPositionPref(pos);

        var vertical = pos == "top" || pos == "bottom";
        var after = pos == "bottom" || pos == "right";

        var document = window.parent.document;
        var container = document.getElementById(vertical ? "appcontent" : "browser");

        var splitter = Firefox.getElementById("fbContentSplitter");
        splitter.setAttribute("orient", vertical ? "vertical" : "horizontal");
        splitter.setAttribute("dir", after ? "" : "reverse");
        container.insertBefore(splitter, after ? null: container.firstChild);

        var frame = document.getElementById("fbMainFrame");

        var newFrame = frame.cloneNode(true);
        var newBrowser = newFrame.querySelector("#fbMainContainer");
        var oldBrowser = frame.querySelector("#fbMainContainer");

        newBrowser.removeAttribute("src");
        container.insertBefore(newFrame, after ? null: container.firstChild);

        this.swapBrowsers(oldBrowser, newBrowser);
        this.browser = newBrowser;

        frame.parentNode.removeChild(frame);
        this.framePosition = pos;
    },

    syncPositionPref: function(pos)
    {
        if (!pos)
        {
            if (Firebug.isDetached())
                pos = "detached";
            else
                pos = this.framePosition || 'bottom';
        }

        Options.set("framePosition", pos);
        return pos;
    },

    swapBrowsers: function(oldBrowser, newBrowser)
    {
        var oldDoc = oldBrowser.contentDocument;
        // Panels remember the top window, for which they were first opened.
        // So we need to destroy their views.
        var styleSheet = oldDoc.styleSheets[0];
        var rulePos = styleSheet.cssRules.length;
        styleSheet.insertRule(
            "panel{display:-moz-box!important; visibility:collapse!important;}", rulePos);

        // We need to deal with inner frames first since swapFrameLoaders
        // doesn't work for type="chrome" browser containing type="content" browsers
        var frames = oldDoc.querySelectorAll("browser[type*=content], iframe[type*=content]");
        var tmpFrames = [], placeholders = [];

        var topDoc = oldBrowser.ownerDocument;
        var temp = topDoc.createElement("box");
        topDoc.documentElement.appendChild(temp);

        var swapDocShells = function(a, b)
        {
            // important! must touch browser.contentDocument to initialize it
            a.contentDocument == b.contentDocument;
            if (a.nodeName == "iframe")
                a.QueryInterface(Ci.nsIFrameLoaderOwner).swapFrameLoaders(b);
            else
                a.swapDocShells(b);
        };

        for (var i = frames.length - 1; i >= 0; i--)
        {
            placeholders[i] = document.createElement("placeholder");
            tmpFrames[i] = frames[i].cloneNode(true);
            tmpFrames[i].removeAttribute("src");
            frames[i].removeAttribute("src");
            temp.appendChild(tmpFrames[i]);
        }

        for (var i = tmpFrames.length - 1; i >= 0; i--)
        {
            swapDocShells(tmpFrames[i], frames[i]);
            frames[i].parentNode.replaceChild(placeholders[i], frames[i]);
        }

        swapDocShells(oldBrowser, newBrowser);

        for (var i = placeholders.length - 1; i >= 0; i--)
            placeholders[i].parentNode.replaceChild(frames[i], placeholders[i]);

        for (var i = frames.length - 1; i >= 0; i--)
            swapDocShells(tmpFrames[i], frames[i]);

        temp.parentNode.removeChild(temp);

        styleSheet.deleteRule(rulePos);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Global Attributes

    getGlobalAttribute: function(id, name)
    {
        var elt = FirebugChrome.$(id);
        return elt.getAttribute(name);
    },

    setGlobalAttribute: function(id, name, value)
    {
        var elt = FirebugChrome.$(id);
        if (elt)
        {
            if (value == null)
                elt.removeAttribute(name);
            else
                elt.setAttribute(name, value);
        }

        if (Firebug.externalChrome)
            Firebug.externalChrome.setGlobalAttribute(id, name, value);
    },

    setChromeDocumentAttribute: function(id, name, value)
    {
        // call as Firebug.chrome.setChromeDocumentAttribute() to set attributes
        // in another window
        var elt = FirebugChrome.$(id);
        if (elt)
            elt.setAttribute(name, value);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    keyCodeListen: function(key, filter, listener, capture)
    {
        if (!filter)
            filter = Events.noKeyModifiers;

        var keyCode = KeyEvent["DOM_VK_"+key];

        function fn(event)
        {
            if (event.keyCode == keyCode && (!filter || filter(event)))
            {
                listener();
                Events.cancelEvent(event);
            }
        }

        Events.addEventListener(win, "keypress", fn, capture);

        return [fn, capture];
    },

    keyListen: function(ch, filter, listener, capture)
    {
        if (!filter)
            filter = Events.noKeyModifiers;

        var charCode = ch.charCodeAt(0);

        function fn(event)
        {
            if (event.charCode == charCode && (!filter || filter(event)))
            {
                listener();
                Events.cancelEvent(event);
            }
        }

        Events.addEventListener(win, "keypress", fn, capture);

        return [fn, capture];
    },

    keyIgnore: function(listener)
    {
        Events.removeEventListener(win, "keypress", listener[0], listener[1]);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    $: function(id)
    {
        return this.getElementById(id);
    },

    getElementById: function(id)
    {
        // The document we close over, not the global.
        return win.document.getElementById(id);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    applyTextSize: function(value)
    {
        if (!panelBar1)
            return;

        var zoom = Options.getZoomByTextSize(value);

        var setRemSize = function(doc)
        {
            // Set the relative font size of the root element (<html> or <window>)
            // so that 'rem' units can be used for sizing relative to the font size.
            // 1rem equals 1px times the zoom level. This doesn't affect any of the
            // UI, because <body>, #fbContentBox, etc. override the font-size.

            doc.documentElement.style.fontSize = zoom + "px";
        };

        // scale the aspect relative to 11pt Lucida Grande
        // xxxsz: The magic number 0.547 should be replaced some logic retrieving this value.
        var fontSizeAdjust = zoom * 0.547;
        var contentBox = Firebug.chrome.$("fbContentBox");
        contentBox.style.fontSizeAdjust = fontSizeAdjust;
        setRemSize(contentBox.ownerDocument);

        var setZoom = function(browser)
        {
            var doc = browser.contentDocument;
            // doc.documentElement.style.fontSizeAdjust = fontSizeAdjust;

            browser.markupDocumentViewer.textZoom = zoom;
            setRemSize(doc);
        };

        setZoom(panelBar1.browser);
        setZoom(panelBar2.browser);

        var cmdPopupBrowser = this.getElementById("fbCommandPopupBrowser");
        cmdPopupBrowser.markupDocumentViewer.textZoom = zoom;

        var box = Firebug.chrome.$("fbCommandBox");
        box.style.fontSizeAdjust = fontSizeAdjust;
        if (Firebug.CommandLine)
        {
            Firebug.CommandLine.getSingleRowCommandLine().style.fontSizeAdjust = fontSizeAdjust;
            Firebug.chrome.$("fbCommandLineCompletion").style.fontSizeAdjust = fontSizeAdjust;
            Firebug.chrome.$("fbCommandLineCompletionList").style.fontSizeAdjust = fontSizeAdjust;

            Firebug.CommandEditor.fontSizeAdjust(fontSizeAdjust);
        }

        Firebug.dispatchToPanels("onTextSizeChange", [zoom, fontSizeAdjust]);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // UI Event Listeners uilisteners  or "panelListeners"

    onPanelNavigate: function(object, panel)
    {
        this.syncLocationList();
    },

    onObjectSelected: function(object, panel)
    {
        if (panel == panelBar1.selectedPanel)
        {
            this.syncStatusPath();

            var sidePanel = panelBar2.selectedPanel;
            if (sidePanel)
                sidePanel.select(object);
        }
    },

    onObjectChanged: function(object, panel)
    {
        if (panel == panelBar1.selectedPanel)
        {
            this.syncStatusPath();

            var sidePanel = panelBar2.selectedPanel;
            if (sidePanel)
                sidePanel.refresh();
        }
    },

    // called on setTimeout() after sourceBox viewport has been repainted
    onApplyDecorator: function(sourceBox)
    {
    },

    // called on scrollTo() passing in the selected line
    onViewportChange: function(sourceLink)
    {
    },

    // called when the Firebug UI comes up in browser
    showUI: function(browser, context)
    {
    },

    // called when the Firebug UI comes down; context may be null
    hideUI: function(browser, context)
    {
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    onMenuShowing: function(popup)
    {
        var detachFirebug = Dom.getElementsByAttribute(popup, "id", "menu_firebug_detachFirebug")[0];
        if (detachFirebug)
        {
            detachFirebug.setAttribute("label", (Firebug.isDetached() ?
                Locale.$STR("firebug.AttachFirebug") : Locale.$STR("firebug.DetachFirebug")));
        }

        var toggleFirebug = Dom.getElementsByAttribute(popup, "id", "menu_firebug_toggleFirebug")[0];
        if (toggleFirebug)
        {
            var fbContentBox = FirebugChrome.$("fbContentBox");
            var collapsed = fbContentBox.getAttribute("collapsed");
            if (collapsed == "true")
            {
                toggleFirebug.setAttribute("label", Locale.$STR("inBrowser"));
                toggleFirebug.setAttribute("tooltiptext", Locale.$STR("inBrowser"));
            }
            else
            {
              toggleFirebug.setAttribute("label", Locale.$STR("firebug.menu.Minimize_Firebug"));
              toggleFirebug.setAttribute("tooltiptext", Locale.$STR("firebug.menu.tip.Minimize_Firebug"));
            }

            // If Firebug is detached, hide the menu. ('Open Firebug' shortcut doesn't hide
            // but just focuses the external window)
            if (Firebug.isDetached())
                toggleFirebug.setAttribute("collapsed", (collapsed == "true" ? "false" : "true"));
        }
    },

    onOptionsShowing: function(popup)
    {
        for (var child = popup.firstChild; child; child = child.nextSibling)
        {
            if (child.localName == "menuitem")
            {
                var option = child.getAttribute("option");
                if (option)
                {
                    var checked = Options.get(option);
                    child.setAttribute("checked", checked);
                }
            }
        }
    },

    onToggleOption: function(menuitem)
    {
        var option = menuitem.getAttribute("option");
        var checked = menuitem.getAttribute("checked") == "true";

        Options.set(option, checked);
    },

    onContextShowing: function(event)
    {
        // xxxHonza: This context menu support can be used even in a separate window, which
        // doesn't contain the Firebug UI (panels).
        //if (!panelBar1.selectedPanel)
        //    return false;

        var popup = event.target;
        if (popup.id != "fbContextMenu")
            return;

        var target = popup.triggerNode;
        var panel = target ? Firebug.getElementPanel(target) : null;

        // The event must be on our chrome not inside the panel.
        if (!panel)
            panel = panelBar1 ? panelBar1.selectedPanel : null;

        Dom.eraseNode(popup);

        // Make sure the Copy action is only available if there is actually something
        // selected in the panel.
        var sel = target.ownerDocument.defaultView.getSelection();
        if (!this.contextMenuObject &&
            !FirebugChrome.$("cmd_copy").getAttribute("disabled") &&
            !sel.isCollapsed)
        {
            var menuitem = Menu.createMenuItem(popup, {label: "Copy"});
            menuitem.setAttribute("command", "cmd_copy");
        }

        var object;
        if (this.contextMenuObject)
            object = this.contextMenuObject;
        else if (target && target.ownerDocument == document)
            object = Firebug.getRepObject(target);
        else if (target && panel)
            object = panel.getPopupObject(target);
        else if (target)
            // xxxHonza: What about a node from a different document? Is that OK?
            object = Firebug.getRepObject(target);

        this.contextMenuObject = null;

        var rep = Firebug.getRep(object, Firebug.currentContext);
        var realObject = rep ? rep.getRealObject(object, Firebug.currentContext) : null;
        var realRep = realObject ? Firebug.getRep(realObject, Firebug.currentContext) : null;

        if (FBTrace.DBG_MENU)
        {
            FBTrace.sysout("chrome.onContextShowing;", {
                object: object,
                rep: rep,
                realObject: realObject,
                realRep: realRep,
                target: target,
                chromeDoc: target.ownerDocument == document,
                contextMenuObject: this.contextMenuObject,
                panel: panel,
            });
        }

        // 1. Add the custom menu items from the realRep
        if (realObject && realRep)
        {
            var items = realRep.getContextMenuItems(realObject, target, Firebug.currentContext,
                lastMouseDownPosition.clientX, lastMouseDownPosition.clientY);
            if (items)
                Menu.createMenuItems(popup, items);
        }

        // 2. Add the custom menu items from the original rep
        if (object && rep && rep != realRep)
        {
            var items = rep.getContextMenuItems(object, target, Firebug.currentContext,
                lastMouseDownPosition.clientX, lastMouseDownPosition.clientY);
            if (items)
                Menu.createMenuItems(popup, items);
        }

        // 3. Add the custom menu items from the panel
        if (panel)
        {
            var items = panel.getContextMenuItems(realObject, target, null,
                lastMouseDownPosition.clientX, lastMouseDownPosition.clientY);
            if (items)
                Menu.createMenuItems(popup, items);
        }

        // 4. Add the inspect menu items
        if (realObject && rep && rep.inspectable)
        {
            var items = this.getInspectMenuItems(realObject);

            // Separate existing menu items from 'inspect' menu items.
            if (popup.firstChild && items.length > 0)
                Menu.createMenuSeparator(popup);

            Menu.createMenuItems(popup, items);
        }

        // 5. Add menu items from uiListeners
        var items = [];
        Events.dispatch(Firebug.uiListeners, "onContextMenu", [items, object, target,
            Firebug.currentContext, panel, popup]);
        Menu.createMenuItems(popup, items);

        // Make sure there are no unnecessary separators (e.g. at the top or bottom
        // of the popup)
        Menu.optimizeSeparators(popup);

        if (!popup.firstChild)
            return false;
    },

    getInspectMenuItems: function(object)
    {
        var items = [];

        // Domplate (+ support for context menus) can be used even in separate
        // windows when Firebug.currentContext doesn't have to be defined.
        if (!Firebug.currentContext)
            return items;

        for (var i = 0; i < Firebug.panelTypes.length; ++i)
        {
            var panelType = Firebug.panelTypes[i];
            if (!panelType.prototype.parentPanel
                && panelType.prototype.name != Firebug.currentContext.panelName
                && panelSupportsObject(panelType, object, Firebug.currentContext))
            {
                var panelName = panelType.prototype.name;

                var title = Firebug.getPanelTitle(panelType);
                var label = Locale.$STRF("panel.Inspect_In_Panel", [title]);
                var tooltiptext = Locale.$STRF("panel.tip.Inspect_In_Panel", [title]);
                var id = "InspectIn" + panelName + "Panel";

                var command = Obj.bindFixed(this.select, this, object, panelName);
                items.push({label: label, tooltiptext: tooltiptext, command: command, nol10n: true,
                    id: id});
            }
        }

        return items;
    },

    onTooltipShowing: function(event)
    {
        // xxxHonza: This tooltip support can be used even in a separate window, which
        // doesn't contain the Firebug UI (panels).
        //if (!panelBar1.selectedPanel)
        //    return false;

        var tooltip = FirebugChrome.$("fbTooltip");
        var target = win.document.tooltipNode;

        var panel = target ? Firebug.getElementPanel(target) : null;

        var object;

        /* XXXjjb: This causes the Script panel to show the function body over and over.
         * We need to clear it at least, but actually we need to understand why the tooltip
         * should show the context menu object at all. One thing the contextMenuObject supports
         * is peeking at function bodies when stopped at a breakpoint.
         * That case could be supported with clearing the contextMenuObject, but we don't
         * know if that breaks something else. So maybe a popupMenuObject should be set
         * on the context if that is what we want to support.
         * The other complication is that there seems to be another tooltip.
        if (this.contextMenuObject)
        {
            object = this.contextMenuObject;
            FBTrace.sysout("tooltip by contextMenuObject");
        }
        else*/

        if (target && target.ownerDocument == document)
            object = Firebug.getRepObject(target);
        else if (panel)
            object = panel.getTooltipObject(target);

        var rep = object ? Firebug.getRep(object, Firebug.currentContext) : null;
        object = rep ? rep.getRealObject(object, Firebug.currentContext) : null;
        rep = object ? Firebug.getRep(object) : null;

        if (object && rep)
        {
            var label = rep.getTooltip(object, Firebug.currentContext, target);
            if (label)
            {
                tooltip.setAttribute("label", label);
                return true;
            }
        }

        if (Css.hasClass(target, 'noteInToolTip'))
            Css.setClass(tooltip, 'noteInToolTip');
        else
            Css.removeClass(tooltip, 'noteInToolTip');

        if (target && target.hasAttribute("title"))
        {
            tooltip.setAttribute("label", target.getAttribute("title"));
            return true;
        }

        return false;
    },

    openAboutDialog: function()
    {
        if (FBTrace.DBG_WINDOWS)
            FBTrace.sysout("Firebug.openAboutDialog");

        try
        {
            // Firefox 4.0+ implements a new AddonManager. In case of Firefox 3.6 the module
            // is not available and there is an exception.
            Components.utils["import"]("resource://gre/modules/AddonManager.jsm");
        }
        catch (err)
        {
        }

        if (typeof(AddonManager) != "undefined")
        {
            AddonManager.getAddonByID("firebug@software.joehewitt.com", function(addon)
            {
                openDialog("chrome://mozapps/content/extensions/about.xul", "",
                "chrome,centerscreen,modal", addon);
            });
        }
        else
        {
            var extensionManager = Cc["@mozilla.org/extensions/manager;1"].getService(
                Ci.nsIExtensionManager);

            openDialog("chrome://mozapps/content/extensions/about.xul", "",
                "chrome,centerscreen,modal", "urn:mozilla:item:firebug@software.joehewitt.com",
                extensionManager.datasource);
        }
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    visitWebsite: function(which, arg)
    {
        var url = firebugURLs[which];
        if (url)
        {
            if (arg)
                url += arg;

            Win.openNewTab(url);
        }
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Main Toolbar

    appendToolbarButton: function(button, before)
    {
        var toolbar = FirebugChrome.$("fbPanelBar1-buttons");
        var element = Toolbar.createToolbarButton(toolbar, button, before);
        element.repObject = button;
    },

    removeToolbarButton: function(button)
    {
        var toolbar = FirebugChrome.$("fbPanelBar1-buttons");
        for (var child = toolbar.firstChild; child; child = child.nextSibling)
        {
            if (child.repObject == button)
            {
                toolbar.removeChild(child);
                break;
            }
        }
    }
};

// ********************************************************************************************* //
// Local Helpers

function panelSupportsObject(panelType, object, context)
{
    if (panelType)
    {
        try {
            // This tends to throw exceptions often because some objects are weird
            return panelType.prototype.supportsObject(object, typeof object, context)
        } catch (exc) {}
    }

    return 0;
}

function getBestPanelName(object, context, panelName)
{
    if (!panelName && context)
        panelName = context.panelName;

    // Check if the panel type of the suggested panel supports the object, and if so, go with it.
    if (panelName)
    {
        var panelType = Firebug.getPanelType(panelName);
        if (panelSupportsObject(panelType, object, context))
            return panelType.prototype.name;
    }

    // The suggested name didn't pan out, so search for the panel type with the
    // most specific level of support.
    return getBestPanelSupportingObject(object, context);
}

function getBestPanelSupportingObject(object, context)
{
    var bestLevel = 0;
    var bestPanel = null;

    for (var i = 0; i < Firebug.panelTypes.length; ++i)
    {
        var panelType = Firebug.panelTypes[i];
        if (!panelType.prototype.parentPanel)
        {
            var level = panelSupportsObject(panelType, object, context);
            if (!bestLevel || (level && (level > bestLevel) ))
            {
                bestLevel = level;
                bestPanel = panelType;
            }

            if (FBTrace.DBG_PANELS)
                FBTrace.sysout("chrome.getBestPanelName panelType: " + panelType.prototype.name +
                    " level: " + level + " bestPanel: " +
                    (bestPanel ? bestPanel.prototype.name : "null") +
                    " bestLevel: " + bestLevel);
        }
    }

    return bestPanel ? bestPanel.prototype.name : null;
}

function getBestSidePanelName(sidePanelName, panelTypes)
{
    if (sidePanelName)
    {
        // Verify, that the suggested panel name is in the acceptable list.
        for (var i = 0; i < panelTypes.length; ++i)
        {
            if (panelTypes[i].prototype.name == sidePanelName)
                return sidePanelName;
        }
    }

    // Default to the first panel type in the list.
    return panelTypes.length ? panelTypes[0].prototype.name : null;
}

// ********************************************************************************************* //
// Event listeners

function browser1Loaded()
{
    if (FBTrace.DBG_INITIALIZE)
        FBTrace.sysout("browse1Loaded\n");

    var browser1 = panelBar1.browser;
    var browser2 = panelBar2.browser;
    Events.removeEventListener(browser1, "load", browser1Loaded, true);

    browser1.contentDocument.title = "Firebug Main Panel";
    browser1.complete = true;

    if (browser1.complete && browser2.complete)
    {
        // initializeUI() is executed asynchronously (solves issue 3442)
        // The problem has been introduced (for an unknown reason) by revision R12210
        setTimeout(function() {
            // chrome bound into this scope
            FirebugChrome.initializeUI();
        });
    }

    if (FBTrace.DBG_INITIALIZE)
        FBTrace.sysout("browse1Loaded complete\n");
}

function browser2Loaded()
{
    if (FBTrace.DBG_INITIALIZE)
        FBTrace.sysout("browse2Loaded\n");

    var browser1 = panelBar1.browser;
    var browser2 = panelBar2.browser;
    Events.removeEventListener(browser2, "load", browser2Loaded, true);

    browser2.contentDocument.title = "Firebug Side Panel";
    browser2.complete = true;

    if (browser1.complete && browser2.complete)
    {
        // See browser1Loaded for more info.
        setTimeout(function() {
            // chrome bound into this scope
            FirebugChrome.initializeUI();
        });
    }

    if (FBTrace.DBG_INITIALIZE)
        FBTrace.sysout("browse2Loaded complete\n");
}

function onBlur(event)
{
    // XXXjjb: this seems like a waste: called continuously to clear possible highlight I guess.
    // XXXhh: Is this really necessary? I disabled it for now as this was preventing me
    // to show highlights on focus
    //Firebug.Inspector.highlightObject(null, Firebug.currentContext);
}

function onSelectLocation(event)
{
    try
    {
        var locationList = FirebugChrome.getElementById("fbLocationList");
        var location = locationList.repObject;

        FirebugChrome.navigate(location);
    }
    catch (err)
    {
        FBTrace.sysout("chrome.onSelectLocation; EXCEPTION " + err, err);
    }
}

function onSelectingPanel(event)
{
    try
    {
        doSelectingPanel(event);
    }
    catch (err)
    {
        FBTrace.sysout("chrome.onSelectingPanel; EXCEPTION " + err, err);
    }
}

function doSelectingPanel(event)
{
    var panel = panelBar1.selectedPanel;
    var panelName = panel ? panel.name : null;

    if (FBTrace.DBG_PANELS)
        FBTrace.sysout("chrome.onSelectingPanel=" + panelName + " Firebug.currentContext=" +
            (Firebug.currentContext ? Firebug.currentContext.getName() : "undefined"));

    if (Firebug.currentContext)
    {
        Firebug.currentContext.previousPanelName = Firebug.currentContext.panelName;
        Firebug.currentContext.panelName = panelName;

        Firebug.currentContext.sidePanelName =
            Firebug.currentContext.sidePanelNames &&
            panelName in Firebug.currentContext.sidePanelNames
            ? Firebug.currentContext.sidePanelNames[panelName]
            : null;
    }

    if (panel)
        panel.navigate(panel.location);

    // Hide all toolbars now. It's a responsibility of the new selected panel to show
    // those toolbars, that are necessary. This avoids the situation when a naughty panel
    // doesn't clean up its toolbars. This must be done before 'showPanel' is dispatched,
    // where the visibility of the BON buttons is managed.
    var toolbar = FirebugChrome.$("fbToolbarInner");
    var child = toolbar.firstChild;
    while (child)
    {
        Dom.collapse(child, true);
        child = child.nextSibling;
    }

    // Those extensions that don't use XUL overlays (i.e. bootstrapped extensions)
    // can provide toolbar buttons throug Firebug APIs.
    var panelToolbar = FirebugChrome.$("fbPanelToolbar");
    Dom.eraseNode(panelToolbar);

    if (panel)
    {
        // get buttons from current panel
        var buttons;
        if (panel.getPanelToolbarButtons)
            buttons = panel.getPanelToolbarButtons();

        if (!buttons)
            buttons = [];

        Events.dispatch(Firebug.uiListeners, "onGetPanelToolbarButtons", [panel, buttons]);

        for (var i=0; i<buttons.length; ++i)
            Toolbar.createToolbarButton(panelToolbar, buttons[i]);

        Dom.collapse(panelToolbar, buttons.length == 0);
    }

    // Calling Firebug.showPanel causes dispatching 'showPanel' to all modules.
    var browser = panel ? panel.context.browser : Firefox.getCurrentBrowser();
    Firebug.showPanel(browser, panel);

    // Synchronize UI around panels. Execute the sync after 'showPanel' so the logic
    // can decide whether to display separators or not.
    // xxxHonza: The command line should be synced here as well.
    Firebug.chrome.syncLocationList();
    Firebug.chrome.syncStatusPath();

    //xxxjjb: unfortunately the Stack side panel depends on the status path (sync after.)
    Firebug.chrome.syncSidePanels();
}

function onMouseScroll(event)
{
    if (Events.isControlAlt(event))
    {
        Events.cancelEvent(event);
        Options.changeTextSize(-event.detail);
    }
}

function onSelectedSidePanel(event)
{
    var sidePanel = panelBar2.selectedPanel;
    if (Firebug.currentContext)
    {
        var panelName = Firebug.currentContext.panelName;
        if (panelName)
        {
            var sidePanelName = sidePanel ? sidePanel.name : null;
            Firebug.currentContext.sidePanelNames[panelName] = sidePanelName;
        }
    }

    if (FBTrace.DBG_PANELS)
    {
        var name = (sidePanel ? sidePanel.name : "undefined");
        FBTrace.sysout("chrome.onSelectedSidePanel; name: " + name, sidePanel);
    }

    var panel = panelBar1.selectedPanel;
    if (panel && sidePanel)
        sidePanel.select(panel.selection);

    var browser = sidePanel ? sidePanel.context.browser : Firefox.getCurrentBrowser();
    // dispatch to modules
    Firebug.showSidePanel(browser, sidePanel);
}

function onPanelMouseOver(event)
{
    var object = Firebug.getRepObject(event.target);
    if (!object)
        return;

    var rep = Firebug.getRep(object, Firebug.currentContext);
    if (rep)
        rep.highlightObject(object, Firebug.currentContext, event.target);
}

function onPanelMouseOut(event)
{
    var object = Firebug.getRepObject(event.target);
    if (!object)
        return;

    var rep = Firebug.getRep(object, Firebug.currentContext);
    if (rep)
        rep.unhighlightObject(object, Firebug.currentContext, event.target);
}

function onPanelClick(event)
{
    var repNode = Firebug.getRepNode(event.target);
    if (repNode)
    {
        var object = repNode.repObject;
        var rep = Firebug.getRep(object, Firebug.currentContext);
        var realObject = rep ? rep.getRealObject(object, Firebug.currentContext) : null;
        var realRep = realObject ? Firebug.getRep(realObject, Firebug.currentContext) : rep;
        if (!realObject)
            realObject = object;

        if (Events.isLeftClick(event))
        {
            if (Css.hasClass(repNode, "objectLink"))
            {
                if (realRep)
                {
                    realRep.inspectObject(realObject, Firebug.currentContext);
                    Events.cancelEvent(event);
                }
            }
        }
    }
}

var lastMouseDownPosition = {
    screenX: -1000,
    screenY: -1000,
    clientX: -1000,
    clientY: -1000,
};

function onPanelMouseDown(event)
{
    if (Events.isLeftClick(event) || Events.isRightClick(event))
    {
        lastMouseDownPosition.screenX = event.screenX;
        lastMouseDownPosition.screenY = event.screenY;
        lastMouseDownPosition.clientX = event.clientX;
        lastMouseDownPosition.clientY = event.clientY;
    }
    else if (Events.isMiddleClick(event, true) && Events.isControlAlt(event))
    {
        Events.cancelEvent(event);
        Options.setTextSize(0);
    }
    else if (Events.isMiddleClick(event) && Firebug.getRepNode(event.target))
    {
        // Prevent auto-scroll when middle-clicking a rep object
        Events.cancelEvent(event);
    }
}

function onPanelMouseUp(event)
{
    if (Events.isLeftClick(event))
    {
        var doc = event.target.ownerDocument;

        // This happens e.g. if you click in a panel, move mouse out from the browser
        // window and release the button.
        if (!doc)
            return;

        var selection = doc.defaultView.getSelection();
        var target = selection.focusNode || event.target;

        if (Dom.getAncestorByClass(selection.focusNode, "editable") ===
            Dom.getAncestorByClass(selection.anchorNode, "editable"))
        {
            var editable = Dom.getAncestorByClass(target, "editable");
            if (editable || Css.hasClass(event.target, "inlineExpander"))
            {
                var selectionData;
                var unselectedRange = doc.createRange();
                var selectedRange = selection.getRangeAt(0);
                var referenceElement = editable || event.target;
                unselectedRange.setStart(referenceElement.firstElementChild ||
                    referenceElement, 0);
                unselectedRange.setEnd(selectedRange.startContainer, selectedRange.startOffset);

                if (selectedRange.collapsed)
                {
                    var distance = Math.abs(event.screenX - lastMouseDownPosition.screenX) +
                        Math.abs(event.screenY - lastMouseDownPosition.screenY);

                    // If mouse has moved far enough, set selection at that point
                    if (distance > 3 || Css.hasClass(event.target, "inlineExpander"))
                    {
                        selectionData =
                        {
                            start: selectedRange.startOffset,
                            end: selectedRange.endOffset
                        };
                    }
                    // otherwise leave selectionData undefined to select all text
                }
                else
                {
                    var unselectedRangeLength = unselectedRange.toString().length;
                    var selectedRangeLength = selection.getRangeAt(0).toString().length;
                    selectionData =
                    {
                        start: unselectedRangeLength,
                        end: unselectedRangeLength + selectedRangeLength
                    };
                }

                if (editable)
                {
                    Firebug.Editor.startEditing(editable, null, null, selectionData);
                }
                else
                {
                    Firebug.Editor.setSelection(selectionData);
                    selection.removeAllRanges();
                }

                Events.cancelEvent(event);
            }
        }
    }
    else if (Events.isControlClick(event) || Events.isMiddleClick(event))
    {
        var repNode = Firebug.getRepNode(event.target);
        if (!repNode)
            return;

        var object = repNode.repObject;
        var rep = Firebug.getRep(object, Firebug.currentContext);
        var realObject = rep ? rep.getRealObject(object, Firebug.currentContext) : null;
        var realRep = realObject ? Firebug.getRep(realObject, Firebug.currentContext) : rep;
        if (!realObject)
            realObject = object;

        if (!realRep || !realRep.browseObject(realObject, Firebug.currentContext))
        {
            if (rep && !(rep != realRep && rep.browseObject(object, Firebug.currentContext)))
            {
                var panel = Firebug.getElementPanel(event.target);
                if (!panel || !panel.browseObject(realObject))
                    return;
            }
        }
        Events.cancelEvent(event);
    }
}

function onMainTabBoxMouseDown(event)
{
    if (Firebug.isInBrowser())
    {
        var contentSplitter = FirebugChrome.$("fbContentSplitter");
        // TODO: grab the splitter here.
    }
}

function stopBubble(event)
{
    event.stopPropagation();
}

function getRealObject(object)
{
    var rep = Firebug.getRep(object, Firebug.currentContext);
    var realObject = rep ? rep.getRealObject(object, Firebug.currentContext) : null;
    return realObject ? realObject : object;
}

function fatalError(summary, exc)
{
    if (typeof(FBTrace) !== undefined)
        FBTrace.sysout.apply(FBTrace, arguments);

    Components.utils.reportError(summary);

    throw exc;
}

return FirebugChrome;

}  // end of createFirebugChrome(win)
}; // end of var ChromeFactory object

// ********************************************************************************************* //

Firebug.ChromeFactory = ChromeFactory;

return ChromeFactory;

// ********************************************************************************************* //
});
