/* See license.txt for terms of usage */

/**
 * UI control of debug Logging for Firebug internals
 */
FBL.ns(function() { with (FBL) {

// ***********************************************************************************
// Shorcuts and Services

const Cc = Components.classes;
const Ci = Components.interfaces;

const PrefService = Cc["@mozilla.org/preferences-service;1"];
const nsIPrefBranch2 = Ci.nsIPrefBranch2;
const prefs = PrefService.getService(nsIPrefBranch2);
const nsIPrefService = Ci.nsIPrefService;
const prefService = PrefService.getService(nsIPrefService);
const windowMediator = CCSV("@mozilla.org/appshell/window-mediator;1", "nsIWindowMediator");
const consoleService = CCSV("@mozilla.org/consoleservice;1", "nsIConsoleService");

const reDBG = /extensions\.([^\.]*)\.(DBG_.*)/;
const reDBG_FBS = /DBG_FBS_(.*)/;
const reSplitLines = /\r\n|\r|\n/;

var EOF = "<br/>";

this.namespaceName = "TracePanel";

// ***********************************************************************************
// Trace Module

var ConsoleModule = extend(Firebug.ConsoleBase, Firebug.Module);
Firebug.TraceModule = extend(ConsoleModule,
{
    /**
     * These will appear as options in FBTrace panel, with the DBG_ removed.
     * Also add extension.firebug.BP etc to defaults/preferences/chromebug.js
     * if you want persistence.
     */
    DBG_BP: false, 			    // debugger.js and firebug-services.js; lots of output
    DBG_CSS: false,             // CSS panel or css stuff
    DBG_CACHE: false,   		// sourceCache
    DBG_CONSOLE: false,         // console
    DBG_DISPATCH: false, 		// lib.dispatch
    DBG_DOM: false,             // includes domplate
    DBG_DBG2FIREBUG: false,     // put trace output to Firebug console
    DBG_ERRORS: false,  		// error.js
    DBG_EVENTS: false,  		// debugger.js for event handlers, need more
    DBG_EVAL: false,    		// debugger.js and firebug-service.js
    DBG_FUNCTION_NAMES: false,  // heuristics for anon functions
    DBG_INSPECT: false, 		// inspector.js
    DBG_INITIALIZE: false,		// registry (modules panels); initialize FB
    DBG_HTML: false,            // HTML panel
    DBG_LINETABLE: false,       // lib.js creating line tables.
    DBG_NET: false,        	    // net.js
    DBG_OPTIONS: false,
    DBG_PANELS: false,          // panel selection.
    DBG_SOURCEFILES: false, 	// debugger and sourceCache
    DBG_STACK: false,  		    // call stack, mostly debugger.js
    DBG_TOPLEVEL: false, 		// firebug-service
    DBG_UI_LOOP: false, 		// debugger.js
    DBG_WINDOWS: false,    	    // tabWatcher, dispatch events; very useful for understand modules/panels
    DBG_FBS_CREATION: false,    // firebug-service script creation
    DBG_FBS_SRCUNITS: false,    // firebug-service compilation units
    DBG_FBS_STEP: false,        // firebug-service stepping
    DBG_FBS_FUNCTION: false,    // firebug-service new Function
    DBG_FBS_BP: false,          // firebug-service breakpoints
    DBG_FBS_ERRORS: false,      // firebug-service error handling
    DBG_FBS_FINDDEBUGGER: false,// firebug-service routing calls to debug windows
    DBG_FBS_FF_START: false,    // firebug-service trace from start of firefox
    DBG_FBS_FLUSH: false,       // firebug-service flush to see crash point
    DBG_FBS_JSDCONTEXT: false,  // firebug-service dump contexts

    debug: this.DBG_OPTIONS,

    injectOptions: function()
    {
        if (this.debug)
            FBTrace.sysout("TraceModule.injectOptions\n");

        for (p in this)
        {
            var m = reDBG.exec(p);
            if (m)
                FBTrace[p] = this[p];
        }
    },

    initialize: function(prefDomain, prefNames)
    {
        if (this.isEnabled())
            this.toggleConsole(true);

        if (this.debug)
            FBTrace.sysout("TraceModule.initialize prefDomain="+ prefDomain+"\n");

        for (var p in this)
        {
            var f = reDBG_FBS.exec(p);
            if (f)
            {
                FBTrace[p] = Firebug.getPref(Firebug.servicePrefDomain, p);
                if (this.debug)
                    FBTrace.sysout("TraceModule.initialize "+Firebug.servicePrefDomain+" "+p+"="+FBTrace[p]+"\n");
            }
            else
            {
                var m = p.indexOf("DBG_");
                if (m != -1)
                    FBTrace[p] = Firebug.getPref(prefDomain, p); // set to 'true' to turn on all traces;
                if (this.debug && m)
                    FBTrace.sysout("TraceModule.initialize "+ prefDomain+"."+p+"="+FBTrace[p]+"\n");
            }
        }

        prefs.setBoolPref("browser.dom.window.dump.enabled", true);
        prefs.addObserver("extensions", this, false);

        consoleService.registerListener(Firebug.TraceModule.JSErrorConsoleObserver);
    },

    shutdown: function()
    {
        consoleService.unregisterListener(Firebug.TraceModule.JSErrorConsoleObserver);

        if (this.consoleWindow && this.consoleWindow.Console)
            this.consoleWindow.Console.unregisterModule(this);
    },

    observe: function(subject, topic, data)
    {
        var m = reDBG.exec(data);
        if (m)
        {
            var prefDomain = "extensions."+m[1];
            this.resetOption(prefDomain, m[2]);
        }
        else
        {
            if (this.debug) FBTrace.sysout("TraceFirebug.panel observe data: "+data+"\n");
        }
    },

    updateOption: function(name, value)
    {
        this.debug = FBTrace.DBG_OPTIONS;
        if (this.debug)
            FBTrace.sysout("TraceFirebug.panel updateOption this.debug="+this.debug+" name:"+name+" value:"+value+"\n");
    },

    resetOption: function(prefDomain, optionName)
    {
        if (!FBTrace)  // we get called in a weird scope
            return;
        try
        {
            FBTrace[optionName] = Firebug.getPref(prefDomain, optionName);
            if (this.debug)
                FBTrace.sysout("tracePanel.resetOption set FBTrace."+optionName+" to "+FBTrace[optionName]+" using prefDomain:"+prefDomain+"\n");
        }
        catch (exc)
        {
            FBTrace.sysout("tracePanel.resetOption "+optionName+" is not an option; not set in defaults/prefs.js?\n");
        }
    },

    watchWindow: function(context, win)
    {
        // Don't call the predecessor
        // Firebug.Console module injects loadFirebugConsole method into the current-page.
        // It shouldn't be done twice.
    },

    initContext: function(context)
    {
        if (this.debug)
            FBTrace.sysout("TraceModule.initContext try sysout\n");
        this.context = context;
    },

    getPanel: function(context, noCreate)
    {
        return context ? context.getPanel("TraceFirebug", noCreate) : this.context.getPanel("TraceFirebug", noCreate);
    },

    showPanel: function(browser, panel)
    {
        if (!panel || panel.name != "TraceFirebug")
            return;

        if (this.debug) FBTrace.sysout("TraceModule showPanel module:\n");
    },

    logInfoOnce: function(obj, context, rep)
    {
        if (!FBTrace.avoidRecursion)
        {
            var noThrottle = true;
            FBTrace.avoidRecursion = true;
            dump(obj);
            Firebug.TraceModule.log(obj, context, "info", rep, noThrottle);
        }
        else
        {
            dump("avoided recursion \n");
        }
        FBTrace.avoidRecursion = false;
    },

    logRow: function(appender, objects, context, className, rep, sourceLink, noThrottle, noRow)
    {
        if (!context)
            context = FirebugContext;
        var panel = this.getPanel(context);
        return panel.append(appender, objects, className, rep, sourceLink, noRow);
    },

    // Support for HTML trace console.
    toggleConsole: function(forceOpen)
    {
        // If console wndow is opened close it.
        this.consoleWindow = windowMediator.getMostRecentWindow("FBTraceConsole");
        if (forceOpen && this.consoleWindow)
        {
            this.consoleWindow.Console.registerModule(this);
            this.consoleWindow.focus();
            return;
        }

        // Make sure hooks are initialized now.
        this.registerHooks(true);

        var self = this;
        var args = {
            traceModule: self,
        };

        this.consoleWindow = window.openDialog(
            "chrome://firebug/content/traceConsole.xul",
            "FBTraceConsole",
            "chrome,resizable,scrollbars=auto,minimizable",
            args);
    },

    onLoadConsole: function(win, rootNode)
    {
        for (var i=0; i<this.listeners.length; i++) {
            if (this.listeners[i].onLoadConsole)
                this.listeners[i].onLoadConsole(win, rootNode);
        }

        this.consoleRoot = MessageTemplate.createTable(rootNode);
        if (this.messages.length == 0)
            return;

        MessageTemplate.dumpMessages(this.messages, this.consoleRoot.firstChild);

        this.messages = [];
    },

    onUnloadConsole: function()
    {
        this.consoleRoot = null;
        this.unregisterHooks();
    },

    // Queue of messages not dumped into the UI yet.
    messages: [],
    table: null,
    consoleWindow: null, // Reference to the console.
    listeners: [],
    hooksInitialized: false,

    // Initialize trace hooks.
    registerHooks: function(forceInit)
    {
        if (this.hooksInitialized)
            return;

        if (!(forceInit || this.isEnabled()))
            return;

        if (typeof FBTrace != "undefined")
        {
            this._sysout = FBTrace.sysout;
            this._dumpProperties = FBTrace.dumpProperties;
            this._dumpStack = FBTrace.dumpStack;

            FBTrace.sysout = this.sysout;
            FBTrace.dumpProperties = this.dumpProperties;
            FBTrace.dumpStack = this.dumpStack;

            this.hooksInitialized = true;
        }
    },

    unregisterHooks: function(forceInit)
    {
        if (!this.hooksInitialized)
            return;

        if (typeof FBTrace != "undefined")
        {
            FBTrace.sysout = this._sysout;
            FBTrace.dumpProperties = this._dumpProperties;
            FBTrace.dumpStack = this._dumpStack;

            this.hooksInitialized = false;
        }
    },

    isEnabled: function()
    {
        return Firebug.getPref(Firebug.prefDomain, "enableTraceConsole");
    },

    // Wrappers for the original FBTrace's functions.
    sysout: function(msg, more, obj)
    {
        if (more) {
            try  {
                msg += " " + more.toString() + "\n";
            } catch (exc) {
            }
        }

        Firebug.TraceModule.dump(new Firebug.TraceModule.TraceMessage("", msg, obj));
    },

    dumpProperties: function(msg, obj)
    {
        Firebug.TraceModule.dump(new Firebug.TraceModule.TraceMessage("", msg, obj));
    },

    dumpStack: function(header)
    {
        Firebug.TraceModule.dump(new Firebug.TraceModule.TraceMessage("", header));
    },

    // Message dump
    dump: function(message)
    {
        for (var i=0; i<this.listeners.length; i++) {
            if (this.listeners[i].onDump)
                this.listeners[i].onDump(message);
        }

        // If the panel isn't visible, push the message into a queue;
        // otherwise dump it directly to the panel.
        if (this.consoleRoot)
            MessageTemplate.dump(message, this.consoleRoot.firstChild);
        else
            this.messages.push(message);
    },

    dumpSeparator: function()
    {
        MessageTemplate.dumpSeparator(Firebug.TraceModule.consoleRoot.firstChild);
    },

    // Listeners
    addListener: function(listener)
    {
        this.listeners.push(listener);
    },

    removeListener: function()
    {
        remove(this.listeners, listener);
    }
});

// ************************************************************************************************
// Trace Panel

Firebug.TracePanel = function() {};
Firebug.TracePanel.prototype = extend(Firebug.ConsolePanel.prototype,
{
    name: "TraceFirebug",
    title: "FBTrace",
    searchable: false,
    editable: false,
    debug: Firebug.TraceModule.DBG_OPTIONS,

    initializeNode: function(myPanelNode)
    {
        if (this.debug) FBTrace.sysout("TracePanel initializeNode\n");
        var options = this.getOptionsMenuItems();

        var numbers_of_columns = 6;
        var number_of_rows = Math.round((options.length / numbers_of_columns));

        for (var i = 0; i < options.length; i++)
        {
            var depth = i % number_of_rows;
            if (depth == 0)
            {
                var optionsColumn = this.document.createElement("div");
                setClass(optionsColumn, "FBTraceColumn");
                myPanelNode.appendChild(optionsColumn);
            }

            var button = this.document.createElement("button");
            setClass(button, "FBTraceOption");
            button.innerHTML = options[i].label;
            setItemIntoElement(button, options[i]);
            optionsColumn.appendChild(button);
            button.addEventListener("click", options[i].command, false);
        }
        prefs.addObserver("extensions", { observe: bind(this.observePrefs, this)}, false);
    },

    observePrefs: function(subject, topic, data)
    {
        var m = reDBG.exec(data);
        if (m)
        {
            this.updateButtons();
        }
    },

    show: function(state)
    {
        this.showToolbarButtons("fbTraceButtons", true);

        if (this.debug)
            FBTrace.sysout("TraceFirebug.panel show context="+this.context+"\n");

        var consoleButtons = this.context.browser.chrome.$("fbConsoleButtons");
        collapse(consoleButtons, false);

        this.updateButtons(state);
        // TODO update options based on state to make tracing per-page
    },

    updateButtons: function()
    {
        var buttons = this.panelNode.getElementsByTagName("button");
        for (var i = 0; i < buttons.length; i++)
        {
            var label = buttons[i].getAttribute("label");
            var prop = "DBG_"+label;
            if (FBTrace.hasOwnProperty(prop))
            {
                var optionOn = FBTrace[prop];
                //FBTrace.sysout("tracePanel.show label: "+label+" optionOn: "+optionOn+"\n");
                buttons[i].setAttribute("checked", optionOn);
            }
        }
    },

    hide: function()
    {
        this.showToolbarButtons("fbTraceButtons", false);

        if (this.debug)
            FBTrace.dumpStack("TraceFirebug.panel hide\n");

        if (this.context && this.context.browser)
        {
            var consoleButtons = this.context.browser.chrome.$("fbConsoleButtons");
            collapse(consoleButtons, true);
        }
    },

    watchWindow: function(win)
    {
        if (this.debug) FBTrace.sysout("TraceFirebug.panel watchWindow\n");
    },

    unwatchWindow: function(win)
    {
        if (this.debug) FBTrace.sysout("TraceFirebug.panel unwatchWindow\n");
        var errorWin = fbs.lastErrorWindow;
        if (errorWin)
            FBTrace.sysout("tracePanel had to clear lastErrorWindow <*><*><*><*>\n");
    },

    updateSelection: function(object)
    {
        if (this.debug) FBTrace.sysout("TraceFirebug.panel updateSelection\n");
    },

    getObjectPath: function(object)
    {
        if (this.debug) FBTrace.sysout("TraceFirebug.panel getObjectPath\n");
        return TabWatcher.contexts;
    },

    getDefaultSelection: function()
    {
        if (this.debug) FBTrace.sysout("TraceFirebug.panel getDefaultSelection\n");
    },

    getOptionsMenuItems: function()
    {
        if (this.debug) FBTrace.sysout("TraceFirebug.panel getOptionsMenuItems for this.context="+this.context+"\n");
        var items = [];
        var self = this;

        for (p in FBTrace)
        {
            var m = p.indexOf("DBG_");
            if (m != -1)
            {
                var label = p.substr(4);
                items.push({
                    label: label,
                    nol10n: true,
                    type: "checkbox",
                    checked: FBTrace[p],
                    command: this.setOption
                });
            }
        }
        return items;
    },

    setOption: function(event)
    {
        var menuitem = event.target;
        var label = menuitem.getAttribute("label");
        var category = 'DBG_'+label;
        FBTrace[category] = !FBTrace[category];
        menuitem.checked = FBTrace[category];

        if (category.indexOf("_FBS_") == -1)
        {
            var prefDomain = Firebug.prefDomain;
            Firebug.setPref(prefDomain, category, FBTrace[category] );
            prefService.savePrefFile(null);
            if (FBTrace.DBG_OPTIONS)
                FBTrace.sysout("tracePanel.setOption: "+prefDomain+"."+category+ " = " + FBTrace[category] + "\n");
        }
        else
        {
            prefs.setBoolPref(Firebug.servicePrefDomain+"."+category, FBTrace[category]);
            prefService.savePrefFile(null);
            if (FBTrace.DBG_OPTIONS)
                FBTrace.sysout("tracePanel.setOption: "+Firebug.servicePrefDomain+"."+category+ " = " + FBTrace[category] + "\n");
        }
    },

    getContextMenuItems: function(object, target)
    {
        if (this.debug) FBTrace.sysout("TraceFirebug.panel getContextMenuItems\n");
    },

    getEditor: function(target, value)
    {
        if (this.debug) FBTrace.sysout("TraceFirebug.panel getEditor\n");
    }
});

// ************************************************************************************************
// Domplate

Firebug.TraceModule.MessageTemplate = domplate(Firebug.Rep,
{
    inspectable: false,

    tableTag:
        TABLE({class: "messageTable", cellpadding: 0, cellspacing: 0},
            TBODY()
        ),

    rowTag:
        TR({class: "messageRow $message|getMessageType",
            _repObject: "$message",
            $exception: "$message|isException",
            onclick: "$onClickRow"},
            TD({class: "messageNameCol messageCol"},
                DIV({class: "messageNameLabel messageLabel"},
                    "$message|getMessageIndex")
            ),
            TD({class: "messageCol"},
                DIV({class: "messageLabel", title: "$message|getMessageLabel"},
                    "$message|getMessageLabel")
            )
        ),

    separatorTag:
        TR({class: "messageRow separatorRow"},
            TD({class: "messageCol", colspan: "2"},
                DIV("$message|getMessageIndex")
            )
        ),

    bodyRow:
        TR({class: "messageInfoRow"},
            TD({class: "messageInfoCol", colspan: 8})
        ),

    bodyTag:
        DIV({class: "messageInfoBody", _repObject: "$message"},
            DIV({class: "messageInfoTabs"},
                A({class: "messageInfoStackTab messageInfoTab", onclick: "$onClickTab",
                    view: "Stack"},
                    "Stack"
                ),
                A({class: "messageInfoExcTab messageInfoTab", onclick: "$onClickTab",
                    view: "Exc",
                    $collapsed: "$message|hideException"},
                    "Exception"
                ),
                A({class: "messageInfoPropsTab messageInfoTab", onclick: "$onClickTab",
                    view: "Props",
                    $collapsed: "$message|hideProperties"},
                    "Properties"
                ),
                A({class: "messageInfoResponseTab messageInfoTab", onclick: "$onClickTab",
                    view: "Response",
                    $collapsed: "$message|hideResponse"},
                    "Response"
                ),
                A({class: "messageInfoSourceTab messageInfoTab", onclick: "$onClickTab",
                    view: "Source",
                    $collapsed: "$message|hideSource"},
                    "Source"
                ),
                A({class: "messageInfoIfacesTab messageInfoTab", onclick: "$onClickTab",
                    view: "Ifaces",
                    $collapsed: "$message|hideInterfaces"},
                    "Interfaces"
                )
            ),
            DIV({class: "messageInfoStackText messageInfoText"},
                TABLE({class: "messageInfoStackTable", cellpadding: 0, cellspacing: 0},
                    TBODY(
                        FOR("stack", "$message|stackIterator",
                            TR(
                                TD({class: "stackFrame"},
                                    A({onclick: "$onClickStackFrame", lineNumber: "$stack.lineNumber"},
                                        "$stack.fileName"),
                                    SPAN("&nbsp;"),
                                    SPAN("(", "$stack.lineNumber", ")")
                                )
                            )
                        )
                    )
                )
            ),
            DIV({class: "messageInfoExcText messageInfoText"}),
            DIV({class: "messageInfoPropsText messageInfoText"}),
            DIV({class: "messageInfoResponseText messageInfoText"},
                "Cache not available."
            ),
            DIV({class: "messageInfoSourceText messageInfoText"}),
            DIV({class: "messageInfoIfacesText messageInfoText"})
        ),

    // Data providers
    getMessageType: function(message)
    {
        return message.getType();
    },

    getMessageIndex: function(message)
    {
        return message.index + 1;
    },

    getMessageLabel: function(message)
    {
        return message.getLabel();
    },

    isException: function(message)
    {
        return message.getException();
    },

    hideProperties: function(message)
    {
        return !message.getProperties();
    },

    hideInterfaces: function(message)
    {
        return !message.getInterfaces();
    },

    hideException: function(message)
    {
        return !message.getException();
    },

    hideResponse: function(message)
    {
        return !(message.obj instanceof Ci.nsIHttpChannel);
    },

    hideSource: function(message)
    {
        return !(message.obj instanceof Ci.nsIHttpChannel);
    },

    // Stack frame support
    stackIterator: function(message)
    {
        return message.getStackArray();
    },

    onClickStackFrame: function(event)
    {
        var winType = "FBTraceConsole-SourceView";
        var url = event.target.innerHTML;
        var lineNumber = event.target.getAttribute("lineNumber");

        openDialog("chrome://global/content/viewSource.xul",
            winType, "all,dialog=no",
            event.target.innerHTML, null, null, lineNumber, false);
    },

    // Firebug rep support
    supportsObject: function(message)
    {
        return message instanceof Firebug.TraceModule.TraceMessage;
    },

    browseObject: function(message, context)
    {
        return false;
    },

    getRealObject: function(message, context)
    {
        return message;
    },

    // Context menu
    getContextMenuItems: function(message, target, context)
    {
        return [];
    },

    // Implementation
    createTable: function(parentNode)
    {
        return HelperDomplate.replace(this.tableTag, {}, parentNode, this);
    },

    dump: function(message, parentNode)
    {
        var panelNode = parentNode.parentNode.parentNode;
        var scrolledToBottom = isScrolledToBottom(panelNode);

        // Set message index
        message.index = parentNode.childNodes.length;

        // Insert log into the console.
        var row = HelperDomplate.insertRows(this.rowTag, {message: message},
            parentNode, this)[0];

        message.row = row;

        // Only if the manifest uses useNativeWrappers=no.
        // The row in embedded frame, which uses type="content-primary", from some
        // reason, this conten type changes wrapper around the row, so let's set
        // directly thte wrappedJSObject here, so row-expand works.
        if (row.wrappedJSObject)
            row.wrappedJSObject.repObject = message;

        if (scrolledToBottom)
            scrollToBottom(panelNode);
    },

    dumpSeparator: function(parentNode)
    {
        var panelNode = parentNode.parentNode.parentNode;
        var scrolledToBottom = isScrolledToBottom(panelNode);

        var fakeMessage = {};
        fakeMessage.index = parentNode.childNodes.length;

        var row = HelperDomplate.insertRows(this.separatorTag, {message: fakeMessage},
            parentNode, this)[0];

        if (scrolledToBottom)
            scrollToBottom(panelNode);

        panelNode.scrollTop = panelNode.scrollHeight - panelNode.offsetHeight + 50;
    },

    dumpMessages: function(messages, parentNode)
    {
        for (var i=0; i<messages.length; ++i)
            this.dump(messages[i], parentNode);
    },

    // Body of the message.
    onClickRow: function(event)
    {
        if (isLeftClick(event))
        {
            var row = getAncestorByClass(event.target, "messageRow");
            if (row)
            {
                this.toggleRow(row);
                cancelEvent(event);
            }
        }
    },

    toggleRow: function(row, forceOpen)
    {
        var opened = hasClass(row, "opened");
        if (opened && forceOpen)
            return;

        toggleClass(row, "opened");

        if (hasClass(row, "opened"))
        {
            var message = row.repObject;
            if (!message && row.wrappedJSObject)
                message = row.wrappedJSObject.repObject;

            var bodyRow = HelperDomplate.insertRows(this.bodyRow, {}, row)[0];
            var messageInfo = HelperDomplate.replace(this.bodyTag,
                {message: message}, bodyRow.firstChild);
            message.bodyRow = bodyRow;


            this.selectTabByName(messageInfo, "Stack");
        }
        else
        {
            row.parentNode.removeChild(row.nextSibling);
        }
    },

    selectTabByName: function(messageInfoBody, tabName)
    {
        var tab = getChildByClass(messageInfoBody, "messageInfoTabs",
            "messageInfo" + tabName + "Tab");
        if (tab)
            this.selectTab(tab);
    },

    onClickTab: function(event)
    {
        this.selectTab(event.currentTarget);
    },

    selectTab: function(tab)
    {
        var messageInfoBody = tab.parentNode.parentNode;

        var view = tab.getAttribute("view");
        if (messageInfoBody.selectedTab)
        {
            messageInfoBody.selectedTab.removeAttribute("selected");
            messageInfoBody.selectedText.removeAttribute("selected");
        }

        var textBodyName = "messageInfo" + view + "Text";

        messageInfoBody.selectedTab = tab;
        messageInfoBody.selectedText = getChildByClass(messageInfoBody, textBodyName);

        messageInfoBody.selectedTab.setAttribute("selected", "true");
        messageInfoBody.selectedText.setAttribute("selected", "true");

        var message = Firebug.getRepObject(messageInfoBody);

        this.updateInfo(messageInfoBody, view, message);
    },

    updateInfo: function(messageInfoBody, view, message)
    {
        var tab = messageInfoBody.selectedTab;
        if (hasClass(tab, "messageInfoStackTab"))
        {
            // The content is generated by domplate template.
        }
        else if (hasClass(tab, "messageInfoPropsTab"))
        {
            this.updateInfoImpl(messageInfoBody, view, message, message.getProperties);
        }
        else if (hasClass(tab, "messageInfoIfacesTab"))
        {
            this.updateInfoImpl(messageInfoBody, view, message, message.getInterfaces);
        }
        else if (hasClass(tab, "messageInfoExcTab"))
        {
            this.updateInfoImpl(messageInfoBody, view, message, message.getException);
        }
        else if (hasClass(tab, "messageInfoResponseTab"))
        {
            this.updateInfoImpl(messageInfoBody, view, message, message.getResponse);
        }
        else if (hasClass(tab, "messageInfoSourceTab"))
        {
            this.updateInfoImpl(messageInfoBody, view, message, message.getResponse,
                function (valueBox, text) {
                    if (text)
                        insertWrappedText(text, valueBox);
                });
        }
    },

    updateInfoImpl: function(messageInfoBody, view, message, getter, setter)
    {
        var valueBox = getChildByClass(messageInfoBody, "messageInfo" + view + "Text");
        if (!valueBox.valuePresented)
        {
            var text = getter.apply(message);
            if (typeof(text) != "undefined")
            {
                valueBox.valuePresented = true;

                if (setter)
                    setter(valueBox, text);
                else
                    valueBox.innerHTML = text;
            }
        }
    }
});

// ************************************************************************************************
// Helper Domplate object that doesn't trace.

var HelperDomplate = (function()
{
    // Private helper function.
    function execute()
    {
        var args = cloneArray(arguments), fn = args.shift(), object = args.shift();

        // Make sure the original Domplate is *not* tracing for now.
        if (typeof FBTrace != "undefined") {
            var dumpDOM = FBTrace.DBG_DOM;
            FBTrace.DBG_DOM = false;
        }

        var retValue = fn.apply(object, args);

        if (typeof FBTrace != "undefined")
            FBTrace.DBG_DOM = dumpDOM;

        return retValue;
    }

    return {
        insertRows: function(tag, args, parentNode, self)
        {
            return execute(tag.insertRows, tag, args, parentNode, self);
        },

        replace: function(tag, args, parentNode, self)
        {
            return execute(tag.replace, tag, args, parentNode, self);
        }
   }
}());

var MessageTemplate = Firebug.TraceModule.MessageTemplate;

// ************************************************************************************************
// Trace Messate Object

Firebug.TraceModule.TraceMessage = function(type, text, obj)
{
    this.type = type;
    this.text = text;
    this.obj = obj;
    this.stack = [];

    if (this.obj instanceof Ci.nsIScriptError)
    {
        // Put info about the script error location into the stack.
        this.stack.push({fileName:this.obj.sourceName, lineNumber:this.obj.lineNumber});
    }
    else
    {
        // Initialize stack trace info. This must be done now, when the stack
        // is available.
        for (var frame = Components.stack, i=0; frame; frame = frame.caller, i++)
        {
            // Skip first two frames (this code).
            if (i < 2)
                continue;

            var fileName = unescape(frame.filename ? frame.filename : "");
            var sourceLine = frame.sourceLine ? frame.sourceLine : "";
            var lineNumber = frame.lineNumber ? frame.lineNumber : "";
            this.stack.push({fileName:fileName, lineNumber:lineNumber});
        }
    }

    if (this.obj instanceof Ci.nsIHttpChannel)
    {
        //firebug.netModule.getHttpHeaders(this.obj, this);
    }

    if (this.obj instanceof Ci.nsICachingChannel)
    {
        try
        {
            var cacheToken = this.obj.cacheToken;
            if (cacheToken instanceof Ci.nsICacheEntryDescriptor)
            {
                this.cacheClient = cacheToken.clientID;
                this.cacheKey = cacheToken.key;
            }
        }
        catch (e)
        {
        }
    }
}

// ************************************************************************************************

Firebug.TraceModule.TraceMessage.prototype =
{
    reXPConnect: /\[xpconnect wrapped ([^\]]*)\]/,

    getType: function()
    {
        return this.type;
    },

    getLabel: function()
    {
        var text = this.text;
        return cropString(text, 400);
    },

    getStackArray: function()
    {
        return this.stack;
    },

    getProperties: function()
    {
        if (this.props)
            return this.props;

        this.props = "";

        if (this.obj instanceof Array)
        {
            if (this.obj.length)
            {
                for (var p=0; p<this.obj.length; p++)
                {
                    try
                    {
                        this.props += "[" + p + "] = " + this.obj[p] + EOF;
                    }
                    catch (e)
                    {
                        alert(e);
                    }
                }
            }
            else
            {
                for (var p in this.obj)
                {
                    try
                    {
                        this.props += "[" + p + "] = ";

                        this.props += "{";
                        var subobj = this.obj[p];
                        for (var p1 in subobj)
                            this.props += "'" + p1 + "': " + subobj[p1] + ", ";
                        this.props += "}" + EOF;
                    }
                    catch (e)
                    {
                        alert(e);
                    }
                }
            }
        }
        else if (typeof(this.obj) == 'string')
        {
            this.props = this.obj + EOF;
        }
        else
        {
            var propsTotal = 0;
            for (var p in this.obj)
            {
                propsTotal++;
                try
                {
                    var pAsString = p + "";
                    var m = this.reXPConnect.exec(pAsString);
                    if (m)
                    {
                        var kind = m[1];
                        if (!this.obj[p] instanceof Ci[kind])
                        {
                            var xpobj = this.obj[p].wrappedJSObject;
                            this.props += "[" + p + "] = " + xpobj + EOF;
                        }
                    }
                    this.props += "[" + p + "] = " + this.obj[p] + EOF;
                }
                catch (e)
                {
                }
            }
        }

        return this.props;
    },

    getInterfaces: function()
    {
        if (this.ifaces)
            return this.ifaces;

        this.ifaces = "";
        for (iface in Components.interfaces)
        {
            if (this.obj instanceof Components.interfaces[iface]) {
                for (p in Components.interfaces[iface])
                    this.ifaces += "[" + iface + "." + p + "]=" + this.obj[p] + EOF;
            }
        }

        return this.ifaces;
    },

    getResponse: function()
    {
        try
        {
            var self = this;
            TabWatcher.iterateContexts(function(context) {
                var url = self.obj.originalURI.spec;
                result = context.sourceCache.loadText(url);
                if (result)
                    throw "OK"; // Break the cycle if the response is there.
            });
        }
        catch (err)
        {
        }

        return result;
    },

    getException: function()
    {
        if (this.err)
            return this.err;

        this.err = "";

        if (this.obj && this.obj.message)
            return this.obj.message;

        // xxxJJB: this isn't needed, instanceof does QI. try {this.obj = this.obj.QueryInterface(Ci.nsIException);} catch (err){}
        if (!this.obj)
            return null;

        if (this.obj instanceof Error || this.obj instanceof Ci.nsIException)
        {
            try
            {
                this.err += "<span class='ExceptionMessage'>" + this.obj.message + "</span>" + EOF;
                this.err += this.obj.name + EOF;
                this.err += this.obj.fileName + "(" + this.obj.lineNumber+ ")" + EOF;
            }
            catch (err)
            {
                alert(e);
            }
        }

        return this.err;
    }
}

// ************************************************************************************************
// Javascript Error Console observer

Firebug.TraceModule.JSErrorConsoleObserver =
{
    observe: function(object)
    {
        try
        {
            if (object.message.indexOf("[JavaScript Error:") == 0)
            {
                object = object.QueryInterface(Ci.nsIScriptError);
                var message = "JavaScript Error: " + object.errorMessage;
                Firebug.TraceModule.dumpProperties(message, object);
            }
        }
        catch (exc)
        {
        }
    },

    QueryInterface: function(iid)
    {
        if (iid.equals(Ci.nsISupports) ||
            iid.equals(Ci.nsIConsoleListener))
            return this;

        throw NS_ERROR_NO_INTERFACE;
    }
}

// ************************************************************************************************
// Registration

Firebug.TraceModule.injectOptions();
Firebug.TraceModule.registerHooks(false);
Firebug.registerModule(Firebug.TraceModule);
Firebug.registerPanel(Firebug.TracePanel);
Firebug.registerRep(Firebug.TraceModule.MessageTemplate);

// ************************************************************************************************

}});
