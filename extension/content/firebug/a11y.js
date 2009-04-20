/* See license.txt for terms of usage */

FBL.ns( function()
{
    with (FBL)
    {
        Firebug.A11yModel = extend(Firebug.Module, {
            
            // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
            // Module Management
            
            dispatchName: "a11y",

            enabled : false,

            initialize : function()
            {
                this.handleTabBarFocus = bind(this.handleTabBarFocus, this);
                this.handleTabBarBlur = bind(this.handleTabBarBlur, this);
                this.handlePanelBarKeyPress = bind(this.handlePanelBarKeyPress, this);
                this.onConsoleKeyPress = bind(this.onConsoleKeyPress, this);
                this.onLayoutKeyPress = bind(this.onLayoutKeyPress, this);
                this.onHTMLKeyPress = bind(this.onHTMLKeyPress, this);
                this.onConsoleFocus = bind(this.onConsoleFocus, this);
                this.onLayoutFocus = bind(this.onLayoutFocus, this);
                this.onLayoutBlur = bind(this.onLayoutBlur, this);
                this.onPanelContextMenu = bind(this.onPanelContextMenu, this);
            },
            
            initializeUI: function()
            {
                this.chrome = FirebugChrome;
                this.set(Firebug.getPref(Firebug.prefDomain, 'enableA11y'), FirebugChrome, true);
            },

            toggle : function()
            {
                Firebug.setPref(Firebug.prefDomain, 'enableA11y', !this.enabled);
            },

            updateOption : function(name, value)
            {
                if (name == "enableA11y")
                    this.set(value, context.chrome, false); 
            },
            
            set : function(enable, chrome, start)
            {
                this.enabled = enable;
                $('cmd_enableA11y').setAttribute('checked', enable + '');
                if (enable)
                    this.performEnable(chrome);
                else if (!start)
                    this.performDisable(chrome);
            },
            
            reattachContext: function(browser, context)
            {
                this.chrome = context.chrome;
                this.set(Firebug.getPref(Firebug.prefDomain, 'enableA11y'), context.chrome, false);
            },
            
            performEnable : function(chrome)
            {
                //add class used by all a11y related css styles (e.g. :focus and -moz-user-focus styles)
                setClass(chrome.$('fbContentBox'), 'useA11y');
                setClass(chrome.$('fbStatusBar'), 'useA11y');
                
                //manage all key events in toolbox (including tablists)
                chrome.$("fbPanelBar1").addEventListener("keypress", this.handlePanelBarKeyPress , true);
                //make focus stick to inspect button when clicked
                chrome.$("fbInspectButton").addEventListener("mousedown", this.focusTarget, true);
                chrome.$('fbPanelBar1-panelTabs').addEventListener('focus', this.handleTabBarFocus, true);
                chrome.$('fbPanelBar1-panelTabs').addEventListener('blur', this.handleTabBarBlur, true);
                chrome.$('fbPanelBar2-panelTabs').addEventListener('focus', this.handleTabBarFocus, true);
                chrome.$('fbPanelBar2-panelTabs').addEventListener('blur', this.handleTabBarBlur, true);
                setClass(chrome.$("fbPanelBar1").browser.contentDocument.body, 'useA11y');
                setClass(chrome.$("fbPanelBar2").browser.contentDocument.body, 'useA11y');
                Firebug.Editor.addListener(this);
            },

            performDisable : function(chrome)
            {   //undo everything we did in performEnable
                removeClass(chrome.$('fbContentBox'), 'useA11y');
                removeClass(chrome.$('fbStatusBar'), 'useA11y');
                chrome.$("fbPanelBar1").removeEventListener("keypress", this.handlePanelBarKeyPress , true);
                chrome.$("fbInspectButton").removeEventListener("mousedown", this.focusTarget, true);
                chrome.$('fbPanelBar1-panelTabs').removeEventListener('focus', this.handleTabBarFocus, true);
                chrome.$('fbPanelBar1-panelTabs').removeEventListener('blur', this.handleTabBarBlur, true);
                chrome.$('fbPanelBar2-panelTabs').removeEventListener('focus', this.handleTabBarFocus, true);
                chrome.$('fbPanelBar2-panelTabs').removeEventListener('blur', this.handleTabBarBlur, true);
                removeClass(chrome.$("fbPanelBar1").browser.contentDocument.body, 'useA11y');
                removeClass(chrome.$("fbPanelBar2").browser.contentDocument.body, 'useA11y');
                Firebug.Editor.removeListener(this);
            },
            
             // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
             // Context & Panel Management
            
            onInitializeNode : function(panel, actAsPanel)
            {
                if (!this.enabled)
                    return;
                this.makeFocusable(panel.panelNode, false);
                if (!panel.context.a11yPanels)
                    panel.context.a11yPanels = {};
                panel.context.a11yPanels[panel.name] = 
                {
                    tabStop     : null,
                    manageFocus : false,
                    lastIsDefault: false
                };
                var panelA11y = panel.context.a11yPanels[panel.name];
            
                actAsPanel = actAsPanel ? actAsPanel : panel.name; 
                //panel.panelNode.ownerDocument.addEventListener("focus", this.reportFocus, true);
                switch (actAsPanel)
                {
                    case 'console':
                        panelA11y.manageFocus = true;
                        if (panel.name == "console")
                            panelA11y.lastIsDefault = true;
                        panel.panelNode.setAttribute('role', 'list');
                        panel.panelNode.setAttribute('aria-live', 'polite');
                        panel.panelNode.setAttribute('id', panel.name + '_logRows');
                        panel.panelNode.addEventListener("keypress", this.onConsoleKeyPress, false);
                        panel.panelNode.addEventListener("focus", this.onConsoleFocus, true);
                        break;
                    case 'html':
                        panel.panelNode.setAttribute('role', 'tree');
                        panel.panelNode.addEventListener("keypress", this.onHTMLKeyPress, false);
                        break;
                    case 'script':
                        this.makeFocusable(panel.panelNode, true);
                        panel.panelNode.addEventListener('contextmenu', this.onPanelContextMenu, false);
                        break;
                    case 'layout':
                        panelA11y.manageFocus = true;
                        panel.panelNode.addEventListener("keypress", this.onLayoutKeyPress, false);
                        panel.panelNode.addEventListener("focus", this.onLayoutFocus, true);
                        panel.panelNode.addEventListener("blur", this.onLayoutBlur, true);
                        break;
                }
            },
            
            onDestroyNode : function(panel, actAsPanel)
            {
                if (!this.enabled)
                    return;
                actAsPanel = actAsPanel ? actAsPanel : panel.name; 
                //remove all event handlers we added in onInitializeNode
                switch (actAsPanel)
                {
                    case 'console':
                        panel.panelNode.removeEventListener("keypress", this.onConsoleKeyPress, false);
                        panel.panelNode.removeEventListener("focus", this.onConsoleFocus, true);
                        break;
                    case 'script':
                        panel.panelNode.removeEventListener('contextmenu', this.onPanelContextMenu, false);
                        break;
                    case 'layout':
                        panel.panelNode.removeEventListener("keypress", this.onLayoutKeyPress, false);
                        panel.panelNode.removeEventListener("focus", this.onLayoutFocus, true);
                        panel.panelNode.removeEventListener("blur", this.onLayoutBlur, true);
                        break;
                }
            },
            
            showPanel : function(browser, panel)
            {
                panel.context.chrome.$('fbToolbar').setAttribute('aria-label', panel.name + " " + $STR("panel tools"))
                return;
                var panelBrowser = FirebugChrome.getPanelBrowser(panel);
                if (panel.name == "script")
                    panelBrowser.setAttribute('showcaret', (panel.name == "script"));
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
                var isButton = target.nodeName.search(/(xul:)?toolbarbutton/) != -1;
                var isDropDownMenu = isButton && target.getAttribute('type') == "menu";
                var siblingTab, forward, toolbar, buttons;
                var keyCode = event.keyCode || event.charCode;
                
                if (keyCode == KeyEvent.DOM_VK_TAB)
                    this.ensurePanelTabStops(); //TODO: need a better solution to prevent loss of panel tabstop
                
                if (isTab || isButton )
                {
                    switch (keyCode)
                    {
                        case KeyEvent.DOM_VK_LEFT:
                        case KeyEvent.DOM_VK_RIGHT:
                            forward = event.keyCode == KeyEvent.DOM_VK_RIGHT;
                            if (isTab)
                            {
                                //will only work as long as long as siblings only consist of paneltab elements
                                siblingTab = target[forward ? 'nextSibling' : 'previousSibling'];
                                if (!siblingTab)
                                    siblingTab = target.parentNode[forward ? 'firstChild' : 'lastChild'];
                                if (siblingTab)
                                {
                                    var panelBar = getAncestorByClass(target, 'panelBar')
                                    setTimeout(bindFixed(function()
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
                                    cancelEvent(event);
                                    return;
                               }
                               toolbar = getAncestorByClass(target, 'innerToolbar');
                               if (toolbar)
                               {
                                   var doc = target.ownerDocument;
                                   //temporarily make all buttons in the toolbar part of the tab order,
                                   //to allow smooth, native focus advancement
                                   setClass(toolbar, 'hasTabOrder');
                                   doc.commandDispatcher[forward ? 'advanceFocus' : 'rewindFocus']();
                                   //Very ugly hack, but it works well. This prevents focus to 'spill out' of a 
                                   //toolbar when using the left and right arrow keys 
                                   if (!isAncestor(doc.commandDispatcher.focusedElement, toolbar))
                                   {
                                       //we moved focus to somewhere out of the toolbar: not good. Move it back to where it was.
                                       doc.commandDispatcher[!forward ? 'advanceFocus' : 'rewindFocus']();
                                   }
                                   //remove the buttons from the tab order again, so that it will remain uncluttered
                                   removeClass(toolbar, 'hasTabOrder');
                               }
                                cancelEvent(event);
                                return;
                           }
                        break;
                        case KeyEvent.DOM_VK_RETURN:
                        case KeyEvent.DOM_VK_SPACE:
                        case KeyEvent.DOM_VK_UP:
                        case KeyEvent.DOM_VK_DOWN:
                            if (isTab && target.tabMenu)
                                target.tabMenu.popup.showPopup(target.tabMenu, -1, -1, "popup", "bottomleft", "topleft");
                            else if (isButton)
                            {
                                if (isDropDownMenu)
                                    target.open = true;
                                cancelEvent(event);
                                return false;
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
                return panel.context.a11yPanels[panel.name].tabStop;    
            },            
            
            ensurePanelTabStops: function()
            {
                var panel = context.chrome.getSelectedPanel();
                var sidePanel = context.chrome.getSelectedSidePanel();
                this.ensurePanelTabStop(panel);
                if (sidePanel)
                    this.ensurePanelTabStop(sidePanel);
            },
            
            ensurePanelTabStop: function(panel)
            {    
                var panelA11y = panel.context.a11yPanels[panel.name];
                if ( panelA11y && panelA11y.manageFocus)
                {
                    var tabStop = this.getPanelTabStop(panel);
                    if (!tabStop|| !this.isVisible(tabStop))
                    {
                        this.tabStop = null;
                        this.findPanelTabStop(panel, 'focusRow', panelA11y.lastIsDefault);
                    }
                }
            },
            
            setPanelTabStop : function (panel, elem)
            {
                var tabStop = this.getPanelTabStop(panel)
                if (tabStop)
                    this.makeFocusable(tabStop, false);
                panel.context.a11yPanels[panel.name].tabStop = elem;
                if (elem)
                    this.makeFocusable(elem, true);
            },
            
            findPanelTabStop : function(panel, className, last)
            {
                var candidates = panel.panelNode.getElementsByClassName(className);
                if (candidates.length > 0)
                    this.setPanelTabStop(panel, candidates[last ? candidates.length -1 : 0]);
                else 
                    this.setPanelTabStop(panel, null);
            },

            // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
            // Console Panel
            
            onLogRowCreated : function(panel, row)
            {
                if (!this.enabled || !panel.context.a11yPanels[panel.name])
                    return;
                if (hasClass(row, 'logRow-dir'))
                {
                    row.setAttribute('role', 'listitem');
                    var memberRows = row.getElementsByClassName('memberRow');
                    if (memberRows.length > 0)
                    {
                        this.onMemberRowsAdded(panel, memberRows);
                    }
                }
                else if (hasClass(row, 'logRow-group'))
                    row.setAttribute('role', 'presentation');
                else 
                {
                    row.setAttribute('role', 'listitem');
                    var logRowType = this.getLogRowType(row);
                    if (logRowType)
                        this.insertHiddenText(panel, row, logRowType + ": ")
                    setClass(row, 'focusRow');
                    this.setPanelTabStop(panel, row);
                    this.onLogRowContentCreated(panel, row);
                }
            },
            
            onLogRowContentCreated : function(panel, node)
            { 
                if (!this.enabled || !panel.context.a11yPanels[panel.name])
                    return;
                var focusObjects = this.getFocusObjects(node);
                Array.forEach(focusObjects, function(e,i,a){
                    this.makeFocusable(e);
                    var prepend = "";
                    var append = this.getObjectType(e);
                    if (hasClass(e, 'errorTitle'))
                        prepend += $STR('expand error') + ': ';
                    e.setAttribute('aria-label', prepend + e.textContent + append);
                    }, this);     
            },
                  
            onConsoleKeyPress : function(event) 
            {   
                var target = event.target;
                var keyCode = event.keyCode || event.charCode;   
                
                if (!this.isFocusObject(target) && !this.isFocusRow(target))
                    return;
                else if (event.shiftKey || event.altKey)
                    return;
                else if ([13, 32, 33, 34, 35, 36, 37, 38, 39, 40].indexOf(keyCode) == -1)
                    return;//not interested in any other keys, than arrows, pg, home/end, space & enter
                
                var panel = Firebug.getElementPanel(target)
                
                var newTarget = target
                if (!this.isLogRow(target)) 
                { 
                    if (!this.isDirCell(target))
                        newTarget = this.getAncestorRow(target);
                    else if (event.ctrlKey)
                    {
                        newTarget = this.getAncestorRow(target);
                        if (newTarget)
                            newTarget = [33, 38].indexOf(keyCode) == -1 ? this.getLastFocusChild(newTarget) : this.getFirstFocusChild(newTarget)
                    }
                    if (!newTarget)
                        newTarget = target
                }
                switch (keyCode) 
                { 
                    case 38://up
                    case 40://down
                        this.focusSiblingRow(panel, newTarget, keyCode == 38);
                        break;
                    case 37://left
                    case 39://right
                        var goLeft = keyCode == 37
                        if (this.isLogRow(target))
                        {
                            if (hasClass(target, 'logGroupLabel') && target.getAttribute('aria-expanded') == (goLeft ? "true" : "false"))
                                this.dispatchMouseEvent(target, 'mousedown');
                            else if (!goLeft)
                            {
                                var focusItems = this.getFocusObjects(target);
                                if (focusItems.length > 0)
                                    this.focus(event.ctrlKey ? focusItems[focusItems.length -1] : focusItems[0]);
                            }
                        }
                        else if (this.isDirCell(target))
                        {
                            var row = getAncestorByClass(target, 'memberRow');
                            var toggleElem = getChildByClass(row.cells[0], "memberLabel")
                            if (!goLeft && hasClass(row, 'hasChildren'))
                            {
                                if (hasClass(row, 'opened'))
                                    this.focusSiblingRow(panel, target , false);
                                else if (toggleElem)
                                {
                                    if (hasClass(row, 'hasChildren'))
                                        target.setAttribute('aria-expanded', 'true');
                                    this.dispatchMouseEvent(toggleElem, 'click');
                                }
                            }
                            else if (goLeft)
                            {
                                var level = parseInt(row.getAttribute("level"));
                                if (hasClass(row, 'opened'))
                                {
                                    if (hasClass(row, 'hasChildren'))
                                        target.setAttribute('aria-expanded', 'false');
                                    this.dispatchMouseEvent(toggleElem, 'click');
                                }
                                else if (level > 0)
                                {
                                    //TODO: Make more efficient. (Now gets more costly as rows increase) 
                                    var i = row.rowIndex - 1;
                                    var tempRow;
                                    while(i >= 0)
                                    {
                                        tempRow = row.parentNode.rows[i];
                                        if (parseInt(tempRow.getAttribute("level")) == level -1)
                                        {
                                            tempRow.cells[1].firstChild.focus();
                                            break;
                                        }
                                        i--;
                                    }
                                }
                            }
                        }
                        else if (this.isFocusObject(target))
                        {
                            var parentRow = newTarget;
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
                        }
                        break;
                    case 35://end
                    case 36://home
                        this.focusEdgeRow(panel, newTarget, keyCode == 36);
                        break;
                    case 33://pgup
                    case 34://pgdn
                        this.focusSiblingPageRow(panel, newTarget, keyCode == 33);
                        break;
                    case 13://enter
                        if (this.isFocusObject(target))
                            this.dispatchMouseEvent(target, 'click');
                            break;
                    case 32://space
                    if (this.isFocusObject(target) && target.hasAttribute('role', 'checkbox'))
                        this.dispatchMouseEvent(target, 'click');
                    break;    
                }
                if (!event.shiftKey)
                    event.preventDefault();
            },
            
            onConsoleFocus : function(event)
            {
                if (this.isTabWorthy(event.target))
                    this.setPanelTabStop(Firebug.getElementPanel(event.target), event.target)
            },
            
            getFocusRows : function(panel)
            {
                var nodes = panel.panelNode.getElementsByClassName('focusRow');   
                return Array.filter(nodes, function(e,i,a){return this.isVisible(e);}, this);    
            },
            
            getLastFocusChild : function(target)
            {
                var focusChildren = target.getElementsByClassName('focusRow'); 
                return focusChildren[focusChildren.length -1];
            },
            
            getFirstFocusChild : function(target)
            {
                var focusChildren = target.getElementsByClassName('focusRow'); 
                return focusChildren[0];
            },
            
            getAncestorRow : function(target)
            {
                return getAncestorByClass(target, "logRow");
            },

            focusSiblingRow : function(panel, target, goUp)
            {
                var rows = this.getFocusRows(panel);
                var index = this.getRowIndex(rows, target); 
                var siblingIndex = goUp ? --index : ++index;
                this.focusRow(panel, rows, siblingIndex, goUp);
            },

            focusSiblingPageRow : function(panel, target, goUp)
            {
                var rows = this.getFocusRows(panel);
                var index = this.getRowIndex(rows, target);
                this.focusRow(panel, rows, (goUp ? index - 10 : index + 10), goUp);
            },
            
            focusEdgeRow : function(panel, target, goUp)
            {
                var rows = this.getFocusRows(panel);
                this.focusRow(panel, rows, (goUp ? 0 : rows.length -1), goUp);
            },
            
            getRowIndex : function(rows, target)
            {
                return Array.indexOf(rows, target);    
            },
            
            focusRow : function(panel, rows, index, goUp)
            { 
                var min = 0; var max = rows.length -1;
                if (index < min || index > max) 
                    index = index < min ? 0 : max;
                this.focus(rows[index]);
            },
                        
            getFocusObjects : function(container)
            {
                var nodes = container.getElementsByClassName("a11yFocus")
                return Array.filter(nodes, this.isVisible, this);;
            },
            
            // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
            // HTML Panel
            
            onHTMLKeyPress: function(event)
            {
                var target = event.target;
                var keyCode = event.keyCode || event.charCode;   
                if ([13, 32, KeyEvent.DOM_VK_F2].indexOf(keyCode) == -1)
                    return;
                if (!hasClass(target, "nodeLabel"))
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
                                this.dispatchMouseEvent(nodeLabels[0], 'mousedown');
                                cancelEvent(event);
                            }
                        }    
                        if (!isEnter || nodeLabels.length == 0)
                        {
                            if (target.parentNode.repObject && panel.editNewAttribute) 
                            {
                                panel.editNewAttribute(target.parentNode.repObject)
                                cancelEvent(event);
                            }
                        }
                        break;
                    case KeyEvent.DOM_VK_F2:
                        if (hasClass(target.parentNode, 'textNodeBox'))
                        {
                            var textNode = getNextByClass(target, 'nodeText');
                            if (textNode)
                                this.dispatchMouseEvent(textNode, 'mousedown');
                        }
                        break;
                }
            },
            
            onObjectBoxSelected: function(objectBox)
            {
                if (!this.enabled)
                    return;
                var label = objectBox.firstChild;
                if (label) {
                    this.makeFocusable(label, true);
                    this.focus(label);
                }
            },
            
            onObjectBoxUnselected: function(objectBox)
            {
                if (!this.enabled)
                    return;
                var label = objectBox.firstChild;
                if (label) {
                    this.makeUnfocusable(label, true);
                }
            },

            // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
            // Layout Panel
            
            onLayoutBoxCreated : function(panel, node, detailsObj)
            {
                if (!this.enabled)
                    return;
                var focusGroups = node.getElementsByClassName('focusGroup');
                this.insertHiddenText(panel, node, $STR('press enter to edit values'), false, "layoutPressEnterDesc")
                Array.forEach(focusGroups, function(e,i,a){
                    if (hasClass(e, 'offsetLayoutBox'))
                        this.makeFocusable(e, true);    
                    else 
                        this.makeFocusable(e, false);
                    e.setAttribute('role', 'group');
                    e.setAttribute('aria-describedby', 'layoutPressEnterDesc');
                    e.setAttribute('aria-label', this.getLayoutBoxLabel(e, detailsObj));
                    e.setAttribute('aria-setsize', a.length);
                    e.setAttribute('aria-posinset', i + 1);
                }, this);
            },
            
            getLayoutBoxLabel : function(elem, detailsObj )
            {
                //TODO: uncessesarily big, make smaller
                var className = elem.className.match(/\b(\w+)LayoutBox\b/);
                if (!className)
                    return "";
                var styleName = className[1];
                var output = "";
                switch(styleName)
                {
                    case "offset":
                        output += $STR("LayoutOffset");
                        styleName = "outer";
                        break;
                    case "margin":
                        output += $STR("LayoutMargin");
                        break;
                    case "border":
                        output += $STR("LayoutBorder");
                        break;
                    case "padding":
                        output += $STR("LayoutPadding");
                        break;   
                    case "content":
                        output += $STR("LayoutSize");
                        break;    
                }
                output += ": ";
                
                var valNames = [];
                var vals = {};
                if (styleName == "outer")
                {
                    valNames = ['top', 'left'];
                    vals.top = detailsObj[styleName + 'Top'];
                    vals.left = detailsObj[styleName + 'Left'];
                }
                else if (styleName == "content")
                {
                    valNames = ['width', 'height']
                    vals.width = detailsObj['width'];
                    vals.height = detailsObj['height'];                   
                }
                else
                {
                    valNames = ['top', 'right', 'bottom', 'left'];
                    vals.top = detailsObj[styleName + 'Top'];
                    vals.right = detailsObj[styleName + 'Right'];
                    vals.bottom = detailsObj[styleName + 'Bottom'];
                    vals.left = detailsObj[styleName + 'Left'];    
                }
                for (var i = 0 ; i < valNames.length; i++)
                {
                    output += $STR(valNames[i]) + " = " + vals[valNames[i]] + " ";
                }
                return output;
            },
            
            onLayoutKeyPress : function(event)
            {
                var target = event.target;
                var keyCode = event.keyCode || event.charCode;   
                if ([13, 37, 38, 39, 40].indexOf(keyCode) == -1)
                    return;
                if (!hasClass(target, 'focusGroup'))
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
                            node = FBL.getAncestorByClass(target.parentNode, 'focusGroup');
                        else
                            node = FBL.getChildByClass(target, 'focusGroup');
                        if (node) 
                            this.focus(node);
                        break;
                    case 13:
                        var editables = target.getElementsByClassName('editable');
                        editables = Array.filter(editables, function(e,i,a){return hasClass(e, 'focusStart');}, this);
                        if (editables[0])
                            this.dispatchMouseEvent(editables[0], 'mousedown');
                        cancelEvent(event);
                        break;
                }
            },
            
            onLayoutFocus : function(event)
            {
                if (hasClass(event.target, 'focusGroup'))
                {
                    this.dispatchMouseEvent(event.target, 'mouseover');
                    this.setPanelTabStop(Firebug.getElementPanel(event.target), event.target);
                }
            },
            
            onLayoutBlur : function(event)
            {
                if (hasClass(event.target, 'focusGroup'))
                    this.dispatchMouseEvent(event.target, 'mouseout');
            },
            
            onBeginEditing : function(panel, editor, target, value)
            {  
                switch (panel.name)
                {
                    case 'html':
                        var tagName= nodeName = null;
                        var setSize = posInSet = 0; var setElems;
                        var label = $STR("inline editor") + ": ";
                        if (hasClass(target, 'nodeName') || hasClass(target, 'nodeValue'))
                        {
                            var isName = hasClass(target, 'nodeName');
                            setElems = target.parentNode.parentNode.getElementsByClassName(isName ? 'nodeName' : 'nodeValue');
                            setSize = (setElems.length * 2);
                            posInSet = ((Array.indexOf(setElems, target) + 1) * 2) - (isName ? 1 : 0);
                            editor.input.setAttribute('role', 'listitem');
                            editor.input.setAttribute('aria-editable', 'true');
                            editor.input.setAttribute('aria-setsize', setSize);
                            editor.input.setAttribute('aria-posinset', posInSet);
                            nodeTag = getPreviousByClass(target, 'nodeTag');
                            if (!isName)
                            {
                                nodeName = getPreviousByClass(target, 'nodeName');
                                label += $STRF('value for attribute in element', [nodeName.textContent, nodeTag.textContent]);
                            }
                            else
                                label += $STRF("attribute for element", [nodeTag.textContent]);
                        }
                        else if (hasClass(target, 'nodeText'))
                        {
                            nodeTag = getPreviousByClass(target, 'nodeTag');
                            label += $STRF("text contents for element", [nodeTag.textContent]);
                        }
                        editor.input.setAttribute('aria-label', label);
                        break;
                    case 'layout':
                        editor.input.setAttribute('aria-label', target.getAttribute('aria-label'));
                        break;
                    case 'dom':   
                    case 'domSide':
                        if (target.cells && target.cells[0])
                            editor.input.setAttribute('aria-label', target.cells[0].textContent);
                        break;
                }
                //not sure why I need to do this. Focus doesn't seem to be picked up properly for inline editors
                editor.input.blur()
                editor.input.focus(); //NVDA still doesn't get this
            },
            
            onStopEdit : function(panel, editor, target)
            {
                switch (panel.name)
                {
                    case 'layout':
                        var tabStop = this.getPanelTabStop(panel);
                        if  (tabStop)
                            this.focus(tabStop);
                        break;
                    case 'html':
                        var box = panel.ioBox.createObjectBox(panel.selection);
                        panel.ioBox.selectObjectBox(box);
                        break;
                }
            },
            
            // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
            // Script Panel
            
            onPanelContextMenu : function(event)
            {
                if (event.button == 0) //the event was created by keyboard, not right mouse click 
                {
                    // get caret location
                    var sel = event.target.ownerDocument.defaultView.getSelection(); 
                    var node = sel.focusNode.parentNode;
                    //manually trigger the fbContextMenu popup 
                    document.popupNode = node;
                    this.chrome.$('fbContextMenu').openPopup(node, 'after_pointer');  
                    cancelEvent(event); //no need for default handlers anymore
                }   
            },
            
            // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
            // Dom Panel
            
            onMemberRowsAdded: function(panel, rows)
            {
                if (!this.enabled || !rows)
                    return;
                if (!panel)
                    panel = Firebug.getElementPanel(rows[0]);
                var panelA11y = panel.context.a11yPanels[panel.name];
                if (!panel || !panelA11y)
                    return;
                var setSize
                var posInset;
                var setSize = rows.length;
                var posInset = 0;
                for (var i = 0; i < rows.length; i++)
                {
                    var makeTab = (panelA11y.lastIsDefault && i === rows.length - 1) || (!panelA11y.lastIsDefault && i === 0)
                    this.makeMemberRowAccessible(panel, rows[i], makeTab, ++posInset, setSize);
                }
            },
                  
            onMemberRowSliceAdded : function(panel, borderRows, posInSet, setSize)
            {
                if (!this.enabled)
                    return;
                var startRow = borderRows[0];
                var endRow = borderRows[1];
                if (!panel)
                    panel = Firebug.getElementPanel(startRow);
                if (!panel || !panel.context.a11yPanels[panel.name])
                    return;
                
                var row = startRow;
                do
                {
                    this.makeMemberRowAccessible(panel, row, false, posInSet++, setSize)
                    if (row === endRow)
                        break;
                } 
                while (row = row.nextSibling);
            },
            
            makeMemberRowAccessible : function(panel, row, makeTab, posInSet, setSize, toggleOnly)
            {
                var labelCell = row.cells[0];
                var valueCell = row.cells[1];
                if (!valueCell)
                    return;
                var cellChild = valueCell.firstChild;
                if (cellChild)
                {
                    if (hasClass(row, 'hasChildren'))
                        cellChild.setAttribute('aria-expanded', hasClass(row, 'opened'));
                    var type = this.getObjectType(cellChild)
                    if (makeTab)
                        this.setPanelTabStop(panel, cellChild);
                    else 
                        this.makeFocusable(cellChild, false);
                    
                    cellChild.setAttribute('role', 'treeitem');
                    cellChild.setAttribute('aria-level', parseInt(row.getAttribute('level')) + 1);
                    cellChild.setAttribute('aria-label', labelCell.textContent + 
                         ": " + " " + valueCell.textContent + (type ? " (" + type + ")" : "" )) ;
                    if (posInSet && setSize)
                    {
                        cellChild.setAttribute('aria-setsize', setSize);
                        cellChild.setAttribute('aria-posinset', posInSet);
                    }
                    setClass(cellChild, 'focusRow');
                }
            },
                         
            // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
            // Domplate Management 
            
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
                var className = elem.className.match(/\logRow-(\w+)\b/);
                if (className)
                    type = className[1];
                return type;
            },
            
            getObjectType : function(elem)
            {   
                var type = "";
                var className = elem.className.match(/\bobject(Box|Link)-(\w+)/);
                if (className)
                    type = className[2];
                if (type == "null" || type == "undefined")
                    type = "";
                else if (type == "number" && (elem.textContent == "true" || elem.textContent == "false"))
                    type = "boolean";
                else if ((type == "" || type == "object") && elem.repObject)
                { 
                    var obj = elem.repObject;
                    type = typeof obj;   
                    if (obj instanceof Array)
                        type = "array";
                }
                return type;
            },
            
            // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
            // Utils
            
            focus : function(elem)
            {
                //maybe add isFocusable check here as well?
                if (isElement(elem) && this.isVisible(elem))
                    elem.focus();
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
            
            dispatchMouseEvent : function (node, eventType)
            {
                if (typeof node == "string")
                    node = $(node);
                var doc = node.ownerDocument;
                var event = doc.createEvent('MouseEvents');
                event.initMouseEvent(eventType, true, true, doc.defaultView,
                    0, 0, 0, 0, 0, false, false, false, false, 0, null);
                node.dispatchEvent(event);
            },
            
            isVisible : function (elem)
            {
                return elem && isVisible(elem) && elem.ownerDocument.defaultView.getComputedStyle(elem, null).visibility !== "hidden";
            },
            
            isTabWorthy : function (elem)
            {
                return this.isFocusRow(elem) || this.isFocusObject(elem);
            },
            
            isLogRow : function(elem)
            {
                return hasClass(elem, 'logRow');
            },
            
            isFocusRow : function(elem)
            {
                return this.isLogRow(elem) || this.isDirCell(elem);
            },
            
            isFocusObject : function(elem) {
                return hasClass(elem, 'a11yFocus');
            },
            
            isDirCell : function(elem) {
                return hasClass(elem, 'memberValueCell') || hasClass(elem.parentNode, 'memberValueCell'); 
            }
        });
        Firebug.registerModule(Firebug.A11yModel);
    }
});