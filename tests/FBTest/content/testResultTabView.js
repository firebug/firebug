/* See license.txt for terms of usage */

define([
    "firebug/lib/trace",
    "firebug/lib/domplate",
    "firebug/lib/string",
    "firebug/lib/dom",
    "firebug/lib/css",
    "firebug/lib/locale",
    "fbtest/jsStringDiff",
    "fbtest/propTree",
],
function(FBTrace, Domplate, Str, Dom, Css, Locale, JSDiff, PropTree) {
with (Domplate) {

// ********************************************************************************************* //
// Constants

var Cc = Components.classes;
var Ci = Components.interfaces;
var Cu = Components.utils;

Cu["import"]("resource://fbtest/FBTestIntegrate.js");

// ********************************************************************************************* //

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
var TestResultTabView = domplate(
/** @lends TestResultTabView */
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
                    Locale.$STR("fbtest.tab.Stack")
            ),
            A({"class": "CompareTab tab", onclick: "$onClickTab",
                view: "Compare", $collapsed: "$result|hideCompareTab"},
                    Locale.$STR("fbtest.tab.Compare")
            ),
            A({"class": "ExceptionTab tab", onclick: "$onClickTab",
                view: "Exception", $collapsed: "$result|hideExceptionTab"},
                    Locale.$STR("fbtest.tab.Exception")
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
                            SPAN("(", Locale.$STR("fbtest.test.Line"), " $stack.lineNumber", ")")
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
                        Locale.$STR("fbtest.title.Expected")
                    ),
                    TD({"class": "testResultCompareSwitch expected",
                        onclick: "$onSwitchView", view: "fbtest.switch.view_source"},
                        Locale.$STR("fbtest.switch.view_source")
                    )
                ),
                TR(
                    TD({"class": "testResultExpected", colspan: 2})
                ),
                TR({"class": "testResultCompareTitle result"},
                    TD(
                        Locale.$STR("fbtest.title.Result")
                    ),
                    TD({"class": "testResultCompareSwitch result",
                        onclick: "$onSwitchView", view: "fbtest.switch.view_source"},
                        Locale.$STR("fbtest.switch.view_source")
                    )
                ),
                TR(
                    TD({"class": "testResultActual", colspan: 2})
                ),
                TR({"class": "testResultCompareTitle diff",
                    $collapsed: "$result|hideDiffGroup"},
                    TD({colspan: 2},
                        Locale.$STR("fbtest.title.Difference")
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
        var tab = Dom.getElementByClass(tabView, tabName + "Tab");
        if (tab)
            this.selectTab(tab);
    },

    selectTab: function(tab)
    {
        var view = tab.getAttribute("view");
        var viewBody = Dom.getAncestorByClass(tab, "tabViewBody");

        // Deactivate current tab.
        if (viewBody.selectedTab)
        {
            viewBody.selectedTab.removeAttribute("selected");
            viewBody.selectedBody.removeAttribute("selected");
        }

        // Store info about new active tab. Each tab has to have a body,
        // which is identified by class.
        var tabBody = Dom.getElementByClass(viewBody, "tab" + view + "Body");
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
        var infoRow = Dom.getAncestorByClass(viewBody, "testResultInfoRow");
        var result = infoRow.repObject;

        // Update Stack tab content
        var tabStackBody = Dom.getElementByClass(viewBody, "tabStackBody");
        if (tabName == "Stack" && !tabStackBody.updated)
        {
            tabStackBody.updated = true;
            this.stackTag.replace({result: result}, tabStackBody, this);
        }

        // Update Compare tab content
        var tabCompareBody = Dom.getElementByClass(viewBody, "tabCompareBody");
        if (tabName == "Compare" && !tabCompareBody.updated)
        {
            tabCompareBody.updated = true;
            this.compareTag.replace({result: result}, tabCompareBody, this);

            var expectedNode = Dom.getElementByClass(viewBody, "testResultExpected");
            var actualNode = Dom.getElementByClass(viewBody, "testResultActual");

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
            if (result.expected != result.result)
            {
                var diffNode = Dom.getElementByClass(viewBody, "testResultDiff");
                var diffText = JSDiff.diffString(clean(result.expected), clean(result.result));
                diffNode.innerHTML = diffText;
            }
        }

        // Update Exception tab content
        var tabExceptionBody = Dom.getElementByClass(viewBody, "tabExceptionBody");
        if (tabName == "Exception" && !tabExceptionBody.updated)
        {
            tabExceptionBody.updated = true;
            PropTree.tag.replace({object: result.err}, tabExceptionBody, PropTree);
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
        var expected = Css.hasClass(target, "expected");
        var infoRow = Dom.getAncestorByClass(target, "testResultInfoRow");
        var result = infoRow.repObject;
        var sourceBody = Dom.getElementByClass(infoRow, expected ?
            "testResultExpected" : "testResultActual");

        Dom.clearNode(sourceBody);

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
            Str.insertWrappedText(expected ? result.expected : result.result, sourceBody);
            view = views[1];
        }
        else if (view == views[1])
        {
            // display escaped, next view: pretty print
            Str.insertWrappedText(escape(expected ? result.expected : result.result), sourceBody);
            view = views[2];
        }
        else if (view == views[2])
        {
            // display pretty print, next view: view source.
            this.insertXml(result.expected, sourceBody);
            view = views[0];
        }

        target.setAttribute("view", view);
        target.innerHTML = Locale.$STR(view);
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

            var xmlSource = Dom.getElementByClass(errorNode, "xmlInfoSource");
            Str.insertWrappedText(xml, xmlSource);
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
            Str.insertWrappedText(data, parentNode);
    },

    insertImage: function(data, parentNode)
    {
        var frame = this.resultFrameTag.replace({}, parentNode, this);
        frame.setAttribute("src", data);
    }
});

// ********************************************************************************************* //

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

// ********************************************************************************************* //

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

// ********************************************************************************************* //
// Registration

return TestResultTabView;

// ********************************************************************************************* //
}});
