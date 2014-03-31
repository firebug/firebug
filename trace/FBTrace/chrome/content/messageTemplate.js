/* See license.txt for terms of usage */

define([
    "fbtrace/trace",
    "fbtrace/lib/events",
    "fbtrace/lib/window",
    "fbtrace/lib/css",
    "fbtrace/lib/locale",
    "fbtrace/lib/string",
    "fbtrace/lib/options",
    "fbtrace/lib/object",
    "fbtrace/lib/system",
    "fbtrace/lib/array",
    "fbtrace/lib/domplate",
    "fbtrace/lib/dom",
    "fbtrace/helperDomplate",
    "fbtrace/traceMessage",
    "fbtrace/importedMessage",
    "fbtrace/tree",
    "fbtrace/propertyTree",
    "fbtrace/lib/reps",
    "fbtrace/traceModule",
],
function(FBTrace, Events, Win, Css, Locale, Str, Options,
    Obj, System, Arr, Domplate, Dom, HelperDomplate, TraceMessage,
    ImportedMessage, Tree, PropertyTree, Reps, TraceModule) {

with (Domplate) {

// ********************************************************************************************* //
// Constants

var Cc = Components.classes;
var Ci = Components.interfaces;
var Cu = Components.utils;

// ********************************************************************************************* //
// Trace message

var MessageTemplate = domplate(Reps.Rep,
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
        var maxLength = Options.get("trace.maxMessageLength");
        return message.getLabel(maxLength);
    },

    getMessageTitle: function(message)
    {
        return encodeURIComponent(message.getLabel(-1));
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

        // Scripts loaded using loadSubScript (e.g. loaded by a module loader) use
        // specific URL syntax:
        // loader -> script URL
        // Get the last part "script URL" in order to have meaningful URL
        var urls = url.split("->");
        if (urls.length > 1)
            url = Str.trim(urls[urls.length - 1]);

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
        return object instanceof TraceMessage || object instanceof ImportedMessage;
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
                label: Locale.$STR("tracing.cmd.Copy Stack"),
                tooltiptext: Locale.$STR("tracing.cmd.tip.Copy Stack"),
                nol10n: true,
                command: Obj.bindFixed(this.onCopyStack, this, message)
            });
        }

        if (Dom.getAncestorByClass(target, "messageInfoExcText"))
        {
            items.push({
                label: Locale.$STR("tracing.cmd.Copy Exception"),
                tooltiptext: Locale.$STR("tracing.cmd.tip.Copy Exception"),
                nol10n: true,
                command: Obj.bindFixed(this.onCopyException, this, message)
            });
        }

        if (items.length > 0)
            items.push("-");

        items.push(this.optionMenu(Locale.$STR("tracing.Show Time"), "trace.showTime"));
        items.push("-");

        items.push({
          label: Locale.$STR("tracing.cmd.Expand All"),
          tooltiptext: Locale.$STR("tracing.cmd.tip.Expand All"),
          nol10n: true,
          command: Obj.bindFixed(this.onExpandAll, this, message)
        });

        items.push({
          label: Locale.$STR("tracing.cmd.Collapse All"),
          tooltiptext: Locale.$STR("tracing.cmd.tip.Collapse All"),
          nol10n: true,
          command: Obj.bindFixed(this.onCollapseAll, this, message)
        });

        return items;
    },

    optionMenu: function(label, option)
    {
        var checked = Options.get(option);

        // The binding has to respect that the menu stays open even if the option
        // has been clicked.
        return {label: label, type: "checkbox", checked: checked, nol10n: true,
            command: function() {
                var checked = Options.get(option);
                Options.set(option, !checked);
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

    // Implementation
    createTable: function(parentNode)
    {
        return HelperDomplate.replace(this.tableTag, {}, parentNode, this);
    },

    dump: function(message, outputNodes, index)
    {
        // Notify listeners
        // xxxHonza: causing cyclic deps, should be notification sent to TraceModule.
        TraceModule.onDump(message, outputNodes);

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
        else if (message.text && message.text.indexOf("!!!") == 0)
        {
            message.type = "DBG_EXCLAMATION";
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

        var message = Reps.getRepObject(messageInfoBody);

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
                    Tree.tag.replace({object: message.props}, valueBox, Tree);
                });
        }
        else if (Css.hasClass(tab, "messageInfoIfacesTab"))
        {
            this.updateInfoImpl(messageInfoBody, view, message, message.getInterfaces,
                function (message, valueBox, text) {
                    Tree.tag.replace({object: message.ifaces}, valueBox, Tree);
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
                    // xxxHonza: HTML Reps must be ported.
                    //if (message.obj instanceof win.Element.constructor)
                    //{
                    //    HTMLPanel.CompleteElement.tag.replace({object: message.obj}, valueBox,
                    //        HTMLPanel.CompleteElement);
                    //}
                    //else
                    //{
                        PropertyTree.tag.replace({object: message.obj}, valueBox, PropertyTree);
                    //}
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
// Registration

Reps.registerRep(MessageTemplate);

// ********************************************************************************************* //

return MessageTemplate;

// ********************************************************************************************* //
}});
