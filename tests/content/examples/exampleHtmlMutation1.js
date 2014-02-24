function runTest()
{
    FBTest.sysout("examples.HtmlMutation.START");
    FBTest.openNewTab(basePath + "examples/exampleHtmlMutation1.html", function(win)
    {
        FBTest.openFirebug(function()
        {
            FBTest.selectPanel("html");

            FBTest.waitForHtmlMutation(null, "div", function(node)
            {
                FBTest.testDone("examples.HtmlMutation.DONE");
            });

            FBTest.progress("fbTestFirebug.waitForHtmlMutation;");
            FBTest.click(win.document.getElementById("testButton"));
        });
    });
}

