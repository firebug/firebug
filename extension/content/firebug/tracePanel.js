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
const clipboard = CCSV("@mozilla.org/widget/clipboard;1", "nsIClipboard");
const traceService = CCSV("@joehewitt.com/firebug-trace-service;1", "nsIObserverService");

const reDBG = /extensions\.([^\.]*)\.(DBG_.*)/;
const reDBG_FBS = /DBG_FBS_(.*)/;
const reSplitLines = /\r\n|\r|\n/;

var EOF = "<br/>";

this.namespaceName = "TracePanel";

// ***********************************************************************************
// Trace Module

Firebug.TraceModule = extend(Firebug.Module,
{
    initialize: function(prefDomain, prefNames)
    {
        // Localize "Open Console" toolbar button.
        FBL.internationalize("fbTraceOpenConsole", "label");
        FBL.internationalize("fbTraceOpenConsole", "tooltiptext");

        // If the trace-console window is already opened, attach to it.
        if (!this.attachConsole())
        {
            // If the window isn't opened, open it automatically if it's allowed.
            if (this.isEnabled())
                this.openConsole();
        }

        if (FBTrace.DBG_OPTIONS)
            FBTrace.sysout("TraceModule.initialize prefDomain="+ prefDomain+"\n");

        traceService.addObserver(this, "firebug-trace-on-message", false);
        consoleService.registerListener(this.JSErrorConsoleObserver);
    },

    shutdown: function()
    {
        traceService.removeObserver(this, "firebug-trace-on-message");
        consoleService.unregisterListener(this.JSErrorConsoleObserver);

        if (this.consoleWindow && this.consoleWindow.Console)
            this.consoleWindow.Console.unregisterModule(this);
    },

    isEnabled: function()
    {
        return Firebug.getPref(Firebug.prefDomain, "enableTraceConsole");
    },

    initContext: function(context)
    {
        if (FBTrace.DBG_OPTIONS)
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

        if (FBTrace.DBG_OPTIONS) 
            FBTrace.sysout("TraceModule showPanel module:\n");
    },

    // HTML trace console.
    openConsole: function()
    {
        // Try to connect an existing trace-console window first.
        if (this.attachConsole())
            return;

        var self = this;
        var args = {
            FBL: FBL,
            Firebug: Firebug,
            traceModule: self,
        };

        this.consoleWindow = window.openDialog(
            "chrome://firebug/content/traceConsole.xul",
            "FBTraceConsole",
            "chrome,resizable,scrollbars=auto,minimizable",
            args);
    },

    attachConsole: function()
    {
        // Already attached.
        if (this.consoleRoot)
            return true;

        // If the trace-console window is already opened, attach it.
        this.consoleWindow = windowMediator.getMostRecentWindow("FBTraceConsole");
        if (this.consoleWindow)
        {
            this.consoleWindow.Console.registerModule(this);
            this.consoleWindow.focus();
            return true;
        }

        return false;
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
    },
    
    // nsIObserver
    observe: function(subject, topic, data)
    {
        if (topic == "firebug-trace-on-message")
            this.dump(new Firebug.TraceModule.TraceMessage("", data, subject.wrappedJSObject));
    },

    messages: [],        // Queue of messages not dumped into the UI yet.
    table: null,         // Table element with all logs (rows) in the console window.
    consoleWindow: null, // Reference to the console.
    listeners: [],       // Listeners for customizing the Console window.

    // Message dump
    dump: function(message)
    {
        for (var i=0; i<this.listeners.length; i++) {
            if (this.listeners[i].onDump)
                this.listeners[i].onDump(message);
        }

        var index = message.text.indexOf("ERROR");
        if (index != -1)
            message.type = "DBG_ERROR";

        index = message.text.indexOf("EXCEPTION");
        if (index != -1)
            message.type = "DBG_ERROR";

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

    initializeNode: function(myPanelNode)
    {
        if (FBTrace.DBG_OPTIONS) FBTrace.sysout("TracePanel initializeNode\n");
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
            button.setAttribute("id", options[i].pref);
            button.removeAttribute("type");
            optionsColumn.appendChild(button);
            button.addEventListener("click", options[i].command, false);
        }
        prefs.addObserver("extensions", { observe: bind(this.observePrefs, this)}, false);
    },

    observePrefs: function(subject, topic, data)
    {
        if ((data.indexOf("extensions.firebug.DBG_") != -1) ||
            (data.indexOf("extensions.firebug-service.DBG_") != -1))
        {
            // Update UI after timeout so, FBTrace object is already updated.
            var self = this;
            setTimeout(function() { self.updateButton(data); }, 100);
        }
    },

    show: function(state)
    {
        this.showToolbarButtons("fbTraceButtons", true);

        if (FBTrace.DBG_OPTIONS)
            FBTrace.sysout("TraceFirebug.panel show context="+this.context+"\n");

        var consoleButtons = this.context.browser.chrome.$("fbConsoleButtons");
        collapse(consoleButtons, false);
    },

    updateButton: function(data)
    {
        var optionName = data.substr(data.lastIndexOf(".")+1);
        var button = this.panelNode.ownerDocument.getElementById(optionName);
        if (button)
            button.setAttribute("checked", FBTrace[optionName]);
    },

    hide: function()
    {
        this.showToolbarButtons("fbTraceButtons", false);

        if (FBTrace.DBG_OPTIONS)
            FBTrace.dumpStack("TraceFirebug.panel hide\n");

        if (this.context && this.context.browser)
        {
            var consoleButtons = this.context.browser.chrome.$("fbConsoleButtons");
            collapse(consoleButtons, true);
        }
    },

    watchWindow: function(win)
    {
        if (FBTrace.DBG_OPTIONS) FBTrace.sysout("TraceFirebug.panel watchWindow\n");
    },

    unwatchWindow: function(win)
    {
        if (FBTrace.DBG_OPTIONS) FBTrace.sysout("TraceFirebug.panel unwatchWindow\n");
        var errorWin = fbs.lastErrorWindow;
        if (errorWin)
            FBTrace.sysout("tracePanel had to clear lastErrorWindow <*><*><*><*>\n");
    },

    updateSelection: function(object)
    {
        if (FBTrace.DBG_OPTIONS) FBTrace.sysout("TraceFirebug.panel updateSelection\n");
    },

    getObjectPath: function(object)
    {
        if (FBTrace.DBG_OPTIONS) FBTrace.sysout("TraceFirebug.panel getObjectPath\n");
        return TabWatcher.contexts;
    },

    getDefaultSelection: function()
    {
        if (FBTrace.DBG_OPTIONS) FBTrace.sysout("TraceFirebug.panel getDefaultSelection\n");
    },

    getOptionsMenuItems: function()
    {
        if (FBTrace.DBG_OPTIONS) FBTrace.sysout("TraceFirebug.panel getOptionsMenuItems for this.context="+this.context+"\n");
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
                    pref: p,
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
        if (FBTrace.DBG_OPTIONS) 
            FBTrace.sysout("TraceFirebug.panel getContextMenuItems\n");
    },

    getEditor: function(target, value)
    {
        if (FBTrace.DBG_OPTIONS) 
            FBTrace.sysout("TraceFirebug.panel getEditor\n");
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
                DIV({class: "messageLabel", title: "$message|getMessageTitle"},
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
                ),
                A({class: "messageInfoTypesTab messageInfoTab", onclick: "$onClickTab",
                    view: "Types",
                    $collapsed: "$message|hideTypes"},
                    "Types"
                ),
                A({class: "messageInfoEventTab messageInfoTab", onclick: "$onClickTab",
                    view: "Event",
                    $collapsed: "$message|hideEvent"},
                    "Event"
                )
            ),
            DIV({class: "messageInfoStackText messageInfoText"},
                TABLE({class: "messageInfoStackTable", cellpadding: 0, cellspacing: 0},
                    TBODY(
                        FOR("stack", "$message|stackIterator",
                            TR(
                                TD({class: "stackFrame"},
                                    A({class: "stackFrameLink", onclick: "$onClickStackFrame", 
                                        lineNumber: "$stack.lineNumber"},
                                        "$stack.fileName"),
                                    SPAN("&nbsp;"),
                                    SPAN("(", "$stack.lineNumber", ")"),
                                    SPAN("&nbsp;"),
                                    A({class: "openDebugger", onclick: "$onOpenDebugger", 
                                        lineNumber: "$stack.lineNumber",
                                        fileName: "$stack.fileName"}, 
                                        "[...]")
                                )
                            )
                        )
                    )
                )
            ),
            DIV({class: "messageInfoExcText messageInfoText"}),
            DIV({class: "messageInfoPropsText messageInfoText"}),
            DIV({class: "messageInfoResponseText messageInfoText"},
                IFRAME({class: "messageInfoResponseFrame"})
            ),
            DIV({class: "messageInfoSourceText messageInfoText"}),
            DIV({class: "messageInfoIfacesText messageInfoText"}),
            DIV({class: "messageInfoTypesText messageInfoText"}),
            DIV({class: "messageInfoEventText messageInfoText"})
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
        // xxxHonza: should be parametrized in preferences.
        return cropString(message.getLabel(), 150);
    },

    getMessageTitle: function(message) 
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

    hideTypes: function(message)
    {
        return !message.getTypes();
    },

    hideEvent: function(message)
    {
        return !message.getEvent();
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

    onOpenDebugger: function(event)
    {
        var target = event.target;
        var lineNumber = target.getAttribute("lineNumber");
        var fileName = target.getAttribute("fileName");

        if (typeof(ChromeBugOpener) == "undefined")
            return;

        // Open Chromebug window.
        var cbWindow = ChromeBugOpener.openNow();
        FBTrace.dumpProperties("Chromebug window has been opened", cbWindow);

        // xxxHonza: Open Chromebug with the source code file, scrolled automatically
        // to the specified line number. Currently chrome bug doesn't return the window
        // from ChromeBugOpener.openNow method. If it would be following code opens
        // the source code file and scrolls to the given line.

        // Register onLoad listener and open the source file at the specified line.
        if (cbWindow) {
            cbWindow.addEventListener("load", function() {
                var context = cbWindow.FirebugContext;
                var link = new cbWindow.FBL.SourceLink(fileName, lineNumber, "js");
                context.chrome.select(link, "script");
            }, true);
        }
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
        var items = [];

        items.push({
          label: "Cut",
          nol10n: true,
          command: bindFixed(this.onCut, this, message)
        });

        items.push({
          label: "Copy",
          nol10n: true,
          command: bindFixed(this.onCopy, this, message)
        });

        items.push("-");

        items.push({
          label: "Remove",
          nol10n: true,
          command: bindFixed(this.onRemove, this, message)
        });

        return items;
    },

    getTooltip: function(message)
    {
        return message.text;
    },

    // Context menu commands
    onCut: function(message)
    {
        this.onCopy(message);
        this.onRemove(message);
    },
    
    onCopy: function(message)
    {
        message.copyToClipboard();
    },

    onRemove: function(message)
    {
        var parentNode = message.row.parentNode;
        parentNode.removeChild(message.row);
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
        else if (hasClass(tab, "messageInfoTypesTab"))
        {
            this.updateInfoImpl(messageInfoBody, view, message, message.getTypes);
        }
        else if (hasClass(tab, "messageInfoEventTab"))
        {
            this.updateInfoImpl(messageInfoBody, view, message, message.getEvent);
        }
        else if (hasClass(tab, "messageInfoExcTab"))
        {
            this.updateInfoImpl(messageInfoBody, view, message, message.getException);
        }
        else if (hasClass(tab, "messageInfoResponseTab"))
        {
            this.updateInfoImpl(messageInfoBody, view, message, message.getResponse,
                function (valueBox, text) {
                    var iframe = getChildByClass(valueBox, "messageInfoResponseFrame");
                    iframe.contentWindow.document.body.innerHTML = text;
                });
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
            // Skip first three frames (this code).
            if (i < 6)
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

    // Get snapshot of all properties now, as they can be changed.
    this.getProperties();
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
        else if (this.obj instanceof Ci.jsdIValue)
        {
            var listValue = {value: null}, lengthValue = {value: 0};
            this.obj.getProperties(listValue, lengthValue);
            for (var i = 0; i < lengthValue.value; ++i)
            {
                var prop = listValue.value[i];
                try {
                    var name = prop.name.getWrappedValue();
                    this.props += "[" + name + "] = " + prop.value.getWrappedValue() + EOF;
                } catch (e) {
                    alert(e);
                }
            }
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
        var result = null;
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
    },
     
    getTypes: function()
    {
        if (this.types)
            return this.types;

        this.types = "";

        try {
            var obj = this.obj;
            while (obj)
            {
                this.types += "typeof = " + typeof(obj) + EOF;
                if (obj)
                    this.types += "    constructor = " + obj.constructor + EOF; 

                obj = obj.prototype;
            }
        }
        catch (e)
        {
            alert(e);
        }

        return this.types;
    },

    getEvent: function()
    {
        if (!(this.obj instanceof Event))
            return;

        if (this.eventInfo)
            return this.eventInfo;

        this.eventInfo = "";

        try
        {
            if (this.obj.eventPhase == this.obj.AT_TARGET)
                this.eventInfo += " at target ";
            else if (this.obj.eventPhase == this.obj.BUBBLING_PHASE)
                this.eventInfo += " bubbling phase ";
            else
                this.eventInfo += " capturing phase ";

            if (this.obj.relatedTarget)
                this.eventInfo += this.obj.relatedTarget.tagName + "->";

            if (this.obj.currentTarget)
            {
                if (this.obj.currentTarget.tagName)
                    this.eventInfo += this.obj.currentTarget.tagName + "->";
                else
                    this.eventInfo += this.obj.currentTarget.nodeName + "->";
            }

            this.eventInfo += this.obj.target.tagName;
        }
        catch (err)
        {
            alert(err);
        }

        return this.eventInfo;
    },

    copyToClipboard: function()
    {
        if (!this.text)
            return;

        // Initialize transfer data.
        var trans = CCIN("@mozilla.org/widget/transferable;1", "nsITransferable");
        var wrapper = CCIN("@mozilla.org/supports-string;1", "nsISupportsString");
        wrapper.data = this.text;
        trans.addDataFlavor("text/unicode");
        trans.setTransferData("text/unicode", wrapper, this.text.length * 2);

        // Set the data into the global clipboard
        clipboard.setData(trans, null, Ci.nsIClipboard.kGlobalClipboard);
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
                // Log only chrome script errors.
                object = object.QueryInterface(Ci.nsIScriptError);
                if (object.sourceName && !object.sourceName.indexOf("chrome:"))
                {
                    var message = "JavaScript Error: " + object.errorMessage;
                    Firebug.TraceModule.dump(
                        new Firebug.TraceModule.TraceMessage("", message, object));
                }
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

Firebug.registerModule(Firebug.TraceModule);
Firebug.registerPanel(Firebug.TracePanel);
Firebug.registerRep(Firebug.TraceModule.MessageTemplate);

// ************************************************************************************************

}});
