/* See license.txt for terms of usage */

FBTestApp.ns( /** @scope _testResultRep_ */ function() { with (FBL) {

// ************************************************************************************************
// Shorcuts and Services

var Cc = Components.classes;
var Ci = Components.interfaces;
var Cu = Components.utils;

Cu["import"]("resource://fbtest/FBTestIntegrate.js");

// ************************************************************************************************
// Domplate for tests results

/**
 * This template represents a "test-result" that is beening displayed within
 * Trace Console window. Expandable and collapsible logic associated with each
 * result is also implemented by this object.
 * 
 * @domplate
 */
FBTestApp.TestResultRep = domplate(
/** @lends FBTestApp.TestResultRep */
{
    tableTag:
        TABLE({"class": "testResultTable", cellpadding: 0, cellspacing: 0, onclick: "$onClick"},
            TBODY()
        ),

    resultTag:
        FOR("result", "$results",
            TR({"class": "testResultRow", _repObject: "$result",
                $testError: "$result|isError",
                $testOK: "$result|isOK"},
                TD({"class": "testResultCol", width: "100%"},
                    DIV({"class": "testResultMessage testResultLabel"},
                        "$result|getMessage"
                    ),
                    DIV({"class": "testResultFullMessage testResultMessage testResultLabel"},
                        "$result.msg"
                    )
                ),
                TD({"class": "testResultCol"},
                    DIV({"class": "testResultFileName testResultLabel"},
                        "$result|getFileName"
                    )
                )
            )
        ),

    resultInfoTag:
        TR({"class": "testResultInfoRow", _repObject: "$result",
            $testError: "$result|isError"},
            TD({"class": "testResultInfoCol", colspan: 2})
        ),

    manualVerifyTag:
        TR({"class": "testResultRow testManualVerify", _repObject: "$test",
            onclick: "$onClickManualVerify"},
            TD({"class": "testResultCol", width: "100%"},
                DIV({"class": "testResultLabel"}, "$verifyMsg"),
                PRE({"class": "testResultLabel"}, "$instructions")
            ),
            TD({"class": "testResultCol"},
                SPAN({"class": "testLink", onclick: "$onManualPasses"},
                    "Pass"
                ),
                "&nbsp;",
                SPAN({"class": "testLink", onclick: "$onManualFails" },
                    "Fail"
                )
            )
        ),

    getMessage: function(result)
    {
        return cropString(result.msg, 200);
    },

    getFileName: function(result)
    {
        // xxxHonza: the file name is always content of the wrapAJSFile.html file.
        return ""; //unescape(result.fileName);
    },

    isError: function(result)
    {
        return !result.pass;
    },

    isOK: function(result)
    {
        return result.pass;
    },

    summaryPassed: function(summary)
    {
        return !summary.failing;
    },

    onClick: function(event)
    {
        if (isLeftClick(event))
        {
            var row = getAncestorByClass(event.target, "testResultRow");
            if (row)
            {
                this.toggleResultRow(row);
                cancelEvent(event);
            }
        }
    },

    onClickManualVerify: function(event)
    {
        cancelEvent(event);
    },

    onManualPasses: function(event)
    {
        this.handleManualVerify(event, true, "Manual verification passed");
    },

    onManualFails: function(event)
    {
        this.handleManualVerify(event, false, "Manual verification failed");
    },

    handleManualVerify: function(event, passes, msg)
    {
        cancelEvent(event);

        var row = getAncestorByClass(event.target, "testManualVerify");
        var test = Firebug.getRepObject(row);

        row.parentNode.removeChild(row);

        if (!test || !test.cleanupHandler)
        {
            FBTestApp.FBTest.ok(passes, msg);
            FBTestApp.FBTest.testDone();
        }
        else
        {
            test.cleanupHandler.call({}, passes);
        }
    },

    toggleResultRow: function(row)
    {
        var result = row.repObject;

        toggleClass(row, "opened");
        if (hasClass(row, "opened"))
        {
            var infoBodyRow = this.resultInfoTag.insertRows({result: result}, row)[0];
            infoBodyRow.repObject = result;
            this.initInfoBody(infoBodyRow);
        }
        else
        {
            var infoBodyRow = row.nextSibling;
            var netInfoBox = getElementByClass(infoBodyRow, "testResultInfoBody");
            row.parentNode.removeChild(infoBodyRow);
        }
    },

    initInfoBody: function(infoBodyRow)
    {
        var result = infoBodyRow.repObject;
        var TabView = FBTestApp.TestResultTabView;
        var tabViewNode = TabView.viewTag.replace({result: result}, infoBodyRow.firstChild, TabView);

        // Select default tab.
        TabView.selectTabByName(tabViewNode, "Stack");
    },

    // Firebug rep support
    supportsObject: function(testResult)
    {
        return testResult instanceof FBTestApp.TestResult;
    },

    browseObject: function(testResult, context)
    {
        return false;
    },

    getRealObject: function(testResult, context)
    {
        return testResult;
    },

    getContextMenuItems: function(testResult, target, context)
    {
        // xxxHonza: The "copy" command shouldn't be there for now.
        var popup = $("fbContextMenu");
        FBL.eraseNode(popup);

        var items = [];

        if (testResult.stack)
        {
            items.push({
              label: $STR("fbtest.item.Copy"),
              nol10n: true,
              command: bindFixed(this.onCopy, this, testResult)
            });

            items.push({
              label: $STR("fbtest.item.Copy_All"),
              nol10n: true,
              command: bindFixed(this.onCopyAll, this, testResult)
            });

            items.push("-");

            items.push({
              label: $STR("fbtest.item.View_Source"),
              nol10n: true,
              command: bindFixed(this.onViewSource, this, testResult)
            });
        }

        return items;
    },

    // Context menu commands
    onViewSource: function(testResult)
    {
        var stackFrame = testResult.stack[0];
        var winType = "FBTraceConsole-SourceView";
        var lineNumber = stackFrame.lineNumber;

        openDialog("chrome://global/content/viewSource.xul",
            winType, "all,dialog=no",
            stackFrame.fileName, null, null, lineNumber, false);
    },

    onCopy: function(testResult)
    {
        copyToClipboard(testResult.msg);
    },

    onCopyAll: function(testResult)
    {
        var tbody = getAncestorByClass(testResult.row, "testTable").firstChild;
        var passLabel = $STR("fbtest.label.Pass");
        var failLabel = $STR("fbtest.label.Fail");

        var text = "";
        for (var row = tbody.firstChild; row; row = row.nextSibling) {
            if (hasClass(row, "testResultRow") && row.repObject) {
                text += (hasClass(row, "testError") ? failLabel : passLabel);
                text += ": " + row.repObject.msg;
                text += ", " + row.repObject.fileName + "\n";
            }
        }

        var summary = getElementByClass(tbody, "testResultSummaryRow");
        if (summary) {
            summary = summary.firstChild;
            text += summary.childNodes[0].textContent + ", " +
                summary.childNodes[1].textContent;
        }

        copyToClipboard(text);
    },
});

// ************************************************************************************************

/**
 * This template represents an "info-body" for expanded test-result. This
 * object also implements logic related to a tab view.
 *
 * xxxHonza: since the tab view is used already several times, it would
 * be very useful to have a TabView widget defined in Firebug's Domplate
 * repository.
 * 
 * @domplate  
 */
FBTestApp.TestResultTabView = domplate(
/** @lends FBTestApp.TestResultTabView */
{
    listeners: [],

    viewTag:
        TABLE({"class": "tabView", cellpadding: 0, cellspacing: 0},
            TBODY(
                TR({"class": "tabViewRow"},
                    TD({"class": "tabViewCol", valign: "top"},
                        TAG("$tabList", {result: "$result"})
                    )
                )
            )
        ),

    tabList:
        DIV({"class": "tabViewBody"},
            TAG("$tabBar", {result: "$result"}),
            TAG("$tabBodies")
        ),

    // List of tabs
    tabBar:
        DIV({"class": "tabBar"},
            A({"class": "StackTab tab", onclick: "$onClickTab",
                view: "Stack", $collapsed: "$result|hideStackTab"},
                    $STR("fbtest.tab.Stack")
            ),
            A({"class": "CompareTab tab", onclick: "$onClickTab",
                view: "Compare", $collapsed: "$result|hideCompareTab"},
                    $STR("fbtest.tab.Compare")
            ),
            A({"class": "ExceptionTab tab", onclick: "$onClickTab",
                view: "Exception", $collapsed: "$result|hideExceptionTab"},
                    $STR("fbtest.tab.Exception")
            )
        ),

    // List of tab bodies
    tabBodies:
        DIV({"class": "tabBodies"},
            DIV({"class": "tabStackBody tabBody"}),
            DIV({"class": "tabCompareBody tabBody"}),
            DIV({"class": "tabExceptionBody tabBody"})
        ),

    // Stack tab displayed within resultInfoRow
    stackTag:
        TABLE({"class": "testResultStackInfoBody", cellpadding: 0, cellspacing: 0},
            TBODY(
                FOR("stack", "$result.stack",
                    TR(
                        TD(
                            A({"class": "stackFrameLink", onclick: "$onClickStackFrame",
                                lineNumber: "$stack.lineNumber"},
                                "$stack.fileName"),
                            SPAN("&nbsp;"),
                            SPAN("(", $STR("fbtest.test.Line"), " $stack.lineNumber", ")")
                        )
                    )
                )
            )
        ),

    // Compare tab displayed within resultInfoRow
    compareTag:
        TABLE({"class": "testResultCompareInfoBody", cellpadding: 0, cellspacing: 0},
            TBODY(
                TR({"class": "testResultCompareTitle expected"},
                    TD(
                        $STR("fbtest.title.Expected")
                    ),
                    TD({"class": "testResultCompareSwitch expected",
                        onclick: "$onSwitchView", view: "fbtest.switch.view_source"},
                        $STR("fbtest.switch.view_source")
                    )
                ),
                TR(
                    TD({"class": "testResultExpected", colspan: 2})
                ),
                TR({"class": "testResultCompareTitle result"},
                    TD(
                        $STR("fbtest.title.Result")
                    ),
                    TD({"class": "testResultCompareSwitch result",
                        onclick: "$onSwitchView", view: "fbtest.switch.view_source"},
                        $STR("fbtest.switch.view_source")
                    )
                ),
                TR(
                    TD({"class": "testResultActual", colspan: 2})
                ),
                TR({"class": "testResultCompareTitle diff",
                    $collapsed: "$result|hideDiffGroup"},
                    TD({colspan: 2},
                        $STR("fbtest.title.Difference")
                    )
                ),
                TR(
                    TD({"class": "testResultDiff", colspan: 2})
                )
            )
        ),

    resultFrameTag:
        IFRAME({"class": "testResultFrame"}),

    hideStackTab: function(result)
    {
        return false;
    },

    hideCompareTab: function(result)
    {
        // The Compare tab is visible if any of these two members is set.
        // This is useful since sometimes the expected result is null and
        // the user wants to see it also in the UI.
        return !result.expected && !result.result;
    },

    hideExceptionTab: function(result)
    {
        return !result.err;
    },

    hideDiffGroup: function(result)
    {
        return (result.expected == result.result);
    },

    onClickTab: function(event)
    {
        this.selectTab(event.target);
    },

    selectTabByName: function(tabView, tabName)
    {
        var tab = getElementByClass(tabView, tabName + "Tab");
        if (tab)
            this.selectTab(tab);
    },

    selectTab: function(tab)
    {
        var view = tab.getAttribute("view");
        var viewBody = getAncestorByClass(tab, "tabViewBody");

        // Deactivate current tab.
        if (viewBody.selectedTab)
        {
            viewBody.selectedTab.removeAttribute("selected");
            viewBody.selectedBody.removeAttribute("selected");
        }

        // Store info about new active tab. Each tab has to have a body,
        // which is identified by class.
        var tabBody = getElementByClass(viewBody, "tab" + view + "Body");
        viewBody.selectedTab = tab;
        viewBody.selectedBody = tabBody;

        // Activate new tab.
        viewBody.selectedTab.setAttribute("selected", "true");
        viewBody.selectedBody.setAttribute("selected", "true");

        this.updateTabBody(viewBody, view);
    },

    updateTabBody: function(viewBody, tabName)
    {
        var tab = viewBody.selectedTab;
        var infoRow = getAncestorByClass(viewBody, "testResultInfoRow");
        var result = infoRow.repObject;

        // Update Stack tab content
        var tabStackBody = getElementByClass(viewBody, "tabStackBody");
        if (tabName == "Stack" && !tabStackBody.updated)
        {
            tabStackBody.updated = true;
            this.stackTag.replace({result: result}, tabStackBody, this);
        }

        // Update Compare tab content
        var tabCompareBody = getElementByClass(viewBody, "tabCompareBody");
        if (tabName == "Compare" && !tabCompareBody.updated)
        {
            tabCompareBody.updated = true;
            this.compareTag.replace({result: result}, tabCompareBody, this);

            var expectedNode = getElementByClass(viewBody, "testResultExpected");
            var actualNode = getElementByClass(viewBody, "testResultActual");

            if (this.isImage(result.expected))
                this.insertImage(result.expected, expectedNode);
            else if (this.isXml(result.expected))
                this.insertXml(result.expected, expectedNode);
            else
                this.insertText(result.expected, expectedNode);

            if (this.isImage(result.result))
                this.insertImage(result.result, actualNode);
            else if (this.isXml(result.expected))
                this.insertXml(result.result, actualNode);
            else
                this.insertText(result.result, actualNode);

            // The diff is generated only if there are any differences.
            if (result.expected != result.result) {
                var diffNode = getElementByClass(viewBody, "testResultDiff");
                var diffText = diffString(clean(result.expected), clean(result.result));
                diffNode.innerHTML = diffText;
            }
        }

        // Update Exception tab content
        var tabExceptionBody = getElementByClass(viewBody, "tabExceptionBody");
        if (tabName == "Exception" && !tabExceptionBody.updated)
        {
            tabExceptionBody.updated = true;
            var propTree = FBTestApp.PropertyTree;
            propTree.tag.replace({object: result.err}, tabExceptionBody, propTree);
        }
    },

    isImage: function(text)
    {
        return (text && text.indexOf("data:image/") == 0);
    },

    isXml: function(text)
    {
        var parser = Cc["@mozilla.org/xmlextras/domparser;1"].createInstance(Ci.nsIDOMParser);

        // Create helper root element (for the case where there is no signle root).
        var tempXml = "<wrapper>" + text + "</wrapper>";
        var doc = parser.parseFromString(tempXml, "text/xml");
        var docElem = doc.documentElement;
        var nsURI = "http://www.mozilla.org/newlayout/xml/parsererror.xml";

        return docElem.namespaceURI != nsURI && docElem.nodeName != "parsererror";
    },

    onSwitchView: function(event)
    {
        var target = event.target;
        var expected = hasClass(target, "expected");
        var infoRow = getAncestorByClass(target, "testResultInfoRow");
        var result = infoRow.repObject;
        var sourceBody = getElementByClass(infoRow, expected ? "testResultExpected" : "testResultActual");

        clearNode(sourceBody);

        var views = [
            "fbtest.switch.view_source",
            "fbtest.switch.escaped",
            "fbtest.switch.pretty_print",
        ];

        // There are three possible views alternating as user clicks on the switch link.
        var view = target.getAttribute("view");
        if (!view || view == views[0])
        {
            // display view source, next view: escaped
            insertWrappedText(expected ? result.expected : result.result, sourceBody);
            view = views[1];
        }
        else if (view == views[1])
        {
            // display escaped, next view: pretty print
            insertWrappedText(escape(expected ? result.expected : result.result), sourceBody);
            view = views[2];
        }
        else if (view == views[2])
        {
            // display pretty print, next view: view source.
            this.insertXml(result.expected, sourceBody);
            view = views[0];
        }

        target.setAttribute("view", view);
        target.innerHTML = $STR(view);
    },

    onClickStackFrame: function(event)
    {
        var lineNumber = event.target.getAttribute("lineNumber");
        FBTestIntegrate.onSourceLinkClicked(event.target, event.target.innerHTML, lineNumber);
    },

    insertXml: function(xml, parentNode)
    {
        var parser = Cc["@mozilla.org/xmlextras/domparser;1"].createInstance(Ci.nsIDOMParser);

        // Create helper root element (for the case where there is no signle root).
        var tempXml = "<wrapper>" + xml + "</wrapper>";
        var doc = parser.parseFromString(tempXml, "text/xml");
        var docElem = doc.documentElement;

        // Error handling
        var nsURI = "http://www.mozilla.org/newlayout/xml/parsererror.xml";
        if (docElem.namespaceURI == nsURI && docElem.nodeName == "parsererror")
        {
            var errorNode = ParseErrorRep.tag.replace({error: {
                message: docElem.firstChild.nodeValue,
                source: docElem.lastChild.textContent
            }}, parentNode);

            var xmlSource = getElementByClass(errorNode, "xmlInfoSource");
            insertWrappedText(xml, xmlSource);
            return;
        }

        // Generate UI. Get appropriate domplate tag for every element that is found
        // within the helper <wrapper> and append it into the parent container.
        for (var i=0; i<docElem.childNodes.length; i++)
        {
            FBTestApp.FBTest.FirebugWindow.Firebug.HTMLPanel.CompleteElement.getNodeTag(
                docElem.childNodes[i]).append({object: docElem.childNodes[i]}, parentNode);
        }
    },

    insertText: function(data, parentNode)
    {
        if (data)
            insertWrappedText(data, parentNode);
    },

    insertImage: function(data, parentNode)
    {
        var frame = this.resultFrameTag.replace({}, parentNode, this);
        frame.setAttribute("src", data);
    }
});

// ************************************************************************************************

/**
 * This template displays a parse-erros that can occurs when parsing
 * expected and acuall results (see compare method).
 * 
 * @domplate  
 */
var ParseErrorRep = domplate(
/** @lends ParseErrorRep */
{
    tag:
        DIV({"class": "xmlInfoError"},
            DIV({"class": "xmlInfoErrorMsg"}, "$error.message"),
            PRE({"class": "xmlInfoErrorSource"}, "$error|getSource"),
            BR(),
            PRE({"class": "xmlInfoSource"})
        ),

    getSource: function(error)
    {
        var parts = error.source.split("\n");
        if (parts.length != 2)
            return error.source;

        var limit = 50;
        var column = parts[1].length;
        if (column >= limit) {
            parts[0] = "..." + parts[0].substr(column - limit);
            parts[1] = "..." + parts[1].substr(column - limit);
        }

        if (parts[0].length > 80)
            parts[0] = parts[0].substr(0, 80) + "...";

        return parts.join("\n");
    }
});

// ************************************************************************************************
// Helper Objects

/**
 * This object represents a test-result.
 */
FBTestApp.TestResult = function(win, pass, msg, expected, result)
{
    var location = win.location.href;
    this.fileName = location.substr(location.lastIndexOf("/") + 1);

    this.pass = pass ? true : false;
    this.msg = msg;//clean(msg);

    // Make sure the following values are strings.
    this.expected = expected ? expected + "" : null;
    this.result = result ? result + "" : null;

    // xxxHonza: there should be perhaps simple API in lib.js to get the stack trace.
    this.stack = [];
    for (var frame = Components.stack, i=0; frame; frame = frame.caller, i++)
    {
        var fileName = unescape(frame.filename ? frame.filename : "");
        //if (fileName.indexOf("chrome://fbtest/content") == 0)
        //    continue;

        var lineNumber = frame.lineNumber ? frame.lineNumber : "";
        this.stack.push({fileName:fileName, lineNumber:lineNumber});
    }
};

FBTestApp.TestException = function(win, msg, err)
{
    var msg = msg + " " + err + " " + err.fileName + " (" + err.lineNumber + ")";
    FBTestApp.TestResult.call(this, win, false, msg);

    this.err = err;
    this.expected = null;
    this.result = null;
};

// ************************************************************************************************

function clean(str)
{
    try
    {
        return str ? str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;") : "";
    }
    catch (err)
    {
        FBTrace.sysout("fbtest.clean; EXCEPTION " + str, err);
    }

    return str;
}

// ************************************************************************************************
// Registration

Firebug.registerRep(FBTestApp.TestResultRep);

// ************************************************************************************************
}});

