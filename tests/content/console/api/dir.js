function runTest()
{
    FBTest.openNewTab(basePath + "console/api/dir.html", function(win)
    {
        FBTest.openFirebug(function()
        {
            FBTest.enableConsolePanel(function(win)
            {
                var tasks = new FBTest.TaskList();
                tasks.push(test1, win);
                tasks.push(test2, win);

                tasks.run(function()
                {
                    FBTest.testDone();
                });
            });
        });
    });
}

function test1(callback, win)
{
    var config = {tagName: "div", classes: "logRow logRow-dir"};
    FBTest.waitForDisplayedElement("console", config, function(row)
    {
        var name = row.getElementsByClassName("memberLabelCell")[0];
        var value = row.getElementsByClassName("memberValueCell")[0];

        FBTest.compare("a", name.textContent, "The variable name must be: 'a'");
        FBTest.compare("\"b\"", value.textContent, "The variable value must be: 'b'");

        callback();
    });

    // Execute test 1 implemented on the page.
    FBTest.click(win.document.getElementById("testButton1"));
}

function test2(callback, win)
{
    var config = {tagName: "div", classes: "logRow logRow-dir"};
    FBTest.waitForDisplayedElement("console", config, function(row)
    {
        var domTable = row.getElementsByClassName("domTable")[0];

        FBTest.compare(2, domTable.rows.length, "There should be 1 row (excluding header)");

        // Expand object 'a'.
        var labelA = domTable.getElementsByClassName("memberLabel")[0];
        expandMembers(labelA, function(rowA)
        {
            FBTest.compare(3, domTable.rows.length, "There should be 2 rows (excluding header)");

            // Expand object 'b'.
            var labelB = domTable.getElementsByClassName("memberLabel")[1];
            expandMembers(labelB, function(rowB)
            {
                FBTest.compare(4, domTable.rows.length, "There should be 3 rows (excluding header)");

                // Close object 'b';
                collapseMembers(labelB, function()
                {
                    FBTest.compare(3, domTable.rows.length, "There should be 2 rows (excluding header)");

                    // Close object 'a';
                    collapseMembers(labelA, function()
                    {
                        FBTest.compare(2, domTable.rows.length, "There should be 1 rows (excluding header)");

                        callback();
                    });
                });
            });
        });
    });

    // Execute test 1 implemented on the page.
    FBTest.click(win.document.getElementById("testButton2"));
}

// xxxHonza: how to avoid following timeouts?
function expandMembers(node, callback)
{
    setTimeout(function()
    {
        callback();
    }, 200);

    FBTest.click(node);
}

function collapseMembers(node, callback)
{
    setTimeout(function()
    {
        callback();
    }, 200);

    FBTest.click(node);
}
