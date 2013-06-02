/* See license.txt for terms of usage */

define([
    "firebug/lib/trace",
    "firebug/lib/css",
],
function(FBTrace, Css) {

// ********************************************************************************************* //
// TestGroup (list of related tests)

FBTestApp.TestGroup = function(name)
{
    this.name = name;
    this.tests = [];
};

FBTestApp.TestGroup.prototype =
{
    getErrors: function(includeMessages)
    {
        var text = "";
        for (var i=0; i<this.tests.length; i++)
        {
            var test = this.tests[i];
            var errors = test.getErrors(includeMessages);
            if (errors)
                text += errors + "\n";
        }
        return text;
    },

    getFailingTests: function()
    {
        var tests = [];
        for (var i=0; i<this.tests.length; i++)
        {
            var test = this.tests[i];
            if (!test.error || test.category == "fails")
                continue;

            tests.push(test);
        }
        return tests;
    },

    update: function()
    {
        var error = false;
        for (var i=0; i<this.tests.length; i++)
        {
            var test = this.tests[i];
            if (test.error && test.category != "fails")
            {
                error = true;
                break;
            }
        }

        if (error)
            Css.setClass(this.row, "error");
        else
            Css.removeClass(this.row, "error");
    }
};

// ********************************************************************************************* //
// Registration

return FBTestApp.TestGroup;

// ********************************************************************************************* //
});
