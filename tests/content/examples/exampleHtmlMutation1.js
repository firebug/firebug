function runTest()
{
    FBTest.openNewTab(basePath + "examples/exampleHtmlMutation1.html", function(win)
    {
        FBTest.openFirebug(function()
        {
            FBTest.selectPanel("html");

            FBTest.waitForHtmlMutation(null, "div", function(node)
            {
                FBTest.testDone();
            });

            FBTest.progress("fbTestFirebug.waitForHtmlMutation;");
            FBTest.click(win.document.getElementById("testButton"));
        });
    });
}

