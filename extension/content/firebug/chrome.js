/* See license.txt for terms of usage */

var Firebug = null;
var FirebugContext = null;

if(!XPCOMUtils)
    throw "Failed to load FBL";

(function() { with (XPCOMUtils) {

// ************************************************************************************************
// Constants

const Cc = Components.classes;
const Ci = Components.interfaces;
const nsIWebNavigation = Ci.nsIWebNavigation;

const LOAD_FLAGS_BYPASS_PROXY = nsIWebNavigation.LOAD_FLAGS_BYPASS_PROXY;
const LOAD_FLAGS_BYPASS_CACHE = nsIWebNavigation.LOAD_FLAGS_BYPASS_CACHE;
const LOAD_FLAGS_NONE = nsIWebNavigation.LOAD_FLAGS_NONE;

// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

const panelURL = "chrome://firebug/content/panel.html";

const statusCropSize = 20;

const positiveZoomFactors = [1, 1.1, 1.2, 1.3, 1.5, 2, 3];
const negativeZoomFactors = [1, 0.95, 0.8, 0.7, 0.5, 0.2, 0.1];

// ************************************************************************************************
// Globals

var panelBox, panelSplitter, sidePanelDeck, panelBar1, panelBar2, locationList, locationSeparator,
    panelStatus, panelStatusSeparator;

var waitingPanelBarCount = 2;

var inDetachedScope = (window.location == "chrome://firebug/content/firebug.xul");

var disabledHead = null;
var disabledCaption = null;
var enableSiteLink = null;
var enableSystemPagesLink = null;
var enableAlwaysLink = null;
// ************************************************************************************************

top.FirebugChrome =
{
    window: window,

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    // Initialization

    panelBarReady: function(panelBar)
    {
        try
        {
            // Wait until all panelBar bindings are ready before initializing
            if (--waitingPanelBarCount == 0)
                this.initialize();
            else
                return false;
        }
        catch (exc)
        {
            if (FBTrace.sysout)
                FBTrace.sysout("chrome.panelBarReady FAILS: "+exc, exc);
            return false;
        }
        return true; // the panel bar is ready
    },

    initialize: function()
    {
        if (window.arguments)
            var detachArgs = window.arguments[0];

        if (!detachArgs)
            detachArgs = {};

        if (FBTrace.DBG_INITIALIZE) FBTrace.sysout("chrome.initialize w/detachArgs=", detachArgs);

        if (detachArgs.FBL)
            top.FBL = detachArgs.FBL;
        else
        {
            if (FBTrace.sysout && (!FBL || !FBL.initialize) )
                FBTrace.sysout("Firebug is broken, FBL incomplete, if the last function is QI, check lib.js:", FBL);

            FBL.initialize();
        }

        if (detachArgs.Firebug)
        {
            Firebug = detachArgs.Firebug;
            FirebugContext = detachArgs.FirebugContext;
        }
        else
            Firebug.initialize();

        Firebug.internationalizeUI(window.document);

        panelBox = $("fbPanelBox");
        panelSplitter = $("fbPanelSplitter");
        sidePanelDeck = $("fbSidePanelDeck");
        panelBar1 = $("fbPanelBar1");
        panelBar2 = $("fbPanelBar2");
        locationList = $("fbLocationList");
        locationSeparator = $("fbLocationSeparator");
        panelStatus = $("fbPanelStatus");
        panelStatusSeparator = $("fbStatusSeparator");

        var browser1 = panelBar1.browser;
        browser1.addEventListener("load", browser1Loaded, true);

        var browser2 = panelBar2.browser;
        browser2.addEventListener("load", browser2Loaded, true);

        window.addEventListener("blur", onBlur, true);

        // Initialize Firebug Tools & Firebug Icon menus.
        var firebugMenuPopup = $("fbFirebugMenuPopup");
        var toolsMenu = $("menu_firebug");
        if (toolsMenu)
            toolsMenu.appendChild(firebugMenuPopup.cloneNode(true));

        var iconMenu = $("fbFirebugMenu");
        if (iconMenu)
            iconMenu.appendChild(firebugMenuPopup.cloneNode(true));

        if (FBTrace.DBG_INITIALIZE)
            FBTrace.sysout("chrome.initialized ", window);
    },

    /**
     * Called when the UI is ready to be initialized, once the panel browsers are loaded.
     */
    initializeUI: function()
    {
        try {
            if (window.arguments)
                var detachArgs = window.arguments[0];

            this.applyTextSize(Firebug.textSize);

            var doc1 = panelBar1.browser.contentDocument;
            doc1.addEventListener("mouseover", onPanelMouseOver, false);
            doc1.addEventListener("mouseout", onPanelMouseOut, false);
            doc1.addEventListener("mousedown", onPanelMouseDown, false);
            doc1.addEventListener("click", onPanelClick, false);
            panelBar1.addEventListener("selectingPanel", onSelectingPanel, false);

            var doc2 = panelBar2.browser.contentDocument;
            doc2.addEventListener("mouseover", onPanelMouseOver, false);
            doc2.addEventListener("mouseout", onPanelMouseOut, false);
            doc2.addEventListener("click", onPanelClick, false);
            doc2.addEventListener("mousedown", onPanelMouseDown, false);
            panelBar2.addEventListener("selectPanel", onSelectedSidePanel, false);

            var mainTabBox = panelBar1.ownerDocument.getElementById("fbPanelBar1-tabBox");
            mainTabBox.addEventListener("mousedown", onMainTabBoxMouseDown, false);

            // The side panel bar doesn't care about this event.  It must, however,
            // prevent it from bubbling now that we allow the side panel bar to be
            // *inside* the main panel bar.
            function stopBubble(event) { event.stopPropagation(); }
            panelBar2.addEventListener("selectingPanel", stopBubble, false);

            locationList.addEventListener("selectObject", onSelectLocation, false);

            this.updatePanelBar1(Firebug.panelTypes);

            if (inDetachedScope)
                this.attachBrowser(FirebugContext);
            else
                Firebug.initializeUI(detachArgs);

        } catch (exc) {
            FBTrace.sysout("chrome.initializeUI fails "+exc, exc);
        }
        var toolbar = $('fbToolbar');
    },

    shutdown: function()
    {
        if (FBTrace.DBG_INITIALIZE || !panelBar1)
            FBTrace.sysout("chrome.shutdown entered for "+window.location+"\n");

        var doc1 = panelBar1.browser.contentDocument;
        doc1.removeEventListener("mouseover", onPanelMouseOver, false);
        doc1.removeEventListener("mouseout", onPanelMouseOut, false);
        doc1.removeEventListener("mousedown", onPanelMouseDown, false);
        doc1.removeEventListener("click", onPanelClick, false);

        var doc2 = panelBar2.browser.contentDocument;
        doc2.removeEventListener("mouseover", onPanelMouseOver, false);
        doc2.removeEventListener("mouseout", onPanelMouseOut, false);
        doc2.removeEventListener("mousedown", onPanelMouseDown, false);
        doc2.removeEventListener("click", onPanelClick, false);

        var mainTabBox = panelBar1.ownerDocument.getElementById("fbPanelBar1-tabBox");
        mainTabBox.removeEventListener("mousedown", onMainTabBoxMouseDown, false);

        locationList.removeEventListener("selectObject", onSelectLocation, false);

        window.removeEventListener("blur", onBlur, true);
        if (inDetachedScope)
            this.undetach();
        else
            Firebug.shutdown();
    },

    updateOption: function(name, value)
    {
        if (panelBar1.selectedPanel)
            panelBar1.selectedPanel.updateOption(name, value);
        if (panelBar2.selectedPanel)
            panelBar2.selectedPanel.updateOption(name, value);

        if (name == "textSize")
            this.applyTextSize(value);
        if (name =="omitObjectPathStack")
            this.obeyOmitObjectPathStack(value);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    attachBrowser: function(context)  // XXXjjb context == (FirebugContext || null)  and inDetachedScope == true
    {
        if (FBTrace.DBG_ACTIVATION)
            FBTrace.sysout("chrome.attachBrowser with inDetachedScope="+inDetachedScope+" context="+context
                               +" context==FirebugContext: "+(context==FirebugContext)+" in window: "+window.location);

        if (inDetachedScope)  // then we are initializing in external window
        {
            Firebug.setChrome(this, "detached"); // 1.4

            FBL.collapse($("fbMinimizeButton"), true);  // Closing the external window will minimize
            FBL.collapse($("fbDetachButton"), true);    // we are already detached.

            var browser = context ? context.browser : this.getCurrentBrowser();
            Firebug.showContext(browser, context);

            if (FBTrace.DBG_WINDOWS)
                FBTrace.sysout("attachBrowser inDetachedScope in Firebug.chrome.window: "+Firebug.chrome.window.location);
        }

    },

    undetach: function()
    {
        var detachedChrome = Firebug.chrome;
        Firebug.setChrome(Firebug.originalChrome, "minimized");

        Firebug.showBar(false);
        Firebug.resetTooltip();

        // when we are done here the window.closed will be true so we don't want to hang on to the ref.
        detachedChrome.window = "This is detached chrome!";
    },

    disableOff: function(collapse)
    {
        FBL.collapse($("fbCloseButton"), collapse);  // disable/enable this button in the Firebug.chrome window.
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    getBrowsers: function()
    {
          return Firebug.tabBrowser.browsers;
    },

    getCurrentBrowser: function()
    {
        return Firebug.tabBrowser.selectedBrowser;
    },

    getCurrentURI: function()
    {
        try
        {
            return Firebug.tabBrowser.currentURI;
        }
        catch (exc)
        {
            return null;
        }
    },

    getPanelDocument: function(panelType)
    {
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
        $("fbStatusText").setAttribute("value", path);
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
        file.append("firebug");   // extensions sub-directory
        file.append("panelSave.html");
        file.createUnique(Components.interfaces.nsIFile.NORMAL_FILE_TYPE, 0666);
        foStream.init(file, 0x02 | 0x08 | 0x20, 0664, 0);   // write, create, truncate
        serializer.serializeToStream(doc, foStream, "");   // rememeber, doc is the DOM tree
        foStream.close();
        return file.path;
    },

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

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    getName: function()
    {
        return window ? window.location.href : null;
    },

    close: function()
    {
        if (FBTrace.DBG_INITIALIZE)
            FBTrace.sysout("chrome.close closing window "+window.location);
        window.close();
    },

    focus: function()
    {
        window.focus();
    },

    isFocused: function()
    {
        var winMediator = CCSV("@mozilla.org/appshell/window-mediator;1", "nsIWindowMediator");

        return winMediator.getMostRecentWindow(null) == window;
    },

    isOpen: function()
    {
        return !($("fbContentBox").collapsed);
    },

    reload: function(skipCache)
    {
        var reloadFlags = skipCache
            ? LOAD_FLAGS_BYPASS_PROXY | LOAD_FLAGS_BYPASS_CACHE
            : LOAD_FLAGS_NONE;

        // Make sure the selected tab in the attached browser window is refreshed.
        var browser = Firebug.chrome.getCurrentBrowser();
        browser.firebugReload = true;
        browser.webNavigation.reload(reloadFlags);

        if (FBTrace.DBG_WINDOWS)
            FBTrace.sysout("chrome.reload; " + skipCache + ", " + browser.currentURI.spec);
    },

    gotoPreviousTab: function()
    {
        if (FirebugContext.previousPanelName)
            this.selectPanel(FirebugContext.previousPanelName);
    },

    gotoSiblingTab : function(goRight)
    {
        if ($('fbContentBox').collapsed)
            return;
        var i, currentIndex = newIndex = -1, currentPanel = this.getSelectedPanel(), newPanel;
        var panelTypes = Firebug.getMainPanelTypes(FirebugContext);
        /*get current panel's index (is there a simpler way for this?*/
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
            newIndex = goRight ? (currentIndex == panelTypes.length - 1 ? 0 : ++currentIndex) : (currentIndex == 0 ? panelTypes.length - 1 : --currentIndex);
            newPanel = panelTypes[newIndex].prototype;
            if (newPanel && newPanel.name)
            {
                this.selectPanel(newPanel.name);
            }
        }
    },

    getNextObject: function(reverse)
    {
        var panel = FirebugContext.getPanel(FirebugContext.panelName);
        if (panel)
        {
            var item = panelStatus.getItemByObject(panel.selection);
            if (item)
            {
                if (reverse)
                    item = item.previousSibling ? item.previousSibling.previousSibling : null;
                else
                    item = item.nextSibling ? item.nextSibling.nextSibling : null;

                if (item)
                    return item.repObject;
            }
        }
    },

    gotoNextObject: function(reverse)
    {
        var nextObject = this.getNextObject(reverse);
        if (nextObject)
            this.select(nextObject);
        else
            beep();
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    // Panels

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

    select: function(object, panelName, sidePanelName, forceUpdate)
    {
        if (FBTrace.DBG_PANELS)
            FBTrace.sysout("chrome.select object:"+object+" panelName:"+panelName+" sidePanelName:"+sidePanelName+" forceUpdate:"+forceUpdate+"\n");
        var bestPanelName = getBestPanelName(object, FirebugContext, panelName);
        var panel = this.selectPanel(bestPanelName, sidePanelName, true);
        if (panel)
            panel.select(object, forceUpdate);
    },

    selectPanel: function(panelName, sidePanelName, noRefresh)
    {
        if (panelName && sidePanelName)
            FirebugContext.sidePanelNames[panelName] = sidePanelName;

        return panelBar1.selectPanel(panelName, false, noRefresh);  // cause panel visibility changes and events
    },

    selectSidePanel: function(panelName)
    {
        return panelBar2.selectPanel(panelName);
    },

    clearPanels: function()
    {
        panelBar1.hideSelectedPanel();
        panelBar1.selectedPanel = null;
        panelBar2.selectedPanel = null;
    },

    getSelectedPanel: function()
    {
        return panelBar1.selectedPanel;
    },

    getSelectedSidePanel: function()
    {
        return panelBar2.selectedPanel;
    },

    switchToPanel: function(context, switchToPanelName)
    {
        // Remember the previous panel and bar state so we can revert if the user cancels
        this.previousPanelName = context.panelName;
        this.previousSidePanelName = context.sidePanelName;
        this.previouslyCollapsed = $("fbContentBox").collapsed;
        this.previouslyFocused = Firebug.isDetached() && this.isFocused();  // TODO previouslyMinimized

        var switchPanel = this.selectPanel(switchToPanelName);
        if (switchPanel)
            this.previousObject = switchPanel.selection;

        return switchPanel;
    },

    unswitchToPanel: function(context, switchToPanelName, cancelled)
    {
        var switchToPanel = context.getPanel(switchToPanelName);

        if (this.previouslyFocused)
            this.focus();

        if (cancelled && this.previousPanelName)  // revert
        {
            if (this.previouslyCollapsed)
                Firebug.showBar(false);

            if (this.previousPanelName == switchToPanelName)
                this.select(this.previousObject);
            else
                this.selectPanel(this.previousPanelName, this.previousSidePanelName);
        }
        else // else stay on the switchToPanel
        {
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

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    // Location interface provider for binding.xml panelFileList

    getLocationProvider: function()
    {
        // a function that returns an object with .getObjectDescription() and .getLocationList()
        return function getSelectedPanelFromCurrentContext()
        {
            return Firebug.chrome.getSelectedPanel();  // panels provide location, use the selected panel
        }
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    // UI Synchronization

    setFirebugContext: function(context)
    {
         // This sets the global value of FirebugContext in the window that this chrome is compiled into.
         // Note that for firebug.xul, the Firebug object is shared across windows, but not FirebugChrome and FirebugContext
         FirebugContext = context;

         if (FBTrace.DBG_WINDOWS || FBTrace.DBG_DISPATCH)
             FBTrace.sysout("setFirebugContext "+(FirebugContext?FirebugContext.getName():" **> NULL <** ") + " in "+window.location+" has wrapped: "+(FirebugContext?FirebugContext.wrappedJSObject:"no"));
    },

    hidePanel: function()
    {
        if (panelBar1.selectedPanel)
            panelBar1.hideSelectedPanel()

        if (panelBar2.selectedPanel)
            panelBar2.hideSelectedPanel()
    },

    syncPanel: function()  // we've decided to have Firebug open
    {
        if (FBTrace.DBG_PANELS) FBTrace.sysout("chrome.syncPanel FirebugContext="+
            (FirebugContext ? FirebugContext.getName() : "undefined")+"\n");

        panelStatus.clear();

        if (FirebugContext)
        {
            var panelName = FirebugContext.panelName
                ? FirebugContext.panelName
                : Firebug.defaultPanelName;

            // Make HTML panel the default panel, which is displayed
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
        var panelTypes = Firebug.getMainPanelTypes(FirebugContext);
        panelBar1.updatePanels(panelTypes);
    },

    syncSidePanels: function()
    {
        var panelTypes = Firebug.getSidePanelTypes(FirebugContext, panelBar1.selectedPanel);
        panelBar2.updatePanels(panelTypes);

        if (FirebugContext && FirebugContext.sidePanelNames)
        {
            var sidePanelName = FirebugContext.sidePanelNames[FirebugContext.panelName];
            sidePanelName = getBestSidePanelName(sidePanelName, panelTypes);
            panelBar2.selectPanel(sidePanelName, true);
        }
        else
            panelBar2.selectPanel(null);

        sidePanelDeck.selectedPanel = panelBar2;
        FBL.collapse(sidePanelDeck, !panelBar2.selectedPanel);
        FBL.collapse(panelSplitter, !panelBar2.selectedPanel);
    },

    syncTitle: function()
    {
        if (FirebugContext)
        {
            var title = FirebugContext.getTitle();
            window.document.title = FBL.$STRF("WindowTitle", [title]);
        }
        else
            window.document.title = FBL.$STR("Firebug");
    },

    focusLocationList: function()
    {
        locationList.popup.showPopup(locationList, -1, -1, "popup", "bottomleft", "topleft");
    },

    syncLocationList: function()
    {
        var panel = panelBar1.selectedPanel;
        if (panel && panel.location)
        {
            locationList.location = panel.location;
            FBL.collapse(locationSeparator, false);
            FBL.collapse(locationList, false);
        }
        else
        {
            FBL.collapse(locationSeparator, true);
            FBL.collapse(locationList, true);
        }
    },

    clearStatusPath: function()
    {
        panelStatus.clear();
    },

    syncStatusPath: function()
    {
        var panel = panelBar1.selectedPanel;
        if (!panel)
        {
            panelStatus.clear();
        }
        else
        {
            var path = panel.getObjectPath(panel.selection);
            if (!path || !path.length)
            {
                FBL.hide(panelStatusSeparator, true);
                panelStatus.clear();
            }
            else
            {
                FBL.hide(panelStatusSeparator, false);

                if (panel.name != panelStatus.lastPanelName)
                    panelStatus.clear();

                panelStatus.lastPanelName = panel.name;

                // If the object already exists in the list, just select it and keep the path
                var selection = panel.selection;
                var existingItem = panelStatus.getItemByObject(panel.selection);
                if (existingItem)
                    panelStatus.selectItem(existingItem);
                else
                {
                    panelStatus.clear();

                    for (var i = 0; i < path.length; ++i)
                    {
                        var object = path[i];

                        var rep = Firebug.getRep(object);
                        var objectTitle = rep.getTitle(object, FirebugContext);

                        var title = FBL.cropMultipleLines(objectTitle, statusCropSize);
                        panelStatus.addItem(title, object, rep, panel.statusSeparator);
                    }

                    panelStatus.selectObject(panel.selection);
                }
            }
        }
    },

    toggleOrient: function()
    {
        var panelPane = $("fbPanelPane");
        panelSplitter.orient = panelPane.orient
            = panelPane.orient == "vertical" ? "horizontal" : "vertical";
        var option = $('menu_toggleOrient').getAttribute("option");
        Firebug.setPref(Firebug.prefDomain, option, panelPane.orient != "vertical");
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    addTab: function(context, url, title, parentPanel)
    {
        context.addPanelType(url, title, parentPanel);
        if (context == FirebugContext)
        {
            if (parentPanel)
            {
                var currentPanel = this.getSelectedPanel();
                if (currentPanel && parentPanel == currentPanel.name)
                    this.syncSidePanels();
            }
            else
            {
                this.syncMainPanels();
            }
        }
    },

    removeTab: function(context, url)
    {
        context.removePanelType(url);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    getGlobalAttribute: function(id, name)
    {
        var elt = $(id);
        return elt.getAttribute(name);
    },

    setGlobalAttribute: function(id, name, value)
    {
        var elt = $(id);
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
        // Call as  Firebug.chrome.setChromeDocumentAttribute() to set attributes in another window.
        var elt = $(id);
        if (elt)
            elt.setAttribute(name, value);
    },

    keyCodeListen: function(key, filter, listener, capture)
    {
        if (!filter)
            filter = FBL.noKeyModifiers;

        var keyCode = KeyEvent["DOM_VK_"+key];

        function fn(event)
        {
            if (event.keyCode == keyCode && (!filter || filter(event)))
            {
                listener();
                FBL.cancelEvent(event);
            }
        }

        window.addEventListener("keypress", fn, capture);

        return [fn, capture];
    },

    keyListen: function(ch, filter, listener, capture)
    {
        if (!filter)
            filter = FBL.noKeyModifiers;

        var charCode = ch.charCodeAt(0);

        function fn(event)
        {
            if (event.charCode == charCode && (!filter || filter(event)))
            {
                listener();
                FBL.cancelEvent(event);
            }
        }

        window.addEventListener("keypress", fn, capture);

        return [fn, capture];
    },

    keyIgnore: function(listener)
    {
        window.removeEventListener("keypress", listener[0], listener[1]);
    },

    $: function(id)
    {
        return $(id);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    applyTextSize: function(value)
    {
        var zoom = value >= 0 ? positiveZoomFactors[value] : negativeZoomFactors[Math.abs(value)];

        panelBar1.browser.markupDocumentViewer.textZoom = zoom;
        panelBar2.browser.markupDocumentViewer.textZoom = zoom;
    },

    obeyOmitObjectPathStack: function(value)
    {
        FBL.hide(panelStatus, (value?true:false));
    },

    getPanelStatusElements: function()
    {
        return panelStatus;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    // UI Event Listeners uilisteners  or "panelListeners"

    onPanelNavigate: function(object, panel)
    {
        this.syncLocationList();
    },

    onPanelSelect: function(object, panel)
    {
        if (panel == panelBar1.selectedPanel)
        {
            this.syncStatusPath();

            var sidePanel = panelBar2.selectedPanel;
            if (sidePanel)
                sidePanel.select(object);
        }
    },

    onApplyDecorator: function(sourceBox) // called on setTimeout after sourceBox viewport has been repainted
    {
    },

    onViewportChange: function(sourceLink) // called on scrollTo, passing in the selected line
    {
    },

    showUI: function(browser, context) // called when the Firebug UI comes up in browser or detached
    {
    },

    hideUI: function(browser, context)  // called when the Firebug UI comes down; context may be null
    {
    },

    //* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    onOptionsShowing: function(popup)
    {
        for (var child = popup.firstChild; child; child = child.nextSibling)
        {
            if (child.localName == "menuitem")
            {
                var option = child.getAttribute("option");
                if (option)
                {
                    var checked = false;
                    if (option == "profiling")
                        checked = fbs.profiling;
                    else
                        checked = Firebug.getPref(Firebug.prefDomain, option);

                    child.setAttribute("checked", checked);
                }
            }
        }
    },

    onToggleOption: function(menuitem)
    {
        var option = menuitem.getAttribute("option");
        var checked = menuitem.getAttribute("checked") == "true";

        Firebug.setPref(Firebug.prefDomain, option, checked);
    },

    onContextShowing: function(event)
    {
        // xxxHonza: This context-menu support can be used even in separate window, which
        // doesn't contain the FBUI (panels).
        //if (!panelBar1.selectedPanel)
        //    return false;

        var popup = $("fbContextMenu");
        var target = document.popupNode;
        var panel = target ? Firebug.getElementPanel(target) : null;

        if (!panel)
            panel = panelBar1 ? panelBar1.selectedPanel : null; // the event must be on our chrome not inside the panel

        FBL.eraseNode(popup);

        if (!this.contextMenuObject && !$("cmd_copy").getAttribute("disabled"))
        {
            var menuitem = FBL.createMenuItem(popup, {label: "Copy"});
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
            object = Firebug.getRepObject(target); // xxxHonza: What about a node from different document? Is that OK?

        this.contextMenuObject = null;

        var rep = Firebug.getRep(object);
        var realObject = rep ? rep.getRealObject(object, FirebugContext) : null;
        var realRep = realObject ? Firebug.getRep(realObject) : null;

        if (FBTrace.DBG_OPTIONS)
            FBTrace.sysout("chrome.onContextShowing object:"+object+" rep: "+rep+" realObject: "+realObject+" realRep:"+realRep+"\n");

        if (realObject && realRep)
        {
            // 1. Add the custom menu items from the realRep
            var menu = realRep.getContextMenuItems(realObject, target, FirebugContext);
            if (menu)
            {
                for (var i = 0; i < menu.length; ++i)
                    FBL.createMenuItem(popup, menu[i]);
            }
        }

        if (object && rep && rep != realRep)
        {
            // 1. Add the custom menu items from the original rep
            var items = rep.getContextMenuItems(object, target, FirebugContext);
            if (items)
            {
                for (var i = 0; i < items.length; ++i)
                    FBL.createMenuItem(popup, items[i]);
            }
        }

        // 1. Add the custom menu items from the panel
        if (panel)
        {
            var items = panel.getContextMenuItems(realObject, target);
            if (items)
            {
                for (var i = 0; i < items.length; ++i)
                    FBL.createMenuItem(popup, items[i]);
            }
        }

        // 2. Add the inspect menu items
        if (realObject && rep && rep.inspectable)
        {
            var separator = null;

            var items = this.getInspectMenuItems(realObject);
            for (var i = 0; i < items.length; ++i)
            {
                if (popup.firstChild && !separator)
                    separator = FBL.createMenuSeparator(popup);

                FBL.createMenuItem(popup, items[i]);
            }
        }

        if (!popup.firstChild)
            return false;
    },

    onEditorsShowing: function(popup)  // TODO move to Firebug.Editors module in editors.js
    {
        var editors = Firebug.registeredEditors;
        if ( editors.length > 0 )
        {
            var lastChild = popup.lastChild;
            FBL.eraseNode(popup);
            var disabled = (!FirebugContext);
            for( var i = 0; i < editors.length; ++i )
            {
                if (editors[i] == "-")
                {
                    FBL.createMenuItem(popup, "-");
                    continue;
                }
                var item = {label: editors[i].label, image: editors[i].image,
                                nol10n: true, disabled: disabled };
                var menuitem = FBL.createMenuItem(popup, item);
                menuitem.setAttribute("command", "cmd_openInEditor");
                menuitem.value = editors[i].id;
            }
            FBL.createMenuItem(popup, "-");
            popup.appendChild(lastChild);
        }
    },

    getInspectMenuItems: function(object)
    {
        var items = [];

        // Domplate (+ support for context menus) can be used even in separate
        // windows when FirebugContext doesn't have to be defined.
        if (!FirebugContext)
            return items;

        for (var i = 0; i < Firebug.panelTypes.length; ++i)
        {
            var panelType = Firebug.panelTypes[i];
            if (!panelType.prototype.parentPanel
                && panelType.prototype.name != FirebugContext.panelName
                && panelSupportsObject(panelType, object))
            {
                var panelName = panelType.prototype.name;

                var title = Firebug.getPanelTitle(panelType);
                var label = FBL.$STRF("InspectInTab", [title]);

                var command = bindFixed(this.select, this, object, panelName);
                items.push({label: label, command: command, nol10n: true});
            }
        }

        return items;
    },

    onTooltipShowing: function(event)
    {
        // xxxHonza: This tooltip support can be used even in separate window, which
        // doesn't contain the FBUI (panels).
        //if (!panelBar1.selectedPanel)
        //    return false;

        var tooltip = $("fbTooltip");
        var target = document.tooltipNode;

        var panel = target ? Firebug.getElementPanel(target) : null;

        var object;
        /* XXXjjb This causes the Script panel to show the function body over and over. We need to clear it at least,
         * but really we need to understand why the tooltip should show the context menu object at all.
         * One thing the contextMenuObject supports is peeking at function bodies when stopped a breakpoint.
         * That case could be supported with clearing the contextMenuObject, but we don't know if that breaks
         * something else. So maybe a popupMenuObject should be set on the context if that is what we want to support
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

        var rep = object ? Firebug.getRep(object) : null;
        object = rep ? rep.getRealObject(object, FirebugContext) : null;
        rep = object ? Firebug.getRep(object) : null;

        if (object && rep)
        {
            var label = rep.getTooltip(object, FirebugContext);
            if (label)
            {
                tooltip.setAttribute("label", label);
                return true;
            }
        }

        if (target.hasAttribute("title"))
        {
            tooltip.setAttribute("label", target.getAttribute("title"));
            return true;
        }

        return false;
    },

    openAboutDialog: function()
    {
        var extensionManager = CCSV("@mozilla.org/extensions/manager;1", "nsIExtensionManager");
        openDialog("chrome://mozapps/content/extensions/about.xul", "",
            "chrome,centerscreen,modal", "urn:mozilla:item:firebug@software.joehewitt.com", extensionManager.datasource);
    },

    resume: function(context)
    {
        if (!context)
        {
            FBTrace.sysout("Firebug chrome: resume with no context??");
            return;
        }

        var panel = panelBar1.selectedPanel;
        if (!panel)
            return;

        if (!context.stopped && panel.resume)
        {
            panel.resume();
            return;
        }

        // Use debugger as the default handler.
        Firebug.Debugger.resume(context);
    }
};

// ************************************************************************************************
// Local Helpers

function panelSupportsObject(panelType, object)
{
    if (panelType)
    {
        try {
            // This tends to throw exceptions often because some objects are weird
            return panelType.prototype.supportsObject(object)
        } catch (exc) {}
    }

    return 0;
}

function getBestPanelName(object, context, panelName)
{
    if (!panelName)
        panelName = context.panelName;

    // Check if the suggested panel name supports the object, and if so, go with it
    if (panelName)
    {
        panelType = Firebug.getPanelType(panelName);
        if (panelSupportsObject(panelType, object))
            return panelType.prototype.name;
    }

    // The suggested name didn't pan out, so search for the panel type with the
    // most specific level of support

    var bestLevel = 0;
    var bestPanel = null;

    for (var i = 0; i < Firebug.panelTypes.length; ++i)
    {
        var panelType = Firebug.panelTypes[i];
        if (!panelType.prototype.parentPanel)
        {
            var level = panelSupportsObject(panelType, object);
            if (!bestLevel || (level && (level > bestLevel) ))
            {
                bestLevel = level;
                bestPanel = panelType;
            }
            if (FBTrace.DBG_PANELS)
                FBTrace.sysout("chrome.getBestPanelName panelType: "+panelType.prototype.name+" level: "+level+" bestPanel: "+ (bestPanel ? bestPanel.prototype.name : "null")+" bestLevel: "+bestLevel+"\n");
        }
    }

    return bestPanel ? bestPanel.prototype.name : null;
}

function getBestSidePanelName(sidePanelName, panelTypes)
{
    if (sidePanelName)
    {
        // Verify that the suggested panel name is in the acceptable list
        for (var i = 0; i < panelTypes.length; ++i)
        {
            if (panelTypes[i].prototype.name == sidePanelName)
                return sidePanelName;
        }
    }

    // Default to the first panel type in the list
    return panelTypes.length ? panelTypes[0].prototype.name : null;
}

// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
// Event listeners

function browser1Loaded()
{
    if (FBTrace.DBG_INITIALIZE)
        FBTrace.sysout("browse1Loaded\n");
    var browser1 = panelBar1.browser;
    browser1.removeEventListener("load", browser1Loaded, true);

    browser1.contentDocument.title = "Firebug Main Panel";
    browser1Loaded.complete = true;

    if (browser1Loaded.complete && browser2Loaded.complete)
        FirebugChrome.initializeUI();
}

function browser2Loaded()
{
    if (FBTrace.DBG_INITIALIZE)
        FBTrace.sysout("browse2Loaded\n");
    var browser2 = panelBar2.browser;
    browser2.removeEventListener("load", browser2Loaded, true);

    browser2.contentDocument.title = "Firebug Side Panel";
    browser2Loaded.complete = true;

    if (browser1Loaded.complete && browser2Loaded.complete)
        FirebugChrome.initializeUI();  // the chrome bound into this scope

    if (FBTrace.DBG_INITIALIZE)
        FBTrace.sysout("browse2Loaded complete\n");
}

function onBlur(event)
{
    // XXXjjb this seems like a waste: called continuously to clear possible highlight I guess.
    // XXXhh Is this really necessary? I disabled it for now as this was preventing me to show highlights on focus
    //Firebug.Inspector.highlightObject(null, FirebugContext);
}

function onSelectLocation(event)
{
    var location = locationList.repObject;
    FirebugChrome.navigate(location);
}

function onSelectingPanel(event)
{
    var panel = panelBar1.selectedPanel;
    var panelName = panel ? panel.name : null;
    if (FBTrace.DBG_PANELS)
        FBTrace.sysout("chrome.onSelectingPanel="+panelName+" FirebugContext="+(FirebugContext?FirebugContext.getName():"undefined")+"\n");

    if (FirebugContext)
    {
        FirebugContext.previousPanelName = FirebugContext.panelName;
        FirebugContext.panelName = panelName;

        FirebugContext.sidePanelName =
            FirebugContext.sidePanelNames && panelName in FirebugContext.sidePanelNames
            ? FirebugContext.sidePanelNames[panelName]
            : null;
    }

    FirebugChrome.syncLocationList();
    FirebugChrome.syncStatusPath();
    FirebugChrome.syncSidePanels();

    var browser = panel ? panel.context.browser : FirebugChrome.getCurrentBrowser();
    Firebug.showPanel(browser, panel);
}

function onSelectedSidePanel(event)
{
    var sidePanel = panelBar2.selectedPanel;
    if (FirebugContext)
    {
        var panelName = FirebugContext.panelName;
        if (panelName)
        {
            var sidePanelName = sidePanel ? sidePanel.name : null;
            FirebugContext.sidePanelNames[panelName] = sidePanelName;
        }
        else
        {
            if (FBTrace.DBG_ERRORS)
                FBTrace.sysout("onSelectedSidePanel FirebugContext has no panelName: ",FirebugContext);
        }
    }
    if (FBTrace.DBG_PANELS) FBTrace.sysout("chrome.onSelectedSidePanel name="+(sidePanel?sidePanel.name:"undefined")+"\n");

    var panel = panelBar1.selectedPanel;
    if (panel && sidePanel)
        sidePanel.select(panel.selection);

    var browser = sidePanel ? sidePanel.context.browser : FirebugChrome.getCurrentBrowser();
    Firebug.showSidePanel(browser, sidePanel);  // dispatch to modules
}

function onPanelMouseOver(event)
{
    var object = Firebug.getRepObject(event.target);
    if (object)
    {
        var realObject = getRealObject(object);
        if (realObject)
            Firebug.Inspector.highlightObject(realObject, FirebugContext);
    }
}

function onPanelMouseOut(event)
{
    Firebug.Inspector.highlightObject(null);
}

function onPanelClick(event)
{
    var repNode = Firebug.getRepNode(event.target);
    if (repNode)
    {
        var object = repNode.repObject;
        var rep = Firebug.getRep(object);
        var realObject = rep ? rep.getRealObject(object, FirebugContext) : null;
        var realRep = realObject ? Firebug.getRep(realObject) : rep;
        if (!realObject)
            realObject = object;

        if (FBL.isLeftClick(event))
        {
            if (FBL.hasClass(repNode, "objectLink"))
            {
                if (realRep)
                {
                    realRep.inspectObject(realObject, FirebugContext);
                    FBL.cancelEvent(event);
                }
            }
        }
        else if (FBL.isControlClick(event) || FBL.isMiddleClick(event))
        {
            if (!realRep || !realRep.browseObject(realObject, FirebugContext))
            {
                if (rep && !(rep != realRep && rep.browseObject(object, FirebugContext)))
                {
                    var panel = Firebug.getElementPanel(event.target);
                    if (!panel || !panel.browseObject(realObject))
                        return;
                }
            }
            FBL.cancelEvent(event);
        }
    }
}

function onPanelMouseDown(event)
{
    if (FBL.isLeftClick(event))
    {
        var editable = FBL.getAncestorByClass(event.target, "editable");
        if (editable)
        {
            Firebug.Editor.startEditing(editable);
            FBL.cancelEvent(event);
        }
    }
    else if (FBL.isMiddleClick(event) && Firebug.getRepNode(event.target))
    {
        // Prevent auto-scroll when middle-clicking a rep object
        FBL.cancelEvent(event);
    }
}

function onMainTabBoxMouseDown(event)
{
    if (Firebug.isInBrowser())
    {
        var contentSplitter = Firebug.chrome.$("fbContentSplitter");
        if (FBTrace.DBG_ERRORS)
            FBTrace.sysout("onMainTabBoxMouseDown ", event);
        // TODO: grab the splitter here.
    }
}

function getRealObject(object)
{
    var rep = Firebug.getRep(object);
    var realObject = rep ? rep.getRealObject(object, FirebugContext) : null;
    return realObject ? realObject : object;
}


// ************************************************************************************************
// Utils (duplicated from lib.js)

function $(id, doc)
{
    if (doc)
        return doc.getElementById(id);
    else
        return document.getElementById(id);
}

function cloneArray(array, fn)
{
   var newArray = [];

   for (var i = 0; i < array.length; ++i)
       newArray.push(array[i]);

   return newArray;
}

function bindFixed()
{
    var args = cloneArray(arguments), fn = args.shift(), object = args.shift();
    return function() { return fn.apply(object, args); }
}

}})();

// ************************************************************************************************

// XXXjoe This horrible hack works around a focus bug in Firefox which is caused when
// the HTML Validator extension and Firebug are installed.  It causes the keyboard to
// behave erratically when typing, and the only solution I've found is to delay
// the initialization of HTML Validator by overriding this function with a timeout.
// XXXrobc Do we still need this? Does this extension even exist anymore?
if (top.hasOwnProperty('TidyBrowser'))
{
    var prev = TidyBrowser.prototype.updateStatusBar;
    TidyBrowser.prototype.updateStatusBar = function()
    {
        var self = this, args = arguments;
        setTimeout(function()
        {
            prev.apply(self, args);
        });
    }
}

// ************************************************************************************************

function ddd(text)
{
    const consoleService = Components.classes["@mozilla.org/consoleservice;1"].
        getService(Components.interfaces["nsIConsoleService"]);
    consoleService.logStringMessage(text + "");
}

function dddx()
{
    Firebug.Console.logFormatted(arguments);
}



