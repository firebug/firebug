/* See license.txt for terms of usage */

define([
    "firebug/lib",
    "firebug/firebug",
    "firebug/domplate",
    "firebug/lib/locale",
    "arch/tools",
    "firebug/lib/events",
    "firebug/lib/url",
    "firebug/lib/css",
    "firebug/lib/dom",
    "firebug/lib/xml",
    "firebug/lib/xpath",
    "firebug/console",
    "firebug/infotip",
],
function(FBL, Firebug, Domplate, Locale, ToolsInterface, Events, URL, CSS, DOM, XML, XPATH) {

// ************************************************************************************************
// Constants

var singleSpaceTag = Domplate.DIV({'class' : 'a11y1emSize'}, "x");

var KeyEvent = window.KeyEvent;

// ************************************************************************************************
// Module Management

Firebug.A11yModel = FBL.extend(Firebug.Module,
{
    dispatchName: "a11y",

    initialize : function()
    {
        Firebug.Module.initialize.apply(this, arguments);

        this.handleTabBarFocus = FBL.bind(this.handleTabBarFocus, this);
        this.handleTabBarBlur = FBL.bind(this.handleTabBarBlur, this);
        this.handlePanelBarKeyPress = FBL.bind(this.handlePanelBarKeyPress, this);
        this.onNavigablePanelKeyPress = FBL.bind(this.onNavigablePanelKeyPress, this);
        this.onConsoleMouseDown = FBL.bind(this.onConsoleMouseDown, this);
        this.onLayoutKeyPress = FBL.bind(this.onLayoutKeyPress, this);
        this.onCSSKeyPress = FBL.bind(this.onCSSKeyPress, this);
        this.onCSSMouseDown = FBL.bind(this.onCSSMouseDown, this);
        this.onHTMLKeyPress = FBL.bind(this.onHTMLKeyPress, this);
        this.onHTMLFocus = FBL.bind(this.onHTMLFocus, this);
        this.onHTMLBlur = FBL.bind(this.onHTMLBlur, this);
        this.onPanelFocus = FBL.bind(this.onPanelFocus, this);
        this.onLayoutFocus = FBL.bind(this.onLayoutFocus, this);
        this.onLayoutBlur = FBL.bind(this.onLayoutBlur, this);
        this.onScriptContextMenu = FBL.bind(this.onScriptContextMenu, this);
        this.onCSSPanelContextMenu = FBL.bind(this.onCSSPanelContextMenu, this);
        this.onScriptKeyPress = FBL.bind(this.onScriptKeyPress, this);
        this.onScriptKeyUp = FBL.bind(this.onScriptKeyUp, this);
        this.onScriptMouseUp = FBL.bind(this.onScriptMouseUp, this);
        this.onNetMouseDown = FBL.bind(this.onNetMouseDown, this);
        this.onNetFocus = FBL.bind(this.onNetFocus, this);
        this.onNetBlur = FBL.bind(this.onNetBlur, this);

        // mark ourselves disabled so we don't performDisable() if we are not enabled.
        Firebug.chrome.window.a11yEnabled = false;

        ToolsInterface.browser.addListener(this);
        Firebug.Console.addListener(this);
        Firebug.DOMModule.addListener(this);
    },

    shutdown: function()
    {
        ToolsInterface.browser.removeListener(this);
        Firebug.Console.removeListener(this);
        Firebug.DOMModule.removeListener(this);

        Firebug.Module.shutdown.apply(this, arguments);
    },

    initializeUI : function()
    {
        //Initialize according to the current pref value.
        this.updateOption("a11y.enable", this.isEnabled());
    },

    isEnabled : function()
    {
        return Firebug.Options.get("a11y.enable");
    },

    updateOption: function(name, value)
    {
        if (FBTrace.DBG_A11Y)
            FBTrace.sysout("a11y.updateOption; " + name + ": " + value +
                ", Current chrome: " + Firebug.chrome.getName() +
                ", Original chrome: " + Firebug.originalChrome.getName());
        if (name == "a11y.enable")
        {
            // Update for current chrome
            this.set(value, Firebug.chrome);
            // If the current chrome is external window, update also original chrome.
            if (Firebug.chrome != Firebug.originalChrome)
            {
                this.set(value, Firebug.originalChrome);
                if (FBTrace.DBG_A11Y)
                    FBTrace.sysout("a11y.updateOption; (original chrome)");
            }
        }
    },

    reattachContext : function(browser, context)
    {
        if (FBTrace.DBG_A11Y)
            FBTrace.sysout("a11y.reattachContext; " + this.isEnabled() + ", " +
                Firebug.chrome.getName());
        if (this.isEnabled())
            this.set(true, Firebug.chrome);
    },

    set : function(enable, chrome)
    {
        if (chrome.window.a11yEnabled == enable)
            return;
        if (enable)
            this.performEnable(chrome);
        else
            this.performDisable(chrome);
        chrome.window.a11yEnabled = enable;
    },

    performEnable : function(chrome)
    {
        var tmpElem;
        //add class used by all a11y related css styles (e.g. :focus and -moz-user-focus styles)
        CSS.setClass(chrome.$('fbContentBox'), 'useA11y');
        CSS.setClass(chrome.$('fbStatusBar'), 'useA11y');
        tmpElem = chrome.$('fbStatusPrefix');
        if (tmpElem) tmpElem.setAttribute('value', Locale.$STR("a11y.labels.firebug status"));

        //manage all key events in toolbox (including tablists)
        tmpElem = chrome.$("fbContentBox");
        if (tmpElem) tmpElem.addEventListener("keypress", this.handlePanelBarKeyPress , true);
        //make focus stick to inspect button when clicked
        tmpElem = chrome.$("fbInspectButton");
        if (tmpElem) tmpElem.addEventListener("mousedown", this.focusTarget, true);
        tmpElem = chrome.$('fbPanelBar1-panelTabs');
        if (tmpElem) tmpElem.addEventListener('focus', this.handleTabBarFocus, true);
        tmpElem = chrome.$('fbPanelBar1-panelTabs');
        if (tmpElem) tmpElem.addEventListener('blur', this.handleTabBarBlur, true);
        tmpElem = chrome.$('fbPanelBar2-panelTabs');
        if (tmpElem) tmpElem.addEventListener('focus', this.handleTabBarFocus, true);
        tmpELem = chrome.$('fbPanelBar2-panelTabs');
        if (tmpElem) tmpElem.addEventListener('blur', this.handleTabBarBlur, true);
        tmpElem = chrome.$("fbPanelBar1");
        if (tmpElem) CSS.setClass(tmpElem.browser.contentDocument.body, 'useA11y');
        tmpElem = chrome.$("fbPanelBar2");
        if (tmpElem) CSS.setClass(tmpElem.browser.contentDocument.body, 'useA11y');
        Firebug.Editor.addListener(this);
        this.listeningToEditor = true;
    },

    performDisable : function(chrome)
    {
        var tmpElem;
        //undo everything we did in performEnable
        CSS.removeClass(chrome.$('fbContentBox'), 'useA11y');
        CSS.removeClass(chrome.$('fbStatusBar'), 'useA11y');
        tmpElem = chrome.$("fbPanelBar1");
        if (tmpElem) tmpElem.removeEventListener("keypress", this.handlePanelBarKeyPress , true);
        tmpElem = chrome.$("fbInspectButton");
        if (tmpElem) tmpElem.removeEventListener("mousedown", this.focusTarget, true);
        tmpElem = chrome.$('fbPanelBar1-panelTabs');
        if (tmpElem) tmpElem.removeEventListener('focus', this.handleTabBarFocus, true);
        tmpElem = chrome.$('fbPanelBar1-panelTabs')
        if (tmpElem) tmpElem.removeEventListener('blur', this.handleTabBarBlur, true);
        tmpElem = chrome.$('fbPanelBar2-panelTabs');
        if (tmpElem) tmpElem.removeEventListener('focus', this.handleTabBarFocus, true);
        tmpElem = chrome.$('fbPanelBar2-panelTabs');
        if (tmpElem) tmpElem.removeEventListener('blur', this.handleTabBarBlur, true);
        tmpElem = chrome.$("fbPanelBar1");
        if (tmpElem)
        {
            CSS.removeClass(tmpElem.browser.contentDocument.body, 'useA11y');
            tmpElem.browser.setAttribute('showcaret', false);
        }
        tmpElem = chrome.$("fbPanelBar2");
        if (tmpElem) CSS.removeClass(tmpElem.browser.contentDocument.body, 'useA11y');

        if(this.listeningToEditor)
            Firebug.Editor.removeListener(this);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    onCreatePanel: function(context, panel, panelType)
    {
        if (!panel.enableA11y)
            return;

        if (panel.addListener)
            panel.addListener(this);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    // Context & Panel Management

    onInitializeNode : function(panel)
    {
        var panelA11y = this.getPanelA11y(panel, true);
        if (!panelA11y)
            return;

        panelA11y.tabStop = null;
        panelA11y.manageFocus = false;
        panelA11y.lastIsDefault = false;
        panelA11y.type = panel.deriveA11yFrom ? panel.deriveA11yFrom : panel.name;

        //panel.context.chrome.$("fbContentBox").addEventListener("focus", this.reportFocus, true);
        this.makeFocusable(panel.panelNode, false);

        switch (panelA11y.type)
        {
            case 'console':
                panelA11y.manageFocus = true;
                if (panel.name == "console")
                {
                    panel.panelNode.setAttribute('aria-label', Locale.$STR('a11y.labels.log rows'));
                    panelA11y.lastIsDefault = true;
                    panel.panelNode.setAttribute('role', 'list');
                }
                else if (panel.name == "callstack")
                {
                    panel.panelNode.setAttribute('role', 'list');
                    panel.panelNode.setAttribute('aria-label', Locale.$STR('a11y.labels.call stack'));
                }
                else
                    panel.panelNode.setAttribute('role', 'presentation');
                panel.panelNode.setAttribute('aria-live', 'polite');
                panel.panelNode.setAttribute('aria-relevant', 'additions');
                panel.panelNode.addEventListener("keypress", this.onNavigablePanelKeyPress, false);
                panel.panelNode.addEventListener("focus", this.onPanelFocus, true);
                panel.panelNode.addEventListener("mousedown", this.onConsoleMouseDown, false);
                if (panel.name == "breakpoints")
                    panel.panelNode.style.overflowX = "hidden";
                break;
            case 'html':
                panel.panelNode.setAttribute('role', 'tree');
                panel.panelNode.setAttribute('aria-label', Locale.$STR('a11y.labels.document structure'));
                panel.panelNode.addEventListener("keypress", this.onHTMLKeyPress, false);
                panel.panelNode.addEventListener("focus", this.onHTMLFocus, true);
                panel.panelNode.addEventListener("blur", this.onHTMLBlur, true);
                break;
            case 'css':
                panelA11y.manageFocus = true;
                panel.panelNode.addEventListener("keypress", this.onCSSKeyPress, false);
                panel.panelNode.addEventListener("mousedown", this.onCSSMouseDown, false);
                panel.panelNode.addEventListener("focus", this.onPanelFocus, true);
                panel.panelNode.addEventListener('contextmenu', this.onCSSPanelContextMenu, false)
                this.insertHiddenText(panel, panel.panelNode, Locale.$STR('a11y.labels.overridden'), false, "CSSOverriddenDescription");
                panel.panelNode.setAttribute('role', panel.name == "stylesheet" ? 'list' : "presentation");
                break;
            case 'layout':
                panelA11y.manageFocus = true;
                panel.panelNode.addEventListener("keypress", this.onLayoutKeyPress, false);
                panel.panelNode.addEventListener("focus", this.onLayoutFocus, true);
                panel.panelNode.addEventListener("blur", this.onLayoutBlur, true);
                break;
            case 'script':
                panel.panelNode.addEventListener('contextmenu', this.onScriptContextMenu, true);
                panel.panelNode.addEventListener('keypress', this.onScriptKeyPress, true);
                panel.panelNode.addEventListener('keyup', this.onScriptKeyUp, true);
                panel.panelNode.addEventListener('mouseup', this.onScriptMouseUp, true);
                panelA11y.oneEmElem = this.addSingleSpaceElem(panel.panelNode);
                break;
            case 'net':
                panelA11y.manageFocus = true;
                panel.panelNode.addEventListener("keypress", this.onNavigablePanelKeyPress, false);
                panel.panelNode.addEventListener("focus", this.onPanelFocus, true);
                panel.panelNode.addEventListener("focus", this.onNetFocus, true);
                panel.panelNode.addEventListener("blur", this.onNetBlur, true);
                panel.panelNode.addEventListener("mousedown", this.onNetMouseDown, false);
                break;
        }
    },

    onDestroyNode : function(panel)
    {
        var panelA11y = this.getPanelA11y(panel);
        if (!panelA11y)
            return;

        panelA11y = null;

        // Remove all event handlers we added in onInitializeNode.
        var actAsPanel = panel.deriveA11yFrom ? panel.deriveA11yFrom : panel.name;
        switch (actAsPanel)
        {
            case 'console':
                panel.panelNode.removeEventListener("keypress", this.onNavigablePanelKeyPress, false);
                panel.panelNode.removeEventListener("focus", this.onPanelFocus, true);
                panel.panelNode.removeEventListener("mousedown", this.onConsoleMouseDown, false);
                break;
            case 'html':
                panel.panelNode.removeEventListener("keypress", this.onHTMLKeyPress, false);
                panel.panelNode.removeEventListener("focus", this.onHTMLFocus, true);
                panel.panelNode.removeEventListener("blur", this.onHTMLBlur, true);
                break;
            case 'css':
                panel.panelNode.removeEventListener("keypress", this.onCSSKeyPress, false);
                panel.panelNode.removeEventListener("mousedown", this.onCSSMouseDown, false);
                panel.panelNode.removeEventListener("focus", this.onPanelFocus, true);
                panel.panelNode.removeEventListener("blur", this.onPanelBlur, true);
                panel.panelNode.removeEventListener('contextmenu', this.onCSSPanelContextMenu, false)
                break;
            case 'layout':
                panel.panelNode.removeEventListener("keypress", this.onLayoutKeyPress, false);
                panel.panelNode.removeEventListener("focus", this.onLayoutFocus, true);
                panel.panelNode.removeEventListener("blur", this.onLayoutBlur, true);
                break;
            case 'script':
                panel.panelNode.removeEventListener('contextmenu', this.onScriptContextMenu, true);
                panel.panelNode.removeEventListener('keypress', this.onScriptKeyPress, true);
                panel.panelNode.removeEventListener('keyup', this.onScriptKeyUp, true);
                panel.panelNode.removeEventListener('mouseup', this.onScriptMouseUp, true)
                break;
            case 'net':
                panel.panelNode.removeEventListener("keypress", this.onNavigablePanelKeyPress, false);
                panel.panelNode.removeEventListener("focus", this.onPanelFocus, true);
                panel.panelNode.removeEventListener("focus", this.onNetFocus, true);
                panel.panelNode.removeEventListener("blur", this.onNetBlur, true);
                panel.panelNode.removeEventListener("mousedown", this.onNetMouseDown, false);
                break;
        }
    },

    showPanel : function(browser, panel)
    {
        var panelA11y = this.getPanelA11y(panel);
        if (!panelA11y)
            return;
        var title = panel.name;
        var panelType = Firebug.getPanelType(panel.name);
        if (panelType)
            title = Firebug.getPanelTitle(panelType);
        Firebug.chrome.$('fbToolbar').setAttribute('aria-label', title + " " + Locale.$STR("a11y.labels.panel tools"))
        var panelBrowser = Firebug.chrome.getPanelBrowser(panel);
        panelBrowser.setAttribute('showcaret', (panel.name == "script"));
        panelBrowser.contentDocument.body.setAttribute('aria-label', Locale.$STRF("a11y.labels.title panel", [title]));
    },

    showSidePanel : function(browser, sidePanel)
    {
        var panelA11y = this.getPanelA11y(sidePanel);
        if (!panelA11y)
            return;
        var panelBrowser = Firebug.chrome.getPanelBrowser(sidePanel);
        var panelType = Firebug.getPanelType(sidePanel.name);
        if (panelType)
            title = Firebug.getPanelTitle(panelType);
            panelBrowser.contentDocument.body.setAttribute('aria-label', Locale.$STRF("a11y.labels.title side panel", [title]));
    },

    addLiveElem : function(panel, role, politeness)
    {
        var panelA11y = this.getPanelA11y(panel);
        if (!panelA11y)
            return;
        if (panelA11y.liveElem && DOM.isElement(panelA11y.liveElem))
            return;
        var attrName = attrValue = "";
        if (role)
        {
            attrName = 'role';
            attrValue = role;
        }
        else
        {
            attrName = "aria-live";
            attrValue = politeness ? politeness : 'polite';
        }
        var elem = panel.document.createElement('div');
        elem.setAttribute(attrName, attrValue);
        elem.className = "offScreen";
        panel.document.body.appendChild(elem);
        panelA11y.liveElem = elem;
        return elem;
    },

    updateLiveElem: function(panel, msg, useAlert)
    {
        var panelA11y = this.getPanelA11y(panel);
        if (!panelA11y)
            return;
        var elem = panelA11y.liveElem;
        if (!elem)
            elem = this.addLiveElem(panel);
        elem.textContent = msg;
        if (useAlert)
            elem.setAttribute('role', 'alert');
    },

    addSingleSpaceElem : function(parent)
    {
        return singleSpaceTag.append({}, parent, this);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    // Toolbars & Tablists

    focusTarget : function(event)
    {
        this.focus(event.target);
    },

    handlePanelBarKeyPress : function (event)
    {
        var target = event.originalTarget;
        var isTab = target.nodeName.toLowerCase() == "paneltab";
        var isButton = target.nodeName.search(/(xul:)?((toolbar)?button)|(checkbox)/) != -1;
        var isDropDownMenu = isButton && (target.getAttribute('type') == "menu" || target.id == "fbLocationList") ;
        var siblingTab, forward, toolbar, buttons;
        var keyCode = event.keyCode || (event.type=='keypress' ? event.charCode : null);
        if (keyCode == KeyEvent.DOM_VK_TAB)
            this.ensurePanelTabStops(); //TODO: need a better solution to prevent loss of panel tabstop
        if (isTab || isButton )
        {
            switch (keyCode)
            {
                case KeyEvent.DOM_VK_LEFT:
                case KeyEvent.DOM_VK_RIGHT:
                case KeyEvent.DOM_VK_UP:
                case KeyEvent.DOM_VK_DOWN:
                    forward = event.keyCode == KeyEvent.DOM_VK_RIGHT || event.keyCode == KeyEvent.DOM_VK_DOWN;
                    if (isTab)
                    {
                        //will only work as long as long as siblings only consist of paneltab elements
                        siblingTab = target[forward ? 'nextSibling' : 'previousSibling'];
                        if (!siblingTab)
                            siblingTab = target.parentNode[forward ? 'firstChild' : 'lastChild'];
                        if (siblingTab)
                        {
                            var panelBar = DOM.getAncestorByClass(target, 'panelBar')
                            setTimeout(FBL.bindFixed(function()
                            {
                                panelBar.selectTab(siblingTab);
                                this.focus(siblingTab);
                            }, this));
                        }
                   }
                   else if (isButton)
                   {
                       if (target.id=="fbFirebugMenu" && !forward)
                       {
                            Events.cancelEvent(event);
                            return;
                       }
                       toolbar = DOM.getAncestorByClass(target, 'innerToolbar');
                       if (toolbar)
                       {
                           var doc = target.ownerDocument;
                           //temporarily make all buttons in the toolbar part of the tab order,
                           //to allow smooth, native focus advancement
                           CSS.setClass(toolbar, 'hasTabOrder');
                           setTimeout(FBL.bindFixed(function() // time out needed to fix this behavior in 3.6
                           {
                               doc.commandDispatcher[forward ? 'advanceFocus' : 'rewindFocus']();
                               //remove the buttons from the tab order again, so that it will remain uncluttered
                               //Very ugly hack, but it works well. This prevents focus to 'spill out' of a
                               //toolbar when using the left and right arrow keys
                               if (!DOM.isAncestor(doc.commandDispatcher.focusedElement, toolbar))
                               {
                                   //we moved focus to somewhere out of the toolbar: not good. Move it back to where it was.
                                   doc.commandDispatcher[!forward ? 'advanceFocus' : 'rewindFocus']();
                               }
                               CSS.removeClass(toolbar, 'hasTabOrder');
                           }, this));

                       }
                        Events.cancelEvent(event);
                        return;
                   }
                break;
                case KeyEvent.DOM_VK_RETURN:
                case KeyEvent.DOM_VK_SPACE:
                    if (isTab && target.tabMenu)
                        target.tabMenu.popup.showPopup(target.tabMenu, -1, -1, "popup", "bottomleft", "topleft");
                    else if (isButton)
                    {
                        if (isDropDownMenu)
                        {
                            if (target.id == "fbLocationList")
                                target.showPopup();
                            else
                                target.open = true;
                            Events.cancelEvent(event);
                            return false;
                        }
                    }
                break;
                case KeyEvent.DOM_VK_F4:
                    if (isTab && target.tabMenu)
                        target.tabMenu.popup.showPopup(target.tabMenu, -1, -1, "popup", "bottomleft", "topleft");
                break;
            }
        }
    },

    handleTabBarFocus: function(event)
    {
        this.tabFocused = true;
    },

    handleTabBarBlur: function(event)
    {
        this.tabFocused = false;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    // Panel Focus & Tab Order Management

    getPanelTabStop : function(panel)
    {
        var panelA11y = this.getPanelA11y(panel);
        if (panelA11y)
            return panelA11y.tabStop;
        if (FBTrace.DBG_ERRORS)
            FBTrace.sysout("a11y.getPanelTabStop null panel.context");
        return null;
    },

    ensurePanelTabStops: function()
    {
        if (!Firebug.currentContext || !Firebug.currentContext.chrome) // XXXjjb: seems like this shoudl be !Firebug.chrome
            return;
        var panel = Firebug.chrome.getSelectedPanel();
        var sidePanel = Firebug.chrome.getSelectedSidePanel();
        this.ensurePanelTabStop(panel);
        if (sidePanel)
            this.ensurePanelTabStop(sidePanel);
    },

    ensurePanelTabStop: function(panel)
    {
        var panelA11y = this.getPanelA11y(panel);
        if (!panelA11y)
            return;
        if (panelA11y.manageFocus)
        {
            var tabStop = this.getPanelTabStop(panel);
            if (!tabStop || !this.isVisibleByStyle(tabStop) || !XML.isVisible(tabStop))
            {
                this.tabStop = null;
                this.findPanelTabStop(panel, 'focusRow', panelA11y.lastIsDefault);
            }
            else if (tabStop.getAttribute('tabindex') !== "0")
                tabStop.setAttribute('tabindex', "0");
        if (tabStop)
            this.checkModifiedState(panel, tabStop, true);
        }
    },

    checkModifiedState : function(panel, elem, makeTab)
    {
        var panelA11y = this.getPanelA11y(panel);
        if (!panelA11y || !elem)
            return;
        switch (panelA11y.type)
        {
            case  'console' :
                if (CSS.hasClass(elem, 'focusRow'))
                    this.modifyPanelRow(panel, elem, makeTab);
                break;
        }
    },

    setPanelTabStop : function (panel, elem)
    {
        var panelA11y = this.getPanelA11y(panel);
        if (!panelA11y)
            return;
        var tabStop = this.getPanelTabStop(panel)
        if (tabStop)
        {
            this.makeFocusable(tabStop, false);
            if (["treeitem", "listitem", "option"].indexOf(tabStop.getAttribute("role")) != -1)
                tabStop.setAttribute("aria-selected", "false");
        }
        panelA11y.tabStop = elem;
        if (elem)
        {
            panelA11y.reFocusId = null;
            this.makeFocusable(elem, true);
            if (["treeitem", "listitem", "option"].indexOf(elem.getAttribute("role")) != -1)
                elem.setAttribute("aria-selected", "true");
        }
    },

    findPanelTabStop : function(panel, className, last)
    {
        var candidates = panel.panelNode.getElementsByClassName(className);
        candidates= Array.filter(candidates, function(e,i,a){return this.isVisibleByStyle(e) && XML.isVisible(e);}, this);
        if (candidates.length > 0)
        {
            var chosenRow = candidates[last ? candidates.length -1 : 0];
            this.modifyPanelRow(panel, chosenRow, true)
            this.setPanelTabStop(panel, chosenRow);
        }
        else
            this.setPanelTabStop(panel, null);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    // Console Panel

    onLogRowCreated : function(panel, row)
    {
        var panelA11y = this.getPanelA11y(panel);
        if (!panelA11y)
            return;
        if (CSS.hasClass(row, 'logRow-dir'))
        {
            row.setAttribute('role', 'listitem');
            CSS.setClass(row, 'outerFocusRow');
            var memberRows = row.getElementsByClassName('memberRow');
            if (memberRows.length > 0)
                this.onMemberRowsAdded(panel, memberRows);
        }
        else if (CSS.hasClass(row, 'logRow-group') || CSS.hasClass(row, 'logRow-profile'))
        {
            row.setAttribute('role', 'presentation');
            var focusRow = row.getElementsByClassName('logGroupLabel').item(0);
            if (focusRow)
            {
                this.setPanelTabStop(panel, focusRow);
                focusRow.setAttribute('aria-expanded', CSS.hasClass(row, 'opened') + "");
                if (!CSS.hasClass(row, 'logRow-profile'))
                    this.insertHiddenText(panel, focusRow, 'group label: ');
            }
        }
        else if (CSS.hasClass(row, 'logRow-errorMessage') || CSS.hasClass(row, 'logRow-warningMessage'))
        {
            CSS.setClass(row, 'outerFocusRow');
            row.setAttribute('role', 'presentation');
            var focusRow = row.getElementsByClassName('errorTitle').item(0);
            if (focusRow)
            {
                this.setPanelTabStop(panel, focusRow);
                focusRow.setAttribute('aria-expanded', CSS.hasClass(focusRow.parentNode, 'opened') + "");
            }
        }
        else if (CSS.hasClass(row, 'logRow-stackTrace'))
        {
            CSS.setClass(row, 'outerFocusRow');
            row.setAttribute('role', 'listitem');
            var stackFrames = row.getElementsByClassName('focusRow');
            Array.forEach(stackFrames, function(e,i,a){
                e.setAttribute('role', 'listitem');
                if ((panelA11y.lastIsDefault && i === stackFrames.length - 1) || (!panelA11y.lastIsDefault && i === 0))
                    this.setPanelTabStop(panel, e);
                else
                    this.makeFocusable(e, false);
                }, this);
        }
        else if (CSS.hasClass(row, 'logRow-spy'))
        {
            var focusRow = DOM.getChildByClass(row, 'spyHeadTable');
            if (focusRow)
                this.makeFocusable(focusRow, true);
        }
        else
        {
            row.setAttribute('role', 'listitem');
            CSS.setClass(row, 'focusRow');
            CSS.setClass(row, 'outerFocusRow');
            if (XML.isVisible(row))
                this.setPanelTabStop(panel, row);
        }
    },

    modifyLogRow :function(panel, row, inTabOrder)
    {
        this.makeFocusable(row, inTabOrder);
        var logRowType = this.getLogRowType(row);
        if (logRowType)
            this.insertHiddenText(panel, row, logRowType + ": ");
        var arrayNode = DOM.getChildByClass(row, 'objectBox-array');
        if (arrayNode)
        {
            arrayNode.setAttribute('role', 'group');
            this.insertHiddenText(panel, row, "array" + ": ");
        }
        var focusObjects = this.getFocusObjects(row );
        Array.forEach(focusObjects, function(e,i,a){
            this.makeFocusable(e);
            var prepend = "";
            var append = " (" + this.getObjectType(e) + ") ";
            if (e.textContent != "")
                e.setAttribute('aria-label', prepend + e.textContent + append);
            if (arrayNode)
                e.setAttribute('role', 'listitem');
            }, this);
    },

    onNavigablePanelKeyPress : function(event)
    {
        var target = event.target;
        var keyCode = event.keyCode || (event.type=='keypress' ? event.charCode : null);
        if (!this.isTabWorthy(target) && !this.isFocusNoTabObject(target))
            return;
        else if (event.shiftKey || event.altKey)
            return;
        else if ([13, 32, 33, 34, 35, 36, 37, 38, 39, 40, 46].indexOf(keyCode) == -1)
            return;//not interested in any other keys, than arrows, pg, home/end, del space & enter
        var panel = Firebug.getElementPanel(target)
        var panelA11y = this.getPanelA11y(panel);
        if (!panelA11y)
            return;
        var newTarget = target
        if (!this.isOuterFocusRow(target))
        {
            if (event.ctrlKey)
            {
                newTarget = this.getAncestorRow(target);
                if (newTarget)
                    newTarget = [33, 38].indexOf(keyCode) == -1 ? this.getLastFocusChild(newTarget) : this.getFirstFocusChild(newTarget)
            }
            else if (!this.isDirCell(target) || CSS.hasClass(target, 'netInfoTab') || CSS.hasClass(target, 'netCol'))
                newTarget = this.getAncestorRow(target, true);
            if (!newTarget)
                newTarget = target;
        }
        switch (keyCode)
        {
            case 38://up
            case 40://down
            if (!this.isFocusNoTabObject(target))
            {
                this.focusSiblingRow(panel, newTarget, keyCode == 38);
                Events.cancelEvent(event);
            }
                break;
            case 37://left
            case 39://right
            var goLeft = keyCode == 37;
            if (this.isDirCell(target))
            {
                var row = DOM.getAncestorByClass(target, 'memberRow');
                var toggleElem = DOM.getChildByClass(row.cells[1], "memberLabel")
                if (!goLeft && CSS.hasClass(row, 'hasChildren'))
                {
                    if (CSS.hasClass(row, 'opened'))
                        this.focusSiblingRow(panel, target , false);
                    else if (toggleElem)
                    {
                        if (CSS.hasClass(row, 'hasChildren'))
                            target.setAttribute('aria-expanded', 'true');
                        this.dispatchMouseEvent(toggleElem, 'click');
                    }
                }
                else if (goLeft)
                {
                    var level = parseInt(row.getAttribute("level"));
                    if (CSS.hasClass(row, 'opened'))
                    {
                        if (CSS.hasClass(row, 'hasChildren'))
                            target.setAttribute('aria-expanded', 'false');
                        this.dispatchMouseEvent(toggleElem, 'click');
                    }
                    else if (level > 0)
                    {
                        var targetLevel = (level - 1) + "";
                        var newRows = Array.filter(row.parentNode.rows, function(e,i,a){
                            return e.rowIndex < row.rowIndex && e.getAttribute('level') == targetLevel;
                            }, this);
                        if (newRows.length)
                            this.focus(newRows[newRows.length -1].cells[2].firstChild);
                    }
                }
                Events.cancelEvent(event);
            }
            else if (this.isOuterFocusRow(target, true))
            {
                if (target.hasAttribute('aria-expanded'))
                {
                    if (target.getAttribute('role') == 'row' || CSS.hasClass(target, 'spyHeadTable'))
                    {
                        if (goLeft && target.getAttribute('aria-expanded') == "true")
                        {
                            var toggleElem = CSS.hasClass(target, 'spyHeadTable') ? target.getElementsByClassName('spyTitleCol').item(0) : target;
                            if (toggleElem)
                                this.dispatchMouseEvent(toggleElem, 'click');
                        }
                    }
                    else if (target.getAttribute('aria-expanded') == (goLeft ? "true" : "false"))
                        this.dispatchMouseEvent(target, CSS.hasClass(target, 'logGroupLabel') ? 'mousedown' : 'click');
                }
                if (goLeft)
                {
                    //check if we're in an expanded section
                    var inExpanded = false, groupClass, groupLabelClass, group, groupLabel;
                    if (CSS.hasClass(target, 'objectBox-stackFrame'))
                    {
                        inExpanded = true;
                        groupClass = "errorTrace";
                        groupLabelClass = "errorTitle";
                    }
                    else if (DOM.getAncestorByClass(target, 'logGroupBody'))
                    {
                        inExpanded = true;
                        groupClass = "logGroupBody";
                        groupLabelClass = "logGroupLabel";
                    }
                    if (inExpanded)
                    {
                        group = DOM.getAncestorByClass(target, groupClass);
                        if (group)
                        {
                            groupLabel = this.getPreviousByClass(target, groupLabelClass, false, panel.panelNode);
                            if (groupLabel)
                            {
                                this.modifyPanelRow(panel, groupLabel);
                                this.focus(groupLabel);
                            }
                        }
                    }
                }
                else if (!goLeft)
                {

                    var focusItems = this.getFocusObjects(target);
                    if (focusItems.length > 0)
                        this.focus(event.ctrlKey ? focusItems[focusItems.length -1] : focusItems[0]);
                }
            }
            else if (this.isFocusObject(target))
            {
                var parentRow = this.getAncestorRow(target, true);
                var focusObjects = this.getFocusObjects(parentRow);
                if (!event.ctrlKey)
                {
                    var focusIndex = Array.indexOf(focusObjects, target);
                    var newIndex = goLeft ? --focusIndex : ++focusIndex;
                    if (goLeft && newIndex < 0)
                        this.focus( parentRow);
                    else
                        this.focus(focusObjects[newIndex]);
                }
                else
                    this.focus(goLeft ? parentRow : focusObjects[focusObjects.length -1]);
                Events.cancelEvent(event);
            }
            break;
        case 35://end
        case 36://home
            this.focusEdgeRow(panel, newTarget, keyCode == 36);
            Events.cancelEvent(event);
            break;
        case 33://pgup
        case 34://pgdn
            this.focusPageSiblingRow(panel, newTarget, keyCode == 33);
            Events.cancelEvent(event);
            break;
        case 13://enter
            if (this.isFocusObject(target))
            {
                this.dispatchMouseEvent(target, 'click');
            }
            else if(CSS.hasClass(target, 'watchEditBox'))
            {
                this.dispatchMouseEvent(target, 'mousedown');
                Events.cancelEvent(event);
            }
            else if (CSS.hasClass(target, 'breakpointRow'))
            {
                var sourceLink = target.getElementsByClassName("objectLink-sourceLink").item(0);
                if (sourceLink)
                    this.dispatchMouseEvent(sourceLink, 'click');
            }
            else if (target.hasAttribute('aria-expanded') && (target.getAttribute('role') == 'row' || target.getAttribute('role') == 'listitem'))
            {
                var toggleElem = CSS.hasClass(target, 'spyHeadTable') ? target.getElementsByClassName('spyTitleCol').item(0) : target;
                if (toggleElem)
                    this.dispatchMouseEvent(toggleElem, 'click');
            }
            break;
        case 32://space
        if (this.isFocusObject(target) && target.hasAttribute('role', 'checkbox'))
        {
            this.dispatchMouseEvent(target, 'click');
            var objectBox = DOM.getAncestorByClass(target, 'hasBreakSwitch');
            if (objectBox)
                target.setAttribute('aria-checked', CSS.hasClass(objectBox, 'breakForError') + "");
        }
        else if (CSS.hasClass(target, 'breakpointRow'))
        {
            var checkbox = target.getElementsByClassName('breakpointCheckbox').item(0);
            if (checkbox)
            {
                target.setAttribute('aria-checked', checkbox.checked ? "false" : "true");
                this.dispatchMouseEvent(checkbox, 'click');
            }
        }
        break;
        case 46://del
            if (CSS.hasClass(target, 'breakpointRow'))
            {
                var closeBtn = target.getElementsByClassName('closeButton').item(0);
                if (closeBtn)
                {
                    var prevBreakpoint = DOM.getPreviousByClass(target, 'breakpointRow');
                    if (prevBreakpoint)
                        this.makeFocusable(prevBreakpoint, true);
                    Firebug.chrome.window.document.commandDispatcher.rewindFocus();
                    this.dispatchMouseEvent(closeBtn, 'click');
                }
            }
            break;
        }
    },

    focusPanelRow : function(panel, row)
    {
        var panelA11y = this.getPanelA11y(panel);
        if (!panelA11y || !row)
            return;
        this.modifyPanelRow(panel, row, false);
        if (panelA11y.cellIndex !== undefined && row.cells && row.cells[panelA11y.cellIndex]) //allows up / down navigation in columns, if columns are used in this panel
        {
            var cell = row.cells[panelA11y.cellIndex];
            if (!CSS.hasClass(cell, "a11yFocus"))
                cell = DOM.getChildByClass(cell, 'a11yFocus');
            this.focus(cell);
        }
        else if (CSS.hasClass(row, 'netInfoTabs')) // for Net Panel. Focus selected tab rather than the tablist
        {
            var tabs = row.getElementsByClassName('netInfoTab');
            tabs = Array.filter(tabs, function(e,i,a){return e.hasAttribute('selected');})
            this.focus(tabs.length > 0 ? tabs[0] : row);
        }
        else
            this.focus(row);
    },

    getRowIndex : function(rows, target)
    {
        return Array.indexOf(rows, target);
    },

    getAncestorRow : function(elem, useSubRow)
    {
        return DOM.getAncestorByClass(elem, useSubRow ? 'focusRow' : 'outerFocusRow');
    },

    onConsoleMouseDown : function(event)
    {
        var node = DOM.getAncestorByClass(event.target, 'focusRow');
        if (node)
            this.modifyPanelRow(Firebug.getElementPanel(node), node, false);
        else
        {
            node = DOM.getAncestorByClass(event.target, 'memberRow');
            if (!node)
                return;
            var focusRow = node.getElementsByClassName('focusRow').item(0);
            if (!focusRow)
                return;
            this.focusPanelRow(Firebug.getElementPanel(focusRow), focusRow);
            node = DOM.getAncestorByClass(event.target, 'memberLabel')
            if (!(node && CSS.hasClass(node, 'hasChildren')))
                Events.cancelEvent(event);
        }
    },

    getValidRow : function(rows, index)
    {
        var min = 0; var max = rows.length -1;
        if (index < min || index > max)
            index = index < min ? 0 : max;
        return rows[index];
    },

    getFocusObjects : function(container)
    {
        var nodes = container.getElementsByClassName("a11yFocus")
        return Array.filter(nodes, this.isVisibleByStyle, this);
    },

    modifyConsoleRow : function(panel, row, inTabOrder)
    {
        if (this.isDirCell(row))
            this.modifyMemberRow(panel, row, inTabOrder);
        else if (this.isProfileRow(row))
            this.modifyProfileRow(panel, row, inTabOrder);
        else if (this.isOuterFocusRow(row, true))
        {
            if (CSS.hasClass(row, 'spyHeadTable') || CSS.hasClass(row, 'netInfoTabs'))
                this.modifyNetRow(panel, row, row.getAttribute('tabindex')=== '0');
            else
                this.modifyLogRow(panel, row, row.getAttribute('tabindex')=== '0');
        }
        else return;
    },

    modifyProfileRow : function(panel, row, inTabOrder)
    {
        var panelA11y = this.getPanelA11y(panel);
        if (!panelA11y || !row)
            return;
            this.makeFocusable(row, inTabOrder);
            var focusObjects = this.getFocusObjects(row);
            Array.forEach(focusObjects, function(e,i,a) {
                this.makeFocusable(e);
                if (CSS.hasClass(e.parentNode, "profileCell"))
                    e.setAttribute("role", "gridcell");
            }, this);
    },

    onConsoleSearchMatchFound : function(panel, text, matches)
    {
        var panelA11y = this.getPanelA11y(panel);
        if (!panelA11y)
            return;
        var matchFeedback = "";
        if (!matches || matches.length == 0)
            matchFeedback = Locale.$STRF('a11y.updates.no matches found', [text]);
        else
            matchFeedback = Locale.$STRF('a11y.updates.match found in logrows', [text, matches.length]);
        this.updateLiveElem(panel, matchFeedback, true); //should not use alert
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    // HTML Panel

    onHTMLKeyPress: function(event)
    {
        var target = event.target;
        var keyCode = event.keyCode || (event.type=='keypress' ? event.charCode : null);
        if ([13, 32, KeyEvent.DOM_VK_F2].indexOf(keyCode) == -1)
            return;
        if (!CSS.hasClass(target, "nodeLabelBox"))
            return;
        var panel = Firebug.getElementPanel(target);
        switch(keyCode)
        {
            case 13:
            case 32:
                var isEnter = keyCode == 13;
                var nodeLabels = null;
                if (isEnter)
                {
                    var nodeLabels = target.getElementsByClassName('nodeName');
                    if (nodeLabels.length > 0)
                    {
                        Firebug.Editor.startEditing(nodeLabels[0]);
                        Events.cancelEvent(event);
                    }
                }
                if (!isEnter || nodeLabels.length == 0)
                {
                    var nodeBox = DOM.getAncestorByClass(target, 'nodeBox');
                    if (nodeBox.repObject && panel.editNewAttribute)
                    {
                        panel.editNewAttribute(nodeBox.repObject)
                        Events.cancelEvent(event);
                    }
                }
                break;
            case KeyEvent.DOM_VK_F2:
                if (CSS.hasClass(target.parentNode.parentNode, 'textNodeBox'))
                {
                    var textNode = DOM.getChildByClass(target, 'nodeText');
                    if (textNode)
                        Firebug.Editor.startEditing(textNode);
                }
                break;
        }
    },

    onHTMLFocus : function(event)
    {
        if (CSS.hasClass(event.target, 'nodeLabelBox'))
        {
            this.dispatchMouseEvent(event.target, 'mouseover');
            var nodeLabel = DOM.getAncestorByClass(event.target, 'nodeLabel');
            if (nodeLabel)
                CSS.setClass(nodeLabel, 'focused');
            event.target.setAttribute("aria-selected", "true");
            Events.cancelEvent(event);
        }
    },

    onHTMLBlur : function(event)
    {
        if (CSS.hasClass(event.target, 'nodeLabelBox'))
        {
            this.dispatchMouseEvent(event.target, 'mouseout');
            var nodeLabel = DOM.getAncestorByClass(event.target, 'nodeLabel');
            if (nodeLabel)
                CSS.removeClass(nodeLabel, 'focused');
            event.target.setAttribute("aria-selected", "false");
            Events.cancelEvent(event);
        }
    },

    onObjectBoxSelected: function(objectBox, forceFocus)
    {
        var panel = Firebug.getElementPanel(objectBox);
        var panelA11y = this.getPanelA11y(panel);
        if (!panelA11y)
            return;
        var label = objectBox.firstChild.getElementsByClassName('nodeLabelBox').item(0);
        if (label) {
            this.makeFocusable(label, true);
            if (this.panelHasFocus(panel) || forceFocus)
                this.focus(label);
        }
    },

    onObjectBoxUnselected: function(objectBox)
    {
        if (!this.isEnabled() ||  !objectBox)
            return;
        var label = objectBox.firstChild.getElementsByClassName('nodeLabelBox').item(0);
        if (label) {
            this.makeUnfocusable(label, true);
        }
    },

    onHTMLSearchMatchFound: function(panel, match)
    {
        var panelA11y = this.getPanelA11y(panel);
        if (!panelA11y)
            return;
        var node = match.node;
        var elem;
        var matchFeedback = "";
        switch (node.nodeType)
        {
            case 1: //element
                elem = node;
                matchFeedback += Locale.$STRF("a11y.updates.match found in element",
                    [match.match[0], elem.nodeName, XPATH.getElementTreeXPath(elem)]);
                break;
            case 2: //attribute
                elem = node.ownerElement;
                matchFeedback += Locale.$STRF("a11y.updates.match found in attribute",
                    [match.match[0], node.nodeName, node.nodeValue, elem.nodeName,
                        XPATH.getElementTreeXPath(elem)]);
                break;

            case 3: //text content
                elem = node.parentNode;
                matchFeedback += Locale.$STRF("a11y.updates.match found in text content", [match.match[0], match.match.input]);
                break;
        }
        this.updateLiveElem(panel, matchFeedback, true); //should not use alert
    },

    onHTMLSearchNoMatchFound: function(panel, text)
    {
        this.updateLiveElem(panel, Locale.$STRF('a11y.updates.no matches found', [text]), true); //should not use alert
    },

    moveToSearchMatch: function()
    {
        if (!this.isEnabled())
            return;
        var panel = Firebug.chrome.getSelectedPanel();
        var panelA11y = this.getPanelA11y(panel);
        if (!panelA11y || !panel.searchable )
            return;
        var popup = Firebug.chrome.$('fbSearchOptionsPopup');
        if (popup)
            popup.hidePopup();
        var type = panel.searchType ? panel.searchType : panelA11y.type;
        switch(type)
        {
            case 'html':
                var match = panel.lastSearch.lastMatch;
                if (!match)
                    return;
                var nodeBox = panel.lastSearch.openToNode(match.node, match.isValue);
                if (!nodeBox)
                    return;
                nodeBox = DOM.getAncestorByClass(nodeBox, 'nodeBox');
                //select call will not trigger focus because focus is outside the HTML panel (i.e. the search field),
                panel.select(nodeBox.repObject, true);
                // Manually force selected node to be focused
                this.onObjectBoxSelected(nodeBox, true);
                break;
            case 'css':
                if (panel.currentSearch && panel.currentSearch.currentNode)
                {
                    var focusRow = DOM.getAncestorByClass(panel.currentSearch.currentNode, 'focusRow');
                    if (focusRow)
                    {
                        this.focusPanelRow(panel, focusRow);
                    }
                }
                break
            case 'script' :
                if (panel.currentSearch && panel.selectedSourceBox)
                {
                    var box = panel.selectedSourceBox;
                    var lineNo = panel.currentSearch.mark;
                    box.a11yCaretLine = lineNo + 1;
                    box.a11yCaretOffset = 0;
                    panel.scrollToLine(box.repObject.href, lineNo, panel.jumpHighlightFactory(lineNo+1, panel.context));
                    var viewport = box.getElementsByClassName('sourceViewport').item(0);
                    if(viewport)
                    {
                        this.focus(viewport);
                        this.insertCaretIntoLine(panel, box);
                    }
                }
                break;
            case 'dom':
                if (panel.currentSearch && panel.currentSearch.currentNode)
                {
                    var focusRow = panel.currentSearch.currentNode.getElementsByClassName('focusRow').item(0);
                    if (focusRow)
                    {
                        this.focusPanelRow(panel, focusRow);
                    }
                }
                break;
            case 'net':
                if (panel.currentSearch && panel.currentSearch.currentNode)
                {
                    var focusRow = DOM.getAncestorByClass(panel.currentSearch.currentNode, 'focusRow');
                    if (focusRow)
                    {
                        this.focusPanelRow(panel, focusRow);
                    }
                }
                break;
        }
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    // CSS Panel

    onCSSKeyPress : function(event)
    {
        var target = event.target;
        var keyCode = event.keyCode || (event.type=='keypress' ? event.charCode : null);
        if (!this.isFocusRow(target))
            return;
        else if (event.altKey)
            return;
        else if ([13, 32, 33, 34, 35, 36, 38,  40].indexOf(keyCode) == -1)
            return;//not interested in any other keys, than arrows, pg, home/end, space & enter
        var panel = Firebug.getElementPanel(target)
        var panelA11y = this.getPanelA11y(panel);
        if (!panelA11y)
            return;
        switch (keyCode)
        {
            case 38://up
            case 40://down
                var goUp = keyCode == 38;
                if (event.ctrlKey)
                {
                    if (event.shiftKey)
                    {
                        var node = this[goUp ? 'getPreviousByClass' : 'getNextByClass'](target, 'cssInheritHeader', panel.panelNode);
                        if (node)
                        {
                            this.focusPanelRow(panel, node);
                        }
                        else if (goUp)
                           this.focusEdgeCSSRow(panel, target, true);
                    }
                    else
                        this.focusSiblingHeadRow(panel, target, goUp);
                }
                else
                    this.focusSiblingCSSRow(panel, target, goUp);
                break;
            case 35://end
            case 36://home
                if (event.ctrlKey)
                    this.focusEdgeHeadRow(panel, target, keyCode == 36);
                else
                    this.focusEdgeCSSRow(panel, target, keyCode == 36);
                break;
            case 33://pgup
            case 34://pgdn
                if (event.ctrlKey)
                    this.focusPageSiblingHeadRow(panel, target, keyCode == 33);
                else
                    this.focusPageSiblingCSSRow(panel, target, keyCode == 33);
                break;
            case 13://enter
                if (CSS.hasClass(target, 'cssProp'))
                {
                    var node = DOM.getChildByClass(target, 'cssPropName');
                    if (node)
                        Firebug.Editor.startEditing(node);
                    Events.cancelEvent(event);
                }
                else if (CSS.hasClass(target, 'cssHead'))
                {
                    var node = DOM.getChildByClass(target, 'cssSelector');
                    if (node && CSS.hasClass(node, 'editable'))
                        Firebug.Editor.startEditing(node);
                    Events.cancelEvent(event);
                }
                else if (CSS.hasClass(target, 'importRule'))
                {
                    var node = DOM.getChildByClass(target, 'objectLink');
                    if (node)
                        this.dispatchMouseEvent(node, 'click');
                }
                break;
            case 32://space
                if (CSS.hasClass(target, 'cssProp'))
                {
                    //our focus is about to be wiped out, we'll try to get it back after
                    panelA11y.reFocusId = XPATH.getElementXPath(target);
                    panel.disablePropertyRow(target);
                    if (panel.name == "stylesheet")
                        target.setAttribute('aria-checked', !CSS.hasClass(target, 'disabledStyle'));
                    Events.cancelEvent(event);
                }
                break;
        }
        if (!event.shiftKey)
            event.preventDefault();
    },

    onCSSMouseDown : function(event)
    {
        var row = DOM.getAncestorByClass(event.target, 'focusRow');
        if (row)
            this.modifyPanelRow(Firebug.getElementPanel(row), row, false);
    },

    focusSiblingCSSRow : function(panel, target, goUp)
    {
        var newRow = this[goUp ? 'getPreviousByClass' : 'getNextByClass'](target, 'focusRow', panel.panelNode)
        if (!newRow)
            return;
        this.focusPanelRow(panel, newRow, false);
    },

    focusPageSiblingCSSRow : function(panel, target, goUp)
    {
        var rows = this.getFocusRows(panel);
        var index = this.getRowIndex(rows, target);
        var newRow = this.getValidRow(rows, goUp ? index - 10 : index + 10);
        this.focusPanelRow(panel, newRow, false);
    },

    focusEdgeCSSRow : function(panel, target, goUp)
    {
        var rows = this.getFocusRows(panel);
        var newRow = this.getValidRow(rows, goUp ? 0 : rows.length -1);
        this.focusPanelRow(panel, newRow, false);
    },

    getHeadRowsAndIndex: function(panel, elem)
    {
        var rows = this.getFocusRows(panel);
        var headRow = CSS.hasClass(elem, 'cssHead') ? elem : DOM.getPreviousByClass(elem, 'cssHead');
        var headRows = Array.filter(rows, function(e,i,a){return CSS.hasClass(e, 'cssHead')});
        var index = Array.indexOf(headRows, headRow);
        if (index == -1)
            index = 0;
        return [headRows, index]
    },

    focusSiblingHeadRow : function(panel, elem, goUp)
    {
        var rowInfo = this.getHeadRowsAndIndex(panel, elem);
        var newRow = this.getValidRow(rowInfo[0], goUp ? rowInfo[1] - 1 : rowInfo[1] + 1);
        this.focusPanelRow(panel, newRow, false);
    },

    focusPageSiblingHeadRow : function(panel, elem, goUp)
    {
        var rowInfo = this.getHeadRowsAndIndex(panel, elem);
        var newRow = this.getValidRow(rowInfo[0], goUp ? rowInfo[1] - 10 : rowInfo[1] + 10);
        this.focusPanelRow(panel, newRow, false);
    },

    focusEdgeHeadRow : function(panel, elem, goUp)
    {
        var rowInfo = this.getHeadRowsAndIndex(panel, elem);
        var newRow = this.getValidRow(rowInfo[0], goUp ? 0 : rowInfo[0].length - 1);
        this.focusPanelRow(panel, newRow, false);
    },

    onBeforeCSSRulesAdded : function(panel)
    {
        // Panel content is about to be recreated, possibly wiping out focus.
        // Use the focused element's xpath to remember which rule had focus so that it can be refocused when the panel content is drawn again
        var panelA11y = this.getPanelA11y(panel);
        if (!panelA11y || !this.panelHasFocus(panel))
            return;
        if (panelA11y.tabStop && CSS.hasClass(panelA11y.tabStop, 'focusRow'))
            panelA11y.reFocusId = XPATH.getElementXPath(panelA11y.tabStop);
    },

    onCSSRulesAdded : function(panel, rootNode)
    {
        var panelA11y = this.getPanelA11y(panel);
        if (!panelA11y)
            return;
        var row;
        if (panelA11y.reFocusId)
        {   //we need to put focus back to where it was before it was wiped out
            var reFocusRows = XPATH.getElementsByXPath(rootNode.ownerDocument, panelA11y.reFocusId);
            panelA11y.reFocusId = null;
            if (reFocusRows.length > 0)
            {
                row = reFocusRows[0];
                this.modifyPanelRow(panel, row, true);
                this.focus(row, true);
                this.setPanelTabStop(panel, row);
                return;
            }
        }
        //no refocus needed, just make first rule the panel's tab stop
        row = rootNode.getElementsByClassName('focusRow').item(0);
        this.modifyPanelRow(panel, row, true);
        return;
    },
    //applies a11y changes (keyboard and screen reader related) to an individual row
    //To improve performance, this only happens when absolutely necessary, e.g. when the user navigates to the row in question

    modifyCSSRow : function(panel, row, inTabOrder)
    {
        if (!panel || !row)
            return;
        var rule = DOM.getAncestorByClass(row, "cssRule");
        if (inTabOrder)
            this.setPanelTabStop(panel, row);
        else
            this.makeFocusable(row);
        if (rule && !CSS.hasClass(rule, 'a11yModified'))
        {
            var listBox = rule.getElementsByClassName('cssPropertyListBox').item(0);
            var selector = rule.getElementsByClassName('cssSelector').item(0);
            if (listBox && selector)
                listBox.setAttribute('aria-label', Locale.$STRF("a11y.labels.declarations for selector", [selector.textContent]));
            CSS.setClass(rule, 'a11yModified')
        }
        if (CSS.hasClass(row, 'cssHead'))
        {
            if (panel.name == "css")
            {
                var sourceLink = rule.parentNode.lastChild;
                if (sourceLink && CSS.hasClass(sourceLink, "objectLink"))
                    row.setAttribute('aria-label', row.textContent + " " + Locale.$STRF('a11y.labels.defined in file', [sourceLink.textContent]));
            }
        }
        else if (CSS.hasClass(row, 'cssProp'))
        {
            row.setAttribute('aria-checked', !CSS.hasClass(row, 'disabledStyle'));
            if (CSS.hasClass(row, 'cssOverridden'))
                row.setAttribute('aria-label', Locale.$STR('aria.labels.overridden') + " " + row.textContent);
        }
        return;
    },

    onCSSPanelContextMenu : function(event)
    {
        var panelA11y = this.getPanelA11y(panel);
        if (!panelA11y)
            return;
        if (event.button == 0) //the event was created by keyboard, not right mouse click
        {
            var panel = Firebug.getElementPanel(event.target);
            if (panel && CSS.hasClass(event.target, 'focusRow'))
            {
                var node = event.target;
                if (panel.name == "css")
                {
                    if (CSS.hasClass(event.target, 'cssHead'))
                        node = event.target.parentNode.getElementsByClassName('objectLink').item(0);
                    else if (CSS.hasClass(event.target, 'cssInheritHeader'))
                        node = event.target.getElementsByClassName('objectLink').item(0);
                    if (!node || CSS.hasClass(node, 'collapsed'))
                        node = event.target;
                }
                //these context menu options are likely to destroy current focus
                panelA11y.reFocusId = XPATH.getElementXPath(event.target);
                document.popupNode = node;
                Firebug.chrome.$('fbContextMenu').openPopup(node, 'overlap', 0,0,true);
                Events.cancelEvent(event); //no need for default handlers anymore
            }
        }
    },

    onCSSSearchMatchFound : function(panel, text, matchRow)
    {
        var panelA11y = this.getPanelA11y(panel);
        if (!panelA11y || !text)
            return;
        if (!matchRow)
        {
            this.updateLiveElem(panel, Locale.$STRF('a11y.updates.no matches found', [text]), true); //should not use alert
            return;
        }
        var matchFeedback = "";
        var matchType = '';
        var selector;
        if (CSS.hasClass(matchRow, 'cssSelector'))
            matchFeedback = " " + Locale.$STRF('a11y.updates.match found in selector', [text, matchRow.textContent]);
        else
        {
            selector = DOM.getPreviousByClass(matchRow, 'cssSelector');
            selector = selector ? selector.textContent : "";
            if (CSS.hasClass(matchRow, 'cssPropName') || CSS.hasClass(matchRow, 'cssPropValue'))
            {
                var propRow = DOM.getAncestorByClass(matchRow, 'cssProp');
                if (propRow)
                    matchFeedback = Locale.$STRF('a11y.updates.match found in style declaration', [text, propRow.textContent, selector]);
            }
        }
        this.updateLiveElem(panel, matchFeedback, true); // should not use alert
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    // Layout Panel

    onLayoutBoxCreated : function(panel, node, detailsObj)
    {
        var panelA11y = this.getPanelA11y(panel);
        if (!panelA11y)
            return;
        var focusGroups = node.getElementsByClassName('focusGroup');
        Array.forEach(focusGroups, function(e,i,a){
            if (CSS.hasClass(e, 'positionLayoutBox'))
                this.makeFocusable(e, true);
            else
                this.makeFocusable(e, false);
            e.setAttribute('role', 'group');
            e.setAttribute('aria-label', this.getLayoutBoxLabel(e, detailsObj));
            e.setAttribute('aria-setsize', a.length);
            e.setAttribute('aria-posinset', i + 1);
        }, this);
    },

    getLayoutBoxLabel : function(elem, detailsObj )
    {
        var className = elem.className.match(/\b(\w+)LayoutBox\b/);
        if (!className)
            return "";
        var styleName = className[1];
        var output = "";
        switch(styleName)
        {
            case "position":
                output += CSS.hasClass(elem, "blankEdge") ? '' : Locale.$STR("a11y.layout.position");
                styleName = "outer";
                break;
            case "margin":
                output += Locale.$STR("a11y.layout.margin");
                break;
            case "border":
                output += Locale.$STR("a11y.layout.border");
                break;
            case "padding":
                output += Locale.$STR("a11y.layout.padding");
                break;
            case "content":
                output += Locale.$STR("a11y.layout.size");
                break;
        }
        output += ": ";
        var valNames = [];
        var vals = {};
        switch (styleName)
        {
            case "outer":
                valNames = ['top', 'left', "position", "z-index"];
                vals.top = detailsObj[styleName + 'Top'];
                vals.left = detailsObj[styleName + 'Left'];
                vals.position = detailsObj.position;
                vals["z-index"] = detailsObj.zIndex;
                break;
            case "content":
                valNames = ['width', 'height']
                vals.width = detailsObj['width'];
                vals.height = detailsObj['height'];
                break;
            default:
                valNames = ['top', 'right', 'bottom', 'left'];
                vals.top = detailsObj[styleName + 'Top'];
                vals.right = detailsObj[styleName + 'Right'];
                vals.bottom = detailsObj[styleName + 'Bottom'];
                vals.left = detailsObj[styleName + 'Left'];
                break;
        }

        for (var i = 0 ; i < valNames.length; i++)
        {
            output += Locale.$STR("a11y.layout." + valNames[i]) + " = " + vals[valNames[i]];
            output += i == valNames.length -1 ? "" : ", ";
        }
        return output;
    },

    onLayoutKeyPress : function(event)
    {
        var target = event.target;
        var keyCode = event.keyCode || (event.type=='keypress' ? event.charCode : null);
        if ([13, 37, 38, 39, 40].indexOf(keyCode) == -1)
            return;
        if (!CSS.hasClass(target, 'focusGroup'))
            return;
        var panel = Firebug.getElementPanel(target);
        switch(keyCode)
        {
            case 37:
            case 38:
            case 39:
            case 40:
                var node, goLeft = keyCode == 37 || keyCode == 38;
                if (goLeft)
                    node = DOM.getAncestorByClass(target.parentNode, 'focusGroup');
                else
                    node = DOM.getChildByClass(target, 'focusGroup');
                if (node)
                    this.focus(node);
                break;
            case 13:
                var editable = target.getElementsByClassName('editable').item(0);
                if (editable)
                    Firebug.Editor.startEditing(editable);
                Events.cancelEvent(event);
                break;
        }
    },

    onLayoutFocus : function(event)
    {
        if (CSS.hasClass(event.target, 'focusGroup'))
        {
            this.dispatchMouseEvent(event.target, 'mouseover');
            this.setPanelTabStop(Firebug.getElementPanel(event.target), event.target);
        }
    },

    onLayoutBlur : function(event)
    {
        if (CSS.hasClass(event.target, 'focusGroup'))
            this.dispatchMouseEvent(event.target, 'mouseout');
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    // Inline Editing
    onInlineEditorShow : function(panel, editor)
    {
        var panelA11y = this.getPanelA11y(panel);
        if (!panelA11y)
            return;
        //recreate the input element rather than reusing the old one, otherwise AT won't pick it up
        editor.input.onkeypress = editor.input.oninput = editor.input.onoverflow = null;
        editor.inputTag.replace({}, editor.box.childNodes[1].firstChild, editor);
        editor.input = editor.box.childNodes[1].firstChild.firstChild;
    },

    onBeginEditing : function(panel, editor, target, value)
    {
        var panelA11y = this.getPanelA11y(panel);
        if (!panelA11y)
            return;
        switch (panelA11y.type)
        {
            case 'html':
                var tagName= nodeName = null;
                var setSize = posInSet = 0; var setElems;
                var label = Locale.$STR("a11y.labels.inline editor") + ": ";
                if (CSS.hasClass(target, 'nodeName') || CSS.hasClass(target, 'nodeValue'))
                {
                    var isName = CSS.hasClass(target, 'nodeName');
                    setElems = target.parentNode.parentNode.getElementsByClassName(isName ? 'nodeName' : 'nodeValue');
                    setSize = (setElems.length * 2);
                    posInSet = ((Array.indexOf(setElems, target) + 1) * 2) - (isName ? 1 : 0);
                    editor.input.setAttribute('role', 'listitem');
                    editor.input.setAttribute('aria-setsize', setSize);
                    editor.input.setAttribute('aria-posinset', posInSet);
                    nodeTag = DOM.getPreviousByClass(target, 'nodeTag');
                    if (!isName)
                    {
                        nodeName = DOM.getPreviousByClass(target, 'nodeName');
                        label += Locale.$STRF('a11y.labels.value for attribute in element', [nodeName.textContent, nodeTag.textContent]);
                    }
                    else
                        label += Locale.$STRF("a11y.label.attribute for element", [nodeTag.textContent]);
                }
                else if (CSS.hasClass(target, 'nodeText'))
                {
                    nodeTag = DOM.getPreviousByClass(target, 'nodeTag');
                    label += Locale.$STRF("a11y.labels.text contents for element", [nodeTag.textContent]);
                }
                editor.input.setAttribute('aria-label', label);
                break;
            case 'css':
            case 'stylesheet':
                var selector = DOM.getPreviousByClass(target, 'cssSelector');
                selector = selector ? selector.textContent : "";
                var label = Locale.$STR("a11y.labels.inline editor") + ": ";
                if (CSS.hasClass(target, 'cssPropName'))
                    label += Locale.$STRF('a11y.labels.property for selector', [selector]);
                else if (CSS.hasClass(target, 'cssPropValue'))
                {
                    var propName = DOM.getPreviousByClass(target, 'cssPropName');
                    propName = propName ? propName.textContent : "";
                    label += Locale.$STRF('a11y.labels.value property in selector', [propName, selector]);
                }
                else if (CSS.hasClass(target, 'cssSelector'))
                    label += Locale.$STR('a11y.labels.css selector');
                editor.input.setAttribute('aria-label', label);
                editor.setAttribute('aria-autocomplete', 'inline');
                break;
            case 'layout':
                editor.input.setAttribute('aria-label', target.getAttribute('aria-label'));
                break;
            case 'dom':
            case 'domSide':
                if (target.cells && target.cells[1])
                    editor.input.setAttribute('aria-label', target.cells[1].textContent);
                break;
        }
    },

    onInlineEditorClose  : function(panel, target, removeGroup)
    {
        var panelA11y = this.getPanelA11y(panel);
        if (!panelA11y)
            return;
        switch (panelA11y.type)
        {
            case 'layout':
                var box = DOM.getAncestorByClass(target, 'focusGroup')
                if (box)
                    this.focus(box, true);
                break;
            case 'css':
            case 'stylesheet':
                var node = target.parentNode;
                if (removeGroup)
                    node = this.getPreviousByClass(node, 'focusRow', panel.panelNode);
                if (node)
                {
                    this.focusPanelRow(panel, node, true);
                }
                break;
            case 'html':
                var box = DOM.getAncestorByClass(target, 'nodeBox')
                if (box)
                    panel.select(box.repObject, true);
                break;
            case 'watches':
                var node = target.getElementsByClassName('watchEditBox').item(0);
                if (node)
                    this.focus(node, true);
                break;
            case 'script':
                panel.selectedSourceBox.focus();
                break;
        }
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    // Script Panel

    onStartDebugging : function(context)
    {
        if (!context)
            return;
        var panel = context.getPanel('script');
        var panelA11y = this.getPanelA11y(panel);
        if (!panelA11y)
            return;
        var frame = context.stoppedFrame;
        var fileName =  frame.script.fileName.split("/");  // XXXjjb I think this should be contxt.executingSourceFile.href
        fileName = fileName.pop();
        // XXXjjb the frame.functionName is often anonymous, since the compiler is lame.
        var alertString = Locale.$STRF("a11y.updates.script_suspended_on_line_in_file",[frame.line, frame.functionName, fileName]);
        this.updateLiveElem(panel, alertString, true);
        this.onShowSourceLink(panel, frame.line);
    },

    onShowSourceLink : function (panel, lineNo)
    {
        if (!this.isEnabled())
            return;
        var box = panel.selectedSourceBox;
        var viewport = box.getElementsByClassName('sourceViewport').item(0);
        box.a11yCaretLine = lineNo;
        if (viewport && this.panelHasFocus(panel))
        {
            this.focus(viewport);
            this.insertCaretIntoLine(panel, box, lineNo);
        }
    },

    onScriptKeyPress : function(event)
    {
        var target = event.target;
        var keyCode = event.keyCode || (event.type=='keypress' ? event.charCode : null);
        if (!CSS.hasClass(target, 'sourceViewport'))
            return;
      if ([13, 33, 34, 35, 36, 37, 38, 39, 40].indexOf(keyCode) == -1)
         return;
        var panel = Firebug.getElementPanel(target);
        var panelA11y = this.getPanelA11y(panel);
        if (!panelA11y)
            return;
        var box = panel.selectedSourceBox
        var lastLineNo = box.lastViewableLine;
        var firstLineNo = box.firstViewableLine;
        var caretDetails = this.getCaretDetails(event.target.ownerDocument);
        if (!caretDetails || caretDetails.length != 2)
            return;
        var lineNode = DOM.getAncestorByClass(caretDetails[0].parentNode, 'sourceRow');
        if (!lineNode )
            return;
        var lineNo = parseInt(lineNode.getElementsByClassName('sourceLine').item(0).textContent);
        box.a11yCaretLine = lineNo;
        box.a11yCaretOffset = caretDetails[1];
        var newLineNo = 1;
        var linesToScroll = 0;
        var goUp;
        switch(keyCode)
        {
            case 38:
            case 40:
                goUp = keyCode == 38
                linesToScroll = goUp ? -1 : 1;
                if (!event.ctrlKey)
                {
                    if (goUp && (lineNo > (firstLineNo +  1)))
                        return;
                    else if (!goUp && (lineNo < (lastLineNo -  1)))
                        return;
                    box.a11yCaretLine = goUp ? lineNo - 1 : lineNo +1;
                }
                box.scrollTop = box.scrollTop + (linesToScroll * box.lineHeight);
                break;
            case 33://pgup
            case 34://pgdn
                goUp = keyCode == 33;
                if ((goUp && box.scrollTop == 0) || (!goUp && box.scrollTop == box.scrollHeight - box.clientHeight))
                {
                    box.a11yCaretLine = goUp ? 0 : box.totalMax;
                    box.a11yCaretOffset = 0;
                    this.insertCaretIntoLine(panel, box);
                    Events.cancelEvent(event);
                    return;
                }
                box.a11yCaretLine = goUp ? lineNo - box.viewableLines : lineNo + box.viewableLines;
                linesToScroll = goUp ? -box.viewableLines : box.viewableLines;
                box.scrollTop = box.scrollTop + (linesToScroll * box.lineHeight);
                Events.cancelEvent(event);
                break;
            case 36://home
            case 35://end
                goUp = keyCode == 36;
                if (event.ctrlKey)
                {
                    box.a11yCaretLine = goUp ? 0 : box.totalMax;
                    box.a11yCaretOffset = 0;
                    if ((goUp && box.scrollTop == 0) || (!goUp && box.scrollTop == box.scrollHeight - box.clientHeight))
                        this.insertCaretIntoLine(panel, box);
                    else
                        box.scrollTop = goUp ? 0 : box.scrollHeight - box.clientHeight;;
                    Events.cancelEvent(event);
                    return;
                }
                if (goUp)
                {
                    //move caret to beginning of line. Override default behavior, as that would take the caret into the line number
                    this.insertCaretIntoLine(panel, box, lineNo, 0);
                    box.scrollLeft = 0; //in case beginning of line is scrolled out of view
                    Events.cancelEvent(event);
                }
                break;
            case 13:
                var liveString = "";
                var caretDetails = this.getCaretDetails(event.target.ownerDocument);
                var lineNode = DOM.getAncestorByClass(caretDetails[0].parentNode, 'sourceRow');
                var lineNo = parseInt(lineNode.getElementsByClassName('sourceLine').item(0).textContent);
                liveString += "Line " + lineNo;
                if (lineNode.getAttribute('breakpoint') == 'true')
                {
                    var breakpointStr;
                    if (lineNode.getAttribute('disabledbreakpoint') == 'true')
                        breakpointStr = "a11y.updates.hasdisabled breakpoint";
                    if (lineNode.getAttribute('condition') == 'true')
                        breakpointStr = "a11y.updates.has conditional breakpoint";
                    liveString += ", " + Locale.$STR(breakpointStr);
                }
                if (lineNode.getAttribute('executable') == 'true')
                    liveString += ", executable";
                if (lineNode.getAttribute('exe_line') == 'true')
                    liveString += ", currently stopped";
                var sourceText = lineNode.getElementsByClassName('sourceRowText').item(0);
                if (sourceText)
                    liveString += ": " + sourceText.textContent;
                this.updateLiveElem(panel, liveString, true); //should not use alert
                break
        }
    },

    onScriptKeyUp : function(event)
    {
        var target = event.target;
        var keyCode = event.keyCode || (event.type=='keypress' ? event.charCode : null);
        if (!CSS.hasClass(target, 'sourceViewport'))
            return;
        if ([13, 33, 34, 35, 36, 37, 38, 39, 40].indexOf(keyCode) == -1)
            return;
        var panel = Firebug.getElementPanel(target);
        var panelA11y = this.getPanelA11y(panel);
        if (!panelA11y)
            return;
        var box = panel.selectedSourceBox
        var caretDetails = this.getCaretDetails(target.ownerDocument);
        var lineNode = DOM.getAncestorByClass(caretDetails[0].parentNode, 'sourceRow');
        if (!lineNode )
            return;
        var lineNo = parseInt(lineNode.getElementsByClassName('sourceLine').item(0).textContent);
        box.a11yCaretLine = lineNo;
        box.a11yCaretOffset = caretDetails[1];
    },

    onScriptMouseUp : function(event)
    {
        var target = event.target;
        if (event.button !== 0)
            return;
        var panel = Firebug.getElementPanel(target);
        var panelA11y = this.getPanelA11y(panel);
        if (!panelA11y)
            return;
        var box = panel.selectedSourceBox
        var caretDetails = this.getCaretDetails(target.ownerDocument);
        var lineNode = null;
        if (caretDetails[0] && caretDetails[0].parentNode)
            lineNode = DOM.getAncestorByClass(caretDetails[0].parentNode, 'sourceRow');
        if (!lineNode )
            return;
        var lineNo = parseInt(lineNode.getElementsByClassName('sourceLine').item(0).textContent);
        box.a11yCaretLine = lineNo;
        box.a11yCaretOffset = caretDetails[1];
    },

    onBeforeViewportChange : function(panel)
    {
        var panelA11y = this.getPanelA11y(panel);
        if (!panelA11y)
            return;
        var box = panel.selectedSourceBox;
        if (!box)
            return;
        this.insertCaretIntoLine(panel, box);
    },

    insertCaretIntoLine : function(panel, box, lineNo, offset)
    {
        var panelA11y = this.getPanelA11y(panel);
        if (!panelA11y || !box)
            return;
        if (typeof lineNo == "undefined")
            lineNo = box.a11yCaretLine ?  box.a11yCaretLine : 0;
        //to prevent the caret from (partially) being placed just out of sight,
        //adjust the viewable line boundaries by 1 (unless the current line is the first or last line)
        var lineAdjust = lineNo == 0 || lineNo == box.totalMax ? 0 : 1;
        var firstLine = box.firstViewableLine + lineAdjust;
        var lastLine = box.lastViewableLine - lineAdjust;
        if (lineNo < (firstLine) || lineNo > lastLine)
            box.a11yCaretLine = lineNo = lineNo < firstLine ? firstLine : lastLine;
        var node = box.getLineNode(lineNo);
        if (!node)
            return;
        if (typeof offset =="undefined")
        {
            if (box.a11yCaretOffset)
                offset = box.a11yCaretOffset;
            else
                box.a11yCaretOffset = offset = 0;
        }
        var startNode = node.getElementsByClassName('sourceRowText').item(0)
        if (startNode && startNode.firstChild && startNode.firstChild.nodeType == 3)
        {
            startNode = startNode.firstChild;
            if (offset >= startNode.length)
                box.a11yCaretOffset = offset = startNode.length - 1;
        }
        else
        {
            startNode = node; //offset is now the number of nodes, not characters within a text node
            offset = 1;
        }
        this.insertCaretToNode(panel, startNode, offset);
    },

    getCaretDetails : function(doc)
    {
        var sel = doc.defaultView.getSelection();
        return [sel.focusNode, sel.focusOffset];
    },

    onUpdateScriptLocation : function(panel, file)
    {
        var panelA11y = this.getPanelA11y(panel);
        if (!panelA11y)
            return;
        var box = panel.selectedSourceBox
        var viewport = panel.selectedSourceBox.getElementsByClassName('sourceViewport').item(0);
        box.tabIndex = -1;
        viewport.tabIndex = 0;
        viewport.setAttribute('role', 'textbox');
        viewport.setAttribute('aria-multiline', 'true');
        viewport.setAttribute('aria-readonly', 'true');
        fileName = URL.getFileName(file.href);
        viewport.setAttribute('aria-label', Locale.$STRF('a11y.labels.source code for file', [fileName]));
        //bit ugly, but not sure how else I can get the caret into the sourcebox without a mouse
        var focusElem = Firebug.chrome.window.document.commandDispatcher.focusedElement;
        var line = box.getLineNode(box.firstViewableLine);
        if (!line)
            return;
        var node = line.getElementsByClassName("sourceRowText").item(0);
        this.insertCaretToNode(panel, node);
        this.focus(focusElem); // move focus back to where it was
    },

    insertCaretToNode : function(panel, node, startOffset)
    {
        if (!startOffset)
            startOffset = 0;
        var sel = panel.document.defaultView.getSelection();
        sel.removeAllRanges();
        var range = panel.document.createRange();
        range.setStart(node, startOffset);
        range.setEnd(node, startOffset);
        sel.addRange(range);
    },

    onScriptContextMenu : function(event)
    {
        if (event.button == 0 ) //i.e. keyboard, not right mouse click
        {
            //Try to find the line node based on the caret and manually trigger the context menu
            var panel = Firebug.getElementPanel(event.target);
            var panelA11y = this.getPanelA11y(panel);
            if (!panelA11y)
                return;
            var sel = event.target.ownerDocument.defaultView.getSelection();
            var node = sel.focusNode.parentNode;
            var x = event.pageX
            if (x == 0)
            {
                //TODO: This is ugly and way too inaccurate, how to get xy coordinates from selection object?
                var charWidth = panelA11y.oneEmElem ? panelA11y.oneEmElem.clientWidth * 0.65: 7.5;
                x = node.offsetLeft + sel.focusOffset * charWidth;
            }
            var y = event.pageY;
            if (y >= event.target.clientHeight)
            {
               y = node.offsetTop;
            }
            Firebug.chrome.window.document.popupNode = node;
            Firebug.chrome.$('fbContextMenu').openPopup(node.ownerDocument.body, "overlap", x, y, true);
            Events.cancelEvent(event);
        }
    },

    onWatchPanelRefreshed : function(panel)
    {
        var panelA11y = this.getPanelA11y(panel);
        if (!panelA11y)
            return;
        var watchEditTrigger = panel.panelNode.getElementsByClassName('watchEditCell').item(0);
        if (watchEditTrigger)
            this.makeFocusable(watchEditTrigger, true);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    // Call Stack Panel

    onStackCreated : function(panel)
    {
        var panelA11y = this.getPanelA11y(panel);
        if (!panelA11y)
            return;
        var rows = panel.panelNode.getElementsByClassName('focusRow');
        Array.forEach(rows, function(e,i,a){
            if ((panelA11y.lastIsDefault && i === rows.length - 1) || (!panelA11y.lastIsDefault && i === 0))
                this.setPanelTabStop(panel, e);
            else
                this.makeFocusable(e, false);
        }, this);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    // Breakpoints Panel

    onBreakRowsRefreshed : function(panel, rootNode)
    {
        var rows = rootNode.getElementsByClassName('focusRow');
        for ( var i = 0; i < rows.length; i++)
        {
            this.makeFocusable(rows[i], i == 0);
            if (i == 0)
                this.setPanelTabStop(panel, rows[i]);
        }
        var groupHeaders = rootNode.getElementsByClassName('breakpointHeader');
        for ( i = 0; i < groupHeaders.length; i++)
        {
            var listBox = DOM.getNextByClass(groupHeaders[i], 'breakpointsGroupListBox');
            if (listBox)
                listBox.setAttribute('aria-label', groupHeaders[i].textContent);
        }
    },

    onScriptSearchMatchFound : function(panel, text, sourceBox, lineNo)
    {
        var panelA11y = this.getPanelA11y(panel);
        if (!panelA11y || !text)
            return;
        var matchFeedback = "";
        if (!sourceBox || lineNo === null)
            matchFeedback = Locale.$STRF('a11y.updates.no matches found', [text]);
        else
        {
            var line = sourceBox.getLine(panel.context, lineNo + 1);
            if (!line) line = "";
            matchFeedback = Locale.$STRF("a11y.updates.match found for on line", [text, lineNo + 1, URL.getFileName(sourceBox.href)]);
        }
        this.updateLiveElem(panel, matchFeedback, true);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    // Dom Panel

    onMemberRowsAdded: function(panel, rows)
    {
        if (!panel)
            panel = Firebug.getElementPanel(rows[0]);
        var panelA11y = this.getPanelA11y(panel);
        if (!panelA11y || !rows)
            return;
        var setSize;
        var posInset;
        var setSize = rows.length;
        var posInset = 0;
        for (var i = 0; i < rows.length; i++)
        {
            var makeTab = (panelA11y.lastIsDefault && i === rows.length - 1) || (!panelA11y.lastIsDefault && i === 0)
            this.prepareMemberRow(panel, rows[i], makeTab, ++posInset, setSize);
        }
    },

    onMemberRowSliceAdded : function(panel, borderRows, posInSet, setSize)
    {
        if (!borderRows)
            return;
        var startRow = borderRows[0];
        var endRow = borderRows[1];
        if (!panel)
            panel = Firebug.getElementPanel(startRow);
        var panelA11y = this.getPanelA11y(panel);
        if (!panelA11y)
            return;
        var reFocusId = panelA11y.reFocusId;
        var row = startRow;
        do
        {
            this.prepareMemberRow(panel, row, false, posInSet++, setSize, reFocusId)
            if (row === endRow)
                break;
        }
        while (row = row.nextSibling);
    },

    prepareMemberRow : function(panel, row, makeTab, posInSet, setSize, reFocusId)
    {
        var panelA11y = this.getPanelA11y(panel);
        if (!panelA11y|| !row)
            return;
        if (!row.cells[2])
            return;
        var cellChild = row.cells[2].firstChild;
        if (cellChild)
        {
            if (CSS.hasClass(row, 'hasChildren'))
                cellChild.setAttribute('aria-expanded', CSS.hasClass(row, 'opened'));
            if (makeTab)
                this.modifyPanelRow(panel, cellChild, true);
            cellChild.setAttribute('role', 'treeitem');
            cellChild.setAttribute('aria-level', parseInt(row.getAttribute('level')) + 1);
            if (posInSet && setSize)
            {
                cellChild.setAttribute('aria-setsize', setSize);
                cellChild.setAttribute('aria-posinset', posInSet);
            }
            CSS.setClass(cellChild, 'focusRow');
            if (typeof reFocusId == "number" && row.rowIndex == reFocusId)
            {
                this.modifyMemberRow(panel, cellChild, true);
                this.focus(cellChild, true, true);
                panelA11y.reFocusId = null;
            }
        }
    },

    modifyMemberRow : function(panel, row, inTabOrder)
    {
        var type = this.getObjectType(row)
        var labelCell = row.parentNode.previousSibling;
        row.setAttribute('aria-label', labelCell.textContent +
        ": " + " " + row.textContent + (type ? " (" + type + ")" : "" )) ;
        if (inTabOrder)
            this.setPanelTabStop(panel, row);
        else
            this.makeFocusable(row, false);
    },

    onBeforeDomUpdateSelection : function (panel)
    {
        var panelA11y = this.getPanelA11y(panel);
        if (!panelA11y)
            return;
        var focusNode = panel.document.activeElement;
        if (this.isDirCell(focusNode))
            panelA11y.reFocusId = focusNode.parentNode.parentNode.rowIndex;
    },

    onWatchEndEditing : function(panel, row)
    {
        var panelA11y = this.getPanelA11y(panel);
        if (!panelA11y)
            return;
        panelA11y.reFocusId = 2;
    },

    onDomSearchMatchFound : function (panel, text, matchRow)
    {
        var panelA11y = this.getPanelA11y(panel);
        if (!panelA11y || !text)
            return;
        var matchFeedback = "";
        if (matchRow && matchRow.cells)
        {
            var dirCell = matchRow.getElementsByClassName('focusRow').item(0);
            if (dirCell)
            {
                this.modifyPanelRow(panel, dirCell);
                var rowLabel = dirCell.getAttribute('aria-label');
                matchFeedback = Locale.$STRF('a11y.updates.match found in dom property', [text, rowLabel]);
            }
        }
        else
            matchFeedback = Locale.$STRF('a11y.updates.no matches found', [text]);
        this.updateLiveElem(panel, matchFeedback, true);
    },
    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    // Net Panel

    isSubFocusRow : function(elem)
    {
        return CSS.hasClass(elem, 'focusRow') || CSS.hasClass(elem, 'wrappedText');
    },

    modifyNetRow : function(panel, row, inTabOrder)
    {
        var panelA11y = this.getPanelA11y(panel);
        if (!panelA11y || !row)
            return;
        if (this.isOuterFocusRow(row, true))
        {
            if (!CSS.hasClass(row, 'netInfoTabs'))
                this.makeFocusable(row, inTabOrder);
            if ((CSS.hasClass(row, 'netRow') || CSS.hasClass(row, 'spyHeadTable')) && !row.hasAttribute('aria-expanded'))
                row.setAttribute('aria-expanded', CSS.hasClass(row, 'opened') + "");
            var focusObjects = this.getFocusObjects(row);
            Array.forEach(focusObjects, function(e,i,a) {
                this.makeFocusable(e);
                if (CSS.hasClass(e, 'netTimeCol') && DOM.getAncestorByClass(e, 'fromCache'))
                    e.setAttribute('aria-label', e.textContent + " (" + Locale.$STR("a11y.labels.cached") +")");
            }, this);
        }
        else return;
    },

    getNetAncestorRow : function(elem, useSubRow)
    {
        return useSubRow ? DOM.getAncestorByClass(elem, 'subFocusRow') || DOM.getAncestorByClass(elem, 'netRow') : DOM.getAncestorByClass(elem, 'netRow');
    },

    onNetMouseDown : function(event)
    {
        var node = DOM.getAncestorByClass(event.target, 'focusRow');
        if (node)
            this.modifyPanelRow(Firebug.getElementPanel(node), node, false);
        else
        {
            node = DOM.getAncestorByClass(event.target, 'subFocusRow');
            if (!node)
                return;
            var focusRow = node.getElementsByClassName('focusRow').item(0);
            if (!focusRow)
                return;
            this.modifyPanelRow(Firebug.getElementPanel(focusRow), focusRow, false);
            this.focus(focusRow);
        }
    },

    onNetFocus : function(e) {
        var target = e.target;
        var panel = Firebug.getElementPanel(target);
        var panelA11y = this.getPanelA11y(panel);
        if (!panelA11y)
            return;
        if (!CSS.hasClass(target, 'netCol') && !CSS.hasClass(target, 'netHeaderCell'))
        {
            return;
        }
        if (CSS.hasClass(target, 'netHrefCol'))
        {
            var hrefLabel = target.getElementsByClassName('netHrefLabel').item(0);
            var fullHrefLabel = target.getElementsByClassName('netFullHrefLabel').item(0);
            if (hrefLabel && fullHrefLabel)
            {
                CSS.setClass(fullHrefLabel, 'a11yShowFullLabel');
                fullHrefLabel.style.marginTop = (hrefLabel.offsetHeight  + 4) + "px";
            return;
            }
        }
        var rangeParent = DOM.getAncestorByClass(target, 'netRow');
        var browser = Firebug.chrome.getPanelBrowser(panel);
        // these two lines are necessary, because otherwise the infoTip will not have the correct dimensions when it's positioned, and the contents
        // could be placed outside FB's viewport (making it impossible to read for keyboard users)
        panel.showInfoTip(browser.infoTip, target, target.offsetLeft, target.offsetTop, rangeParent, 0); //will be called again in showInfoTip
        browser.infoTip.setAttribute("active", "true");
        var left = CSS.hasClass(target, 'netTimeCol') ? target.offsetLeft - browser.infoTip.offsetWidth - 12 : target.offsetLeft + target.offsetWidth - 4;
        Firebug.InfoTip.showInfoTip(browser.infoTip, panel, target, left, target.offsetTop - panel.panelNode.scrollTop - 12, rangeParent, 0);
    },

    onNetBlur : function(e) {
        var target = e.target;
        var panel = Firebug.getElementPanel(target);
        var panelA11y = this.getPanelA11y(panel);
        if (!panelA11y)
            return;
        if (CSS.hasClass(target, 'netHrefCol'))
        {
            var hrefLabel = target.getElementsByClassName('netHrefLabel').item(0);
            var fullHrefLabel = target.getElementsByClassName('netFullHrefLabel').item(0);
            if (hrefLabel && fullHrefLabel)
            {
                CSS.removeClass(fullHrefLabel, 'a11yShowFullLabel');
                fullHrefLabel.style.marginTop = "0px";
            }
        }
        var browser = Firebug.chrome.getPanelBrowser(panel);
        Firebug.InfoTip.hideInfoTip(browser.infoTip);
    },

    onNetMatchFound : function(panel, text, row)
    {
        //TODO localize for 1.5
        var panelA11y = this.getPanelA11y(panel);
        if (!panelA11y)
            return;
        var matchFeedback = "";
        if (!row)
            matchFeedback = Locale.$STRF('a11y.updates.no matches found', [text]);
        else
        {
            var foundWhere = '';
            var parentRow = DOM.getAncestorByClass(row, "netRow");
            if (!parentRow)
            {
                parentRow = DOM.getAncestorByClass(row, "netInfoRow");
                if (parentRow)
                    parentRow = parentRow.previousSibling;
            }
            if (CSS.hasClass(row, "netHrefLabel"))
                foundWhere = Locale.$STR("net.header.URL");
            else if (CSS.hasClass(row, "netStatusLabel"))
                foundWhere = Locale.$STR("net.header.Status");
            else if (CSS.hasClass(row, "netDomainLabel"))
                foundWhere = Locale.$STR("net.header.Domain");
            else if (CSS.hasClass(row, "netSizeLabel"))
                foundWhere = Locale.$STR("net.header.Size");
            else if (CSS.hasClass(row, "netTimeLabel"))
                foundWhere = Locale.$STR("net.header.Timeline");
            else
                foundWhere = "request details";
            if (parentRow && parentRow.repObject)
            {
                var file = parentRow.repObject;
                var href =  (file.method ? file.method.toUpperCase() : "?") + " " + URL.getFileName(file.href);
                matchFeedback = Locale.$STRF("a11y.updates.match found in net row",[text, href, foundWhere, row.textContent]);
            }
            else if (DOM.getAncestorByClass(row, "netSummaryRow"))
                matchFeedback = Locale.$STRF("a11y.updates.match found in net summary row",[text, row.textContent]);
        }
        this.updateLiveElem(panel, matchFeedback, true); //should not use alert
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    // Panel Navigation

    insertHiddenText : function(panel, elem, text, asLastNode, id)
    {
        var span = panel.document.createElement('span');
        span.className ="offScreen";
        span.textContent = text;
        if (id)
            span.id = id;
        if (asLastNode)
            elem.appendChild(span);
        else
            elem.insertBefore(span, elem.firstChild);
    },

    getLogRowType : function(elem)
    {
        var type = "";
        if (!elem)
            return type;
        var className = elem.className.match(/\logRow-(\w+)\b/);
        if (className)
            type = className[1];
        if (!type)
        {
            if (CSS.hasClass(elem, 'errorTitle'))
                type = "detailed error";
            else if (CSS.hasClass(elem, 'errorSourceBox'))
                type = "error source line";
            else
                type = this.getObjectType(elem);
        }
        if (type == "stackFrame")
            type="";
        return type;
    },

    getObjectType : function(elem)
    {
        var type = "";
        if (elem.nodeName == "img")
            return type;
        var className = elem.className.match(/\bobject(Box|Link)-(\w+)/);
        if (className)
            type = className[2];
        if (type == "null" || type == "undefined")
            type = "";
        else if (type == "number" && (elem.textContent == "true" || elem.textContent == "false"))
            type = "boolean";
        else if ((type == "" || type == "object") && elem.repObject)
        {
            try
            {
                var obj = elem.repObject;
                if (!obj)
                    return type;
                type = typeof obj;
                if (obj instanceof Array)
                    type = "array";
                if (typeof obj.lineNo != "undefined")
                    type = "function call";
            }
            catch(e)
            {}
        }
        return type;
    },

    modifyPanelRow : function (panel, row, inTabOrder)
    {
        if (CSS.hasClass(row, 'a11yModified'))
            return;
        var panelA11y = this.getPanelA11y(panel);
        if (!panelA11y || !row)
            return;
        switch (panelA11y.type)
        {
            case 'console':
                this.modifyConsoleRow(panel,row, inTabOrder);
                break;
            case 'css':
                this.modifyCSSRow(panel, row, inTabOrder);
                break;
            case 'net':
                this.modifyNetRow(panel, row, inTabOrder);
               break;
        }
        CSS.setClass(row, 'a11yModified');
    },

    focusSiblingRow : function(panel, target, goUp)
    {
        var newRow = this[goUp ? 'getPreviousByClass' : 'getNextByClass'](target, 'focusRow', true, panel.panelNode)
        if (!newRow)
            return;
        this.focusPanelRow(panel, newRow)
    },

    focusPageSiblingRow : function(panel, target, goUp)
    {
        var rows = this.getFocusRows(panel);
        var index = this.getRowIndex(rows, target);
        var newRow = this.getValidRow(rows, goUp ? index - 10 : index + 10);
        this.focusPanelRow(panel, newRow);
    },

    focusEdgeRow : function(panel, target, goUp)
    {
        var rows = this.getFocusRows(panel);
        var newRow = this.getValidRow(rows, goUp ? 0 : rows.length -1);
        this.focusPanelRow(panel, newRow);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    // Utils

    onPanelFocus : function(event)
    {
        var panel = Firebug.getElementPanel(event.target);
        var panelA11y = this.getPanelA11y(panel);
        if (!panelA11y)
            return;
        var target = event.target;
        if (this.isTabWorthy(target) && target !== this.getPanelTabStop(panel))
            this.setPanelTabStop(panel, target);
        if (target.getAttribute("role") =="gridcell" || target.getAttribute("role") =="rowheader" || target.getAttribute("role") =="columnheader")
        {
            var cell = target.nodeName.toLowerCase() == "td" || target.nodeName.toLowerCase() == "th" ? target : target.parentNode;
            panelA11y.cellIndex = cell.cellIndex !== undefined ? cell.cellIndex : undefined;
        }
        else
        {
            if (CSS.hasClass(target, 'netInfoTab'))
                this.dispatchMouseEvent(target, 'click');
            panelA11y.cellIndex = undefined; //reset if no longer in grid
        }
    },

    getFocusRows : function(panel)
    {
        var nodes = panel.panelNode.getElementsByClassName('focusRow');
        return Array.filter(nodes, function(e,i,a){return this.isVisibleByStyle(e) && XML.isVisible(e);}, this);
    },

    getLastFocusChild : function(target)
    {
        var focusChildren = target.getElementsByClassName('focusRow');
        return focusChildren.length > 0 ? focusChildren[focusChildren.length -1] : null;
    },

    getFirstFocusChild : function(target)
    {
        var focusChildren = target.getElementsByClassName('focusRow');
        return focusChildren.length > 0 ? focusChildren[0] : null;
    },

    focus : function(elem, noVisiCheck, needsMoreTime)
    {
        if (DOM.isElement(elem) && (noVisiCheck || this.isVisibleByStyle(elem)))
            Firebug.currentContext.setTimeout(function(){
                elem.focus()
                }, needsMoreTime ? 500 :10);
    },

    makeFocusable : function(elem, inTabOrder)
    {
        if (elem)
            elem.setAttribute('tabindex', inTabOrder ? '0' : '-1');
    },

    makeUnfocusable : function(elem)
    {
        if (elem)
            elem.removeAttribute('tabindex');
    },

    reportFocus : function(event)
    {
        FBTrace.sysout('focus: ' + event.target.nodeName + "#" + event.target.id + "." + event.target.className, event.target);
    },

    dispatchMouseEvent : function (node, eventType, clientX, clientY, button)
    {
        if (!clientX)
            clientX = 0;
        if (!clientY)
            clientY = 0;
        if (!button)
            button = 0;
        if (typeof node == "string")
            throw new Error("a11y.dispatchMouseEvent obsolete API"); // not used; was node = FBL.$(node);
        var doc = node.ownerDocument;
        var event = doc.createEvent('MouseEvents');
        event.initMouseEvent(eventType, true, true, doc.defaultView,
            0, 0, 0, clientX, clientY, false, false, false, false, button, null);
        node.dispatchEvent(event);
    },

    isVisibleByStyle : function (elem)
    {
        if (!elem || elem.nodeType != 1)
            return false;
        var style = elem.ownerDocument.defaultView.getComputedStyle(elem, null);
        return style.visibility !== "hidden" && style.display !== "none" ;
    },

    isTabWorthy : function (elem)
    {
        return this.isFocusRow(elem) || this.isFocusObject(elem);
    },

    isOuterFocusRow : function(elem, includeSubRow)
    {
        return includeSubRow ? this.isSubFocusRow(elem) : CSS.hasClass(elem, 'outerFocusRow');
    },

    isProfileRow : function(elem)
    {
        return CSS.hasClass(elem, 'profileRow');
    },

    isFocusRow : function(elem)
    {
        return CSS.hasClass(elem, 'focusRow');
    },

    isFocusObject : function(elem)
    {
        return CSS.hasClass(elem, 'a11yFocus');
    },

    isFocusNoTabObject : function(elem)
    {
        return CSS.hasClass(elem, 'a11yFocusNoTab');
    },

    isDirCell : function(elem)
    {
        return CSS.hasClass(elem.parentNode, 'memberValueCell');
    },

    panelHasFocus : function(panel)
    {
        if (!panel || !panel.context)
            return false;
        var focusedElement = Firebug.chrome.window.document.commandDispatcher.focusedElement;
        var focusedPanel = Firebug.getElementPanel(focusedElement)
        return focusedPanel && (focusedPanel.name == panel.name);
    },

    getPanelA11y : function(panel, create)
    {
        var a11yPanels, panelA11y;
        if (!this.isEnabled() || !panel || !panel.name || !panel.context)
            return false;
        a11yPanels = panel.context.a11yPanels;
        if (!a11yPanels)
            a11yPanels = panel.context.a11yPanels = {};
        panelA11y = a11yPanels[panel.name];
        if (!panelA11y)
        {
            if (create)
                panelA11y = a11yPanels[panel.name] = {};
            else
                return false;
        }
        return panelA11y
    },

    //these utils are almost the same as their FBL namesakes ,
    //except that that the routine skips containers that are not visible (rather than wasting time on their childnodes)

    getPreviousByClass : function (node, className, downOnly, maxRoot)
    {
        if (!node)
            return null;
        function criteria(node) { return node.nodeType == 1 && CSS.hasClass(node, className); }
        for (var sib = node.previousSibling; sib; sib = sib.previousSibling)
        {
            if (!this.isVisibleByStyle(sib) || !XML.isVisible(sib))
                continue;
            var prev = this.findPreviousUp(sib, criteria);
            if (prev)
                return prev;
            if (criteria(sib))
                return sib;
        }
        if (!downOnly)
        {
            var next = this.findPreviousUp(node, criteria);
            if (next)
                return next;
        }
        if (node.parentNode && node.parentNode != maxRoot)
        {
            if (criteria(node.parentNode))
                return node.parentNode;
            return this.getPreviousByClass(node.parentNode, className, true);
        }
    },

    getNextByClass : function (node, className, upOnly, maxRoot)
    {
        if (!node)
            return null;
        function criteria(node) { return node.nodeType == 1 && CSS.hasClass(node, className); }
        if (!upOnly)
        {
            var next = this.findNextDown(node, criteria);
            if (next)
                return next;
        }
        for (var sib = node.nextSibling; sib; sib = sib.nextSibling)
        {
            if (!this.isVisibleByStyle(sib) || !XML.isVisible(sib))
                continue;
            if (criteria(sib))
                return sib;
            var next = this.findNextDown(sib, criteria);
            if (next)
                return next;
        }
        if (node.parentNode && node.parentNode != maxRoot)
            return this.getNextByClass(node.parentNode, className, true);
    },

    findNextDown : function(node, criteria)
    {
        if (!node)
            return null;
        for (var child = node.firstChild; child; child = child.nextSibling)
        {
            if (!this.isVisibleByStyle(child) || !XML.isVisible(child))
                continue;
            if (criteria(child))
                return child;
            var next = this.findNextDown(child, criteria);
            if (next)
                return next;
        }
    },

    findPreviousUp : function(node, criteria)
    {
        if (!node)
            return null;
        for (var child = node.lastChild; child; child = child.previousSibling)
        {
            if (!this.isVisibleByStyle(child) || !XML.isVisible(child))
                continue;
            var next = this.findPreviousUp(child, criteria);
            if (next)
                return next;
            if (criteria(child))
                return child;
        }
    }
});

// ************************************************************************************************
// Registration

Firebug.registerModule(Firebug.A11yModel);

return Firebug.A11yModel;

// ************************************************************************************************
});
