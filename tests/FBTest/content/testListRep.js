/* See license.txt for terms of usage */

define([
    "firebug/lib/trace",
    "firebug/lib/css",
    "firebug/lib/dom",
    "firebug/lib/locale",
    "firebug/lib/object",
    "firebug/lib/system",
    "firebug/chrome/window",
    "firebug/lib/domplate",
    "firebug/lib/events",
    "fbtest/testResultRep",
],
function(FBTrace, Css, Dom, Locale, Obj, System, Win, Domplate, Events, TestResultRep) {
with (Domplate) {

// ********************************************************************************************* //
// Constants

var Cc = Components.classes;
var Ci = Components.interfaces;

// ********************************************************************************************* //
// Test List

/** @domplate */
var TestList = domplate(
/** @lends FBTestApp.TestList */
{
    tag:
        TABLE({"class": "testListTable", cellpadding: 0, cellspacing: 0},
            TBODY()
        ),

    rowTag:
        FOR("test", "$tests",
            TR({"class": "testListRow", _repObject: "$test",
                $results: "$test|hasResults",
                $error: "$test|hasError",
                $todo: "$test|isTodo",
                $disabled: "$test|isDisabled"},
                TD({"class": "testListCol testName", onclick: "$onExpandTest"},
                    SPAN("&nbsp;")
                ),
                TD({"class": "testListCol testUri", onclick: "$onRunTest"},
                    SPAN({"class": "testLink"},
                        A({title: "$test|getTestTooltip"},
                            "$test.uri"
                        )
                    )
                ),
                TD({"class": "testListCol testIcon"},
                    DIV({"class": "statusIcon"})
                ),
                TD({"class": "testListCol testDesc"},
                    SPAN("$test.desc")
                )
            )
        ),

    rowBodyTag:
        TR({"class": "testBodyRow", _repObject: "$test"},
            TD({"class": "testBodyCol", colspan: 4})
        ),

    hasResults: function(test)
    {
        return test.results && test.results.length > 0;
    },

    hasError: function(test)
    {
        return test.error;
    },

    isTodo: function(test)
    {
        return test.category == "fails";
    },

    getTestTooltip: function(test)
    {
        return test.tooltip;
    },

    isDisabled: function(test)
    {
        return test.disabled;
    },

    onRunTest: function(event)
    {
        if (Events.isLeftClick(event))
        {
            Events.cancelEvent(event);

            // Even one test is launched as a test-suite.
            var row = Dom.getAncestorByClass(event.target, "testListRow");
            FBTestApp.TestRunner.runTests([row.repObject]);
        }
    },

    onExpandTest: function(event)
    {
        if (Events.isLeftClick(event))
        {
            var row = Dom.getAncestorByClass(event.target, "testListRow");
            if (row && row.repObject.results && row.repObject.results.length > 0)
            {
                this.toggleRow(row);
                Events.cancelEvent(event);
            }
        }
    },

    expandTest: function(row)
    {
        if (Css.hasClass(row, "testListRow"))
            this.toggleRow(row, true);
    },

    collapseTest: function(row)
    {
        if (Css.hasClass(row, "testListRow") && Css.hasClass(row, "opened"))
            this.toggleRow(row);
    },

    toggleRow: function(row, forceOpen)
    {
        var opened = Css.hasClass(row, "opened");
        if (opened && forceOpen)
            return;

        Css.toggleClass(row, "opened");
        if (Css.hasClass(row, "opened"))
        {
            var test = row.repObject;
            var infoBodyRow = this.rowBodyTag.insertRows({test: test}, row)[0];
            infoBodyRow.repObject = test;
            this.initBody(infoBodyRow);
        }
        else
        {
            var infoBodyRow = row.nextSibling;
            row.parentNode.removeChild(infoBodyRow);
        }
    },

    initBody: function(infoBodyRow)
    {
        var test = infoBodyRow.repObject;
        var table = TestResultRep.tableTag.replace({}, infoBodyRow.firstChild);
        var tbody = table.firstChild;
        var row = TestResultRep.resultTag.insertRows(
            {results: test.results}, tbody.lastChild ? tbody.lastChild : tbody)[0];

        for (var i=0; i<test.results.length; i++)
        {
            var result = test.results[i];
            result.row = row;
            row = row.nextSibling;
        }
    },

    // Firebug rep support
    supportsObject: function(test, type)
    {
        return test instanceof FBTestApp.Test;
    },

    browseObject: function(test, context)
    {
        return false;
    },

    getRealObject: function(test, context)
    {
        return test;
    },

    // Context menu
    getContextMenuItems: function(test, target, context)
    {
        var items = [];

        if (test.testPage)
        {
            items.push({
              label: Locale.$STR("fbtest.cmd.Open Test Page"),
              nol10n: true,
              command: Obj.bindFixed(this.onOpenTestPage, this, test)
            });
        }

        items.push("-");

        items.push({
          label: Locale.$STR("fbtest.cmd.Run From Here"),
          nol10n: true,
          command: Obj.bindFixed(this.onRunFromHere, this, test)
        });

        items.push({
          label: Locale.$STR("fbtest.cmd.Run This Group From Here"),
          nol10n: true,
          command: Obj.bindFixed(this.onRunGroupFromHere, this, test)
        });

        var counter = Firebug.getPref(FBTestApp.prefDomain, "runMoreTimes");
        items.push({
          //xxxHonza: doesn't work? label: Locale.$STRF("fbtest.cmd.Run More Times", [counter]),
          label: "Run " + counter + " Times",
          nol10n: true,
          command: Obj.bindFixed(this.onRunMoreTimes, this, test)
        });

        items.push({
          label: Locale.$STR("fbtest.contextmenu.label.Hide Passing Tests"),
          nol10n: true,
          type: "checkbox",
          checked: Css.hasClass(FBTestApp.TestConsole.table, "hidePassingTests"),
          command: Obj.bindFixed(FBTestApp.TestConsole.hidePassingTests, FBTestApp.TestConsole)
        });

        items.push({
          label: Locale.$STR("fbtest.contextmenu.label.Disable Test"),
          nol10n: true,
          type: "checkbox",
          checked: test.disabled,
          command: Obj.bindFixed(this.onDisableTest, this, test)
        });

        items.push("-");

        items.push({
          label: Locale.$STR("fbtest.cmd.Copy All Errors"),
          nol10n: true,
          command: Obj.bindFixed(FBTestApp.GroupList.onCopyAllErrors, FBTestApp.GroupList)
        });

        if (test.error)
        {
            items.push({
              label: Locale.$STR("fbtest.cmd.Copy Errors"),
              nol10n: true,
              command: Obj.bindFixed(this.onCopyAllErrors, this, test)
            });
        }

        items.push({
          label: Locale.$STR("fbtest.contextmenu.label.Submit Test Results"),
          nol10n: true,
          disabled: !FBTestApp.TestCouchUploader.isEnabled(),
          command: Obj.bindFixed(FBTestApp.TestCouchUploader.onUpload, FBTestApp.TestCouchUploader)
        });

        return items;
    },

    // Commands
    onCopyAllErrors: function(test)
    {
        System.copyToClipboard(test.getErrors());
    },

    onOpenTestPage: function(test)
    {
        var remoteFBL = FBTestApp.FBTest.FirebugWindow.FBL;
        remoteFBL.openNewTab(test.testCasePath + test.testPage);
    },

    onRunFromHere: function(test)
    {
        var group = test.group;
        var groups = FBTestApp.TestConsole.groups;
        var groupIndex = groups.indexOf(group);

        var tests = [];

        // Get tests from the clicked one till the end of the parent group.
        var testIndex = group.tests.indexOf(test);
        tests.push.apply(tests, group.tests.slice(testIndex));

        // Join all tests from all the following groups.
        for (var i=groupIndex+1; i<groups.length; i++)
            tests.push.apply(tests, groups[i].tests);

        if (FBTrace.DBG_FBTEST)
            FBTrace.sysout("fbtest.onRunFromHere; Number of tests: " + tests.length, tests);

        FBTestApp.TestRunner.runTests(tests);
    },

    onRunGroupFromHere: function(test)
    {
        var group = test.group;
        var groups = FBTestApp.TestConsole.groups;
        var groupIndex = groups.indexOf(group);

        var tests = [];

        // Get tests from the clicked one till the end of the parent group.
        var testIndex = group.tests.indexOf(test);
        tests.push.apply(tests, group.tests.slice(testIndex));

        if (FBTrace.DBG_FBTEST)
            FBTrace.sysout("fbtest.onRunGroupFromHere; Number of tests: " + tests.length, tests);

        FBTestApp.TestRunner.runTests(tests);
    },

    onRunMoreTimes: function(test)
    {
        var counter = Firebug.getPref(FBTestApp.prefDomain, "runMoreTimes");

        var tests = [];

        // Join all tests from all the following groups.
        for (var i=0; i<counter; i++)
            tests.push(test);

        FBTestApp.TestRunner.runTests(tests);
    },

    onDisableTest: function(test)
    {
        test.disabled = !test.disabled;

        if (test.disabled)
            Css.setClass(test.row, "disabled");
        else
            Css.removeClass(test.row, "disabled");
    }
});

// ********************************************************************************************* //
// Registration

Firebug.registerRep(TestList);

return TestList;

// ********************************************************************************************* //
}});
