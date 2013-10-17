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
    "firebug/lib/array",
    "firebug/lib/system",
    "fbtest/testListRep",
],
function(FBTrace, Domplate, Obj, Str, Dom, Events, Css, Locale, Arr, System, TestList) {

"use strict";

// ********************************************************************************************* //
// Constants

var Cc = Components.classes;
var Ci = Components.interfaces;
var Cu = Components.utils;

var {domplate, TABLE, TBODY, TD, TR, SPAN} = Domplate;

// ********************************************************************************************* //
// Test List Domplate repository.

/**
 * Domplate templates in this file are used to generate list of registered tests.
 *
 * @domplate
 */
FBTestApp.GroupList = domplate(Firebug.Rep,
/** @lends FBTestApp.GroupList */
{
    tableTag:
        TABLE({"class": "groupTable", cellpadding: 0, cellspacing: 0, onclick: "$onClick"},
            TBODY()
        ),

    groupRowTag:
        TR({"class": "testGroupRow", _repObject: "$group"},
            TD({"class": "groupName testGroupCol"},
                SPAN({"class": "testGroupName"},
                    "$group|getGroupName"
                ),
                SPAN({"class": "testGroupCount"},
                    "$group|getGroupCount"
                ),
                SPAN({"class": "groupAction testLink", onclick: "$onGroupClick"},
                    SPAN("Run")
                )
            )
        ),

    groupSeparatorTag:
        TR({"class": "testGroupSeparator"},
            TD(
                SPAN({"class": "extension"},
                    "$group.extension"
                ),
                SPAN({"class": "location"},
                    "$group.testListPath"
                )
            )
        ),

    groupBodyTag:
        TR({"class": "groupBodyRow", _repObject: "$group"},
            TD({"class": "groupBodyCol", colspan: 1})
        ),

    getGroupName: function(group)
    {
        var n = group.name;
        return n.charAt(0).toUpperCase() + n.substr(1).toLowerCase();
    },

    getGroupCount: function(group)
    {
        return "(" + group.tests.length + ")";
    },

    onGroupClick: function(event)
    {
        if (Events.isLeftClick(event))
        {
            var row = Dom.getAncestorByClass(event.target, "testGroupRow");
            if (row)
            {
                Events.cancelEvent(event);
                FBTestApp.TestRunner.runTests(row.repObject.tests);
            }
        }
    },

    onClick: function(event)
    {
        if (Events.isLeftClick(event))
        {
            var row = Dom.getAncestorByClass(event.target, "testGroupRow");
            if (row)
            {
                this.toggleRow(row);
                Events.cancelEvent(event);
            }
        }
    },

    expandGroup: function(row)
    {
        if (Css.hasClass(row, "testGroupRow"))
            this.toggleRow(row, true);
    },

    collapseGroup: function(row)
    {
        if (Css.hasClass(row, "testGroupRow") && Css.hasClass(row, "opened"))
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
            var group = row.repObject;
            var infoBodyRow = this.groupBodyTag.insertRows({group: group}, row)[0];
            infoBodyRow.repObject = group;
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
        var group = infoBodyRow.repObject;
        var table = TestList.tag.replace({}, infoBodyRow.firstChild);
        var row = TestList.rowTag.insertRows({tests: group.tests}, table.firstChild)[0];
        for (var i=0; i<group.tests.length; i++)
        {
            var test = group.tests[i];
            test.row = row;
            row = row.nextSibling;
        }
    },

    // Firebug rep support
    supportsObject: function(group, type)
    {
        return group instanceof FBTestApp.TestGroup;
    },

    browseObject: function(group, context)
    {
        return false;
    },

    getRealObject: function(group, context)
    {
        return group;
    },

    // Context menu
    getContextMenuItems: function(group, target, context)
    {
        var items = [];

        items.push({
          label: Locale.$STR("fbtest.cmd.Expand All"),
          nol10n: true,
          command: Obj.bindFixed(this.onExpandAll, this, group)
        });

        items.push({
          label: Locale.$STR("fbtest.cmd.Collapse All"),
          nol10n: true,
          command: Obj.bindFixed(this.onCollapseAll, this, group)
        });

        items.push("-");

        items.push({
          label: Locale.$STR("fbtest.cmd.Run From Here"),
          nol10n: true,
          command: Obj.bindFixed(this.onRunFromHere, this, group)
        });

        items.push({
          label: Locale.$STR("fbtest.contextmenu.label.Hide Passing Tests"),
          nol10n: true,
          type: "checkbox",
          checked: Css.hasClass(FBTestApp.TestConsole.table, "hidePassingTests"),
          command: Obj.bindFixed(FBTestApp.TestConsole.hidePassingTests, FBTestApp.TestConsole)
        });

        items.push("-");

        items.push({
          label: Locale.$STR("fbtest.cmd.Copy All Errors"),
          nol10n: true,
          command: Obj.bindFixed(this.onCopyAllErrors, this)
        });

        items.push({
          label: Locale.$STR("fbtest.contextmenu.label.Submit Test Results"),
          nol10n: true,
          disabled: !FBTestApp.TestCouchUploader.isEnabled(),
          command: Obj.bindFixed(FBTestApp.TestCouchUploader.onUpload, FBTestApp.TestCouchUploader)
        });

        return items;
    },

    // Commands
    onExpandAll: function(group)
    {
        var table = Dom.getAncestorByClass(group.row, "groupTable");
        var rows = Arr.cloneArray(table.firstChild.childNodes);
        for (var i=0; i<rows.length; i++)
            this.expandGroup(rows[i]);
    },

    onCollapseAll: function(group)
    {
        var table = Dom.getAncestorByClass(group.row, "groupTable");
        var rows = Arr.cloneArray(table.firstChild.childNodes);
        for (var i=0; i<rows.length; i++)
            this.collapseGroup(rows[i]);
    },

    onRunFromHere: function(group)
    {
        var groups = FBTestApp.TestConsole.groups;
        var index = groups.indexOf(group);

        // Join all tests from this group and those which follow.
        var tests = [];
        for (var i=index; i<groups.length; i++)
            tests.push.apply(tests, groups[i].tests);

        if (FBTrace.DBG_FBTEST)
            FBTrace.sysout("fbtest.onRunFromHere; Number of tests: " + tests.length, tests);

        FBTestApp.TestRunner.runTests(tests);
    },

    onCopyAllErrors: function()
    {
        try
        {
            var text = FBTestApp.TestConsole.getErrorSummaryText();
            System.copyToClipboard(text);
        }
        catch (err)
        {
            if (FBTrace.DBG_ERRORS || FBTrace.DBG_FBTEST)
                FBTrace.sysout("fbtrace.FBTestApp.GroupList; onCopyAllErrors EXCEPTION", err);
        }
    },
});

// ********************************************************************************************* //
// Registration

Firebug.registerRep(FBTestApp.GroupList);

return FBTestApp.GroupList;

// ********************************************************************************************* //
});
