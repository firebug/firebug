/* See license.txt for terms of usage */

define([
    "firebug/lib/trace",
    "firebug/lib/locale",
],
function(FBTrace, Locale) {

// ********************************************************************************************** //
// Test Summary

FBTestApp.TestSummary =
{
    passingTests: {passing: 0, failing: 0},
    failingTests: {passing: 0, failing: 0},

    append: function(test)
    {
        if (test.category == "fails")
        {
            test.error ? this.failingTests.failing++ : this.failingTests.passing++;

            Firebug.chrome.$("todoTests").value = Locale.$STR("fbtest.label.Todo") + ": " +
                this.failingTests.failing + "/" + this.failingTests.passing;
        }
        else
        {
            test.error ? this.passingTests.failing++ : this.passingTests.passing++;

            if (this.passingTests.passing)
                Firebug.chrome.$("passingTests").value = Locale.$STR("fbtest.label.Pass") + ": " +
                    this.passingTests.passing;

            if (this.passingTests.failing)
                Firebug.chrome.$("failingTests").value = Locale.$STR("fbtest.label.Fail") + ": " +
                    this.passingTests.failing;
        }
    },

    setMessage: function(message)
    {
        Firebug.chrome.$("progressMessage").value = message;
    },

    onTodoShowTooltip: function(tooltip)
    {
        var failingTestsLabel = Locale.$STRP("fbtest.tooltip.ToDoFailing", [this.failingTests.failing]);
        var passingTestsLabel = Locale.$STRP("fbtest.tooltip.ToDoPassing", [this.failingTests.passing]);
        tooltip.label = Locale.$STRF("fbtest.tooltip.ToDo", [failingTestsLabel, passingTestsLabel]);
    },

    clear: function()
    {
        this.passingTests = {passing: 0, failing: 0};
        this.failingTests = {passing: 0, failing: 0};

        Firebug.chrome.$("passingTests").value = "";
        Firebug.chrome.$("failingTests").value = "";
        Firebug.chrome.$("progressMessage").value = "";
    },

    dumpSummary: function()
    {
        FBTestApp.FBTest.sysout("Passed: " + this.passingTests.passing);
        FBTestApp.FBTest.sysout("Failed: " + this.passingTests.failing);
    }
};

// ********************************************************************************************** //
// Registration

return FBTestApp.TestSummary;

// ********************************************************************************************** //
});
