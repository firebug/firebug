/* See license.txt for terms of usage */

define([
    "fbtrace/trace",
    "firebug/firebug",
    "firebug/lib/xpcom",
    "firebug/lib/events",
    "firebug/chrome/reps",
    "firebug/chrome/window",
    "fbtrace/firebugExplorer",
    "fbtrace/globalTab",
    "firebug/chrome/menu",
    "firebug/lib/css",
    "firebug/lib/locale",
    "firebug/lib/string",
    "firebug/js/sourceLink",
    "firebug/lib/object",
    "firebug/lib/system",
    "firebug/lib/array",
    "firebug/lib/wrapper",
    "firebug/lib/domplate",
    "firebug/lib/dom",
],
function(FBTrace, Firebug, Xpcom, Events, FirebugReps, Win, FirebugExplorer, GlobalTab,
    Menu, Css, Locale, Str, SourceLink, Obj, System, Arr, Wrapper, Domplate, Dom) {
with (Domplate) {

// ********************************************************************************************* //
// Constants

var Cc = Components.classes;
var Ci = Components.interfaces;
var Cu = Components.utils;

var clipboard = Xpcom.CCSV("@mozilla.org/widget/clipboard;1", "nsIClipboard");
var wm = Xpcom.CCSV("@mozilla.org/appshell/window-mediator;1", "nsIWindowMediator");

var PrefService = Cc["@mozilla.org/preferences-service;1"];
var prefs = PrefService.getService(Ci.nsIPrefBranch);
var prefService = PrefService.getService(Ci.nsIPrefService);

var reDBG = /extensions\.([^\.]*)\.(DBG_.*)/;
var reDBG_FBS = /DBG_FBS_(.*)/;

var EOF = "<br/>";

// Register locale file with strings for the Tracing Console window.
Firebug.registerStringBundle("chrome://fbtrace/locale/firebug-tracing.properties");

// ********************************************************************************************* //
//  The controller for the prefDomain Model.

//  getOptionsMenuItems to create View, onPrefChangeHandler for View update
//  base for trace viewers like tracePanel and traceConsole
//  binds  to the branch 'prefDomain' of prefs
Firebug.TraceOptionsController = function(prefDomain, onPrefChangeHandler)
{
    this.prefDomain = prefDomain;

    Components.utils["import"]("resource://fbtrace/firebug-trace-service.js");
    this.traceService = traceConsoleService;

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
                    var optionValue = Firebug.Options.getPref(prefDomain, m[2]);
                    if (this.prefEventToUserEvent)
                        this.prefEventToUserEvent(optionName, optionValue);
                }
            }
            else
            {
                if (typeof(FBTrace) != "undefined" && FBTrace.DBG_OPTIONS)
                    FBTrace.sysout("traceModule.observe : "+data+"\n");
            }
        }
    };

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // UI

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
                var prefValue = Firebug.Options.getPref(this.prefDomain, p);
                var label = p.substr(4);
                items.push({
                    label: label,
                    nol10n: true,
                    type: "checkbox",
                    checked: prefValue,
                    pref: p,
                    command: Obj.bind(this.userEventToPrefEvent, this)
                });
            }
            catch (err)
            {
                if (FBTrace.DBG_ERRORS)
                {
                    FBTrace.sysout("traceModule.getOptionsMenuItems could not create item for " +
                        p + " in prefDomain " + this.prefDomain + ", " + err, err);
                }
                // if the option doesn't exist in this prefDomain, just continue...
            }
        }

        items.sort(function(a, b)
        {
            return a.label > b.label;
        });

        return items;
    };

    // use as an event listener on UI control
    this.userEventToPrefEvent = function(event)
    {
        var menuitem = event.target.wrappedJSObject;
        if (!menuitem)
            menuitem = event.target;

        var label = menuitem.getAttribute("label");
        var category = "DBG_" + label;
        var value = Firebug.Options.getPref(this.prefDomain, category);
        var newValue = !value;

        Firebug.Options.setPref(this.prefDomain, category, newValue);
        prefService.savePrefFile(null);

        if (FBTrace.DBG_OPTIONS)
        {
            FBTrace.sysout("traceConsole.setOption: new value "+ this.prefDomain+"."+
                category+ " = " + newValue, menuitem);
        }
    };

    if (onPrefChangeHandler)
    {
        this.prefEventToUserEvent = onPrefChangeHandler;
    }
    else
    {
        this.prefEventToUserEvent = function(optionName, optionValue)
        {
            FBTrace.sysout("TraceOptionsController owner needs to implement prefEventToUser Event",
                {name: optionName, value: optionValue});
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

            Firebug.Options.setPref(this.prefDomain, p, false);
        }
        prefService.savePrefFile(null);
    };

};

// ********************************************************************************************* //
// Trace Module

