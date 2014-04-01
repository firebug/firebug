/* See license.txt for terms of usage */

/**
 * This file defines Firebug Panel APIs for test drivers.
 */

(function() {

// ********************************************************************************************* //
// Firebug Panel API

this.getPanelTypeByName = function(panelName, doc)
{
    if (!doc)
        doc = FW.Firebug.chrome.window.document;

    var panelTabs = doc.getElementById("fbPanelBar1-panelTabs");
    for (var child = panelTabs.firstChild; child; child = child.nextSibling)
    {
        var label = child.getAttribute("label");
        FBTest.sysout("getPanelTypeByName trying '"+label+"'");
        var role = child.getAttribute("role");
        if (role == "tab" && label == panelName)
            return child.panelType.prototype.name;
    }

    return null;
};

this.setPanelState = function(model, panelName, callback, enable, reload)
{
    this.selectPanel(panelName);

    // Open Firebug UI is asynchronous since it involves attaching to the backend.
    this.pressToggleFirebug(true, undefined, () =>
    {
        var panelType = FW.Firebug.getPanelType(panelName);
        if (panelType.prototype.isEnabled() != enable)
        {
            var panelTab;

            var doc = FW.Firebug.chrome.window.document;
            var panelTabs = doc.getElementById("fbPanelBar1-panelTabs");
            for (var child = panelTabs.firstChild; child; child = child.nextSibling)
            {
                if (panelType == child.panelType)
                {
                    panelTab = child;
                    break;
                }
            }

            if (!panelTab)
            {
                this.ok(panelTab, "Such panel doesn't exist! " + panelName + ", " + enable);
                return;
            }

            // Execute directly menu commands.
            if (enable)
                panelTab.tabMenu.onEnable();
            else
                panelTab.tabMenu.onDisable();
        }

        // Clear cache and reload.
        this.clearCache();

        // Do not reload automatically, JSD2 doesn't need that anymore.
        if (reload)
        {
            this.reload(callback);
        }
        else if (callback)
        {
            var browser = FBTestFirebug.getCurrentTabBrowser();
            callback(browser.contentDocument.defaultView);
        }
    });
};

/**
 * Disables the Net panel and reloads if a callback is specified.
 * @param {Function} callback A handler that is called as soon as the page is reloaded.
 */
this.disableNetPanel = function(callback)
{
    this.setPanelState(FW.Firebug.NetMonitor, "net", callback, false);
};

/**
 * Enables the Net panel and reloads if a callback is specified.
 * @param {Function} callback A handler that is called as soon as the page is reloaded.
 */
this.enableNetPanel = function(callback)
{
    this.setPanelState(FW.Firebug.NetMonitor, "net", callback, true, !!callback);
};

/**
 * Disables the Script panel and reloads if a callback is specified.
 * @param {Function} callback A handler that is called as soon as the page is reloaded.
 */
this.disableScriptPanel = function(callback)
{
    this.setPanelState(FW.Firebug.Debugger, "script", callback, false);
};

/**
 * Enables the Script panel and reloads if a callback is specified.
 * @param {Function} callback A handler that is called as soon as the page is reloaded.
 */
this.enableScriptPanel = function(callback)
{
    function onCallback(win)
    {
        FBTest.waitForThreadAttach(function()
        {
            callback(win);
        });
    }

    var cb = callback ? onCallback : null;
    this.setPanelState(FW.Firebug.Debugger, "script", cb, true);
};

/**
 * Disables the Console panel and reloads if a callback is specified.
 * @param {Function} callback A handler that is called as soon as the page is reloaded.
 */
this.disableConsolePanel = function(callback)
{
    this.setPanelState(FW.Firebug.Console, "console", callback, false);
};

/**
 * Enables the Console panel and reloads if a callback is specified.
 * @param {Function} callback A handler that is called as soon as the page is reloaded.
 */
this.enableConsolePanel = function(callback, reload)
{
    function onCallback(win)
    {
        FBTest.waitForTabAttach(function()
        {
            callback(win);
        });
    }

    var cb = callback ? onCallback : null;
    this.setPanelState(FW.Firebug.Console, "console", cb, true, !!reload);
};

this.enableConsolePanelAndReload = function(callback)
{
    return this.enableConsolePanel(callback, true);
};

/**
 * Disables all activable panels.
 */
this.disableAllPanels = function()
{
    FW.FBL.$("cmd_firebug_disablePanels").doCommand();
};

/**
 * Enables all activable panels.
 */
this.enableAllPanels = function()
{
    // xxxsz: This function should be made asynchronous
    FW.FBL.$("cmd_firebug_enablePanels").doCommand();
};

/**
 * Enable specified panels one by one and selects the first one.
 */
this.enablePanels = function(panelNames, callback)
{
    if (!panelNames.length)
    {
        FBTest.sysout("enablePanels; ERROR no panels to enable!");
        return;
    }

    var name = panelNames.pop();

    var method;
    if (name === "script")
        method = FBTestFirebug.enableScriptPanel;
    else if (name === "net")
        method = FBTestFirebug.enableNetPanel;
    else if (name === "console")
        method = FBTestFirebug.enableConsolePanel;
    else if (name === "cookies")
        method = FBTestFirebug.enableCookiesPanel;

    if (!method)
    {
        FBTest.sysout("enablePanels; ERROR wrong panel name " + panelName);
        return;
    }

    method.call(this, function(win)
    {
        if (!panelNames.length)
            callback(win)
        else
            FBTestFirebug.enablePanels(panelNames, callback);
    });
};

// ********************************************************************************************* //
// Panel Selection

/**
 * Select specific panel in the UI.
 * @param {Object} panelName Name of the panel (e.g. <i>console</i>, <i>dom</i>, <i>script</i>,
 * <i>net</i>, <i>css</i>).
 * @param {Object} chrome Firebug chrome object.
 */
this.selectPanel = function(panelName, chrome)
{
    if (!chrome)
        chrome = FW.Firebug.chrome;

    var panelType = FW.Firebug.getPanelType(panelName);
    if (panelType.prototype.parentPanel)
        return this.selectSidePanel(panelName, chrome);

    return chrome.selectPanel(panelName);
};

this.selectSidePanel = function(panelName, chrome)
{
    if (!chrome)
        chrome = FW.Firebug.chrome;

    return chrome.selectSidePanel(panelName);
};

/* select a panel tab */
this.selectPanelTab = function(name, doc)
{
    if (!doc)
        doc = FW.Firebug.chrome.window.document;

    var panelTabs = doc.getElementById("fbPanelBar1-panelTabs");
    for (var child = panelTabs.firstChild; child; child = child.nextSibling)
    {
        var label = child.getAttribute("label");
        FBTest.sysout("selectPanelTab trying "+label);
        var role = child.getAttribute("role");
        if (role == "tab" && label == name)
        {
            var panelBar = panelTabs;
            while (panelBar && (panelBar.tagName != "panelBar") )
                panelBar = panelBar.parentNode;

            panelBar.selectTab(child);
            return true;
        }
    }
    return false;
};

this.getSelectedPanelTab = function(doc)
{
    if (!doc)
        doc = FW.Firebug.chrome.window.document;

    var panelTabs = doc.getElementById("fbPanelBar1-panelTabs");
    for (var child = panelTabs.firstChild; child; child = child.nextSibling)
    {
        if (child.getAttribute("selected") == "true")
            return child;
    }
    return null;
};

/* selected panel on UI (not via context) */
this.getSelectedPanel = function()
{
    var panelBar1 = FW.Firebug.chrome.$("fbPanelBar1");
    return panelBar1.selectedPanel; // may be null
};

/* selected side panel on UI (not via context) */
this.getSelectedSidePanel = function()
{
    var panelBar2 = FW.Firebug.chrome.$("fbPanelBar2");
    return panelBar2.selectedPanel; // may be null
};

/**
 * Returns document object of Main Firebug content UI (content of all panels is presented
 * in this document).
 */
this.getPanelDocument = function()
{
    var panelBar1 = FW.Firebug.chrome.$("fbPanelBar1");
    return panelBar1.browser.contentDocument;
};

this.getSidePanelDocument = function()
{
    var panelBar2 = FW.Firebug.chrome.$("fbPanelBar2");
    return panelBar2.browser.contentDocument;
};

/* user sees panel tab disabled? */
this.isPanelTabDisabled = function(name)
{
    var panelBar1 = FW.Firebug.chrome.$("fbPanelBar1-panelTabs");
    for (var child = panelBar1.firstChild; child; child = child.nextSibling)
    {
        var label = child.getAttribute("label");
        FBTest.sysout("isPanelTabDisabled trying '"+label+"'");
        var role = child.getAttribute("role");
        if (role == "tab" && label == name)
        {
            FBTest.sysout("isPanelTablDisabled found role tab and label '"+label+"' has "+child.getAttribute("aria-disabled"));
            return child.getAttribute("aria-disabled"); // "true" or "false"
        }
    }
    return null;
};

/**
 * Returns panel object that represents a specified panel. In order to get root element of
 * panels's content use <i>panel.panelNode</i>, where <i>panel</i> is the returned value.
 * @param {Object} name Name of the panel to be returned (e.g. <i>net</i>).
 */
this.getPanel = function(name)
{
    if (!FW.Firebug.currentContext)
    {
        this.ok(FW.Firebug.currentContext, "There is no current context!");
        return;
    }

    return FW.Firebug.currentContext.getPanel(name);
};

// ********************************************************************************************* //
// Panel Navigation

/**
 * Select a location, e.g. a source file inside the Script panel, using the string the user
 * sees.
 *
 * Example:
 * ~~
 * var panel = FBTest.selectPanel("script");
 * FBTest.selectPanelLocationByName(panel, "foo.js");
 * ~~
 *
 * xxxHonza: the method should be asynchronous since the source can be fetched from
 * the backend asynchronously. For now it should be used together with:
 * FBTest.waitForDisplayedText() to wait till specific source is really displayed
 * in the panel.
 */
this.selectPanelLocationByName = function(panel, name)
{
    var locations = panel.getLocationList();
    for (var i = 0; i < locations.length; i++)
    {
        var location = locations[i];
        var description = panel.getObjectDescription(location);
        if (description.name == name)
        {
            panel.navigate(location);
            return true;
        }
    }

    return false;
};

/**
 * Returns current location in the current panel. For example, if the Script panel
 * is selected the return value might be: myScript.js
 */
this.getCurrentLocation = function()
{
    var locationList = FW.Firebug.chrome.$("fbLocationList");
    return locationList.label;
};

// ********************************************************************************************* //
// Panel Options

this.setPanelOption = function(panelName, menuItemIdentifier, callback, errorCallback)
{
    var panelType = FW.Firebug.getPanelType(panelName);
    var panelTab;

    var doc = FW.Firebug.chrome.window.document;
    var panelTabs = doc.getElementById(panelType.prototype.parentPanel ?
        "fbPanelBar2-panelTabs" : "fbPanelBar1-panelTabs");
    for (var child = panelTabs.firstChild; child; child = child.nextSibling)
    {
        if (panelType == child.panelType)
        {
            panelTab = child;
            break;
        }
    }

    var optionsMenuButton = panelTab.getElementsByTagName("panelTabMenu")[0];
    var optionsMenuButtonChildren = FW.FBL.domUtils.getChildrenForNode(optionsMenuButton, true);
    var optionsMenu = null

    for (var i = 0; i < optionsMenuButtonChildren.length; i++)
    {
        if (optionsMenuButtonChildren[i] instanceof XULElement && optionsMenuButtonChildren[i].className === "menuPopup")
        {
            optionsMenu = optionsMenuButtonChildren[i];
            break;
        }
    }
    var self = this;

    function onPopupShown(event)
    {
        optionsMenu.removeEventListener("popupshowing", onPopupShown);

        // Fire the event handler asynchronously so items have a chance to be appended.
        setTimeout(function()
        {
            var menuItem;
            if (typeof menuItemIdentifier == "string" || menuItemIdentifier.id)
            {
                var menuItemId = menuItemIdentifier.id || menuItemIdentifier;
                menuItem = event.target.ownerDocument.getElementById(menuItemId);
            }
            else if (menuItemIdentifier.label)
            {
                var menuItemId = menuItemIdentifier.label;
                for (var item = event.target.firstChild; item; item = item.nextSibling)
                {
                    if (item.label == menuItemId)
                    {
                        menuItem = item;
                        break;
                    }
                }
            }

            // If the menu item isn't available close the options menu and bail out.
            if (!self.ok(menuItem, "'" + menuItemId + "' item must be available in the options menu."))
            {
                optionsMenu.hidePopup();
                if (errorCallback)
                    errorCallback();
                return;
            }
    
            // Click on specified menu item.
            self.synthesizeMouse(menuItem);

            // Close the popup asynchronously to allow the click to take affect
            setTimeout(() => optionsMenu.hidePopup());

            if (callback)
            {
                // Since the command is dispatched asynchronously,
                // execute the callback using timeout.
                // Especially Mac OS needs this.
                setTimeout(() => callback(), 250);
            }
        }, 10);
    }

    optionsMenu.addEventListener("popupshowing", onPopupShown);

    var contextMenuEventDetails = {type: "contextmenu", button: 2};
    self.synthesizeMouse(panelTab, 5, 5, contextMenuEventDetails);
};

// ********************************************************************************************* //
// Panel DOM

this.expandElements = function(panelNode, className) // className, className, ...
{
    var rows = FW.FBL.getElementsByClass.apply(null, arguments);
    for (var i=0; i<rows.length; i++)
    {
        var row = rows[i];
        if (!FW.FBL.hasClass(row, "opened") && !FW.FBL.hasClass(row, "collapsed"))
            FBTest.click(row);
    }

    return rows;
};

/**
 * Wait for displayed element config
 * @typedef {Object} WaitForDisplayedElementConfig
 * @property {String} tagName - Name of the element tag
 * @property {String} id - ID of the element
 * @property {String} classes - Space-separated list of classes the element contains
 * @property {Object} attributes - Attributes the element contains (name/value pairs)
 * @property {Number} counter - Number of elements
 * @property {Boolean} onlyMutations - If true, only check for changes, otherwise also already
 *     displayed elements are considered
 */

/**
 * Executes passed callback as soon as an expected element is displayed within the
 * specified panel. A DOM node representing the UI is passed into the callback as
 * the only parameter.
 *
 * @param {String} panelName Name of the panel that shows the result.
 * @param {WaitForDisplayedElementConfig} config Requirements, which must be fulfilled to trigger
 *     the callback function
 * @param {Function} callback A callback function with one parameter.
 */
this.waitForDisplayedElement = function(panelName, config, callback)
{
    if (!config)
    {
        // Default configuration for specific panels.
        config = {};
        switch (panelName)
        {
            case "net":
                config.tagName = "tr";
                config.classes = "netRow category-xhr hasHeaders loaded";
                break;

            case "console":
                config.tagName = "div";
                config.classes = "logRow logRow-spy loaded";
                break;

            default:
                FBTest.sysout("waitForDisplayedElement; ERROR Unknown panel name specified.");
                return;
        }
    }

    if (!config.counter)
        config.counter = 1;

    this.selectPanel(panelName);

    // If config.onlyMutations is not true, let's check the UI since the nodes we
    // are waiting for might me already displayed.
    if (!config.onlyMutations)
    {
        var panelNode = this.getPanel(panelName).panelNode;

        if (config.id)
        {
            var node = panelNode.ownerDocument.getElementById(config.id);
            if (node)
            {
                setTimeout(function()
                {
                    callback(node);
                });
                return;
            }
        }
        else
        {
            // Expected elements can be already displayed. In such case just asynchronously
            // execute the callback (with the last element passed in).
            // Execute the callback if there is equal or more matched elements in the UI as
            // expected in the config.
            var nodes = panelNode.getElementsByClassName(config.classes);
            if (nodes.length >= config.counter)
            {
                setTimeout(function()
                {
                    callback(nodes[nodes.length-1]);
                });
                return;
            }
        }
    }

    var panelType = FW.Firebug.getPanelType(panelName);
    var doc = panelType.prototype.parentPanel ? this.getSidePanelDocument() :
        this.getPanelDocument();
    var mutationAttributes = {};
    if (config.id)
        mutationAttributes.id = config.id;
    else
        mutationAttributes.class = config.classes;

    if (config.attributes)
    {
        for (var prop in config.attributes)
            mutationAttributes[prop] = config.attributes[prop];
    }

    var recognizer = new MutationRecognizer(doc.defaultView, config.tagName, mutationAttributes);

    var tempCallback = callback;
    if (config.counter > 1)
    {
        /** @ignore */
        tempCallback = function(element)
        {
            var panelNode = FBTestFirebug.getPanel(panelName).panelNode;
            var nodes = panelNode.getElementsByClassName(config.classes);

            if (nodes.length < config.counter)
                FBTest.waitForDisplayedElement(panelName, config, callback);
            else
                // wwwFlorent: oddly, element != nodes[config.counter - 1]
                callback(nodes[config.counter - 1]);
        };
    }

    recognizer.onRecognizeAsync(tempCallback);
};

/**
 * Wait till a text is displayed in specified panel.
 * @param {Object} panelName Name of the panel where the text should appear.
 * @param {Object} text Text to wait for.
 * @param {Object} callback Executed as soon as the text is displayed.
 */
this.waitForDisplayedText = function(panelName, text, callback)
{
    var panel = this.selectPanel(panelName);
    var rec = new MutationRecognizer(panel.document.defaultView, "Text", {}, text);
    rec.onRecognizeAsync(callback);
};

this.waitForPanel = function(panelName, callback)
{
    panelBar1 = FW.Firebug.chrome.$("fbPanelBar1");
    panelBar1.addEventListener("selectingPanel",function onSelectingPanel(event)
    {
        var panel = panelBar1.selectedPanel;
        if (panel.name === panelName)
        {
            panelBar1.removeEventListener("selectingPanel", onSelectingPanel, false);
            callback(panel);
        }
        else
        {
            FBTest.sysout("waitForPanel saw "+panel.name);
        }
    }, false);
};

// ********************************************************************************************* //
// Tooltips

this.showTooltip = function(target, callback)
{
    function onTooltipShowing(event)
    {
        TooltipController.removeListener(onTooltipShowing);

        callback(event.target);
    }

    // Tooltip controller ensures clean up (listeners removal) in cases
    // when the tooltip is never shown and so, the listener not removed.
    TooltipController.addListener(onTooltipShowing);

    var win = target.ownerDocument.defaultView;

    try
    {
        disableNonTestMouseEvents(win, true);

        this.synthesizeMouse(target, 2, 2, {type: "mouseover"});
        this.synthesizeMouse(target, 4, 4, {type: "mousemove"});
        this.synthesizeMouse(target, 6, 6, {type: "mousemove"});
    }
    catch (e)
    {
        if (FBTrace.DBG_ERRORS)
            FBTrace.sysout("EXCEPTION " + e, e);
    }
    finally
    {
        disableNonTestMouseEvents(win, false);
    }
}

// ********************************************************************************************* //
}).apply(FBTest);
