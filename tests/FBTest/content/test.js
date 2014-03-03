/* See license.txt for terms of usage */

define([
    "firebug/lib/trace",
    "firebug/lib/css",
    "firebug/lib/dom",
    "firebug/lib/string",
],
function(FBTrace, Css, Dom, Str) {

// ********************************************************************************************* //
// Test

FBTestApp.Test = function(group, uri, desc, category, testPage)
{
    if (category != "passes" && category != "fails")
    {
        if (FBTrace.DBG_ERRORS || FBTrace.DBG_FBTEST)
            FBTrace.sysout("fbrace.FTestApp.Test; Wrong category for a test: " +
                category + ", " + uri);
    }

    // Test definition.
    this.group = group;
    this.uri = uri;
    this.desc = desc;
    this.category = category;
    this.testPage = testPage;

    // Used by the test runner.
    this.results = [];
    this.error = false;
    this.row = null;
    this.path = null;

    // Timing
    this.start = 0;
    this.end = 0;

    this.disabled = false;
};

FBTestApp.Test.prototype =
{
    appendResult: function(testResult)
    {
        this.results.push(testResult);

        Css.setClass(this.row, "results");

        // If it's an error update test so, it's reflecting an error state.
        if (!testResult.pass)
        {
            Css.setClass(this.row, "error");
            this.error = true;
        }
    },

    onStartTest: function(baseURI)
    {
        this.path = baseURI + this.uri;
        this.results = [];
        this.error = false;

        Css.setClass(this.row, "running");
        Css.removeClass(this.row, "results");
        Css.removeClass(this.row, "error");

        // Remove previous results from the UI.
        if (Css.hasClass(this.row, "opened"))
        {
            var infoBody = this.row.nextSibling;
            Dom.clearNode(Dom.getElementByClass(infoBody, "testBodyCol"));
        }

        // Clear time info
        var timeNode = Dom.getElementByClass(this.row, "statusIcon");
        Dom.clearNode(timeNode);
        timeNode.removeAttribute("title");
    },

    onTestDone: function()
    {
        Css.removeClass(this.row, "running");

        var timeNode = Dom.getElementByClass(this.row, "statusIcon");
        var elapsedTime = this.end - this.start;
        timeNode.innerHTML = "(" + Str.formatTime(elapsedTime) + ")";
        timeNode.setAttribute("title", elapsedTime + "ms");

        // Update group error flag.
        this.group.update();
    },

    getErrors: function(includeMessages)
    {
        if (!this.error || this.category == "fails")
            return "";

        var text = "[FAILED] " + this.uri + ": " + this.desc;
        if (!includeMessages)
            return text;

        text += "\n";

        for (var i=0; i<this.results.length; i++)
        {
            var testResult = this.results[i];
            text += "- " + testResult.msg + (testResult.pass ? "" : " [ERROR]") + "\n";
        }
        return text;
    }
};

// ********************************************************************************************* //
// Registration

return FBTestApp.Test;

// ********************************************************************************************* //
});