Firebug.TraceModule = Obj.extend(Firebug.Module,
{
    dispatchName: "traceModule",

    addListener: function(listener)
    {
        if (!listener)
            dump("\n\n\n++++++++++++++++++ NULL LISTENER ++++++++++++++++++\n\n\n");

        Firebug.Module.addListener.apply(this, arguments);
    },

    initialize: function()
    {
        Firebug.Module.initialize.apply(this, arguments);

        // prefDomain is the calling app, firebug or chromebug
        this.prefDomain = Firebug.Options.getPrefDomain();
        window.dump("FBTrace; Firebug.TraceModule.initialize: " + this.prefDomain + "\n");

        FBTrace.DBG_OPTIONS = Firebug.Options.getPref(this.prefDomain, "DBG_OPTIONS");

        // Open console automatically if the pref says so.
        //if (Firebug.Options.getPref(this.prefDomain, "alwaysOpenTraceConsole"))
        //    this.openConsole();

        window.dump("traceModule.initialize: " + this.prefDomain+" alwaysOpen: " +
            Firebug.Options.getPref(this.prefDomain, "alwaysOpenTraceConsole") + "\n");
    },

    shutdown: function()
    {
    },

    reattachContext: function(browser, context)
    {
        if (FBTrace.DBG_OPTIONS)
        {
            FBTrace.sysout("traceModule.reattachContext for: " +
                context ? context.getName() : "null context",
                [browser, context]);
        }
    },

    getTraceConsoleURL: function()
    {
        return "chrome://fbtrace-firebug/content/traceConsole.xul";
    },

    onToggleOption: function(target)
    {
        window.Firebug.chrome.onToggleOption(target);

        // Open automatically if set to "always open", close otherwise.
        if (Firebug.getPref(Firebug.prefDomain, "alwaysOpenTraceConsole"))
            this.openConsole();
        else
            this.closeConsole();
    },

    closeConsole: function(prefDomain)
    {
        if (!prefDomain)
            prefDomain = this.prefDomain;

        var consoleWindow = null;
        Win.iterateBrowserWindows("FBTraceConsole", function(win)
        {
            if (win.TraceConsole.prefDomain == prefDomain)
            {
                consoleWindow = win;
                return true;
            }
        });

        if (consoleWindow)
            consoleWindow.close();
    },

    openConsole: function(prefDomain, windowURL)
    {
        if (!prefDomain)
            prefDomain = this.prefDomain;

        var self = this;
        Win.iterateBrowserWindows("FBTraceConsole", function(win)
        {
            if (win.TraceConsole.prefDomain == prefDomain)
            {
                self.consoleWindow = win;
                return true;
            }
        });

        // Try to connect an existing trace-console window first.
        if (this.consoleWindow && this.consoleWindow.TraceConsole)
        {
            this.consoleWindow.focus();
            return;
        }

        if (!windowURL)
            windowURL = this.getTraceConsoleURL();

        if (FBTrace.DBG_OPTIONS)
            FBTrace.sysout("traceModule.openConsole, prefDomain: " + prefDomain);

        var self = this;
        var args = {
            //FBL: FBL,
            Firebug: Firebug,
            traceModule: self,
            prefDomain: prefDomain,
        };

        if (FBTrace.DBG_OPTIONS)
        {
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
        var win = wm.getMostRecentWindow("navigator:browser");
        if (!(win && win.Firebug && win.Firebug.TraceModule))
            return;

        var listeners = win.Firebug.TraceModule.fbListeners;
        for (var i=0; i<listeners.length; i++)
            listeners.onLoadConsoleExecuted = true;

        Events.dispatch(listeners, "onLoadConsole", [win, rootNode]);
    },

    onUnloadConsole: function(win)
    {
        var win = wm.getMostRecentWindow("navigator:browser");
        if (win && win.Firebug && win.Firebug.TraceModule)
            Events.dispatch(win.Firebug.TraceModule.fbListeners, "onUnloadConsole", [win]);
    },

    onDump: function(message, outputNodes)
    {
        // Don't dispatch to listener in this scope - TraceConsole.xul
        // We need to dispatch to listenres registered within Firebug
        // which is browser.xul scope.
        //dispatch(this.fbListeners, "onDump", [message]);

        // Get browser window with Firebug and distribute dump for customization.
        var win = wm.getMostRecentWindow("navigator:browser");
        if (!(win && win.Firebug && win.Firebug.TraceModule))
            return;

        var consoleWin = outputNodes.logs.parentNode.ownerDocument.defaultView;
        var rootNode = outputNodes.logs;

        // Fire "onLoadConsole" for listeners that have been registered
        // after the console has been opened.
        var listeners = win.Firebug.TraceModule.fbListeners;
        for (var i=0; listeners && i<listeners.length; i++)
        {
            var listener = listeners[i];
            if (!listener.onLoadConsoleExecuted)
            {
                listener.onLoadConsoleExecuted = true;
                Events.dispatch([listener], "onLoadConsole", [consoleWin, rootNode]);
            }
        }

        if (win && win.Firebug && win.Firebug.TraceModule)
            Events.dispatch(listeners, "onDump", [message]);
    },

    dump: function(message, outputNodes)
    {
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

        // Customize layout of options.
        var tabular = Firebug.Options.get("fbtrace.tabularOptionsLayout");
        optionsBody.setAttribute("tabular", tabular);

        this.optionsController = new Firebug.TraceOptionsController(prefDomain,
        function updateButton(optionName, optionValue)
        {
            var button = parentNode.ownerDocument.getElementById(optionName);
            if (button)
                button.setAttribute("checked", optionValue?"true":"false");
            else
                FBTrace.sysout("traceModule onPrefChange no button with name "+optionName+
                    " in parentNode", parentNode);
        });

        var menuitems = this.optionsController.getOptionsMenuItems();
        for (var i=0; i<menuitems.length; i++)
        {
            var menuitem = menuitems[i];
            var button = doc.createElement("button");
            Css.setClass(button, "traceOption");
            Menu.setItemIntoElement(button, menuitem);
            button.innerHTML = menuitem.label;
            button.setAttribute("id", menuitem.pref);
            button.removeAttribute("type");
            button.addEventListener("click", menuitem.command, false);

            var tooltip = Locale.$STR("tracing.option." + menuitem.label + "_Description");
            if (tooltip)
                button.setAttribute("title", tooltip);

            optionsBody.appendChild(button);
        }

        try
        {
            // Initialize global options
            var globalBody = parentNode.querySelector(".traceInfoGlobalText");
            if (globalBody)
                GlobalTab.render(globalBody);
        }
        catch (e)
        {
            window.dump("FBTrace; globalOptions EXCEPTION " + e + "\n");
        }

        // Select default tab.
        rep.selectTabByName(parentNode, "Logs");

        this.optionsController.addObserver();
    },
};

// ********************************************************************************************* //
// Trace Console Rep

Firebug.TraceModule.PanelTemplate = domplate(
{
    tag:
        TABLE({"class": "traceTable", cellpadding: 0, cellspacing: 0},
            TBODY(
                TR({"class": "traceInfoRow"},
                    TD({"class": "traceInfoCol"},
                        DIV({"class": "traceInfoBody"},
                            DIV({"class": "traceInfoTabs"},
                                A({"class": "traceInfoLogsTab traceInfoTab", onclick: "$onClickTab",
                                    view: "Logs"},
                                    Locale.$STR("Logs")
                                ),
                                A({"class": "traceInfoOptionsTab traceInfoTab", onclick: "$onClickTab",
                                    view: "Options"},
                                    Locale.$STR("Options")
                                ),
                                A({"class": "traceInfoGlobalTab traceInfoTab", onclick: "$onClickTab",
                                    view: "Global"},
                                    Locale.$STR("Global Events")
                                )
                            ),
                            DIV({"class": "traceInfoLogsText traceInfoText"},
                                IFRAME({"class": "traceInfoLogsFrame",
                                    src: "chrome://fbtrace/content/traceLogFrame.html"}
                                )
                            ),
                            DIV({"class": "traceInfoOptionsText traceInfoText"}),
                            DIV({"class": "traceInfoGlobalText traceInfoText"})
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
        messageInfoBody.selectedText = Dom.getChildByClass(messageInfoBody, textBodyName);

        messageInfoBody.selectedTab.setAttribute("selected", "true");
        messageInfoBody.selectedText.setAttribute("selected", "true");
    }
});

// ********************************************************************************************* //
// Trace message

Firebug.TraceModule.MessageTemplate = domplate(Firebug.Rep,
{
    inspectable: false,

    tableTag:
        TABLE({"class": "messageTable", cellpadding: 0, cellspacing: 0},
            TBODY()
        ),

    rowTag:
        TR({"class": "messageRow $message|getMessageType",
            _repObject: "$message",
            $exception: "$message|isException",
            onclick: "$onClickRow"},
            TD({"class": "messageNameCol messageCol"},
                DIV({"class": "messageNameLabel messageLabel"},
                    "$message|getMessageIndex")
            ),
            TD({"class": "messageTimeCol messageCol"},
                DIV({"class": "messageTimeLabel messageLabel"},
                    "$message|getMessageTime")
            ),
            TD({"class": "messageBodyCol messageCol"},
                DIV({"class": "messageLabel", title: "$message|getMessageTitle"},
                    "$message|getMessageLabel")
            )
        ),

    separatorTag:
        TR({"class": "messageRow separatorRow", _repObject: "$message"},
            TD({"class": "messageCol", colspan: "3"},
                DIV("$message|getMessageIndex")
            )
        ),

    importHeaderTag:
        TR({"class": "messageRow importHeaderRow", _repObject: "$message"},
            TD({"class": "messageCol", colspan: "3"},
                DIV(B("Firebug: $message.firebug")),
                DIV("$message.app.name, $message.app.version, " +
                    "$message.app.platformVersion, $message.app.buildID, " +
                    "$message.app.locale"),
                DIV("$message.os.name $message.os.version"),
                DIV("$message.date"),
                DIV("$message.filePath")
            )
        ),

    importFooterTag:
        TR({"class": "messageRow importFooterRow", _repObject: "$message"},
            TD({"class": "messageCol", colspan: "3"})
        ),

    bodyRow:
        TR({"class": "messageInfoRow"},
            TD({"class": "messageInfoCol", colspan: 8})
        ),

    bodyTag:
        DIV({"class": "messageInfoBody", _repObject: "$message"},
            DIV({"class": "messageInfoTabs"},
                A({"class": "messageInfoStackTab messageInfoTab", onclick: "$onClickTab",
                    view: "Stack"},
                    Locale.$STR("tracing.tab.Stack")
                ),
                A({"class": "messageInfoExcTab messageInfoTab", onclick: "$onClickTab",
                    view: "Exc",
                    $collapsed: "$message|hideException"},
                    Locale.$STR("tracing.tab.Exception")
                ),
                A({"class": "messageInfoPropsTab messageInfoTab", onclick: "$onClickTab",
                    view: "Props",
                    $collapsed: "$message|hideProperties"},
                    Locale.$STR("tracing.tab.Properties")
                ),
                A({"class": "messageInfoScopeTab messageInfoTab", onclick: "$onClickTab",
                    view: "Scope",
                    $collapsed: "$message|hideScope"},
                    Locale.$STR("tracing.tab.Scope")
                ),
                A({"class": "messageInfoResponseTab messageInfoTab", onclick: "$onClickTab",
                    view: "Response",
                    $collapsed: "$message|hideResponse"},
                    Locale.$STR("tracing.tab.Response")
                ),
                A({"class": "messageInfoSourceTab messageInfoTab", onclick: "$onClickTab",
                    view: "Source",
                    $collapsed: "$message|hideSource"},
                    Locale.$STR("tracing.tab.Source")
                ),
                A({"class": "messageInfoIfacesTab messageInfoTab", onclick: "$onClickTab",
                    view: "Ifaces",
                    $collapsed: "$message|hideInterfaces"},
                    Locale.$STR("tracing.tab.Interfaces")
                ),
                // xxxHonza: this doesn't seem to be much useful.
                /*A({"class": "messageInfoTypesTab messageInfoTab", onclick: "$onClickTab",
                    view: "Types",
                    $collapsed: "$message|hideTypes"},
                    "Types"
                ),*/
                A({"class": "messageInfoObjectTab messageInfoTab", onclick: "$onClickTab",
                    view: "Types",
                    $collapsed: "$message|hideObject"},
                    Locale.$STR("tracing.tab.Object")
                ),
                A({"class": "messageInfoEventTab messageInfoTab", onclick: "$onClickTab",
                    view: "Event",
                    $collapsed: "$message|hideEvent"},
                    Locale.$STR("tracing.tab.Event")
                )
            ),
            DIV({"class": "messageInfoStackText messageInfoText"},
                TABLE({"class": "messageInfoStackTable", cellpadding: 0, cellspacing: 0},
                    TBODY(
                        FOR("stack", "$message|stackIterator",
                            TR(
                                TD({"class": "stackFrame"},
                                    A({"class": "stackFrameLink", onclick: "$onClickStackFrame",
                                        lineNumber: "$stack.lineNumber"},
                                        "$stack|getStackFileName"),
                                    SPAN("&nbsp;"),
                                    SPAN("(", "$stack.lineNumber", ")"),
                                    SPAN("&nbsp;"),
                                    SPAN({"class": "stackFuncName"},
                                        "$stack.funcName"),
                                    A({"class": "openDebugger", onclick: "$onOpenDebugger",
                                        lineNumber: "$stack.lineNumber",
                                        fileName: "$stack.fileName"},
                                        "[...]")
                                )
                            )
                        )
                    )
                )
            ),
            DIV({"class": "messageInfoExcText messageInfoText"}),
            DIV({"class": "messageInfoPropsText messageInfoText"}),
            DIV({"class": "messageInfoResponseText messageInfoText"},
                IFRAME({"class": "messageInfoResponseFrame"})
            ),
            DIV({"class": "messageInfoSourceText messageInfoText"}),
            DIV({"class": "messageInfoIfacesText messageInfoText"}),
            DIV({"class": "messageInfoScopeText messageInfoText"}),
            DIV({"class": "messageInfoTypesText messageInfoText"}),
            DIV({"class": "messageInfoObjectText messageInfoText"}),
            DIV({"class": "messageInfoEventText messageInfoText"})
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
        var maxLength = Firebug.Options.getPref(Firebug.TraceModule.prefDomain,
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

    getStackFileName: function(stack)
    {
        var url = stack.fileName;

        // Scripts loaded using loadSubScript (e.g. loaded by a module loader)
        // Use spcific URL syntax:
        // loader -> script URL
        // Get the last part "script URL" in order to have meaningful URL
        var urls = url.split("->");
        if (urls.length == 2)
            url = Str.trim(urls[1]);

        return url;
    },

    onClickStackFrame: function(event)
    {
        var url = event.target.innerHTML;
        var winType = "FBTraceConsole-SourceView";
        var lineNumber = event.target.getAttribute("lineNumber");

        window.openDialog("chrome://global/content/viewSource.xul",
            winType, "all,dialog=no",
            url, null, null, lineNumber, false);
    },

    onOpenDebugger: function(event)
    {
        var target = event.target;
        var lineNumber = target.getAttribute("lineNumber");
        var fileName = target.getAttribute("fileName");

        // xxxHonza: open the built-in debugger?
    },

    // Firebug rep support
    supportsObject: function(object, type)
    {
        return object instanceof Firebug.TraceModule.TraceMessage ||
            object instanceof Firebug.TraceModule.ImportedMessage;
    },

    browseObject: function(message, context)
    {
        return false;
    },

    getRealObject: function(message, context)
    {
        return message;
    },

    getSourceLink: function(target, object)
    {
        if (Css.hasClass(target, "stackFrameLink"))
        {
            var sourceLink = new SourceLink.SourceLink(target.innerHTML,
                target.getAttribute("lineNumber"));

            return sourceLink;
        }
    },

    // Context menu
    getContextMenuItems: function(message, target, context, repObject)
    {
        var items = [];

        if (Dom.getAncestorByClass(target, "messageRow"))
        {
            items.push({
              label: Locale.$STR("Cut"),
              nol10n: true,
              command: Obj.bindFixed(this.onCutMessage, this, message)
            });

            items.push({
              label: Locale.$STR("Copy"),
              nol10n: true,
              command: Obj.bindFixed(this.onCopyMessage, this, message)
            });

            items.push("-");

            items.push({
              label: Locale.$STR("Remove"),
              nol10n: true,
              command: Obj.bindFixed(this.onRemoveMessage, this, message)
            });
        }

        if (Dom.getAncestorByClass(target, "messageInfoStackText"))
        {
            items.push({
              label: Locale.$STR("Copy Stack"),
              nol10n: true,
              command: Obj.bindFixed(this.onCopyStack, this, message)
            });
        }

        if (Dom.getAncestorByClass(target, "messageInfoExcText"))
        {
            items.push({
              label: Locale.$STR("Copy Exception"),
              nol10n: true,
              command: Obj.bindFixed(this.onCopyException, this, message)
            });
        }

        if (items.length > 0)
            items.push("-");

        items.push(this.optionMenu(Locale.$STR("tracing.Show Time"), "trace.showTime"));
        items.push(this.optionMenu(Locale.$STR("tracing.Show Scope Variables"), "trace.enableScope"));
        items.push("-");

        items.push({
          label: Locale.$STR("tracing.cmd.Explore Firebug Scope"),
          nol10n: true,
          command: Obj.bindFixed(this.onExploreFirebug, this)
        });

        items.push("-");

        items.push({
          label: Locale.$STR("tracing.cmd.Expand All"),
          nol10n: true,
          command: Obj.bindFixed(this.onExpandAll, this, message)
        });

        items.push({
          label: Locale.$STR("tracing.cmd.Collapse All"),
          nol10n: true,
          command: Obj.bindFixed(this.onCollapseAll, this, message)
        });

        return items;
    },

    optionMenu: function(label, option)
    {
        var checked = Firebug.Options.getPref(Firebug.TraceModule.prefDomain, option);

        // The binding has to respect that the menu stays open even if the option
        // has been clicked.
        return {label: label, type: "checkbox", checked: checked, nol10n: true,
            command: function() {
                var checked = Firebug.Options.getPref(Firebug.TraceModule.prefDomain, option);
                Firebug.Options.setPref(Firebug.TraceModule.prefDomain, option, !checked);
            },
        };
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
        System.copyToClipboard(message.text);
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
        System.copyToClipboard(message.getStack());
    },

    onCopyException: function(message)
    {
        System.copyToClipboard(message.getException());
    },

    onExploreFirebug: function()
    {
        FirebugExplorer.dump();
    },

    onExpandAll: function(message)
    {
        var table = Dom.getAncestorByClass(message.row, "messageTable");
        var rows = Arr.cloneArray(table.firstChild.childNodes);
        for (var i=0; i<rows.length; i++)
            this.expandRow(rows[i]);
    },

    onCollapseAll: function(message)
    {
        var table = Dom.getAncestorByClass(message.row, "messageTable");
        var rows = Arr.cloneArray(table.firstChild.childNodes);
        for (var i=0; i<rows.length; i++)
            this.collapseRow(rows[i]);
    },

    // Clipboard helpers
    copyToClipboard: function(text)
    {
        if (!text)
            return;

        // Initialize transfer data.
        var trans = Xpcom.CCIN("@mozilla.org/widget/transferable;1", "nsITransferable");
        var wrapper = Xpcom.CCIN("@mozilla.org/supports-string;1", "nsISupportsString");
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
        // Notify listeners
        Firebug.TraceModule.onDump(message, outputNodes);

        // xxxHonza: find better solution for checking an ERROR messages
        // (setup some rules).
        if (message.text && (message.text.indexOf("ERROR") != -1 ||
            message.text.indexOf("EXCEPTION") != -1 ||
            message.text.indexOf("FAILS") != -1))
        {
            message.type = "DBG_ERRORS";
        }
        else if (message.text && message.text.indexOf("firebug.") == 0)
        {
            message.type = "DBG_INITIALIZATION";
        }
        else if (message.text && message.text.indexOf("fbs.") == 0)
        {
            message.type = "DBG_FBS";
        }
        else if (message.text && message.text.indexOf("script.") == 0)
        {
            message.type = "DBG_FBS";
        }
        else if (message.text && message.text.indexOf("BTI.") == 0)
        {
            message.type = "DBG_BTI";
        }

        var scrollingNode = outputNodes.getScrollingNode();
        var scrolledToBottom = Dom.isScrolledToBottom(scrollingNode);

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
            Dom.scrollToBottom(scrollingNode);
    },

    dumpSeparator: function(outputNodes, tag, object)
    {
        var panelNode = outputNodes.getScrollingNode();
        var scrolledToBottom = Dom.isScrolledToBottom(panelNode);

        var targetNode = outputNodes.getTargetNode();

        if (!tag)
            tag = this.separatorTag;

        if (!object)
            object = {type: "separator"};

        object.index = targetNode.childNodes.length;

        var row = HelperDomplate.insertRows(tag, {message: object}, targetNode, this)[0];

        if (scrolledToBottom)
            Dom.scrollToBottom(panelNode);

        panelNode.scrollTop = panelNode.scrollHeight - panelNode.offsetHeight + 50;
    },

    // Body of the message.
    onClickRow: function(event)
    {
        if (Events.isLeftClick(event))
        {
            var row = Dom.getAncestorByClass(event.target, "messageRow");
            if (row)
            {
                this.toggleRow(row);
                Events.cancelEvent(event);
            }
        }
    },

    collapseRow: function(row)
    {
        if (Css.hasClass(row, "messageRow") && Css.hasClass(row, "opened"))
            this.toggleRow(row);
    },

    expandRow: function(row)
    {
        if (Css.hasClass(row, "messageRow"))
            this.toggleRow(row, true);
    },

    toggleRow: function(row, state)
    {
        var opened = Css.hasClass(row, "opened");
        if ((state != null) && (opened == state))
             return;

        Css.toggleClass(row, "opened");

        if (Css.hasClass(row, "opened"))
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
        var tab = Dom.getChildByClass(messageInfoBody, "messageInfoTabs",
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
        messageInfoBody.selectedText = Dom.getChildByClass(messageInfoBody, textBodyName);

        messageInfoBody.selectedTab.setAttribute("selected", "true");
        messageInfoBody.selectedText.setAttribute("selected", "true");

        var message = Firebug.getRepObject(messageInfoBody);

        // Make sure the original Domplate is *not* tracing for now.
        var dumpDOM = FBTrace.DBG_DOMPLATE;
        FBTrace.DBG_DOMPLATE = false;
        this.updateInfo(messageInfoBody, view, message);
        FBTrace.DBG_DOMPLATE = dumpDOM;
    },

    updateInfo: function(messageInfoBody, view, message)
    {
        var tab = messageInfoBody.selectedTab;
        if (Css.hasClass(tab, "messageInfoStackTab"))
        {
            // The content is generated by domplate template.
        }
        else if (Css.hasClass(tab, "messageInfoPropsTab"))
        {
            this.updateInfoImpl(messageInfoBody, view, message, message.getProperties,
                function (message, valueBox, text) {
                    Firebug.TraceModule.Tree.tag.replace({object: message.props}, valueBox,
                        Firebug.TraceModule.Tree);
                });
        }
        else if (Css.hasClass(tab, "messageInfoScopeTab"))
        {
            this.updateInfoImpl(messageInfoBody, view, message, message.getScope,
                function (message, valueBox, text) {
                    Firebug.TraceModule.PropertyTree.tag.replace({object: message.scope}, valueBox,
                        Firebug.TraceModule.PropertyTree);
                });
        }
        else if (Css.hasClass(tab, "messageInfoIfacesTab"))
        {
            this.updateInfoImpl(messageInfoBody, view, message, message.getInterfaces,
                function (message, valueBox, text) {
                    Firebug.TraceModule.Tree.tag.replace({object: message.ifaces}, valueBox,
                        Firebug.TraceModule.Tree);
                });
        }
        else if (Css.hasClass(tab, "messageInfoTypesTab"))
        {
            this.updateInfoImpl(messageInfoBody, view, message, message.getTypes);
        }
        else if (Css.hasClass(tab, "messageInfoEventTab"))
        {
            this.updateInfoImpl(messageInfoBody, view, message, message.getEvent);
        }
        else if (Css.hasClass(tab, "messageInfoObjectTab"))
        {
            this.updateInfoImpl(messageInfoBody, view, message, message.getProperties,
                function (message, valueBox, text) {
                    var win = messageInfoBody.ownerDocument.defaultView;
                    if (message.obj instanceof win.Element.constructor)
                        Firebug.HTMLPanel.CompleteElement.tag.replace({object: message.obj}, valueBox,
                            Firebug.HTMLPanel.CompleteElement);
                    else
                        Firebug.TraceModule.PropertyTree.tag.replace({object: message.obj}, valueBox,
                            Firebug.TraceModule.PropertyTree);
                });
        }
        else if (Css.hasClass(tab, "messageInfoExcTab"))
        {
            this.updateInfoImpl(messageInfoBody, view, message, message.getException);
        }
        else if (Css.hasClass(tab, "messageInfoResponseTab"))
        {
            this.updateInfoImpl(messageInfoBody, view, message, message.getResponse,
                function (message, valueBox, text) {
                    var iframe = Dom.getChildByClass(valueBox, "messageInfoResponseFrame");
                    iframe.contentWindow.document.body.innerHTML = text;
                });
        }
        else if (Css.hasClass(tab, "messageInfoSourceTab"))
        {
            this.updateInfoImpl(messageInfoBody, view, message, message.getResponse,
                function (message, valueBox, text) {
                    if (text)
                        Str.insertWrappedText(text, valueBox);
                });
        }
    },

    updateInfoImpl: function(messageInfoBody, view, message, getter, setter)
    {
        var valueBox = Dom.getChildByClass(messageInfoBody, "messageInfo" + view + "Text");
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

// ********************************************************************************************* //
// Helper Domplate object that doesn't trace.

var HelperDomplate = (function()
{
    // Private helper function.
    function execute()
    {
        var args = Arr.cloneArray(arguments), fn = args.shift(), object = args.shift();

        // Make sure the original Domplate is *not* tracing for now.
        if (typeof FBTrace != "undefined")
        {
            var dumpDOM = FBTrace.DBG_DOMPLATE;
            FBTrace.DBG_DOMPLATE = false;
        }

        var retValue = fn.apply(object, args);

        if (typeof FBTrace != "undefined")
            FBTrace.DBG_DOMPLATE = dumpDOM;

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

// ********************************************************************************************* //
// Trace Message Object

Firebug.TraceModule.TraceMessage = function(type, text, obj, scope, time)
{
    this.type = type;
    this.text = text;
    this.obj = obj;
    this.stack = [];
    this.scope = scope;
    this.time = time;

    if (typeof(this.obj) == "function")
    {
        // will make functions visible
        this.obj = {"": this.obj};
    }

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
        var traceServiceFile = "firebug-trace-service.js";
        var firebugServiceFile = "firebug-service.js";

        // Initialize stack trace info. This must be done now, when the stack
        // is available.
        for (var frame = Components.stack, i=0; frame; frame = frame.caller, i++)
        {
            // Skip frames related to the tracing code.
            var fileName = unescape(frame.filename ? frame.filename : "");

            // window.dump("traceModule frame "+i+": "+fileName+"\n");
            if (i < 5 || fileName.indexOf(traceServiceFile) != -1)
                continue;

            if (fileName.indexOf(firebugServiceFile) != -1)
                this.fbsIsOnStack = true;

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

    if (!this.fbsIsOnStack)
        this.getScope();
}

// ********************************************************************************************* //

Firebug.TraceModule.TraceMessage.prototype =
{
    getType: function()
    {
        return this.type;
    },

    getLabel: function(maxLength)
    {
        if (!maxLength)
            maxLength = 0;

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
                    var name = Wrapper.unwrapIValue(prop.name);
                    this.props[name] = "" + Wrapper.unwrapIValue(prop.value);
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

                    try
                    {
                        // If "this.obj.__lookupGetter__(p)" is executed for 'window' when
                        // p == 'globalStorage' (or local or session) the property is not
                        // accessbible anymore when iterated in getMembers (dom.js)
                        if (!Dom.isDOMMember(this.obj, p) && this.obj.__lookupGetter__)
                            var getter = this.obj.__lookupGetter__(p);
                        if (getter)
                            var value = "" + getter;
                        else
                            var value = Str.safeToString(this.obj[p]);

                        this.props[p] = value;
                    }
                    catch (err)
                    {
                        this.props[p] = "{Error}";
                    }
                }
            }
            catch (exc)
            {
            }
        }

        return this.props;
    },

    getInterfaces: function()
    {
        if (this.ifaces)
            return this.ifaces;

        this.ifaces = [];

        if (!this.obj)
            return;

        for (var iface in Ci)
        {
            try
            {
                // http://groups.google.com/group/mozilla.dev.platform/browse_thread/thread/7e660bf20836fa47
                if (/*("prototype" in Ci[iface]) && */this.obj instanceof Ci[iface])
                {
                    var ifaceProps = this.ifaces[iface] = [];
                    for (p in Ci[iface])
                        ifaceProps[p] = this.obj[p];
                }
            }
            catch (err)
            {
                //onPanic("TraceMessage.getInterfaces: " + iface+" typeof(Ci[iface].prototype)="+
                //    typeof(Ci[iface].prototype), err);
            }
        }
        return this.ifaces;
    },

    getScope: function()
    {
        if (!Firebug.Options.get("trace.enableScope"))
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
            Firebug.TabWatcher.iterateContexts(function(context) {
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

        // xxxJJB: this isn't needed, instanceof does QI. try {this.obj =
        // this.obj.QueryInterface(Ci.nsIException);} catch (err){}
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

        try
        {
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
        if (!(this.obj instanceof window.Event))
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

// ********************************************************************************************* //
// Imported message

Firebug.TraceModule.ImportedMessage = function(logMsg)
{
    this.type = logMsg.type;
    this.text = logMsg.text;
    this.obj = null;
    this.stack = logMsg.stack;
    this.scope = null;
    this.time = logMsg.time;
}

Firebug.TraceModule.ImportedMessage.prototype = Obj.extend(Firebug.TraceModule.TraceMessage.prototype,
{
    getStackArray: function()
    {
        return cloneArray(this.stack);
    },
})

// ********************************************************************************************* //

var lastPanic = null;
function onPanic(contextMessage, errorMessage)
{
    var appShellService = Cc["@mozilla.org/appshell/appShellService;1"].getService(Ci.nsIAppShellService);
    var win = appShellService.hiddenDOMWindow;
    // XXXjjb I cannot get these tests to work.
    //if (win.lastPanic && (win.lastPanic == errorMessage))
        win.dump("traceModule: "+contextMessage +" panic attack "+errorMessage+"\n");
    //else
    //alert("Firebug traceModule panics: "+errorMessage);

    win.lastPanic = errorMessage;
}

// ********************************************************************************************* //
// Domplate helpers - Tree (domplate widget)

/**
 * This object is intended as a domplate widget for displaying hierarchical
 * structure (tree). Specific tree should be derived from this object and
 * getMembers method should be implemented.
 */
Firebug.TraceModule.Tree = domplate(Firebug.Rep,
{
    tag:
        TABLE({"class": "domTable", cellpadding: 0, cellspacing: 0, onclick: "$onClick"},
            TBODY(
                FOR("member", "$object|memberIterator",
                    TAG("$member|getRowTag", {member: "$member"}))
            )
        ),

    rowTag:
        TR({"class": "memberRow $member.open $member.type\\Row", $hasChildren: "$member.hasChildren",
            _repObject: "$member", level: "$member.level"},
            TD({"class": "memberLabelCell",
                style: "padding-left: $member.indent\\px; width:1%; white-space: nowrap"},
                DIV({"class": "memberLabel $member.type\\Label"}, "$member.name")
            ),
            TD({"class": "memberValueCell", style: "width: 100%;"},
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

        var row = Dom.getAncestorByClass(event.target, "memberRow");
        var label = Dom.getAncestorByClass(event.target, "memberLabel");
        if (label && Css.hasClass(row, "hasChildren"))
            this.toggleRow(row);
    },

    toggleRow: function(row)
    {
        var level = parseInt(row.getAttribute("level"));
        var target = row.lastChild.firstChild;
        var isString = Css.hasClass(target,"objectBox-string");
        var repObject = row.repObject;

        if (Css.hasClass(row, "opened"))
        {
            Css.removeClass(row, "opened");
            if (isString)
            {
                var rowValue = repObject.value;
                row.lastChild.firstChild.textContent = '"' + Str.cropMultipleLines(rowValue) + '"';
            }
            else
            {
                var tbody = row.parentNode;
                for (var firstRow = row.nextSibling; firstRow; firstRow = row.nextSibling)
                {
                    if (parseInt(firstRow.getAttribute("level")) <= level)
                        break;

                    tbody.removeChild(firstRow);
                }
            }
        }
        else
        {
            Css.setClass(row, "opened");
            if (isString)
            {
                var rowValue = repObject.value;
                row.lastChild.firstChild.textContent = '"' + rowValue + '"';
            }
            else
            {
                if (repObject)
                {
                    var members = this.getMembers(repObject.value, level+1);
                    if (members)
                        this.loop.insertRows({members: members}, row);
                }
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
        for (var p in object)
        {
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

        var hasChildren = Obj.hasProperties(value) && !(value instanceof FirebugReps.ErrorCopy) &&
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
    }
});

// ********************************************************************************************* //

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

// ********************************************************************************************* //
// Registration

Firebug.registerModule(Firebug.TraceModule);
Firebug.registerRep(Firebug.TraceModule.MessageTemplate);

// ********************************************************************************************* //

return Firebug.TraceModule;

// ********************************************************************************************* //
}});
