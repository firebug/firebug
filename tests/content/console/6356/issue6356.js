function runTest()
{
    FBTest.sysout("issue6356.START");
    FBTest.openNewTab(basePath + "console/6356/issue6356.html", function(win)
    {
        FBTest.openFirebug();
        FBTest.selectPanel("console");

        FBTest.enableConsolePanel(function(win)
        {
            var tasks = new FBTest.TaskList();
            tasks.push(test1, win);
            tasks.push(test1, win);

            tasks.run(function() {
                FBTest.testDone("issue6356.DONE");
            });
        });
    });
}

function test1(callback, win)
{
    var config = {tagName: "div", classes: "logRow-log"};
    FBTest.waitForDisplayedElement("console", config, function(row)
    {
        row = row.getElementsByClass("objectBox-array")[0];
        var expected = "Object[input#myInput property value = \"1. This is very long" +
            " va... definitely be cropped.\" attribute value = \"2. This is also a very " +
            "...e need to make shorter.\"]";

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
        row = row.getElementsByClass("objectBox-array")[0];
        var expected = "Object[input#myInput attribute value = \"test\"]";

        FBTest.compare(expected, row.textContent, "The log must match: " +
            row.textContent);

        callback();
    });

    FBTest.click(win.document.getElementById("testButton2"));
}
