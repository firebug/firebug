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
                this.onConsoleFocus = bind(this.onConsoleFocus, this);
                this.onPanelContextMenu = bind(this.onPanelContextMenu, this);
            },
            
            initializeUI: function()
            {
                this.chrome = FirebugChrome;
                this.set(Firebug.getPref(Firebug.prefDomain, 'enableA11y'), FirebugChrome);
            },

            toggle : function()
            {
                Firebug.setPref(Firebug.prefDomain, 'enableA11y', !this.enabled);
            },

            updateOption : function(name, value)
            {
                if (name == "enableA11y")
                    this.set(value, context.chrome); 
            },
            
            set : function(enable, chrome)
            {
                this.enabled = enable;
                $('cmd_enableA11y').setAttribute('checked', enable + '');
                if (enable)
                    this.performEnable(chrome);
                else
                    this.performDisable(chrome);
            },
            
            reattachContext: function(browser, context)
            {
                this.chrome = context.chrome;
                this.set(Firebug.getPref(Firebug.prefDomain, 'enableA11y'), context.chrome);
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
            },
            
             // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
             // Context & Panel Management
            
            onInitializeNode : function(panel, actAsPanel)
            {
                if (!this.enabled)
                    return;
                this.makeFocusable(panel.panelNode, false);
                if (!panel.context.a11yPanels)
                {
                    panel.context.a11yPanels = {};
                    panel.context.a11yPanels[panel.name] = 
                    {
                        tabStop     : null,
                        manageFocus : false
                    };
                }
                actAsPanel = actAsPanel ? actAsPanel : panel.name; 
                switch (actAsPanel)
                {
                    case 'console':
                        panel.context.a11yPanels[panel.name].manageFocus = true;
                        panel.panelNode.setAttribute('role', 'list');
                        panel.panelNode.setAttribute('aria-live', 'polite');
                        panel.panelNode.setAttribute('id', panel.name + '_logRows');
                        panel.panelNode.addEventListener("keypress", this.onConsoleKeyPress, false);
                        panel.panelNode.addEventListener("focus", this.onConsoleFocus, true);
                        //panel.panelNode.ownerDocument.addEventListener("focus", this.reportFocus, true);
                        break;
                    case 'script':
                        this.makeFocusable(panel.panelNode, true);
                        panel.panelNode.addEventListener('contextmenu', this.onPanelContextMenu, false);
                        break;
                }
            },
            
            onDestroyNode : function(panel)
            {
                if (!this.enabled)
                    return;
                //remove all event handlers we added in onInitializeNode
                switch (panel.name)
                {
                    case 'console':
                        panel.panelNode.removeEventListener("keypress", this.onConsoleKeyPress, false);
                        panel.panelNode.removeEventListener("focus", this.onConsoleFocus, true);
                        //panel.panelNode.ownerDocument.addEventListener("focus", this.reportFocus, true);
                        break;
                    case 'script':
                        panel.panelNode.removeEventListener('contextmenu', this.onPanelContextMenu, false);
                        break;
                }
            },
            
            showPanel : function(browser, panel)
            {
                panel.context.chrome.$('fbToolbar').setAttribute('aria-label', panel.name + " panel tools")
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
            // Generic Panel Handling
             
            onPanelContextMenu : function(event)
            {
                if (event.button == 0) //the event was created by keyboard, not right mouse click 
                {
                    // get caret location
                    var sel = event.target.ownerDocument.defaultView.getSelection(); 
                    var node = sel.focusNode.parentNode;
                    //manually trigger the fbContextMenu popup 
                    document.popupNode = node;
                    this.chrome.$('fbContextMenu').openPopup(node, 'after_pointer'); // this is as close as I can get it to the caret 
                    cancelEvent(event); //no need for default handlers anymore
                }   
            },
            
            getPanelTabStop : function(panel)
            {
                if (!panel)
                    panel = Firebug.getElementPanel(); 
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
                if (panel.context.a11yPanels[panel.name] && panel.context.a11yPanels[panel.name].manageFocus)
                {
                    var tabStop = this.getPanelTabStop(panel);
                    if (!tabStop|| !this.isVisible(tabStop))
                    {
                        this.tabStop = null;
                        this.findTabStop(panel, 'focusRow', true);
                    }
                }
            },

            // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
            // Console Panel
            
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
                        newTarget = [33, 38].indexOf(keyCode) == -1 ? this.getLastFocusChild(newTarget) : this.getFirstFocusChild(newTarget)
                    }
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
                        if (this.isFocusObject(target) && !target.hasAttribute('role', 'checkbox'))
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
            // Domplate Management
            
            onLogRowCreated : function(panel, row)
            {
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
                {
                    row.setAttribute('role', 'presentation');
                    FBTrace.sysout('group created', row);
                }
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
                var focusObjects = this.getFocusObjects(node);
                Array.forEach(focusObjects, function(e,i,a){
                    this.makeFocusable(e);
                    var prepend = "";
                    var append = this.getObjectType(e);
                    if (hasClass(e, 'errorTitle'))
                        prepend += 'Expand error: ';
                    e.setAttribute('aria-label', prepend + e.textContent + append);
                    }, this);     
            },
            
            onMemberRowsAdded: function(panel, rows, startRow, lastRow)
            {
                var setSize
                var posInset;
                
                if (rows) 
                {
                    if (!panel)
                        panel = Firebug.getElementPanel(startRow);
                    var setSize = rows.length;
                    var posInset = 0;
                    for (var i = 0; i < rows.length; i++)
                    {
                        this.makeMemberRowAccessible(panel, rows[i], i === rows.length - 1, ++posInset, setSize);
                    }
                }
                else if (startRow && lastRow)
                {
                    if (!panel)
                        panel = Firebug.getElementPanel(startRow);
                    var row = startRow; //not included in loop, this is the 'parent' row that was expanded
                    
                    setSize = lastRow.rowIndex - startRow.rowIndex;
                    posInset = 0;
                    while (row = row.nextSibling)
                    {
                        this.makeMemberRowAccessible(panel, row, false, ++posInset, setSize)
                        
                        if (row === lastRow)
                        {
                            break;
                        }
                    }    
                }
            },
            
            makeMemberRowAccessible : function(panel, row, last, posInset, setSize, toggleOnly)
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
                    if (last)
                        this.setPanelTabStop(panel, cellChild);
                    else 
                        this.makeFocusable(cellChild);
                    cellChild.setAttribute('role', 'treeitem');
                    cellChild.setAttribute('aria-level', parseInt(row.getAttribute('level')) + 1);
                    cellChild.setAttribute('aria-label', labelCell.textContent + 
                         ": " + " " + valueCell.textContent + (type ? " (" + type + ")" : "" )) ;
                    if (posInset && setSize)
                    {
                        cellChild.setAttribute('aria-setsize', setSize);
                        cellChild.setAttribute('aria-posinset', posInset);
                    }
                    setClass(cellChild, 'focusRow');
                }
            },
            
            insertHiddenText : function(panel, elem, text, asLastNode)
            {
                var span = panel.document.createElement('span');
                span.className ="offScreen";
                span.textContent = text;
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
                    else if (false) //for some reason this breaks: els if (obj.nodeType)
                    {
                        switch(obj.nodeType)
                        {
                            case Node.ATTRIBUTE_NODE:
                                type = "attribute";
                                break;
                            case Node.ELEMENT_NODE:
                                type = "element";
                                break;
                        }
                    }
                }
                return type;
            },
            
            setPanelTabStop : function (panel, elem)
            {
                var tabStop = this.getPanelTabStop(panel)
                if (tabStop)
                    this.makeFocusable(tabStop, false);
                panel.context.a11yPanels[panel.name].tabStop = elem;
                this.makeFocusable(elem, true);
            },
            
            findTabStop : function(panel, className, last)
            {
                var candidates = panel.panelNode.getElementsByClassName(className);
                if (candidates.length > 0)
                    this.setPanelTabStop(panel, candidates[last ? candidates.length -1 : 0]);
                else 
                    this.setPanelTabStop(null);
            },
            
            // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
            // Utils
            
            focus: function(elem)
            {
                //maybe add isFocusable check here as well?
                if (isElement(elem) && this.isVisible(elem))
                    elem.focus();
            },
            
            makeFocusable : function(elt, inTabOrder)
            {
                elt.setAttribute('tabindex', inTabOrder ? '0' : '-1');
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
                var styles = elem.ownerDocument.defaultView.getComputedStyle(elem, null);
                return elem && isVisible(elem) && styles.visibility !== "hidden";
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