/* See license.txt for terms of usage */

/**
 * UI control of debug Logging for Firebug internals
 */
FBL.ns(function() { with (FBL) {

// ***********************************************************************************
// Shorcuts and Services

const Cc = Components.classes;
const Ci = Components.interfaces;

const clipboard = CCSV("@mozilla.org/widget/clipboard;1", "nsIClipboard");

const PrefService = Cc["@mozilla.org/preferences-service;1"];
const prefs = PrefService.getService(Ci.nsIPrefBranch2);
const prefService = PrefService.getService(Ci.nsIPrefService);

const reDBG = /extensions\.([^\.]*)\.(DBG_.*)/;
const reDBG_FBS = /DBG_FBS_(.*)/;

var EOF = "<br/>";

// Register locale file with strings for the Tracing Console window.
Firebug.registerStringBundle("chrome://firebug/locale/firebug-tracing.properties");

//************************************************************************************************
//  The controller for the prefDomain Model.
//  getOptionsMenuItems to create View, onPrefChangeHandler for View update
//  base for trace viewers like tracePanel and traceConsole
//  binds  to the branch 'prefDomain' of prefs

Firebug.TraceOptionsController = function(prefDomain, onPrefChangeHandler)
{
    this.prefDomain = prefDomain;

    this.traceService = Cc["@joehewitt.com/firebug-trace-service;1"]
        .getService(Ci.nsISupports).wrappedJSObject;

    this.addObserver = function()
    {
        prefs.setBoolPref("browser.dom.window.dump.enabled", true);
        this.observer = { observe: bind(this.observe, this) };
        prefs.addObserver(prefDomain, this.observer, false);
    };

    this.removeObserver = function()
    {
        prefs.removeObserver( prefDomain, this.observer, false);
    };

    // nsIObserver
    this.observe = function(subject, topic, data)
    {
        if (topic == "nsPref:changed")
        {
            var m = reDBG.exec(data);
            if (m)
            {
                var changedPrefDomain = "extensions." + m[1];
                if (changedPrefDomain == prefDomain)
                {
                    var optionName = data.substr(prefDomain.length+1); // skip dot
                    var optionValue = Firebug.getPref(prefDomain, m[2]);
                    if (this.prefEventToUserEvent)
                        this.prefEventToUserEvent(optionName, optionValue);
                }
            }
            else
            {
                if (FBTrace.DBG_OPTIONS)
                    FBTrace.sysout("traceModule.observe : "+data+"\n");
            }
        }
    };

//*************** UI ***************************************************************

    this.getOptionsMenuItems = function()  // Firebug menu items from option map
    {
        var optionMap = this.traceService.getTracer(prefDomain);
        var items = [];
        for (var p in optionMap)
        {
            var m = p.indexOf("DBG_");
            if (m != 0)
                continue;

            try
            {
                var prefValue = Firebug.getPref(this.prefDomain, p);
                var label = p.substr(4);
                items.push({
                 label: label,
                 nol10n: true,
                 type: "checkbox",
                 checked: prefValue,
                 pref: p,
                 command: bind(this.userEventToPrefEvent, this)
                });
            }
            catch (err)
            {
                if (FBTrace.DBG_ERRORS)
                    FBTrace.sysout("traceModule.getOptionsMenuItems could not create item for "+p+" in prefDomain "+this.prefDomain);
                // if the option doesn't exist in this prefDomain, just continue...
            }
        }

        items.sort(function(a, b) {
            return a.label > b.label;
        });

        return items;
    };

    this.userEventToPrefEvent = function(event)  // use as an event listener on UI control
    {
        var menuitem = event.target.wrappedJSObject;
        if (!menuitem)
            menuitem = event.target;

        var label = menuitem.getAttribute("label");
        var category = 'DBG_'+label;
        var value = Firebug.getPref(this.prefDomain, category);
        var newValue = !value;

        Firebug.setPref(this.prefDomain, category, newValue);
        prefService.savePrefFile(null);

        if (FBTrace.DBG_OPTIONS)
            FBTrace.sysout("traceConsole.setOption: new value "+ this.prefDomain+"."+category+ " = " + newValue, menuitem);
    };

    if (onPrefChangeHandler)
        this.prefEventToUserEvent = onPrefChangeHandler;
    else
    {
        this.prefEventToUserEvent = function(optionName, optionValue)
        {
            FBTrace.sysout("TraceOptionsController owner needs to implement prefEventToUser Event", {name: optionName, value: optionValue});
        };
    }

    this.clearOptions = function()
    {
        var optionMap = this.traceService.getTracer(prefDomain);
        var items = [];
        for (var p in optionMap)
        {
            var m = p.indexOf("DBG_");
            if (m != 0)
                continue;

            Firebug.setPref(this.prefDomain, p, false);
        }
        prefService.savePrefFile(null);
    };

};

// ***********************************************************************************
// Trace Module

Firebug.TraceModule = extend(Firebug.Module,
{
    dispatchName: "traceModule",

    initialize: function(prefDomain, prefNames)  // prefDomain is the calling app, firebug or chromebug
    {
        Firebug.Module.initialize.apply(this, arguments);

        FBTrace.DBG_OPTIONS = Firebug.getPref(prefDomain, "DBG_OPTIONS");

        this.prefDomain = prefDomain;

        // Open console automatically if the pref says so.
        if (Firebug.getPref(this.prefDomain, "alwaysOpenTraceConsole"))
            this.openConsole();

        if (FBTrace.DBG_OPTIONS)
            FBTrace.sysout("traceModule.initialize: " + prefDomain+" alwayOpen:"+Firebug.getPref(this.prefDomain, "alwaysOpenTraceConsole"));
    },

    internationalizeUI: function(doc)
    {
        var elements = ["FirebugMenu_Options_alwaysOpenTraceConsole", "menu_openTraceConsole"];
        for (var i=0; i<elements.length; i++)
        {
            var element = doc.getElementById(elements[i]);
            if (element)
                FBL.internationalize(element, "label");
        }
    },

    shutdown: function()
    {
        if (this.consoleWindow && this.consoleWindow.TraceConsole)
            this.consoleWindow.TraceConsole.unregisterModule(this);
    },

    reattachContext: function(browser, context)
    {
        if (FBTrace.DBG_OPTIONS)
            FBTrace.sysout("traceModule.reattachContext for: " +
                context ? context.getName() : "null context",
                [browser, context]);
    },

    openConsole: function(prefDomain, windowURL)
    {
        if (!prefDomain)
            prefDomain = this.prefDomain;

        var self = this;
        iterateBrowserWindows("FBTraceConsole", function(win) {
            if (win.TraceConsole.prefDomain == prefDomain) {
                self.consoleWindow = win;
                return true;
            }
        });

        // Try to connect an existing trace-console window first.
        if (this.consoleWindow && this.consoleWindow.TraceConsole) {
            this.consoleWindow.TraceConsole.registerModule(this);
            this.consoleWindow.focus();
            return;
        }

        if (!windowURL)
            windowURL = "chrome://firebug/content/traceConsole.xul";

        if (FBTrace.DBG_OPTIONS)
            FBTrace.sysout("traceModule.openConsole, prefDomain: " + prefDomain);

        var self = this;
        var args = {
            FBL: FBL,
            Firebug: Firebug,
            traceModule: self,
            prefDomain: prefDomain,
        };

        if (FBTrace.DBG_OPTIONS) {
            for (var p in args)
                FBTrace.sysout("tracePanel.openConsole prefDomain:" +
                    prefDomain +" args["+p+"]= "+ args[p]+"\n");
        }

        this.consoleWindow = window.openDialog(
            windowURL,
            "FBTraceConsole." + prefDomain,
            "chrome,resizable,scrollbars=auto,minimizable,dialog=no",
            args);
    },

    // Trace console listeners
    onLoadConsole: function(win, rootNode)
    {
        dispatch(this.fbListeners, "onLoadConsole", [win, rootNode]);
    },

    onUnloadConsole: function(win)
    {
        dispatch(this.fbListeners, "onUnloadConsole", [win]);
    },

    onDump: function(message)
    {
        dispatch(this.fbListeners, "onDump", [message]);
    },

    dump: function(message, outputNodes)
    {
        // xxxHonza: find better solution for checking an ERROR messages
        // (setup some rules).
        var text = message.text;
        if (text && (text.indexOf("ERROR") != -1 ||
            text.indexOf("EXCEPTION") != -1 ||
            text.indexOf("FAILS") != -1))
        {
            message.type = "DBG_ERRORS";
        }

        Firebug.TraceModule.MessageTemplate.dump(message, outputNodes);
    },
});

Firebug.TraceModule.CommonBaseUI = {

    destroy: function()
    {
        this.optionsController.removeObserver();
    },

    initializeContent: function(parentNode, outputNodes, prefDomain, callback)
    {
        var doc = parentNode.ownerDocument;

        // Create basic layout for trace console content.
        var rep = Firebug.TraceModule.PanelTemplate;
        rep.tag.replace({}, parentNode, rep);

        // This IFRAME is the container for all logs.
        var logTabIframe = parentNode.getElementsByClassName("traceInfoLogsFrame").item(0);
        var self = this;
        logTabIframe.addEventListener("load", function(event)
        {
            var frameDoc = logTabIframe.contentWindow.document;

            addStyleSheet(frameDoc, createStyleSheet(frameDoc, "chrome://firebug/skin/panelbase.css"));
            addStyleSheet(frameDoc, createStyleSheet(frameDoc, "chrome://firebug/skin/traceConsole.css"));

            var rootNode = frameDoc.getElementById("traceLogContent");
            outputNodes.setScrollingNode(rootNode);

            var logNode = Firebug.TraceModule.MessageTemplate.createTable(rootNode);

            function recalcLayout() {
               logTabIframe.style.height = (doc.defaultView.innerHeight - 25) + "px";
            }

            doc.defaultView.addEventListener("resize", function(event) {
               recalcLayout();
            }, true);

            recalcLayout();

            callback(logNode);
        }, true);

        // Initialize content for Options tab (a button for each DBG_ option).
        var optionsBody = parentNode.getElementsByClassName("traceInfoOptionsText").item(0);
        this.optionsController = new Firebug.TraceOptionsController(prefDomain, function updateButton(optionName, optionValue)
        {
            var button = parentNode.ownerDocument.getElementById(optionName);
            if (button)
                button.setAttribute("checked", optionValue?"true":"false");
            else
                FBTrace.sysout("traceModule onPrefChange no button with name "+optionName+ " in parentNode", parentNode);
        });

        var menuitems = this.optionsController.getOptionsMenuItems();
        for (var i=0; i<menuitems.length; i++)
        {
            var menuitem = menuitems[i];
            var button = doc.createElement("button");
            FBL.setClass(button, "traceOption");
            FBL.setItemIntoElement(button, menuitem);
            button.innerHTML = menuitem.label;
            button.setAttribute("id", menuitem.pref);
            button.removeAttribute("type");
            button.addEventListener("click", menuitem.command, false);
            optionsBody.appendChild(button);
        }

        // Select default tab.
        rep.selectTabByName(parentNode, "Logs");

        this.optionsController.addObserver();
    },

};


//************************************************************************************************
//Trace Console Rep

Firebug.TraceModule.PanelTemplate = domplate({

    tag:
        TABLE({class: "traceTable", cellpadding: 0, cellspacing: 0},
            TBODY(
                TR({class: "traceInfoRow"},
                    TD({class: "traceInfoCol"},
                        DIV({class: "traceInfoBody"},
                            DIV({class: "traceInfoTabs"},
                                A({class: "traceInfoLogsTab traceInfoTab", onclick: "$onClickTab",
                                    view: "Logs"},
                                    $STR("Logs")
                                ),
                                A({class: "traceInfoOptionsTab traceInfoTab", onclick: "$onClickTab",
                                    view: "Options"},
                                    $STR("Options")
                                )
                            ),
                            DIV({class: "traceInfoLogsText traceInfoText"},
                                IFRAME({class: "traceInfoLogsFrame",
                                    src: "chrome://firebug/content/traceLogFrame.html"}
                                )
                            ),
                            DIV({class: "traceInfoOptionsText traceInfoText"})
                        )
                    )
                )
            )
        ),

    onClickTab: function(event)
    {
        this.selectTab(event.currentTarget);
    },

    selectTabByName: function(parentNode, tabName)
    {
        var tab = parentNode.getElementsByClassName("traceInfo" + tabName + "Tab").item(0);
        if (tab)
            this.selectTab(tab);
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

        var textBodyName = "traceInfo" + view + "Text";

        messageInfoBody.selectedTab = tab;
        messageInfoBody.selectedText = getChildByClass(messageInfoBody, textBodyName);

        messageInfoBody.selectedTab.setAttribute("selected", "true");
        messageInfoBody.selectedText.setAttribute("selected", "true");
    }
});

// ************************************************************************************************
// Trace message

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
            TD({class: "messageTimeCol messageCol"},
                DIV({class: "messageTimeLabel messageLabel"},
                    "$message|getMessageTime")
            ),
            TD({class: "messageBodyCol messageCol"},
                DIV({class: "messageLabel", title: "$message|getMessageTitle"},
                    "$message|getMessageLabel")
            )
        ),

    separatorTag:
        TR({class: "messageRow separatorRow", _repObject: "$message"},
            TD({class: "messageCol", colspan: "3"},
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
                    $STR("tracing.tab.Stack")
                ),
                A({class: "messageInfoExcTab messageInfoTab", onclick: "$onClickTab",
                    view: "Exc",
                    $collapsed: "$message|hideException"},
                    $STR("tracing.tab.Exception")
                ),
                A({class: "messageInfoPropsTab messageInfoTab", onclick: "$onClickTab",
                    view: "Props",
                    $collapsed: "$message|hideProperties"},
                    $STR("tracing.tab.Properties")
                ),
                A({class: "messageInfoScopeTab messageInfoTab", onclick: "$onClickTab",
                    view: "Scope",
                    $collapsed: "$message|hideScope"},
                    $STR("tracing.tab.Scope")
                ),
                A({class: "messageInfoResponseTab messageInfoTab", onclick: "$onClickTab",
                    view: "Response",
                    $collapsed: "$message|hideResponse"},
                    $STR("tracing.tab.Response")
                ),
                A({class: "messageInfoSourceTab messageInfoTab", onclick: "$onClickTab",
                    view: "Source",
                    $collapsed: "$message|hideSource"},
                    $STR("tracing.tab.Source")
                ),
                A({class: "messageInfoIfacesTab messageInfoTab", onclick: "$onClickTab",
                    view: "Ifaces",
                    $collapsed: "$message|hideInterfaces"},
                    $STR("tracing.tab.Interfaces")
                ),
                // xxxHonza: this doesn't seem to be much useful.
                /*A({class: "messageInfoTypesTab messageInfoTab", onclick: "$onClickTab",
                    view: "Types",
                    $collapsed: "$message|hideTypes"},
                    "Types"
                ),*/
                A({class: "messageInfoObjectTab messageInfoTab", onclick: "$onClickTab",
                    view: "Types",
                    $collapsed: "$message|hideObject"},
                    $STR("tracing.tab.Object")
                ),
                A({class: "messageInfoEventTab messageInfoTab", onclick: "$onClickTab",
                    view: "Event",
                    $collapsed: "$message|hideEvent"},
                    $STR("tracing.tab.Event")
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
                                    SPAN({class: "stackFuncName"},
                                        "$stack.funcName"),
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
            DIV({class: "messageInfoScopeText messageInfoText"}),
            DIV({class: "messageInfoTypesText messageInfoText"}),
            DIV({class: "messageInfoObjectText messageInfoText"}),
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

    getMessageTime: function(message)
    {
        var date = new Date(message.time);
        var m = date.getMinutes() + "";
        var s = date.getSeconds() + "";
        var ms = date.getMilliseconds() + "";
        return "[" + ((m.length > 1) ? m : "0" + m) + ":" +
            ((s.length > 1) ? s : "0" + s) + ":" +
            ((ms.length > 2) ? ms : ((ms.length > 1) ? "0" + ms : "00" + ms)) + "]";
    },

    getMessageLabel: function(message)
    {
        var maxLength = Firebug.getPref(Firebug.TraceModule.prefDomain,
            "trace.maxMessageLength");
        return message.getLabel(maxLength);
    },

    getMessageTitle: function(message)
    {
        return message.getLabel(-1);
    },

    isException: function(message)
    {
        return message.getException();
    },

    hideProperties: function(message)
    {
        var props = message.getProperties();
        for (var name in props)
            return false;

        return true;
    },

    hideScope: function(message)
    {
        return !message.getScope();
    },

    hideInterfaces: function(message)
    {
        var ifaces = message.getInterfaces();
        for (var name in ifaces)
            return false;

        return true;
    },

    hideTypes: function(message)
    {
        return !message.getTypes();
    },

    hideObject: function(message)
    {
        return !message.getObject();
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
        FBTrace.sysout("Chromebug window has been opened", cbWindow);

        // xxxHonza: Open Chromebug with the source code file, scrolled automatically
        // to the specified line number. Currently chrome bug doesn't return the window
        // from ChromeBugOpener.openNow method. If it would be following code opens
        // the source code file and scrolls to the given line.

        // Register onLoad listener and open the source file at the specified line.
        if (cbWindow) {
            cbWindow.addEventListener("load", function() {
                var context = cbWindow.FirebugContext;
                var link = new cbWindow.FBL.SourceLink(fileName, lineNumber, "js");
                Firebug.chrome.select(link, "script");
            }, true);
        }
    },

    // Firebug rep support
    supportsObject: function(message, type)
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

        if (getAncestorByClass(target, "messageRow"))
        {
            items.push({
              label: $STR("Cut"),
              nol10n: true,
              command: bindFixed(this.onCutMessage, this, message)
            });

            items.push({
              label: $STR("Copy"),
              nol10n: true,
              command: bindFixed(this.onCopyMessage, this, message)
            });

            items.push("-");

            items.push({
              label: $STR("Remove"),
              nol10n: true,
              command: bindFixed(this.onRemoveMessage, this, message)
            });
        }

        if (getAncestorByClass(target, "messageInfoStackText"))
        {
            items.push({
              label: $STR("Copy Stack"),
              nol10n: true,
              command: bindFixed(this.onCopyStack, this, message)
            });
        }

        if (getAncestorByClass(target, "messageInfoExcText"))
        {
            items.push({
              label: $STR("Copy Exception"),
              nol10n: true,
              command: bindFixed(this.onCopyException, this, message)
            });
        }

        if (items.length > 0)
            items.push("-");

        items.push(this.optionMenu($STR("tracing.Show Time"), "trace.showTime"));
        items.push(this.optionMenu($STR("tracing.Show Scope Variables"), "trace.enableScope"));
        items.push("-");

        items.push({
          label: $STR("tracing.cmd.Expand All"),
          nol10n: true,
          command: bindFixed(this.onExpandAll, this, message)
        });

        items.push({
          label: $STR("tracing.cmd.Collapse All"),
          nol10n: true,
          command: bindFixed(this.onCollapseAll, this, message)
        });

        return items;
    },

    optionMenu: function(label, option)
    {
        var checked = Firebug.getPref(Firebug.TraceModule.prefDomain, option);
        return {label: label, type: "checkbox", checked: checked, nol10n: true,
            command: bindFixed(Firebug.setPref, Firebug, Firebug.TraceModule.prefDomain,
                option, !checked) };
    },

    getTooltip: function(message)
    {
        return message.text;
    },

    // Context menu commands
    onCutMessage: function(message)
    {
        this.onCopyMessage(message);
        this.onRemoveMessage(message);
    },

    onCopyMessage: function(message)
    {
        copyToClipboard(message.text);
    },

    onRemoveMessage: function(message)
    {
        var row = message.row;
        var parentNode = row.parentNode;
        this.toggleRow(row, false);
        parentNode.removeChild(row);
    },

    onCopyStack: function(message)
    {
        copyToClipboard(message.getStack());
    },

    onCopyException: function(message)
    {
        copyToClipboard(message.getException());
    },

    onExpandAll: function(message)
    {
        var table = getAncestorByClass(message.row, "messageTable");
        var rows = cloneArray(table.firstChild.childNodes);
        for (var i=0; i<rows.length; i++)
            this.expandRow(rows[i]);
    },

    onCollapseAll: function(message)
    {
        var table = getAncestorByClass(message.row, "messageTable");
        var rows = cloneArray(table.firstChild.childNodes);
        for (var i=0; i<rows.length; i++)
            this.collapseRow(rows[i]);
    },

    // Clipboard helpers
    copyToClipboard: function(text)
    {
        if (!text)
            return;

        // Initialize transfer data.
        var trans = CCIN("@mozilla.org/widget/transferable;1", "nsITransferable");
        var wrapper = CCIN("@mozilla.org/supports-string;1", "nsISupportsString");
        wrapper.data = text;
        trans.addDataFlavor("text/unicode");
        trans.setTransferData("text/unicode", wrapper, text.length * 2);

        // Set the data into the global clipboard
        clipboard.setData(trans, null, Ci.nsIClipboard.kGlobalClipboard);
    },

    // Implementation
    createTable: function(parentNode)
    {
        return HelperDomplate.replace(this.tableTag, {}, parentNode, this);
    },

    dump: function(message, outputNodes, index)
    {
        var scrollingNode = outputNodes.getScrollingNode();
        var scrolledToBottom = isScrolledToBottom(scrollingNode);

        var targetNode = outputNodes.getTargetNode();
        // Set message index
        if (index)
            message.index = index;
        else
            message.index = targetNode.childNodes.length;

        // Insert log into the console.
        var row = HelperDomplate.insertRows(this.rowTag, {message: message},
            targetNode, this)[0];

        message.row = row;

        // Only if the manifest uses useNativeWrappers=no.
        // The row in embedded frame, which uses type="content-primary", from some
        // reason, this conten type changes wrapper around the row, so let's set
        // directly thte wrappedJSObject here, so row-expand works.
        if (row.wrappedJSObject)
            row.wrappedJSObject.repObject = message;

        if (scrolledToBottom)
            scrollToBottom(scrollingNode);
    },

    dumpSeparator: function(outputNodes)
    {
        var panelNode = outputNodes.getScrollingNode();
        var scrolledToBottom = isScrolledToBottom(panelNode);

        var targetNode = outputNodes.getTargetNode();
        var fakeMessage = {};
        fakeMessage.index = targetNode.childNodes.length;

        var row = HelperDomplate.insertRows(this.separatorTag, {message: fakeMessage},
            targetNode, this)[0];

        if (scrolledToBottom)
            scrollToBottom(panelNode);

        panelNode.scrollTop = panelNode.scrollHeight - panelNode.offsetHeight + 50;
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

    collapseRow: function(row)
    {
        if (hasClass(row, "messageRow", "opened"))
            this.toggleRow(row);
    },

    expandRow: function(row)
    {
        if (hasClass(row, "messageRow"))
            this.toggleRow(row, true);
    },

    toggleRow: function(row, state)
    {
        var opened = hasClass(row, "opened");
        if ((state != null) && (opened == state))
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

        // Make sure the original Domplate is *not* tracing for now.
        var dumpDOM = FBTrace.DBG_DOM;
        FBTrace.DBG_DOM = false;
        this.updateInfo(messageInfoBody, view, message);
        FBTrace.DBG_DOM = dumpDOM;
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
            this.updateInfoImpl(messageInfoBody, view, message, message.getProperties,
                function (message, valueBox, text) {
                    Firebug.TraceModule.Tree.tag.replace({object: message.props}, valueBox,
                        Firebug.TraceModule.Tree);
                });
        }
        else if (hasClass(tab, "messageInfoScopeTab"))
        {
            this.updateInfoImpl(messageInfoBody, view, message, message.getScope,
                function (message, valueBox, text) {
                    Firebug.TraceModule.PropertyTree.tag.replace({object: message.scope}, valueBox,
                        Firebug.TraceModule.PropertyTree);
                });
        }
        else if (hasClass(tab, "messageInfoIfacesTab"))
        {
            this.updateInfoImpl(messageInfoBody, view, message, message.getInterfaces,
                function (message, valueBox, text) {
                    Firebug.TraceModule.Tree.tag.replace({object: message.ifaces}, valueBox,
                        Firebug.TraceModule.Tree);
                });
        }
        else if (hasClass(tab, "messageInfoTypesTab"))
        {
            this.updateInfoImpl(messageInfoBody, view, message, message.getTypes);
        }
        else if (hasClass(tab, "messageInfoEventTab"))
        {
            this.updateInfoImpl(messageInfoBody, view, message, message.getEvent);
        }
        else if (hasClass(tab, "messageInfoObjectTab"))
        {
            this.updateInfoImpl(messageInfoBody, view, message, message.getProperties,
                function (message, valueBox, text) {
                    if (message.obj instanceof Element)
                        Firebug.HTMLPanel.CompleteElement.tag.replace({object: message.obj}, valueBox,
                            Firebug.HTMLPanel.CompleteElement);
                    else
                        Firebug.TraceModule.PropertyTree.tag.replace({object: message.obj}, valueBox,
                            Firebug.TraceModule.PropertyTree);
                });
        }
        else if (hasClass(tab, "messageInfoExcTab"))
        {
            this.updateInfoImpl(messageInfoBody, view, message, message.getException);
        }
        else if (hasClass(tab, "messageInfoResponseTab"))
        {
            this.updateInfoImpl(messageInfoBody, view, message, message.getResponse,
                function (message, valueBox, text) {
                    var iframe = getChildByClass(valueBox, "messageInfoResponseFrame");
                    iframe.contentWindow.document.body.innerHTML = text;
                });
        }
        else if (hasClass(tab, "messageInfoSourceTab"))
        {
            this.updateInfoImpl(messageInfoBody, view, message, message.getResponse,
                function (message, valueBox, text) {
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
                    setter(message, valueBox, text);
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

// ************************************************************************************************
// Trace Message Object

Firebug.TraceModule.TraceMessage = function(type, text, obj, scope, time)
{
    this.type = type;
    this.text = text;
    this.obj = obj;
    this.stack = [];
    this.scope = scope;
    this.time = time;

    if (this.obj instanceof Ci.nsIScriptError)
    {
        var trace = Firebug.errorStackTrace;
        if (trace)
        {
            for (var i=0; i<trace.frames.length; i++)
            {
                var frame = trace.frames[i];
                if (frame.href && frame.line)
                    this.stack.push({fileName:frame.href, lineNumber:frame.line, funcName:""});
            }
        }
        else
        {
            // Put info about the script error location into the stack.
            this.stack.push({fileName:this.obj.sourceName, lineNumber:this.obj.lineNumber, funcName:""});
        }
    }
    //xxxHonza: the object doesn't have to always be an instance of Error.
    else if (this.obj && this.obj.stack && /*(this.obj instanceof Error) &&*/
        (typeof this.obj.stack.split == "function"))
    {
        // If the passed object is an error with stack trace attached, use it.
        // This stack trace points directly to the place where the error occurred.
        var stack = this.obj.stack.split("\n");
        for (var i=0; i<stack.length; i++)
        {
            var frame = stack[i].split("@");
            if (frame.length != 2)
                continue;

            var index = frame[1].lastIndexOf(":");
            this.stack.push({
                fileName: frame[1].substr(0, index),
                lineNumber: frame[1].substr(index+1),
                funcName: frame[0]
            });
        }
    }
    else
    {
        // Initialize stack trace info. This must be done now, when the stack
        // is available.
        for (var frame = Components.stack, i=0; frame; frame = frame.caller, i++)
        {
            // Skip frames related to the tracing code.
            var fileName = unescape(frame.filename ? frame.filename : "");
            var traceServiceFile = "firebug@software.joehewitt.com/components/firebug-trace-service.js";
            if (i < 6 || fileName.indexOf(traceServiceFile) != -1)
                continue;

            var sourceLine = frame.sourceLine ? frame.sourceLine : "";
            var lineNumber = frame.lineNumber ? frame.lineNumber : "";
            this.stack.push({fileName:fileName, lineNumber:lineNumber, funcName:""});
        }
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

    if (this.obj instanceof Error ||
        this.obj instanceof Ci.nsIException ||
        this.obj instanceof Ci.nsIScriptError)
    {
        // Put the error message into the title so, it's immediately visible.
        this.text += " " + this.obj.message;
    }

    // Get snapshot of all properties now, as they can be changed.
    this.getProperties();

    // Get current scope
    this.getScope();
}

// ************************************************************************************************

Firebug.TraceModule.TraceMessage.prototype =
{
    getType: function()
    {
        return this.type;
    },

    getLabel: function(maxLength)
    {
        if (!this.text)
            return "";

        if (maxLength <= 10 || this.text.length <= maxLength)
            return this.text.replace(/[\n]/g,"");

        return this.text.substr(0, maxLength - 3) + "...";
    },

    getStackArray: function()
    {
        return this.stack;
    },

    getStack: function()
    {
        var result = "";
        for (var i=0; i<this.stack.length; i++) {
            var frame = this.stack[i];
            result += frame.fileName + " (" + frame.lineNumber + ")\n";
        }

        return result;
    },

    getProperties: function()
    {
        if (this.props)
            return this.props;

        this.props = [];

        if (this.obj instanceof Array)
        {
            if (this.obj.length)
            {
                for (var p=0; p<this.obj.length; p++)
                {
                    try
                    {
                        var getter = this.obj.__lookupGetter__(p);
                        if (getter)
                            this.props[p] = "" + getter;
                        else
                            this.props[p] = "" + this.obj[p];
                    }
                    catch (e)
                    {
                        onPanic("instanceof Array with length, item "+p, e);
                    }
                }
            }
            else
            {
                for (var p in this.obj)
                {
                    try
                    {
                        var subProps = this.props[p] = [];
                        var subobj = this.obj.__lookupGetter__(p);
                        if (!subobj)
                            subobj = this.obj[p];
                        for (var p1 in subobj)
                        {
                            var getter = subobj.lookupGetter__(p1);
                            if (getter)
                                subProps[p1] = "" + getter;
                            else
                                subProps[p1] = "" + subobj[p1];
                        }
                    }
                    catch (e)
                    {
                        onPanic("instanceof Array, item "+p, e);
                    }
                }
            }
        }
        else if (typeof(this.obj) == "string")
        {
            this.props = this.obj;
        }
        else if (this.obj instanceof Ci.jsdIValue)
        {
            var listValue = {value: null}, lengthValue = {value: 0};
            this.obj.getProperties(listValue, lengthValue);
            for (var i = 0; i < lengthValue.value; ++i)
            {
                var prop = listValue.value[i];
                try {
                    var name = unwrapIValue(prop.name);
                    this.props[name] = "" + unwrapIValue(prop.value);
                } catch (e) {
                    onPanic("instanceof jsdIValue, i="+i, e);
                }
            }
        }
        else if (this.obj instanceof Ci.nsISupportsCString)
        {
            this.props = this.obj.data;
        }
        else
        {
            try
            {
                this.props = {};
                var propsTotal = 0;
                for (var p in this.obj)
                {
                    propsTotal++;

                    try {
                        if (this.obj.__lookupGetter__)
                            var getter = this.obj.__lookupGetter__(p);
                        if (getter)
                            var value = "" + getter;
                        else
                            var value = safeToString(this.obj[p]);
                        this.props[p] = value;
                    }
                    catch (err) {
                        window.dump(">>>>>>>>>>>>>>>> traceModule.getProperties FAILS with "+err+"\n");
                        window.dump(">>>>>>>>>>>>>>>> traceModule.getProperties FAILS on object "+safeToString(this.obj)+"\n");
                        this.props[p] = "{Error}";
                    }
                }
            }
            catch (exc)
            {
                window.dump(">>>>>>>>>>>>>>>> traceModule.getProperties enumeration FAILS after "+propsTotal+ " with "+exc+"\n");
                window.dump(">>>>>>>>>>>>>>>> traceModule.getProperties enumeration FAILS on object "+safeToString(this.obj)+"\n");
                if (this.obj instanceof Window)
                    window.dump(">>>>>>>>>>>>>>>> traceModule.getProperties enumeration FAILS window closed:"+this.obj.closed+"\n");
            }
        }

        return this.props;
    },

    getInterfaces: function()
    {
        if (this.ifaces)
            return this.ifaces;

        this.ifaces = [];
        for (var iface in Ci) {
            if (this.obj instanceof Ci[iface]) {
                var ifaceProps = this.ifaces[iface] = [];
                for (p in Ci[iface])
                    ifaceProps[p] = this.obj[p];
            }
        }
        return this.ifaces;
    },

   getScope: function()
   {
       if (!Firebug.getPref(Firebug.prefDomain, "trace.enableScope"))
           return null;

       if (this.scope)
           return this.scope;

       var scope = {};
       Firebug.Debugger.halt(function(frame)
       {
           for (var i=0; i<4 && frame; i++)
               frame = frame.callingFrame;

           if (frame)
           {
               var listValue = {value: null}, lengthValue = {value: 0};
               frame.scope.getProperties(listValue, lengthValue);

               for (var i=lengthValue.value-1; i>=0; i--)
               {
                   var prop = listValue.value[i];
                   var name = unwrapIValue(prop.name);
                   var value = unwrapIValue(prop.value);

                   if ((typeof(value) != "function") && name && value)
                       scope[name.toString()] = value.toString();
               }
           }
       });

       return this.scope = scope;
   },

    getResponse: function()
    {
        var result = null;
        try
        {
            var self = this;
            TabWatcher.iterateContexts(function(context) {
                var url = self.obj.originalURI.spec;
                return context.sourceCache.loadText(url);
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
                onPanic("instanceof Error or nsIExcpetion", e);
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
            onPanic("getTypes "+this.types, e);
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
            onPanic("event", err);
        }

        return this.eventInfo;
    },

    getObject: function()
    {
        return this.obj;
    }
}

var lastPanic = null;
function onPanic(contextMessage, errorMessage)
{
    var appShellService = Components.classes["@mozilla.org/appshell/appShellService;1"].getService(Components.interfaces.nsIAppShellService);
    var win = appShellService.hiddenDOMWindow;
    // XXXjjb I cannot get these tests to work.
    //if (win.lastPanic && (win.lastPanic == errorMessage))
        win.dump("traceModule: "+contextMessage +" panic attack "+errorMessage+"\n");
    //else
    //alert("Firebug traceModule panics: "+errorMessage);

    win.lastPanic = errorMessage;
}

// ************************************************************************************************
// Domplate helpers - Tree (domplate widget)

/**
 * This object is intended as a domplate widget for displaying hierarchical
 * structure (tree). Specific tree should be derived from this object and
 * getMembers method should be implemented.
 */
Firebug.TraceModule.Tree = domplate(Firebug.Rep,
{
    tag:
        TABLE({class: "domTable", cellpadding: 0, cellspacing: 0, onclick: "$onClick"},
            TBODY(
                FOR("member", "$object|memberIterator",
                    TAG("$member|getRowTag", {member: "$member"}))
            )
        ),

    rowTag:
        TR({class: "memberRow $member.open $member.type\\Row", $hasChildren: "$member.hasChildren",
            _repObject: "$member", level: "$member.level"},
            TD({class: "memberLabelCell",
                style: "padding-left: $member.indent\\px; width:1%; white-space: nowrap"},
                DIV({class: "memberLabel $member.type\\Label"}, "$member.name")
            ),
            TD({class: "memberValueCell", style: "width: 100%;"},
                TAG("$member.tag", {object: "$member.value"})
            )
        ),

    loop:
        FOR("member", "$members",
            TAG("$member|getRowTag", {member: "$member"})),

    memberIterator: function(object)
    {
        return this.getMembers(object);
    },

    getRowTag: function(member)
    {
        return this.rowTag;
    },

    onClick: function(event)
    {
        if (!isLeftClick(event))
            return;

        var row = getAncestorByClass(event.target, "memberRow");
        var label = getAncestorByClass(event.target, "memberLabel");
        if (label && hasClass(row, "hasChildren"))
            this.toggleRow(row);
    },

    toggleRow: function(row)
    {
        var level = parseInt(row.getAttribute("level"));

        if (hasClass(row, "opened"))
        {
            removeClass(row, "opened");

            var tbody = row.parentNode;
            for (var firstRow = row.nextSibling; firstRow; firstRow = row.nextSibling) {
                if (parseInt(firstRow.getAttribute("level")) <= level)
                    break;

                tbody.removeChild(firstRow);
            }
        }
        else
        {
            setClass(row, "opened");

            var repObject = row.repObject;
            if (repObject) {
                var members = this.getMembers(repObject.value, level+1);
                if (members)
                    this.loop.insertRows({members: members}, row);
            }
        }
    },

    getMembers: function(object, level)
    {
        if (!level)
            level = 0;

        if (typeof(object) == "string")
            return [this.createMember("", "", object, level)];

        var members = [];
        for (var p in object) {
            var member = this.createMember("", p, object[p], level);
            if (object[p] instanceof Array)
                member.tag = FirebugReps.Nada.tag;
            members.push(member);
        }
        return members;
    },

    createMember: function(type, name, value, level)
    {
        var rep = Firebug.getRep(value);
        var tag = rep.shortTag ? rep.shortTag : rep.tag;
        var valueType = typeof(value);

        var hasChildren = this.hasProperties(value) && !(value instanceof ErrorCopy) &&
            (valueType == "function" || (valueType == "object" && value != null)
            || (valueType == "string" && value.length > Firebug.stringCropLength));

        return {
            name: name,
            value: value,
            type: type,
            rowClass: "memberRow-" + type,
            open: "",
            level: level,
            indent: level*16,
            hasChildren: hasChildren,
            tag: tag
        };
    },

    hasProperties: function(ob)
    {
        try {
            for (var name in ob)
                return true;
        } catch (exc) {}
        return false;
    }
});

// ************************************************************************************************

Firebug.TraceModule.PropertyTree = domplate(Firebug.TraceModule.Tree,
{
    getMembers: function(object, level)
    {
        if (!level)
            level = 0;

        try
        {
            var members = [];
            for (var p in object)
            {
                try
                {
                    members.push(this.createMember("dom", p, object[p], level));
                }
                catch (e)
                {
                }
            }
        }
        catch (err)
        {
            FBTrace.sysout("Exception", err);
        }

        return members;
    }
});

// ************************************************************************************************
// Registration

Firebug.registerModule(Firebug.TraceModule);
Firebug.registerRep(Firebug.TraceModule.MessageTemplate);

// ************************************************************************************************

}});
