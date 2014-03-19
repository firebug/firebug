function runTest()
{
    FBTest.openNewTab(basePath + "console/5382/issue5382.html", function(win)
    {
        FBTest.openFirebug(function()
        {
            FBTest.enableConsolePanel(function(win)
            {
                var tasks = new FBTest.TaskList();
                tasks.push(test1);
                tasks.push(test2);

                tasks.run(function()
                {
                    FBTest.testDone();
                });
            });
        });
    });
}

function test1(callback)
{
    var config = {tagName: "span", classes: "objectBox-array"};
    FBTest.waitForDisplayedElement("console", config, function(row)
    {
        var expected = /\[\[\"123\"\]\,\s*\[\"1\"\]\]/;
        FBTest.compare(expected, row.textContent, "The log must match");

        // Expand the inner array
        var element = row.querySelector(".objectBox-array.hasTwisty");
        FBTest.click(element);

        // Check the log again (must be expanded now).
        expected = /\[\[\"123\"\]\,\s*\[\"1\"\]\s*0\"1\"\s*index0\s*input\"123\"\]/;
        FBTest.compare(expected, row.textContent, "The expanded log must match");

        callback();
    });

    FBTest.executeCommand("console.log( [['123'], '123'.match(/\\w/)] )");
}

function test2(callback)
{
    var config = {tagName: "span", classes: "objectBox-array"};
    FBTest.waitForDisplayedElement("console", config, function(row)
    {
        var expected = /\[1\,\s*Window\s*issue5382\.html\]/;
        FBTest.compare(expected, row.textContent, "The log must match");

        // Click on the window object/link
        var element = row.querySelector(".objectLink-object");
        FBTest.click(element);

        // Firebug should switch to the DOM panel.
        var panel = FBTest.getSelectedPanel();
        FBTest.compare("dom", panel.name, "The DOM panel must be selected");

        callback();
    });

    FBTest.executeCommand("console.log( [1, window] )");
}
