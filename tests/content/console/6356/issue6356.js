function runTest()
{
    FBTest.openNewTab(basePath + "console/6356/issue6356.html", function(win)
    {
        FBTest.openFirebug(function()
        {
            FBTest.enableConsolePanel(function(win)
            {
                var tasks = new FBTest.TaskList();
                tasks.push(test1, win);
                tasks.push(test2, win);

                tasks.run(function() {
                    FBTest.testDone();
                });
            });
        });
    });
}

function test1(callback, win)
{
    var config = {tagName: "div", classes: "logRow-log"};
    FBTest.waitForDisplayedElement("console", config, function(row)
    {
        row = row.getElementsByClassName("objectBox-array")[0];
        var expected = /Object\[input\#myInput\s*property value\s*\=\s*\"1\. This is very long val\.\.\. definitely be cropped\.\"\s*attribute value\s*\=\s*\"2\. This is also a very l\.\.\.e need to make shorter\.\"\]/;

        FBTest.compare(expected, row.textContent, "The log must match: " +
            row.textContent);

        callback();
    });

    FBTest.click(win.document.getElementById("testButton1"));
}

function test2(callback, win)
{
    var config = {tagName: "div", classes: "logRow-log"};
    FBTest.waitForDisplayedElement("console", config, function(row)
    {
        row = row.getElementsByClassName("objectBox-array")[0];
        var expected = /Object\[input\#myInput\s*attribute\s*value\s*\=\s*\"test\"]/;

        FBTest.compare(expected, row.textContent, "The log must match: " +
            row.textContent);

        callback();
    });

    FBTest.click(win.document.getElementById("testButton2"));
}
