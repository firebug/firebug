/* See license.txt for terms of usage */

define([
    "firebug/lib/trace",
    "firebug/lib/domplate",
    "firebug/lib/object",
    "firebug/lib/string",
    "firebug/lib/dom",
    "firebug/lib/events",
    "firebug/lib/css",
    "firebug/lib/locale",
    "firebug/lib/system",
    "fbtest/testResultTabView",
],
function(FBTrace, Domplate, Obj, Str, Dom, Events, Css, Locale, System, TestResultTabView) {
with (Domplate) {

// ********************************************************************************************* //
// Constants

var Cc = Components.classes;
var Ci = Components.interfaces;
var Cu = Components.utils;

Cu["import"]("resource://fbtest/FBTestIntegrate.js");

// ********************************************************************************************* //
// TestResultRep Implementation

/**
 * This template represents a "test-result" that is beening displayed within
 * Trace Console window. Expandable and collapsible logic associated with each
 * result is also implemented by this object.
 *
 * @domplate
 */
var TestResultRep = domplate(
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

    getMessage: function(result)
    {
        return Str.cropString(result.msg, 200);
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
        if (Events.isLeftClick(event))
        {
            var row = Dom.getAncestorByClass(event.target, "testResultRow");
            if (row)
            {
                this.toggleResultRow(row);
                Events.cancelEvent(event);
            }
        }
    },

    toggleResultRow: function(row)
    {
        var result = row.repObject;

        Css.toggleClass(row, "opened");
        if (Css.hasClass(row, "opened"))
        {
            var infoBodyRow = this.resultInfoTag.insertRows({result: result}, row)[0];
            infoBodyRow.repObject = result;
            this.initInfoBody(infoBodyRow);
        }
        else
        {
            var infoBodyRow = row.nextSibling;
            var netInfoBox = Dom.getElementByClass(infoBodyRow, "testResultInfoBody");
            row.parentNode.removeChild(infoBodyRow);
        }
    },

    initInfoBody: function(infoBodyRow)
    {
        var result = infoBodyRow.repObject;
        var tabViewNode = TestResultTabView.viewTag.replace({result: result},
            infoBodyRow.firstChild, TestResultTabView);

        // Select default tab.
        TestResultTabView.selectTabByName(tabViewNode, "Stack");
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
        var popup = Firebug.chrome.$("fbContextMenu");
        Dom.eraseNode(popup);

        var items = [];

        if (testResult.stack)
        {
            items.push({
              label: Locale.$STR("fbtest.item.Copy"),
              nol10n: true,
              command: Obj.bindFixed(this.onCopy, this, testResult)
            });

            items.push({
              label: Locale.$STR("fbtest.item.Copy_All"),
              nol10n: true,
              command: Obj.bindFixed(this.onCopyAll, this, testResult)
            });

            items.push("-");

            items.push({
              label: Locale.$STR("fbtest.item.View_Source"),
              nol10n: true,
              command: Obj.bindFixed(this.onViewSource, this, testResult)
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
        System.copyToClipboard(testResult.msg);
    },

    onCopyAll: function(testResult)
    {
        var tbody = Dom.getAncestorByClass(testResult.row, "testTable").firstChild;
        var passLabel = Locale.$STR("fbtest.label.Pass");
        var failLabel = Locale.$STR("fbtest.label.Fail");

        var text = "";
        for (var row = tbody.firstChild; row; row = row.nextSibling) {
            if (Css.hasClass(row, "testResultRow") && row.repObject) {
                text += (Css.hasClass(row, "testError") ? failLabel : passLabel);
                text += ": " + row.repObject.msg;
                text += ", " + row.repObject.fileName + "\n";
            }
        }

        var summary = Dom.getElementByClass(tbody, "testResultSummaryRow");
        if (summary) {
            summary = summary.firstChild;
            text += summary.childNodes[0].textContent + ", " +
                summary.childNodes[1].textContent;
        }

        System.copyToClipboard(text);
    },
});

// ********************************************************************************************* //
// Registration

Firebug.registerRep(TestResultRep);

return TestResultRep;

// ********************************************************************************************* //
}});
